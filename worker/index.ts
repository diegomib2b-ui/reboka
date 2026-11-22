/**
 * Servidor do Reboka no Cloudflare Workers. Só roda nas rotas /api/*; o resto do site é arquivo estático.
 * Aqui ficam as três coisas que o navegador não pode fazer: guardar a chave do Mercado Pago,
 * receber o aviso de pagamento e mudar plano e assinatura da empresa.
 */
import { planos, DESCONTO_ANUAL } from '../src/data/site';
import { waWebhook, waConectar, waStatus, waEnviar, waCronRetornos } from './whatsapp';

export interface Env {
  ASSETS: { fetch: (r: Request) => Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  /** Segredos, configurados no painel do Cloudflare (nunca no código). */
  SUPABASE_SECRET_KEY?: string;
  MP_ACCESS_TOKEN?: string;
  MP_WEBHOOK_SECRET?: string;
  /** WhatsApp com IA (Evolution + Anthropic). */
  EVOLUTION_URL?: string;
  EVOLUTION_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

type Plano = 'essencial' | 'equipe';
type Ciclo = 'mensal' | 'anual';
const MP = 'https://api.mercadopago.com';
const json = (dados: unknown, status = 200) => Response.json(dados, { status, headers: { 'cache-control': 'no-store' } });
const erro = (mensagem: string, status = 400) => json({ erro: mensagem }, status);

export function valorDo(plano: Plano, ciclo: Ciclo): number {
  const mensal = planos.find((p) => p.id === plano)!.precoMensal;
  return ciclo === 'anual' ? Math.round(mensal * 12 * (1 - DESCONTO_ANUAL) * 100) / 100 : mensal;
}

/** Confere a assinatura do aviso: só o Mercado Pago conhece o segredo, então só ele gera o mesmo código. */
export async function assinaturaValida(req: Request, segredo: string): Promise<boolean> {
  const partes = Object.fromEntries((req.headers.get('x-signature') ?? '').split(',').map((p) => p.trim().split('=') as [string, string]));
  const url = new URL(req.url);
  const id = (url.searchParams.get('data.id') ?? '').toLowerCase();
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${id};request-id:${req.headers.get('x-request-id') ?? ''};ts:${partes.ts};`;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // Comparação em tempo constante: não revela, pelo tempo de resposta, quantos caracteres bateram.
  if (hex.length !== partes.v1.length) return false;
  let dif = 0;
  for (let i = 0; i < hex.length; i++) dif |= hex.charCodeAt(i) ^ partes.v1.charCodeAt(i);
  return dif === 0;
}

/** Banco com a chave secreta: ignora a RLS. Usado só depois de conferir quem está pedindo. */
async function banco(env: Env, caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SECRET_KEY!, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, 'content-type': 'application/json', prefer: 'return=representation', ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`Banco respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

async function mp(env: Env, caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${MP}${caminho}`, { ...init, headers: { authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const corpo = (await r.json().catch(() => ({}))) as Record<string, any>;
  if (r.status === 401 || r.status === 403) throw new Error('O Mercado Pago recusou a chave de acesso. Confira o MP_ACCESS_TOKEN no Cloudflare.');
  if (!r.ok) throw new Error(`O Mercado Pago recusou o pedido: ${corpo.message ?? r.status}`);
  return corpo;
}

/** Quem está pedindo: valida o login no Supabase e devolve a empresa e a função da pessoa. */
async function quemE(req: Request, env: Env) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const cab = { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${token}` };
  const u = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: cab });
  if (!u.ok) return null;
  const usuario = (await u.json()) as { id: string; email: string };
  const m = await fetch(`${env.SUPABASE_URL}/rest/v1/reboka_membros?select=loja_id,papel,reboka_lojas(nome,assinatura,mp_assinatura_id)&usuario_id=eq.${usuario.id}&limit=1`, { headers: cab });
  const [membro] = (m.ok ? await m.json() : []) as { loja_id: string; papel: string; reboka_lojas: { nome: string; assinatura: string; mp_assinatura_id: string | null } }[];
  return membro ? { usuario, lojaId: membro.loja_id, papel: membro.papel, loja: membro.reboka_lojas } : null;
}

