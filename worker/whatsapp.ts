/**
 * Atendimento por WhatsApp com IA. Fluxo: Evolution (Baileys) recebe a mensagem -> webhook aqui ->
 * monta o contexto da empresa no Supabase -> Claude Haiku responde (e pode agendar) -> volta pelo Evolution.
 * As chaves (Evolution e Anthropic) são segredos do Worker. Sem elas, as rotas respondem "não configurado".
 */
import type { Env } from './index';

const MODELO_PADRAO = 'claude-haiku-4-5';
const json = (d: unknown, s = 200) => Response.json(d, { status: s, headers: { 'cache-control': 'no-store' } });
const soDig = (t: string) => (t || '').replace(/\D/g, '');

// ---- Supabase REST (service role: ignora RLS) ----
async function sb<T = unknown>(env: Env, caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SECRET_KEY!, authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, 'content-type': 'application/json', prefer: 'return=representation', ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
  return (r.status === 204 ? null : await r.json()) as T;
}
async function rpc<T = unknown>(env: Env, nome: string, args: Record<string, unknown>): Promise<T> {
  return sb<T>(env, `rpc/${nome}`, { method: 'POST', body: JSON.stringify(args) });
}

// ---- Evolution API ----
function evoHeaders(env: Env) { return { 'content-type': 'application/json', apikey: env.EVOLUTION_KEY! }; }
async function evo(env: Env, caminho: string, init: RequestInit = {}) {
  return fetch(`${env.EVOLUTION_URL!.replace(/\/$/, '')}${caminho}`, { ...init, headers: { ...evoHeaders(env), ...(init.headers ?? {}) } });
}
async function evoEnviar(env: Env, instancia: string, numero: string, texto: string) {
  await evo(env, `/message/sendText/${instancia}`, { method: 'POST', body: JSON.stringify({ number: soDig(numero), text: texto }) });
}

// ---- Claude (Anthropic) ----
type Msg = { role: 'user' | 'assistant'; content: unknown };
async function claude(env: Env, system: string, mensagens: Msg[], tools: unknown[]) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || MODELO_PADRAO, max_tokens: 600, system, messages: mensagens, tools }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
  return r.json() as Promise<{ content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[]; stop_reason: string }>;
}

type Loja = { id: string; nome: string; slug: string | null; agendar_ativo: boolean; agendar_dias: number[]; agendar_hora_ini: number; agendar_hora_fim: number; agendar_intervalo: number; wa_instancia: string; wa_persona: string | null; pix_chave: string | null; pix_nome: string | null; pix_cidade: string | null };

async function contextoLoja(env: Env, loja: Loja) {
  const servicos = await sb<{ nome: string; valor_medio: number; adicional: boolean }[]>(env, `reboka_servicos?loja_id=eq.${loja.id}&ativo=is.true&select=nome,valor_medio,adicional`);
  const linhas = servicos.map((s) => `- ${s.nome}: R$ ${Number(s.valor_medio).toFixed(2)}${s.adicional ? ' (adicional)' : ''}`).join('\n');
  const dias = (loja.agendar_dias || []).map((d) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d]).join(', ');
  return `EMPRESA: ${loja.nome}\nSERVIÇOS E PREÇOS:\n${linhas || '(não cadastrados)'}\n` +
    (loja.agendar_ativo ? `AGENDA: atende ${dias}, das ${loja.agendar_hora_ini}h às ${loja.agendar_hora_fim}h.\n` : 'AGENDAMENTO ONLINE: desativado.\n');
}

