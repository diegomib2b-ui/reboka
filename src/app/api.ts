import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

export type Papel = 'dono' | 'gestor' | 'recepcao';
export type Loja = { id: string; nome: string; documento: string | null; plano: 'essencial' | 'equipe' | 'pro_ia'; assinatura: string; teste_termina_em: string; meta_mensal: number | null;
  periodicidade: 'mensal' | 'anual' | null; mp_assinatura_id: string | null; acesso_ate: string | null;
  slug: string | null; agendar_ativo: boolean; agendar_dias: number[]; agendar_hora_ini: number; agendar_hora_fim: number; agendar_intervalo: number;
  avaliar_ativo: boolean; google_review_url: string | null;
  fidelidade_ativo: boolean; fidelidade_meta: number; fidelidade_premio: string;
  comissao_tipo: 'percentual' | 'fixo'; comissao_valor: number;
  pix_chave: string | null; pix_nome: string | null; pix_cidade: string | null;
  wa_ativo: boolean; wa_instancia: string | null; wa_numero: string | null; wa_persona: string | null; wa_proativo_retorno: boolean; wa_proativo_pronto: boolean;
  perfil: 'oficina' | 'funilaria' | 'misto'; vagas_funilaria: number; carros_por_horario: number;
  /** Tabela de preço do guincho: a cotação do chamado sai destes números. */
  /** Link público "Pedir guincho": ligado ou não, e o WhatsApp que o cliente vê depois de pedir. */
  pedir_ativo: boolean; pedir_telefone: string | null;
  tarifa_saida: number; tarifa_km: number; tarifa_franquia_km: number; tarifa_noturno_pct: number; tarifa_adicionais: Adicional[] };
export type Adicional = { nome: string; valor: number };
export type Membro = { loja_id: string; usuario_id: string; papel: Papel; nome: string; reboka_lojas: Loja };
export type Pessoa = { usuario_id: string; nome: string; papel: Papel; criado_em: string };
export type Convite = { id: string; email: string; papel: Papel; criado_em: string; aceito_em: string | null };
export type Ranking = { usuario_id: string; nome: string; papel: Papel; contatos: number; voltaram: number; recuperado: number };
export type Registro = { id: number; quem: string; acao: string; criado_em: string };
export type Fatia = { nome: string; valor: number; quantidade: number };
export const LIMITE_CLIENTES = { essencial: 1000, equipe: 7000, pro_ia: 7000 } as const;
export type Servico = { id: string; nome: string; ciclo_retorno_dias: number | null; ciclo_retorno_km: number | null; valor_medio: number; ativo: boolean; adicional: boolean; dura_dias: number | null };
export type Cliente = {
  id: string; nome: string; telefone: string; origem: string; nao_contatar: boolean;
  observacao: string | null; ultimo_contato_em: string | null; demo: boolean; criado_em: string; responsavel_id: string | null;
  /** Resumo do carro principal e de todos os carros (para a busca). Quem manda é a lista de carros da ficha. */
  veiculo: string | null; placa: string | null; carros?: string | null;
};
/** Um carro do cliente. km é a última leitura do painel; km_mes é a média que o banco calcula pelas leituras. */
export type Veiculo = { id: string; cliente_id: string; modelo: string | null; placa: string | null; km: number | null; km_em: string | null; km_mes: number | null };
/** Carro e placa por cliente, para as listas que vêm de views (Hoje e Reativação). */
export type Carro = { veiculo: string | null; placa: string | null };
/** Hoje no relógio da empresa (AAAA-MM-DD), para datar a leitura do painel. */
const hojeLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const limparPlaca = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export type Atendimento = {
  id: string; servico_nome: string; data: string; valor: number; ciclo_dias: number | null;
  sessao_numero: number | null; sessoes_total: number | null; retorno_previsto_em: string | null; profissional: string | null;
  veiculo_id: string | null; km: number | null; ciclo_km: number | null;
};
export type Etapa = 'novo_contato' | 'avaliacao_agendada' | 'avaliacao_feita' | 'orcamento_enviado' | 'fechado' | 'perdido';
export type Oportunidade = {
  id: string; cliente_id: string; servico_id: string | null; etapa: Etapa; valor_estimado: number;
  motivo_perda: string | null; proxima_acao: string | null; proxima_acao_em: string | null; etapa_desde: string; criado_em: string;
  reboka_clientes: { nome: string; telefone: string }; reboka_servicos: { nome: string } | null;
  /** Resumo do orçamento da negociação, quando existe (o banco devolve objeto ou lista de um item). */
  reboka_orcamentos?: OrcamentoResumo | OrcamentoResumo[] | null;
};
export type StatusOrcamento = 'rascunho' | 'enviado' | 'aprovado' | 'recusado';
export type OrcamentoResumo = { id: string; status: StatusOrcamento; token: string; visto_em: string | null; respondido_em: string | null };
export type ItemOrcamento = { id?: string; tipo: 'peca' | 'servico'; descricao: string; quantidade: number; valor_unitario: number; aprovado?: boolean | null };
export type Orcamento = OrcamentoResumo & { veiculo_id: string | null; observacao: string | null; validade: string | null; reboka_orcamento_itens: (ItemOrcamento & { ordem: number })[] };
export const orcamentoDe = (o: Oportunidade): OrcamentoResumo | null => { const x = o.reboka_orcamentos; return (Array.isArray(x) ? x[0] : x) ?? null; };
export type LinhaImportada = {
  nome: string; telefone: string; origem: string; observacao: string | null;
  servico: string | null; data: string | null; valor: number; veiculo: string | null; placa: string | null;
};
export type Resumo = {
  faturamento: number; recuperado: number; atendimentos: number; retornos: number; voltaram_apos_contato: number;
  clientes_atendidas: number; clientes_novas: number; contatos: number; negociacoes_novas: number;
  fechadas: number; valor_fechado: number; perdidas: number; valor_perdido: number;
  motivos: Record<string, number>; servicos: Fatia[]; origens: Fatia[]; profissionais: Fatia[];
};
export type MesEvolucao = { mes: string; faturamento: number; atendimentos: number; recuperado: number };
export type Sumida = {
  cliente_id: string; nome: string; telefone: string; ultimo_contato_em: string | null;
  ultima_data: string; servico_nome: string; dias: number; total: number; visitas: number;
};
export type Contato = { id: string; canal: string; observacao: string | null; criado_em: string };
export type Modelo = { id: string; titulo: string; texto: string };
export type Retorno = {
  cliente_id: string; cliente: string; telefone: string;
  servico: string | null; profissional: string | null; previsto: string;
  veiculo: string | null; placa: string | null;
};
export type ItemHoje = {
  cliente_id: string; cliente: string; telefone: string;
  motivo: 'retorno_vencido' | 'orcamento_parado' | 'pacote_atrasado' | 'novo_sem_resposta' | 'pos_servico' | 'itens_recusados';
  prioridade: number; servico: string | null; dias: number; valor_estimado: number;
  ciclo_dias: number | null; referencia: string;
  /** Carro do item, ciclo por km e se o retorno venceu pela quilometragem estimada (e não pelo tempo). */
  veiculo_id: string | null; veiculo: string | null; placa: string | null; ciclo_km: number | null; por_km: boolean;
};
export type StatusPatio = 'fila' | 'em_servico' | 'pronto' | 'entregue';
export type Patio = {
  id: string; cliente_id: string | null; nome: string; telefone: string | null;
  veiculo: string | null; placa: string | null; servico_nome: string | null; valor: number;
  mecanico: string | null; status: StatusPatio; avisado_em: string | null;
  criado_em: string; iniciado_em: string | null; pronto_em: string | null; entregue_em: string | null;
};