const SITUACAO: Record<string, string> = { authorized: 'ativa', paused: 'pausada', cancelled: 'cancelada' };

/** Lê a assinatura no Mercado Pago e copia a situação para a empresa. É a única porta por onde plano e assinatura mudam. */
export async function sincronizar(env: Env, assinaturaId: string, origem: string, soLoja?: string) {
  const a = await mp(env, `/preapproval/${encodeURIComponent(assinaturaId)}`);
  const [lojaId, plano, ciclo] = String(a.external_reference ?? '').split('|');
  if (!/^[0-9a-f-]{36}$/.test(lojaId ?? '') || !['essencial', 'equipe'].includes(plano) || !['mensal', 'anual'].includes(ciclo)) return { ignorado: 'referência desconhecida' };
  if (soLoja && soLoja !== lojaId) return { ignorado: 'assinatura de outra empresa' };
  const situacao = SITUACAO[a.status as string];
  await banco(env, 'reboka_cobranca_eventos', { method: 'POST', body: JSON.stringify({ loja_id: lojaId, origem, status: a.status, detalhe: { id: a.id, plano, ciclo, proxima: a.next_payment_date ?? null } }) });
  if (!situacao) return { lojaId, status: a.status, aguardando: true }; // "pending": a pessoa ainda não concluiu o pagamento
  const [atual] = (await banco(env, `reboka_lojas?select=mp_assinatura_id,assinatura&id=eq.${lojaId}`)) as { mp_assinatura_id: string | null; assinatura: string }[];
  // Aviso atrasado de uma assinatura antiga não pode derrubar a assinatura nova que já está ativa.
  if (situacao !== 'ativa' && atual?.mp_assinatura_id && atual.mp_assinatura_id !== a.id) return { ignorado: 'assinatura antiga' };
  const mudanca: Record<string, unknown> = { assinatura: situacao, mp_assinatura_id: a.id, assinatura_atualizada_em: new Date().toISOString() };
  if (situacao === 'ativa') Object.assign(mudanca, { plano, periodicidade: ciclo, acesso_ate: null });
  else mudanca.acesso_ate = a.next_payment_date && new Date(a.next_payment_date) > new Date() ? a.next_payment_date : null;
  await banco(env, `reboka_lojas?id=eq.${lojaId}`, { method: 'PATCH', body: JSON.stringify(mudanca) });
  return { lojaId, situacao, plano, ciclo };
}

async function assinar(req: Request, env: Env) {
  const eu = await quemE(req, env);
  if (!eu) return erro('Entre na sua conta de novo.', 401);
  if (eu.papel !== 'dono') return erro('Só quem criou a conta pode assinar.', 403);
  const { plano, ciclo, email } = (await req.json().catch(() => ({}))) as { plano?: Plano; ciclo?: Ciclo; email?: string };
  if (!['essencial', 'equipe'].includes(plano ?? '') || !['mensal', 'anual'].includes(ciclo ?? '')) return erro('Escolha o plano e a forma de cobrança.');
  const pagador = (email ?? eu.usuario.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pagador)) return erro('Informe o e-mail da sua conta do Mercado Pago.');
  if (eu.loja.assinatura === 'ativa') return erro('Esta empresa já tem uma assinatura ativa. Cancele antes de assinar outro plano.');
  const origem = new URL(req.url).origin;
  const nomePlano = planos.find((p) => p.id === plano)!.nome;
  const a = await mp(env, '/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Reboka, plano ${nomePlano} (${ciclo})`,
      external_reference: `${eu.lojaId}|${plano}|${ciclo}`,
      payer_email: pagador,
      back_url: `${origem}/app/`,
      status: 'pending',
      auto_recurring: { frequency: ciclo === 'anual' ? 12 : 1, frequency_type: 'months', transaction_amount: valorDo(plano!, ciclo!), currency_id: 'BRL' },
    }),
  });
  await banco(env, 'reboka_cobranca_eventos', { method: 'POST', body: JSON.stringify({ loja_id: eu.lojaId, origem: 'checkout', status: 'criada', detalhe: { id: a.id, plano, ciclo } }) });
  // Guarda o número da tentativa: na volta do Mercado Pago, é por ele que conferimos se o pagamento passou.
  await banco(env, `reboka_lojas?id=eq.${eu.lojaId}`, { method: 'PATCH', body: JSON.stringify({ mp_assinatura_id: a.id }) });
  return json({ url: a.init_point });
}