/** Horários livres de um dia (YYYY-MM-DD), respeitando a janela e o que já está ocupado. */
async function horariosLivres(env: Env, loja: Loja, dia: string): Promise<string[]> {
  if (!loja.agendar_ativo || !loja.slug) return [];
  const d = new Date(dia + 'T12:00:00');
  if (!loja.agendar_dias.includes(d.getDay())) return [];
  const ocupados = await rpc<{ inicio: string }[]>(env, 'reboka_agenda_ocupados', { p_slug: loja.slug, p_dia: dia });
  const ocup = new Set(ocupados.map((o) => new Date(o.inicio).getTime()));
  const out: string[] = [];
  for (let m = loja.agendar_hora_ini * 60; m + loja.agendar_intervalo <= loja.agendar_hora_fim * 60; m += loja.agendar_intervalo) {
    const h = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const t = new Date(`${dia}T${h}:00-03:00`).getTime(); // horário da empresa (Brasília); o servidor roda em UTC
    if (t > Date.now() && !ocup.has(t)) out.push(h);
  }
  return out;
}

const FERRAMENTAS = [
  { name: 'horarios_livres', description: 'Lista horários livres para agendar numa data. Use antes de oferecer horários.', input_schema: { type: 'object', properties: { data: { type: 'string', description: 'Data no formato AAAA-MM-DD' } }, required: ['data'] } },
  { name: 'agendar', description: 'Cria um agendamento confirmado para o cliente.', input_schema: { type: 'object', properties: { nome: { type: 'string' }, servico: { type: 'string' }, data: { type: 'string', description: 'AAAA-MM-DD' }, hora: { type: 'string', description: 'HH:MM' }, veiculo: { type: 'string' } }, required: ['nome', 'data', 'hora'] } },
  { name: 'status_do_carro', description: 'Verifica se o carro do cliente já está pronto no pátio.', input_schema: { type: 'object', properties: {}, required: [] } },
];

async function executarFerramenta(env: Env, loja: Loja, telefone: string, nome: string, input: Record<string, unknown>): Promise<string> {
  try {
    if (nome === 'horarios_livres') {
      const livres = await horariosLivres(env, loja, String(input.data));
      return livres.length ? `Horários livres em ${input.data}: ${livres.join(', ')}` : `Sem horários livres em ${input.data}.`;
    }
    if (nome === 'agendar') {
      const inicio = new Date(`${input.data}T${input.hora}:00-03:00`).toISOString();
      await rpc(env, 'reboka_agendar', { p_slug: loja.slug, p_nome: input.nome, p_telefone: telefone, p_veiculo: input.veiculo ?? null, p_servico: input.servico ?? null, p_inicio: inicio });
      return `Agendamento criado para ${input.data} às ${input.hora}.`;
    }
    if (nome === 'status_do_carro') {
      const fila = await sb<{ status: string; veiculo: string | null }[]>(env, `reboka_patio?loja_id=eq.${loja.id}&telefone=eq.${soDig(telefone)}&status=neq.entregue&select=status,veiculo&order=criado_em.desc&limit=1`);
      if (!fila.length) return 'Não encontrei o carro deste número no pátio agora.';
      const s = fila[0].status;
      return s === 'pronto' ? 'O carro já está PRONTO para retirada.' : s === 'em_servico' ? 'O carro está em serviço agora.' : 'O carro está na fila, aguardando começar.';
    }
  } catch (e) { return `Não consegui fazer isso: ${(e as Error).message}`; }
  return 'Ferramenta desconhecida.';
}

function systemPrompt(loja: Loja, contexto: string) {
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // dia em Brasília
  return `Você é a atendente virtual do guincho ${loja.nome}, uma empresa de reboque e socorro automotivo. Hoje é ${hoje}.
Responda pelo WhatsApp de forma curta, simpática e objetiva, em português do Brasil. Use no máximo 2-3 frases por mensagem.
Seu objetivo: tirar dúvidas de preço e horário, agendar serviços e informar se o carro está pronto.
Regras:
- Use as ferramentas para consultar horários livres e para agendar — nunca invente horários nem confirme agendamento sem usar a ferramenta "agendar".
- Só agende em horários que a ferramenta disser que estão livres.
- Se perguntarem preço, use a lista abaixo.
- Não prometa nada fora dos serviços listados. Se não souber, ofereça falar com um atendente.
${loja.wa_persona ? `Instruções do dono: ${loja.wa_persona}\n` : ''}
${contexto}`;
}