export type Agendamento = {
  id: string; nome: string; telefone: string | null; veiculo: string | null; servico_nome: string | null;
  inicio: string; status: 'pendente' | 'confirmado' | 'cancelado' | 'compareceu' | 'fila' | 'em_servico' | 'pronto' | 'entregue'; criado_em: string;
  previsao_entrega: string | null; vaga: number | null;
  /** Campos do chamado de guincho (migration 0024). */
  origem: string | null; destino: string | null; km: number | null; valor: number | null; noturno: boolean;
  adicionais: Adicional[]; motorista: string | null; placa: string | null; pagador: string | null; pago: boolean; observacao: string | null;
  /** 'link' quando o cliente pediu pelo link público; com a posição do celular, se ele enviou. */
  canal?: string | null; origem_lat?: number | null; origem_lng?: number | null; tem_foto?: boolean; cotacao_enviada_em?: string | null;
};
export type PedirInfo = { nome: string; telefone: string | null; servicos: string[] };
export type Pedido = { nome: string; telefone: string; veiculo: string; placa: string; servico: string; origem: string; destino: string; observacao: string; lat: number | null; lng: number | null };
/** Fases do chamado na tela. No banco são os status do motor: fila, em_servico, pronto e entregue (confirmado = agendado). */
export type NovoChamado = { nome: string; telefone: string | null; veiculo: string | null; placa: string | null; servico_nome: string | null;
  origem: string | null; destino: string | null; km: number | null; valor: number | null; noturno: boolean; adicionais: Adicional[];
  motorista: string | null; pagador: string | null; observacao: string | null; inicio: string; status: Agendamento['status'] };