async function cancelar(req: Request, env: Env) {
  const eu = await quemE(req, env);
  if (!eu) return erro('Entre na sua conta de novo.', 401);
  if (eu.papel !== 'dono') return erro('Só quem criou a conta pode cancelar.', 403);
  if (!eu.loja.mp_assinatura_id) return erro('Esta empresa não tem assinatura para cancelar.');
  await mp(env, `/preapproval/${eu.loja.mp_assinatura_id}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
  return json(await sincronizar(env, eu.loja.mp_assinatura_id, 'cancelamento', eu.lojaId));
}

async function aviso(req: Request, env: Env) {
  if (!env.MP_WEBHOOK_SECRET || !(await assinaturaValida(req, env.MP_WEBHOOK_SECRET))) return erro('Assinatura inválida.', 401);
  const url = new URL(req.url);
  const corpo = (await req.json().catch(() => ({}))) as { type?: string; data?: { id?: string } };
  const tipo = corpo.type ?? url.searchParams.get('type') ?? '';
  const id = corpo.data?.id ?? url.searchParams.get('data.id') ?? '';
  try {
    if (tipo === 'subscription_preapproval' && id) return json(await sincronizar(env, id, 'aviso'));
    if (tipo === 'subscription_authorized_payment' && id) {
      // Cada cobrança mensal gera este aviso. Ele aponta para a assinatura, que é quem diz se está tudo em dia.
      const p = await mp(env, `/authorized_payments/${encodeURIComponent(id)}`);
      if (p.preapproval_id) return json(await sincronizar(env, p.preapproval_id, 'pagamento'));
    }
  } catch (e) {
    // 500 faz o Mercado Pago tentar de novo mais tarde, que é o que queremos se o banco ou a API falharem.
    return erro((e as Error).message, 500);
  }
  return json({ ignorado: tipo || 'sem tipo' });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname, searchParams } = new URL(req.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const pronto = Boolean(env.MP_ACCESS_TOKEN && env.SUPABASE_SECRET_KEY);
    try {
      if (pathname === '/api/saude') {
        return json({ cobranca: pronto, aviso: Boolean(env.MP_WEBHOOK_SECRET), modoTeste: (env.MP_ACCESS_TOKEN ?? '').startsWith('TEST-') });
      }
      // WhatsApp com IA: não depende da cobrança (Mercado Pago).
      if (pathname === '/api/wa/webhook') return await waWebhook(req, env);
      if (pathname.startsWith('/api/wa/')) {
        const eu = await quemE(req, env);
        if (!eu) return erro('Entre na sua conta de novo.', 401);
        if (pathname === '/api/wa/conectar') return await waConectar(req, env, eu.lojaId);
        if (pathname === '/api/wa/status') return await waStatus(env, eu.lojaId);
        if (pathname === '/api/wa/enviar') {
          const { telefone, texto } = (await req.json()) as { telefone: string; texto: string };
          return await waEnviar(env, eu.lojaId, telefone, texto);
        }
        return erro('Rota não encontrada.', 404);
      }
      if (req.method !== 'POST') return erro('Método não permitido.', 405);
      if (!pronto) return erro('A cobrança ainda não foi configurada.', 503);
      if (pathname === '/api/assinar') return await assinar(req, env);
      if (pathname === '/api/cancelar') return await cancelar(req, env);
      if (pathname === '/api/mp-webhook') return await aviso(req, env);
      if (pathname === '/api/sincronizar') {
        const eu = await quemE(req, env);
        if (!eu) return erro('Entre na sua conta de novo.', 401);
        const id = searchParams.get('id') ?? eu.loja.mp_assinatura_id;
        if (!id) return json({ ignorado: 'sem assinatura' });
        return json(await sincronizar(env, id, 'retorno', eu.lojaId));
      }
      return erro('Rota não encontrada.', 404);
    } catch (e) {
      return erro((e as Error).message || 'Erro inesperado.', 500);
    }
  },
  /** Cron diário: lembretes de retorno pela IA (para quem ativou). */
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await waCronRetornos(env).catch((e) => console.error('cron wa', e));
  },
};