async function responder(env: Env, loja: Loja, telefone: string, nome: string, textoCliente: string) {
  const contexto = await contextoLoja(env, loja);
  const historico = await sb<{ direcao: string; texto: string }[]>(env, `reboka_wa_mensagens?loja_id=eq.${loja.id}&telefone=eq.${soDig(telefone)}&order=criado_em.desc&limit=10&select=direcao,texto`);
  const msgs: Msg[] = historico.reverse().map((m) => ({ role: m.direcao === 'in' ? 'user' : 'assistant', content: m.texto }));
  msgs.push({ role: 'user', content: textoCliente });

  let resposta = '';
  for (let volta = 0; volta < 4; volta++) {
    const r = await claude(env, systemPrompt(loja, contexto), msgs, FERRAMENTAS);
    const textos = r.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ').trim();
    const usos = r.content.filter((c) => c.type === 'tool_use');
    if (r.stop_reason === 'tool_use' && usos.length) {
      msgs.push({ role: 'assistant', content: r.content });
      const resultados = [];
      for (const u of usos) resultados.push({ type: 'tool_result', tool_use_id: u.id, content: await executarFerramenta(env, loja, telefone, u.name!, u.input ?? {}) });
      msgs.push({ role: 'user', content: resultados });
      if (textos) resposta = textos;
      continue;
    }
    resposta = textos || resposta;
    break;
  }
  if (!resposta) resposta = 'Oi! Posso te ajudar com agendamento e valores. O que você precisa?';
  await evoEnviar(env, loja.wa_instancia, telefone, resposta);
  await sb(env, 'reboka_wa_mensagens', { method: 'POST', body: JSON.stringify([
    { loja_id: loja.id, telefone: soDig(telefone), nome, direcao: 'in', texto: textoCliente },
    { loja_id: loja.id, telefone: soDig(telefone), nome, direcao: 'out', texto: resposta },
  ]) });
}

// ---- rotas ----
export async function waWebhook(req: Request, env: Env): Promise<Response> {
  if (!env.EVOLUTION_URL || !env.ANTHROPIC_API_KEY) return json({ ok: false, erro: 'não configurado' });
  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return json({ ok: true }); }
  const ev = String(corpo.event ?? '').toLowerCase();
  if (!ev.includes('messages')) return json({ ok: true });
  const data = (corpo.data ?? {}) as Record<string, unknown>;
  const key = (data.key ?? {}) as Record<string, unknown>;
  if (key.fromMe) return json({ ok: true });
  const instancia = String(corpo.instance ?? '');
  const jid = String(key.remoteJid ?? '');
  if (jid.includes('@g.us') || !jid) return json({ ok: true }); // ignora grupos
  const telefone = soDig(jid.split('@')[0]);
  const mensagem = (data.message ?? {}) as Record<string, { text?: string } & string>;
  const texto = (mensagem.conversation as unknown as string) || mensagem.extendedTextMessage?.text || '';
  const nome = String((data as { pushName?: string }).pushName ?? '');
  if (!texto.trim()) return json({ ok: true });

  const lojas = await sb<Loja[]>(env, `reboka_lojas?wa_instancia=eq.${instancia}&wa_ativo=is.true&plano=eq.pro_ia&select=id,nome,slug,agendar_ativo,agendar_dias,agendar_hora_ini,agendar_hora_fim,agendar_intervalo,wa_instancia,wa_persona,pix_chave,pix_nome,pix_cidade`);
  if (!lojas.length) return json({ ok: true });
  // Responde em background para o webhook retornar rápido.
  await responder(env, lojas[0], telefone, nome, texto).catch((e) => console.error('wa responder', e));
  return json({ ok: true });
}