export type AgendaServico = { nome: string; valor: number };
export type Avaliacao = { id: string; nota: number; comentario: string | null; nome: string | null; criado_em: string };
export type AvaliarInfo = { loja_id: string; nome: string; google_url: string | null };
export type Cartao = { cliente_id: string; cliente: string; telefone: string | null; veiculo: string | null; placa: string | null; selos: number; resgates: number };
export type AgendaInfo = { loja_id: string; nome: string; dias: number[]; hora_ini: number; hora_fim: number; intervalo: number; servicos: AgendaServico[] };
export type Plano = { id: string; nome: string; preco_mensal: number; servicos_mes: number | null; ativo: boolean };
export type Mensalista = {
  id: string; cliente_id: string; cliente: string; telefone: string | null; veiculo: string | null; placa: string | null;
  plano_id: string; plano: string; preco_mensal: number; servicos_mes: number | null;
  dia_vencimento: number; status: 'ativo' | 'pausado' | 'cancelado'; usados: number; pago: boolean;
};

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export const api = {
  async minhaLoja(): Promise<Membro | null> {
    const linhas = ok(await sb.from('reboka_membros').select('loja_id, usuario_id, papel, nome, reboka_lojas(*)').eq('usuario_id', (await sb.auth.getSession()).data.session?.user.id ?? '').limit(1));
    return (linhas as unknown as Membro[])[0] ?? null;
  },
  async criarLoja(nomeLoja: string, nomeUsuario: string, plano: string) {
    return ok(await sb.rpc('reboka_criar_loja', { nome_loja: nomeLoja, nome_usuario: nomeUsuario, plano_escolhido: plano }));
  },
  async hoje(): Promise<ItemHoje[]> {
    const itens = ok(await sb.from('reboka_hoje').select('*').order('prioridade').order('valor_estimado', { ascending: false })) as ItemHoje[];
    // Dinheiro parado na mesa vem primeiro: orçamento sem resposta e contato novo sobem para o topo; o resto mantém a ordem do banco.
    const peso = (i: ItemHoje) => (i.motivo === 'orcamento_parado' ? 0 : i.motivo === 'novo_sem_resposta' ? 1 : 2);
    return itens.map((i, n) => ({ i, n })).sort((a, b) => peso(a.i) - peso(b.i) || a.n - b.n).map((x) => x.i);
  },
  /** Retornos previstos (próxima revisão/serviço) numa janela de datas — alimenta o painel de Retorno dentro da Agenda. */
  async retornos(ini: string, fim: string): Promise<Retorno[]> {
    return (ok(await sb.rpc('reboka_retornos', { p_ini: ini, p_fim: fim })) as Retorno[])
      .sort((a, b) => a.previsto.localeCompare(b.previsto));
  },
  /** Uma consulta só para os carros de uma lista de clientes: as views não trazem essas colunas. */
  async carros(ids: string[]): Promise<Record<string, Carro>> {
    const unicos = [...new Set(ids)];
    if (!unicos.length) return {};
    const l = ok(await sb.from('reboka_clientes').select('id, veiculo, placa').in('id', unicos)) as (Carro & { id: string })[];
    return Object.fromEntries(l.map((x) => [x.id, { veiculo: x.veiculo, placa: x.placa }]));
  },
  async modelos(): Promise<Modelo[]> {
    return ok(await sb.from('reboka_modelos').select('id, titulo, texto').order('criado_em'));
  },
  async servicos(): Promise<Servico[]> {
    return ok(await sb.from('reboka_servicos').select('*').eq('ativo', true).order('nome'));
  },
  async clientes(busca: string): Promise<Cliente[]> {
    let q = sb.from('reboka_clientes').select('*').order('nome').limit(200);
    const t = busca.trim();
    // Só números: telefone. Senão procura no nome e em todos os carros do cliente (sem os sinais que quebram o filtro).
    const livre = t.replace(/[,()%*\\]/g, ' ').trim();
    // Telefone é o texto sem letras (placa também tem números, então não basta contar dígitos).
    if (t) q = /^[\d\s()+.-]+$/.test(t) && t.replace(/\D/g, '').length >= 3
      ? q.ilike('telefone', `%${t.replace(/\D/g, '')}%`)
      : q.or(`nome.ilike.%${livre}%,carros.ilike.%${livre}%${limparPlaca(livre).length >= 3 ? `,carros.ilike.%${limparPlaca(livre)}%` : ''}`);
    return ok(await q);
  },
  async cliente(id: string) {
    const [p, a, c, v] = await Promise.all([
      sb.from('reboka_clientes').select('*').eq('id', id).maybeSingle(),
      sb.from('reboka_atendimentos').select('*').eq('cliente_id', id).order('data', { ascending: false }),
      sb.from('reboka_contatos').select('*').eq('cliente_id', id).order('criado_em', { ascending: false }).limit(30),
      sb.from('reboka_veiculos').select('id, cliente_id, modelo, placa, km, km_em, km_mes').eq('cliente_id', id).order('criado_em'),
    ]);
    return { cliente: ok(p) as Cliente | null, atendimentos: ok(a) as Atendimento[], contatos: ok(c) as Contato[], veiculos: ok(v) as Veiculo[] };
  },
  async salvarCliente(lojaId: string, d: { id?: string; nome: string; telefone: string; origem: string; observacao?: string | null; responsavel_id?: string | null; veiculo?: string | null; placa?: string | null }) {
    const linha: Record<string, unknown> = { loja_id: lojaId, nome: d.nome.trim(), telefone: d.telefone.replace(/\D/g, ''), origem: d.origem, observacao: d.observacao ?? null };
    if (d.responsavel_id !== undefined) linha.responsavel_id = d.responsavel_id;
    const r = d.id
      ? await sb.from('reboka_clientes').update(linha).eq('id', d.id).select('id').single()
      : await sb.from('reboka_clientes').insert(linha).select('id').single();
    if (r.error?.message.includes('duplicate')) throw new Error('Já existe um cliente com esse telefone.');
    const id = ok(r).id as string;
    // No cadastro novo, o carro informado vira o primeiro carro do cliente. Depois disso, os carros são editados na ficha.
    if (!d.id && (d.veiculo?.trim() || limparPlaca(d.placa ?? ''))) await api.salvarVeiculo(lojaId, id, { modelo: d.veiculo ?? '', placa: d.placa ?? '', km: null });
    return id;
  },
  async salvarVeiculo(lojaId: string, clienteId: string, d: { id?: string; modelo: string; placa: string; km: number | null; kmMudou?: boolean }) {
    const linha: Record<string, unknown> = { modelo: d.modelo.replace(/\s+/g, ' ').trim() || null, placa: limparPlaca(d.placa) || null };
    if (!linha.modelo && !linha.placa) throw new Error('Informe o modelo ou a placa do carro.');
    if (linha.placa && String(linha.placa).length < 5) throw new Error('A placa precisa ter de 5 a 8 letras e números.');
    // A leitura do painel só é regravada quando muda, para a data da leitura continuar certa.
    if (!d.id || d.kmMudou) { linha.km = d.km; linha.km_em = d.km === null ? null : hojeLocal(); }
    ok(d.id
      ? await sb.from('reboka_veiculos').update(linha).eq('id', d.id).select('id')
      : await sb.from('reboka_veiculos').insert({ loja_id: lojaId, cliente_id: clienteId, ...linha }).select('id'));
  },
  async apagarVeiculo(id: string) {
    ok(await sb.from('reboka_veiculos').delete().eq('id', id).select('id'));
  },
  async marcarNaoContatar(id: string, valor: boolean) {
    ok(await sb.from('reboka_clientes').update({ nao_contatar: valor }).eq('id', id).select('id'));
  },
  async apagarCliente(id: string) {
    ok(await sb.from('reboka_clientes').delete().eq('id', id).select('id'));
  },
  async registrarAtendimento(lojaId: string, clienteId: string, proc: Servico, d: { data: string; valor: number; sessao?: number | null; total?: number | null; profissional?: string | null; veiculoId?: string | null; km?: number | null }) {
    ok(await sb.from('reboka_atendimentos').insert({
      loja_id: lojaId, cliente_id: clienteId, servico_id: proc.id, servico_nome: proc.nome,
      data: d.data, valor: d.valor, ciclo_dias: proc.ciclo_retorno_dias, sessao_numero: d.sessao ?? null, sessoes_total: d.total ?? null, profissional: d.profissional?.trim() || null,
      veiculo_id: d.veiculoId ?? null, km: d.km ?? null, ciclo_km: proc.ciclo_retorno_km,
    }).select('id'));
  },
  async registrarContato(lojaId: string, clienteId: string, observacao: string) {
    const { data } = await sb.auth.getUser();
    ok(await sb.from('reboka_contatos').insert({ loja_id: lojaId, cliente_id: clienteId, usuario_id: data.user?.id, canal: 'whatsapp', observacao }).select('id'));
  },
  async oportunidades(): Promise<Oportunidade[]> {
    return ok(await sb.from('reboka_oportunidades')
      .select('*, reboka_clientes(nome, telefone), reboka_servicos(nome), reboka_orcamentos(id, status, token, visto_em, respondido_em)').order('etapa_desde')) as unknown as Oportunidade[];
  },
  async orcamento(oportunidadeId: string): Promise<Orcamento | null> {
    const o = ok(await sb.from('reboka_orcamentos').select('*, reboka_orcamento_itens(*)').eq('oportunidade_id', oportunidadeId).maybeSingle()) as Orcamento | null;
    o?.reboka_orcamento_itens.sort((a, b) => a.ordem - b.ordem);
    return o;
  },
  async veiculosDoCliente(clienteId: string): Promise<Veiculo[]> {
    return ok(await sb.from('reboka_veiculos').select('id, cliente_id, modelo, placa, km, km_em, km_mes').eq('cliente_id', clienteId).order('criado_em'));
  },
  /** Grava o orçamento inteiro numa chamada só e devolve o token do link. Com enviar, marca como enviado e move o cartão. */
  async salvarOrcamento(oportunidadeId: string, d: { veiculo_id: string | null; observacao: string; validade: string | null; itens: ItemOrcamento[] }, enviar = false): Promise<string> {
    return ok(await sb.rpc('reboka_salvar_orcamento', { op: oportunidadeId, carro: d.veiculo_id, obs: d.observacao, valido_ate: d.validade,
      itens: d.itens.map((i) => ({ tipo: i.tipo, descricao: i.descricao, quantidade: i.quantidade, valor_unitario: i.valor_unitario })), enviar }));
  },
  async salvarOportunidade(lojaId: string, d: {
    id?: string; cliente_id?: string; servico_id: string | null; valor_estimado: number; etapa?: Etapa;
    proxima_acao?: string | null; proxima_acao_em?: string | null;
  }) {
    const { id, ...campos } = d;
    ok(id
      ? await sb.from('reboka_oportunidades').update(campos).eq('id', id).select('id')
      : await sb.from('reboka_oportunidades').insert({ loja_id: lojaId, ...campos }).select('id'));
  },
  /** Sair de "perdido" limpa o motivo: o banco só aceita motivo quando a etapa é perdido. */
  async moverOportunidade(id: string, etapa: Etapa, motivo?: string) {
    ok(await sb.from('reboka_oportunidades').update({ etapa, motivo_perda: etapa === 'perdido' ? motivo ?? 'outro' : null }).eq('id', id).select('id'));
  },
  async apagarOportunidade(id: string) {
    ok(await sb.from('reboka_oportunidades').delete().eq('id', id).select('id'));
  },
  async todosServicos(): Promise<Servico[]> {
    return ok(await sb.from('reboka_servicos').select('*').order('nome'));
  },
  async criarServico(lojaId: string, nome: string, ciclo: number | null, valor: number): Promise<Servico> {
    return ok(await sb.from('reboka_servicos')
      .insert({ loja_id: lojaId, nome, ciclo_retorno_dias: ciclo, valor_medio: valor }).select('*').single());
  },
  /**
   * Importa em lotes de 500. Telefone que já existe na empresa é ignorado (não sobrescreve cadastro).
   * O atendimento só entra para cliente novo, então importar a mesma planilha duas vezes não duplica nada.
   */
  async importar(lojaId: string, linhas: LinhaImportada[], procs: Map<string, Servico>, chave: (t: string) => string, demo: boolean,
    progresso: (feitas: number) => void) {
    let novas = 0, atendimentos = 0;
    for (let i = 0; i < linhas.length; i += 500) {
      const lote = linhas.slice(i, i + 500);
      const criadas = ok(await sb.from('reboka_clientes')
        .upsert(lote.map((l) => ({ loja_id: lojaId, nome: l.nome, telefone: l.telefone, origem: l.origem, observacao: l.observacao, demo })),
          { onConflict: 'loja_id,telefone', ignoreDuplicates: true })
        .select('id, telefone')) as { id: string; telefone: string }[];
      novas += criadas.length;
      const idPorTelefone = new Map(criadas.map((c) => [c.telefone, c.id]));
      // O carro da planilha vira o primeiro carro de cada cliente novo.
      const carros = lote.flatMap((l) => {
        const pid = idPorTelefone.get(l.telefone);
        return pid && (l.veiculo || l.placa) ? [{ loja_id: lojaId, cliente_id: pid, modelo: l.veiculo, placa: l.placa }] : [];
      });
      const carroPorCliente = new Map<string, string>();
      if (carros.length) for (const v of ok(await sb.from('reboka_veiculos').insert(carros).select('id, cliente_id')) as { id: string; cliente_id: string }[]) carroPorCliente.set(v.cliente_id, v.id);
      const ats = lote.flatMap((l) => {
        const pid = idPorTelefone.get(l.telefone);
        const proc = l.servico ? procs.get(chave(l.servico)) : undefined;
        if (!pid || !proc || !l.data) return [];
        return [{ loja_id: lojaId, cliente_id: pid, servico_id: proc.id, servico_nome: proc.nome,
          data: l.data, valor: l.valor || Number(proc.valor_medio), ciclo_dias: proc.ciclo_retorno_dias, ciclo_km: proc.ciclo_retorno_km, veiculo_id: carroPorCliente.get(pid) ?? null }];
      });
      if (ats.length) { ok(await sb.from('reboka_atendimentos').insert(ats).select('id')); atendimentos += ats.length; }
      progresso(Math.min(i + 500, linhas.length));
    }
    return { novas, jaExistiam: linhas.length - novas, atendimentos };
  },
  async popularDemo(lojaId: string): Promise<number> {
    ok(await sb.rpc('reboka_popular_demo', { c: lojaId }));
    const n = ok(await sb.rpc('reboka_popular_demo_historico', { c: lojaId })) as number;
    ok(await sb.rpc('reboka_popular_demo_extra', { c: lojaId }));
    ok(await sb.rpc('reboka_popular_demo_veiculos', { c: lojaId }));
    ok(await sb.rpc('reboka_popular_demo_orcamentos', { c: lojaId }));
    return n;
  },
  async resumo(lojaId: string, de: string, ate: string): Promise<Resumo> {
    return ok(await sb.rpc('reboka_resumo', { c: lojaId, de, ate }));
  },
  async evolucao(lojaId: string, meses = 6): Promise<MesEvolucao[]> {
    return ok(await sb.rpc('reboka_evolucao', { c: lojaId, meses }));
  },
  async sumidas(): Promise<Sumida[]> {
    return ok(await sb.from('reboka_reativacao').select('*').order('total', { ascending: false }).limit(300));
  },
  async sumidasResumo(dias = 90): Promise<{ qtd: number; total: number }> {
    const r = await sb.rpc('reboka_reativacao_resumo', { p_dias: dias });
    if (r.error) throw r.error;
    const row = (r.data as { qtd: number; total: number }[] | null)?.[0];
    return { qtd: Number(row?.qtd ?? 0), total: Number(row?.total ?? 0) };
  },
  async veiculosSugestoes(): Promise<string[]> {
    const r = ok(await sb.from('reboka_clientes').select('veiculo').not('veiculo', 'is', null).limit(500)) as { veiculo: string | null }[];
    return Array.from(new Set(r.map((v) => (v.veiculo ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  },
  async ultimosRecebimentos(limite = 8): Promise<{ id: string; nome: string | null; servico_nome: string | null; valor: number; data: string }[]> {
    const r = ok(await sb.from('reboka_atendimentos')
      .select('id, servico_nome, valor, data, reboka_clientes(nome)')
      .order('data', { ascending: false }).limit(limite)) as unknown as { id: string; servico_nome: string | null; valor: number; data: string; reboka_clientes: { nome: string } | null }[];
    return r.map((a) => ({ id: a.id, nome: a.reboka_clientes?.nome ?? null, servico_nome: a.servico_nome, valor: Number(a.valor), data: a.data }));
  },
  async salvarPixConfig(lojaId: string, d: { pix_chave?: string | null; pix_nome?: string | null; pix_cidade?: string | null }) {
    ok(await sb.from('reboka_lojas').update(d).eq('id', lojaId).select('id'));
  },
  async salvarServico(lojaId: string, d: { id?: string; nome: string; ciclo_retorno_dias: number | null; ciclo_retorno_km: number | null; valor_medio: number; ativo: boolean; adicional?: boolean; dura_dias?: number | null }) {
    const { id, ...campos } = d;
    const r = id
      ? await sb.from('reboka_servicos').update(campos).eq('id', id).select('id')
      : await sb.from('reboka_servicos').insert({ loja_id: lojaId, ...campos }).select('id');
    if (r.error?.message.includes('duplicate')) throw new Error('Já existe um serviço com esse nome.');
    ok(r);
  },
  // ----- equipe, conta e mensagens -----
  async aceitarConvites(): Promise<number> { return ok(await sb.rpc('reboka_aceitar_convites')); },
  async equipe(lojaId: string): Promise<Pessoa[]> {
    return ok(await sb.from('reboka_membros').select('usuario_id, nome, papel, criado_em').eq('loja_id', lojaId).order('criado_em'));
  },
  async convites(lojaId: string): Promise<Convite[]> {
    return ok(await sb.from('reboka_convites').select('id, email, papel, criado_em, aceito_em').eq('loja_id', lojaId).is('aceito_em', null).order('criado_em'));
  },
  async convidar(lojaId: string, email: string, papel: Papel) {
    ok(await sb.rpc('reboka_convidar', { c: lojaId, email_convidado: email, papel_convidado: papel }));
  },
  async cancelarConvite(id: string) { ok(await sb.from('reboka_convites').delete().eq('id', id).select('id')); },
  async mudarPapel(lojaId: string, usuarioId: string, papel: Papel) {
    ok(await sb.from('reboka_membros').update({ papel }).eq('loja_id', lojaId).eq('usuario_id', usuarioId).select('papel'));
  },
  async removerPessoa(lojaId: string, usuarioId: string) {
    ok(await sb.from('reboka_membros').delete().eq('loja_id', lojaId).eq('usuario_id', usuarioId).select('papel'));
  },
  async ranking(lojaId: string, de: string, ate: string): Promise<Ranking[]> {
    return ok(await sb.rpc('reboka_equipe_resumo', { c: lojaId, de, ate }));
  },
  async registro(lojaId: string): Promise<Registro[]> {
    return ok(await sb.from('reboka_registro').select('id, quem, acao, criado_em').eq('loja_id', lojaId).order('criado_em', { ascending: false }).limit(60));
  },
  async salvarLoja(id: string, d: { nome: string; documento: string | null; meta_mensal: number | null; perfil?: Loja['perfil']; vagas_funilaria?: number }) {
    ok(await sb.from('reboka_lojas').update(d).eq('id', id).select('id'));
  },
  async trocarPlano(lojaId: string, plano: Loja['plano']) { ok(await sb.rpc('reboka_trocar_plano', { c: lojaId, novo: plano })); },
  async totalClientes(): Promise<number> {
    return (await sb.from('reboka_clientes').select('*', { count: 'exact', head: true })).count ?? 0;
  },
  async salvarModelo(lojaId: string, d: { id?: string; titulo: string; texto: string }) {
    ok(d.id
      ? await sb.from('reboka_modelos').update({ texto: d.texto }).eq('id', d.id).select('id')
      : await sb.from('reboka_modelos').insert({ loja_id: lojaId, titulo: d.titulo, texto: d.texto }).select('id'));
  },
  async minhasClientes(usuarioId: string): Promise<string[]> {
    const l = ok(await sb.from('reboka_clientes').select('id').eq('responsavel_id', usuarioId).limit(5000)) as { id: string }[];
    return l.map((x) => x.id);
  },
  async profissionais(): Promise<string[]> {
    const l = ok(await sb.from('reboka_atendimentos').select('profissional').not('profissional', 'is', null).order('criado_em', { ascending: false }).limit(300)) as { profissional: string }[];
    return [...new Set(l.map((x) => x.profissional))].slice(0, 20);
  },
  /** Exportação para a empresa levar os dados embora (LGPD). Busca em páginas de 1.000, o teto de linhas por consulta. */
  async exportarClientes(): Promise<(Cliente & { reboka_atendimentos: { data: string; servico_nome: string; valor: number }[] })[]> {
    const tudo: never[] = [];
    for (let i = 0; ; i += 1000) {
      const pagina = ok(await sb.from('reboka_clientes').select('*, reboka_atendimentos(data, servico_nome, valor)').order('nome').range(i, i + 999)) as never[];
      tudo.push(...pagina);
      if (pagina.length < 1000) break;
    }
    return tudo;
  },
  async negociacoesDaCliente(clienteId: string): Promise<Oportunidade[]> {
    return ok(await sb.from('reboka_oportunidades')
      .select('*, reboka_clientes(nome, telefone), reboka_servicos(nome)').eq('cliente_id', clienteId)
      .order('criado_em', { ascending: false })) as unknown as Oportunidade[];
  },
  async limparDemo(lojaId: string): Promise<number> { return ok(await sb.rpc('reboka_limpar_demo', { c: lojaId })); },
  // ----- pátio (fila operacional) -----
  /** Carros ainda no pátio (não entregues), mais recentes por último dentro de cada coluna. */
  async patio(): Promise<Patio[]> {
    return ok(await sb.from('reboka_patio').select('*').neq('status', 'entregue').order('criado_em')) as Patio[];
  },
  async patioAdicionar(lojaId: string, d: { cliente_id?: string | null; nome: string; telefone?: string | null; veiculo?: string | null; placa?: string | null; servico_nome?: string | null; valor?: number; mecanico?: string | null }) {
    ok(await sb.from('reboka_patio').insert({
      loja_id: lojaId, cliente_id: d.cliente_id ?? null, nome: d.nome.trim(),
      telefone: d.telefone?.replace(/\D/g, '') || null, veiculo: d.veiculo?.trim() || null, placa: limparPlaca(d.placa ?? '') || null,
      servico_nome: d.servico_nome?.trim() || null, valor: d.valor ?? 0, mecanico: d.mecanico?.trim() || null,
    }).select('id'));
  },
  /** Move o carro de coluna e carimba o horário da etapa. */
  async patioMover(id: string, status: StatusPatio) {
    const campos: Record<string, unknown> = { status };
    if (status === 'em_servico') campos.iniciado_em = new Date().toISOString();
    if (status === 'pronto') campos.pronto_em = new Date().toISOString();
    ok(await sb.from('reboka_patio').update(campos).eq('id', id).select('id'));
  },
  async patioAvisado(id: string) {
    ok(await sb.from('reboka_patio').update({ avisado_em: new Date().toISOString() }).eq('id', id).select('id'));
  },
  async patioDefinirServico(id: string, servico_nome: string, valor: number) {
    ok(await sb.from('reboka_patio').update({ servico_nome, valor }).eq('id', id).select('id'));
  },
  async patioRemover(id: string) { ok(await sb.from('reboka_patio').delete().eq('id', id).select('id')); },
  /** Entregar: tira do pátio e, se houver serviço reconhecido e valor, registra o atendimento (entra no caixa e nos retornos). */
  async patioEntregar(lojaId: string, carro: Patio, servicos: Servico[]) {
    ok(await sb.from('reboka_patio').update({ status: 'entregue', entregue_em: new Date().toISOString() }).eq('id', carro.id).select('id'));
    const proc = carro.servico_nome ? servicos.find((s) => s.nome.toLowerCase() === carro.servico_nome!.toLowerCase()) : null;
    if (carro.cliente_id && proc && Number(carro.valor) > 0) {
      await this.registrarAtendimento(lojaId, carro.cliente_id, proc, { data: hojeLocal(), valor: Number(carro.valor), profissional: carro.mecanico });
    }
    // Fidelidade: ganha um selo (a função ignora se a fidelidade estiver desativada).
    if (carro.cliente_id) { try { await sb.rpc('reboka_fidelidade_marcar', { c_loja: lojaId, c_cliente: carro.cliente_id }); } catch { /* opcional */ } }
  },
  // ----- fidelidade -----
  async fidelidade(lojaId: string): Promise<Cartao[]> {
    return ok(await sb.rpc('reboka_fidelidade_lista', { c: lojaId })) as Cartao[];
  },
  async marcarSelo(lojaId: string, clienteId: string): Promise<number> {
    return ok(await sb.rpc('reboka_fidelidade_marcar', { c_loja: lojaId, c_cliente: clienteId })) as number;
  },
  async resgatarFidelidade(lojaId: string, clienteId: string, meta: number) {
    const atual = ok(await sb.from('reboka_fidelidade').select('selos, resgates').eq('loja_id', lojaId).eq('cliente_id', clienteId).single()) as { selos: number; resgates: number };
    ok(await sb.from('reboka_fidelidade').update({ selos: Math.max(0, atual.selos - meta), resgates: atual.resgates + 1, atualizado_em: new Date().toISOString() })
      .eq('loja_id', lojaId).eq('cliente_id', clienteId).select('cliente_id'));
  },
  async salvarFidelidadeConfig(lojaId: string, d: { fidelidade_ativo?: boolean; fidelidade_meta?: number; fidelidade_premio?: string }) {
    ok(await sb.from('reboka_lojas').update(d).eq('id', lojaId).select('id'));
  },
  async salvarComissaoConfig(lojaId: string, d: { comissao_tipo?: 'percentual' | 'fixo'; comissao_valor?: number }) {
    ok(await sb.from('reboka_lojas').update(d).eq('id', lojaId).select('id'));
  },
  // ----- mensalistas (planos recorrentes) -----
  async planos(soAtivos = false): Promise<Plano[]> {
    let q = sb.from('reboka_planos').select('id, nome, preco_mensal, servicos_mes, ativo').order('preco_mensal');
    if (soAtivos) q = q.eq('ativo', true);
    return ok(await q) as Plano[];
  },
  async salvarPlano(lojaId: string, d: { id?: string; nome: string; preco_mensal: number; servicos_mes: number | null; ativo: boolean }) {
    const { id, ...campos } = d;
    ok(id ? await sb.from('reboka_planos').update(campos).eq('id', id).select('id')
          : await sb.from('reboka_planos').insert({ loja_id: lojaId, ...campos }).select('id'));
  },
  async apagarPlano(id: string) { ok(await sb.from('reboka_planos').delete().eq('id', id).select('id')); },
  async mensalistas(lojaId: string): Promise<Mensalista[]> {
    return ok(await sb.rpc('reboka_mensalistas_lista', { c: lojaId })) as Mensalista[];
  },
  async adicionarMensalista(lojaId: string, d: { cliente_id: string; plano_id: string; dia_vencimento: number }) {
    const r = await sb.from('reboka_mensalistas').insert({ loja_id: lojaId, ...d }).select('id');
    if (r.error?.message.includes('duplicate')) throw new Error('Esse cliente já é mensalista.');
    ok(r);
  },
  async mudarStatusMensalista(id: string, status: 'ativo' | 'pausado' | 'cancelado') {
    ok(await sb.from('reboka_mensalistas').update({ status }).eq('id', id).select('id'));
  },
  async removerMensalista(id: string) { ok(await sb.from('reboka_mensalistas').delete().eq('id', id).select('id')); },
  /** Marca o mês atual como pago (competência = primeiro dia do mês). */
  async registrarPagamento(lojaId: string, m: Mensalista) {
    const comp = new Date(); comp.setDate(1);
    const r = await sb.from('reboka_mensalista_pagamentos')
      .insert({ loja_id: lojaId, mensalista_id: m.id, competencia: comp.toISOString().slice(0, 10), valor: Number(m.preco_mensal) }).select('id');
    if (r.error && !r.error.message.includes('duplicate')) throw new Error(r.error.message);
  },
  // ----- agenda (painel) -----
  async agendamentos(): Promise<Agendamento[]> {
    const ontem = new Date(Date.now() - 86400000).toISOString();
    const hoje = new Date().toISOString().slice(0, 10);
    // Pega o dia a dia (início recente) E os jobs de vários dias ainda em andamento (previsão de entrega de hoje em diante),
    // mesmo que tenham entrado há mais tempo.
    return ok(await sb.from('reboka_agendamentos').select('*')
      .or(`inicio.gte.${ontem},previsao_entrega.gte.${hoje}`)
      .neq('status', 'cancelado').order('inicio')) as Agendamento[];
  },
  async criarAgendamento(lojaId: string, d: { nome: string; telefone?: string | null; veiculo?: string | null; servico_nome?: string | null; inicio: string; status: Agendamento['status']; previsao_entrega?: string | null; vaga?: number | null }) {
    return ok(await sb.from('reboka_agendamentos').insert({
      loja_id: lojaId, nome: d.nome, telefone: d.telefone ?? null, veiculo: d.veiculo ?? null,
      servico_nome: d.servico_nome ?? null, inicio: d.inicio, status: d.status, previsao_entrega: d.previsao_entrega ?? null, vaga: d.vaga ?? null,
    }).select('id'));
  },
  /** Entregar um agendamento: marca entregue e, se houver telefone + serviço reconhecido, registra a venda (acha/cria o cliente, entra no caixa e na fidelidade). */
  async entregarAgendamento(lojaId: string, a: Agendamento, servicos: Servico[]) {
    await this.mudarStatusAgendamento(a.id, 'entregue');
    const proc = a.servico_nome ? servicos.find((s) => s.nome.toLowerCase() === a.servico_nome!.toLowerCase()) : null;
    const tel = (a.telefone ?? '').replace(/\D/g, '');
    if (!proc || !tel || Number(proc.valor_medio) <= 0) return;
    let clienteId: string | null = null;
    const ex = await sb.from('reboka_clientes').select('id').eq('loja_id', lojaId).eq('telefone', tel).limit(1).maybeSingle();
    if (ex.data) clienteId = (ex.data as { id: string }).id;
    else { try { clienteId = await this.salvarCliente(lojaId, { nome: a.nome, telefone: tel, origem: 'outro', veiculo: a.veiculo }); } catch { clienteId = null; } }
    if (!clienteId) return;
    await this.registrarAtendimento(lojaId, clienteId, proc, { data: hojeLocal(), valor: Number(proc.valor_medio), profissional: null });
    try { await sb.rpc('reboka_fidelidade_marcar', { c_loja: lojaId, c_cliente: clienteId }); } catch { /* opcional */ }
  },
  // ----- chamados de guincho -----
  async criarChamado(lojaId: string, d: NovoChamado) {
    return ok(await sb.from('reboka_agendamentos').insert({ loja_id: lojaId, ...d, telefone: d.telefone ? d.telefone.replace(/\D/g, '') : null }).select('id'));
  },
  async atualizarChamado(id: string, d: Partial<Pick<Agendamento, 'motorista' | 'valor' | 'km' | 'pago' | 'pagador' | 'observacao' | 'destino' | 'origem' | 'noturno' | 'adicionais' | 'cotacao_enviada_em'>>) {
    ok(await sb.from('reboka_agendamentos').update(d).eq('id', id).select('id'));
  },
  /** Entregar o chamado: marca entregue e lança o valor cobrado no financeiro (acha ou cria o cliente pelo telefone). */
  async entregarChamado(lojaId: string, a: Agendamento, servicos: Servico[], pago: boolean) {
    ok(await sb.from('reboka_agendamentos').update({ status: 'entregue', pago }).eq('id', a.id).select('id'));
    const tel = (a.telefone ?? '').replace(/\D/g, '');
    const valor = Number(a.valor) || 0;
    if (!tel || valor <= 0) return;
    let clienteId: string | null = null;
    const ex = await sb.from('reboka_clientes').select('id').eq('loja_id', lojaId).eq('telefone', tel).limit(1).maybeSingle();
    if (ex.data) clienteId = (ex.data as { id: string }).id;
    else { try { clienteId = await this.salvarCliente(lojaId, { nome: a.nome, telefone: tel, origem: 'outro', veiculo: a.veiculo, placa: a.placa }); } catch { clienteId = null; } }
    if (!clienteId) return;
    const proc = a.servico_nome ? servicos.find((s) => s.nome.toLowerCase() === a.servico_nome!.toLowerCase()) : null;
    ok(await sb.from('reboka_atendimentos').insert({
      loja_id: lojaId, cliente_id: clienteId, servico_id: proc?.id ?? null, servico_nome: a.servico_nome || 'Guincho',
      data: hojeLocal(), valor, profissional: a.motorista?.trim() || null, km: null, pagador: a.pagador, pago,
    }).select('id'));
  },
  /** Chamados entregues que ainda não foram pagos (oficina, seguradora ou cliente que paga depois). */
  async chamadosAReceber(): Promise<Agendamento[]> {
    return ok(await sb.from('reboka_agendamentos').select('*').eq('status', 'entregue').eq('pago', false).order('inicio')) as Agendamento[];
  },
  // ----- link público "Pedir guincho" -----
  async pedirInfo(slug: string): Promise<PedirInfo | null> {
    const l = ok(await sb.rpc('reboka_pedir_info', { p_slug: slug })) as PedirInfo[];
    return l[0] ?? null;
  },
  async pedir(slug: string, d: Pedido) {
    return ok(await sb.rpc('reboka_pedir', { p_slug: slug, p_nome: d.nome, p_telefone: d.telefone, p_veiculo: d.veiculo, p_placa: d.placa, p_servico: d.servico,
      p_origem: d.origem, p_destino: d.destino, p_observacao: d.observacao, p_lat: d.lat, p_lng: d.lng })) as string;
  },
  /** Envia a foto do veículo de um pedido recém-criado (arquivo <id>.jpg no Storage) e marca o chamado. */
  async enviarFotoPedido(id: string, foto: Blob) {
    const r = await sb.storage.from('reboka-pedidos').upload(`${id}.jpg`, foto, { contentType: 'image/jpeg', upsert: false });
    if (r.error) throw new Error('Não foi possível enviar a foto.');
    ok(await sb.rpc('reboka_pedir_foto', { p_id: id }));
  },
  /** Endereço temporário (10 minutos) da foto do chamado. Só a equipe do guincho consegue gerar. */
  async fotoChamado(id: string): Promise<string | null> {
    const r = await sb.storage.from('reboka-pedidos').createSignedUrl(`${id}.jpg`, 600);
    return r.data?.signedUrl ?? null;
  },
  async salvarPedirConfig(lojaId: string, d: { pedir_ativo?: boolean; pedir_telefone?: string | null; slug?: string }) {
    const r = await sb.from('reboka_lojas').update(d).eq('id', lojaId).select('id');
    if (r.error?.message.includes('duplicate')) throw new Error('Esse link já está em uso. Tente de novo.');
    ok(r);
  },
  async salvarTarifas(lojaId: string, d: Pick<Loja, 'tarifa_saida' | 'tarifa_km' | 'tarifa_franquia_km' | 'tarifa_noturno_pct' | 'tarifa_adicionais'>) {
    ok(await sb.from('reboka_lojas').update(d).eq('id', lojaId).select('id'));
  },
  async mudarStatusAgendamento(id: string, status: Agendamento['status']) {
    ok(await sb.from('reboka_agendamentos').update({ status }).eq('id', id).select('id'));
  },
  /** Mover um job multi-dia (arrastar na timeline de Vagas): troca de vaga e/ou desloca as datas. */
  async moverJob(id: string, d: { vaga?: number | null; inicio?: string; previsao_entrega?: string | null }) {
    ok(await sb.from('reboka_agendamentos').update(d).eq('id', id).select('id'));
  },
  async remarcarAgendamento(id: string, inicioISO: string) {
    ok(await sb.from('reboka_agendamentos').update({ inicio: inicioISO }).eq('id', id).select('id'));
  },
  async salvarAgenda(lojaId: string, d: Partial<Pick<Loja, 'slug' | 'agendar_ativo' | 'agendar_dias' | 'agendar_hora_ini' | 'agendar_hora_fim' | 'agendar_intervalo' | 'carros_por_horario'>>) {
    const r = await sb.from('reboka_lojas').update(d).eq('id', lojaId).select('id');
    if (r.error?.message.includes('duplicate')) throw new Error('Esse link já está em uso. Escolha outro.');
    ok(r);
  },
  /** Manda um agendamento para o pátio (vira carro na fila) e marca como compareceu. */
  async agendamentoParaPatio(lojaId: string, a: Agendamento) {
    await this.patioAdicionar(lojaId, { nome: a.nome, telefone: a.telefone, veiculo: a.veiculo, servico_nome: a.servico_nome });
    ok(await sb.from('reboka_agendamentos').update({ status: 'compareceu' }).eq('id', a.id).select('id'));
  },
  // ----- agenda (público, via slug) -----
  async agendaInfo(slug: string): Promise<AgendaInfo | null> {
    const l = ok(await sb.rpc('reboka_agenda_info', { p_slug: slug })) as AgendaInfo[];
    return l[0] ?? null;
  },
  async agendaOcupados(slug: string, dia: string): Promise<string[]> {
    const l = ok(await sb.rpc('reboka_agenda_ocupados', { p_slug: slug, p_dia: dia })) as { inicio: string }[];
    return l.map((x) => x.inicio);
  },
  async agendar(slug: string, d: { nome: string; telefone: string; veiculo: string; servico: string; inicio: string }) {
    return ok(await sb.rpc('reboka_agendar', { p_slug: slug, p_nome: d.nome, p_telefone: d.telefone, p_veiculo: d.veiculo, p_servico: d.servico, p_inicio: d.inicio })) as string;
  },
  // ----- avaliações -----
  async avaliacoes(): Promise<Avaliacao[]> {
    return ok(await sb.from('reboka_avaliacoes').select('*').order('criado_em', { ascending: false }).limit(200)) as Avaliacao[];
  },
  async salvarAvaliacaoConfig(lojaId: string, d: { avaliar_ativo?: boolean; google_review_url?: string | null; slug?: string }) {
    const r = await sb.from('reboka_lojas').update(d).eq('id', lojaId).select('id');
    if (r.error?.message.includes('duplicate')) throw new Error('Esse link já está em uso. Escolha outro.');
    ok(r);
  },
  async avaliarInfo(slug: string): Promise<AvaliarInfo | null> {
    const l = ok(await sb.rpc('reboka_avaliar_info', { p_slug: slug })) as AvaliarInfo[];
    return l[0] ?? null;
  },
  /** Devolve a URL do Google quando a nota é alta e há link; senão null (feedback interno). */
  async avaliar(slug: string, nota: number, comentario: string, nome: string): Promise<string | null> {
    return ok(await sb.rpc('reboka_avaliar', { p_slug: slug, p_nota: nota, p_comentario: comentario, p_nome: nome })) as string | null;
  },
  async contagens() {
    const n = async (t: string) => (await sb.from(t).select('*', { count: 'exact', head: true })).count ?? 0;
    const [clientes, atendimentos, oportunidades, contatos, hoje] = await Promise.all(
      ['reboka_clientes', 'reboka_atendimentos', 'reboka_oportunidades', 'reboka_contatos', 'reboka_hoje'].map(n));
    return { clientes, atendimentos, oportunidades, contatos, hoje };
  },
};

/** A empresa pode usar o painel? Vale o teste em andamento, a assinatura ativa e o período já pago de quem cancelou. */
export function acessoLiberado(c: Loja): boolean {
  if (c.assinatura === 'ativa' || c.assinatura === 'atrasada') return true;
  if (c.assinatura === 'teste') return new Date(c.teste_termina_em).getTime() > Date.now();
  return !!c.acesso_ate && new Date(c.acesso_ate).getTime() > Date.now();
}

/** Chamadas ao servidor do Reboka (Worker). Vai junto o login da pessoa, para o servidor saber quem está pedindo. */
async function servidor<T>(caminho: string, corpo?: unknown, metodo = 'POST'): Promise<T> {
  const { data } = await sb.auth.getSession();
  const r = await fetch(caminho, {
    method: metodo,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const j = (await r.json().catch(() => ({}))) as { erro?: string };
  if (!r.ok) throw new Error(j.erro ?? 'Não foi possível falar com o servidor.');
  return j as T;
}
export type WaMensagem = { id: string; telefone: string; nome: string | null; direcao: 'in' | 'out'; texto: string; criado_em: string };
export const whatsapp = {
  conectar: () => servidor<{ instancia: string; qr: string | null; codigo: string | null }>('/api/wa/conectar', {}),
  status: () => servidor<{ conectado: boolean; estado?: string }>('/api/wa/status', undefined, 'GET'),
  enviar: (telefone: string, texto: string) => servidor<{ ok: boolean }>('/api/wa/enviar', { telefone, texto }),
  async salvarConfig(lojaId: string, d: Partial<Pick<Loja, 'wa_ativo' | 'wa_persona' | 'wa_proativo_retorno' | 'wa_proativo_pronto'>>) {
    ok(await sb.from('reboka_lojas').update(d).eq('id', lojaId).select('id'));
  },
  async mensagens(lojaId: string): Promise<WaMensagem[]> {
    return ok(await sb.from('reboka_wa_mensagens').select('id, telefone, nome, direcao, texto, criado_em').eq('loja_id', lojaId).order('criado_em', { ascending: false }).limit(120)) as WaMensagem[];
  },
};
export const cobranca = {
  saude: () => servidor<{ cobranca: boolean; aviso: boolean; modoTeste: boolean }>('/api/saude', undefined, 'GET'),
  assinar: (plano: string, ciclo: string, email: string) => servidor<{ url: string }>('/api/assinar', { plano, ciclo, email }),
  cancelar: () => servidor<{ situacao?: string }>('/api/cancelar', {}),
  sincronizar: (id?: string) => servidor<{ situacao?: string; aguardando?: boolean }>(`/api/sincronizar${id ? `?id=${encodeURIComponent(id)}` : ''}`, {}),
};