export async function waConectar(req: Request, env: Env, lojaId: string): Promise<Response> {
  if (!env.EVOLUTION_URL) return json({ erro: 'WhatsApp não configurado no servidor.' }, 400);
  const lojas = await sb<{ wa_instancia: string | null }[]>(env, `reboka_lojas?id=eq.${lojaId}&select=wa_instancia`);
  const instancia = lojas[0]?.wa_instancia || `reboka_${lojaId.replace(/-/g, '').slice(0, 12)}`;
  const base = new URL(req.url).origin;
  // Cria a instância (idempotente: se já existir, só pega o QR).
  await evo(env, '/instance/create', { method: 'POST', body: JSON.stringify({
    instanceName: instancia, integration: 'WHATSAPP-BAILEYS', qrcode: true,
    webhook: { url: `${base}/api/wa/webhook`, byEvents: false, events: ['MESSAGES_UPSERT'] },
  }) }).catch(() => {});
  await sb(env, `reboka_lojas?id=eq.${lojaId}`, { method: 'PATCH', body: JSON.stringify({ wa_instancia: instancia }) });
  const r = await evo(env, `/instance/connect/${instancia}`);
  const j = (await r.json().catch(() => ({}))) as { base64?: string; code?: string };
  return json({ instancia, qr: j.base64 ?? null, codigo: j.code ?? null });
}

export async function waStatus(env: Env, lojaId: string): Promise<Response> {
  if (!env.EVOLUTION_URL) return json({ conectado: false });
  const lojas = await sb<{ wa_instancia: string | null }[]>(env, `reboka_lojas?id=eq.${lojaId}&select=wa_instancia`);
  const inst = lojas[0]?.wa_instancia;
  if (!inst) return json({ conectado: false });
  const r = await evo(env, `/instance/connectionState/${inst}`);
  const j = (await r.json().catch(() => ({}))) as { instance?: { state?: string } };
  const estado = j.instance?.state ?? 'close';
  if (estado === 'open') await sb(env, `reboka_lojas?id=eq.${lojaId}`, { method: 'PATCH', body: JSON.stringify({ wa_numero: inst }) });
  return json({ conectado: estado === 'open', estado });
}

/** Envio proativo (carro pronto, cobrança), chamado pelo próprio app autenticado. */
export async function waEnviar(env: Env, lojaId: string, telefone: string, texto: string): Promise<Response> {
  if (!env.EVOLUTION_URL) return json({ erro: 'não configurado' }, 400);
  const lojas = await sb<Loja[]>(env, `reboka_lojas?id=eq.${lojaId}&wa_ativo=is.true&plano=eq.pro_ia&select=id,wa_instancia`);
  if (!lojas.length || !lojas[0].wa_instancia) return json({ erro: 'WhatsApp não ativo.' }, 400);
  await evoEnviar(env, lojas[0].wa_instancia, telefone, texto);
  await sb(env, 'reboka_wa_mensagens', { method: 'POST', body: JSON.stringify([{ loja_id: lojaId, telefone: soDig(telefone), direcao: 'out', texto }]) });
  return json({ ok: true });
}

/** Cron diário: manda os retornos vencidos do dia para quem ligou a opção. */
export async function waCronRetornos(env: Env) {
  if (!env.EVOLUTION_URL || !env.ANTHROPIC_API_KEY) return;
  const lojas = await sb<{ id: string; wa_instancia: string }[]>(env, `reboka_lojas?wa_ativo=is.true&plano=eq.pro_ia&wa_proativo_retorno=is.true&select=id,wa_instancia`);
  for (const loja of lojas) {
    const doDia = await sb<{ cliente: string; telefone: string; servico: string | null; dias: number }[]>(
      env, `reboka_hoje?loja_id=eq.${loja.id}&motivo=eq.retorno_vencido&telefone=not.is.null&select=cliente,telefone,servico,dias&limit=20`).catch(() => []);
    for (const i of doDia) {
      const texto = `Oi, ${i.cliente.split(' ')[0]}! Já faz ${i.dias} dias da última ${i.servico ?? 'serviço'}. Quer agendar a próxima? É só me dizer o dia. 🚗`;
      await evoEnviar(env, loja.wa_instancia, i.telefone, texto).catch(() => {});
      await sb(env, 'reboka_wa_mensagens', { method: 'POST', body: JSON.stringify([{ loja_id: loja.id, telefone: soDig(i.telefone), direcao: 'out', texto }]) }).catch(() => {});
    }
  }
}
