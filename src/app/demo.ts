// Modo demonstração: painel liberado sem login, com dados fictícios em memória.
// Ativado por ?demo=1 na URL (ex.: /app/?demo=1). Nenhuma chamada vai ao Supabase.
// Para demonstrar o produto a clientes — tudo que é clicado fica só na sessão do navegador.
import { api, whatsapp, cobranca } from './api';
import type {
  ItemHoje,
  Loja, Membro, Cliente, Pessoa, Resumo, MesEvolucao, Ranking, Sumida, Oportunidade,
  Servico, Carro, Modelo, Agendamento, Retorno, Avaliacao, Cartao, Plano, Mensalista,
  Atendimento, Contato, Etapa,
} from './api';

export const MODO_DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';

const d = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const base = new Date(); base.setHours(0, 0, 0, 0);
const hora = (h: number, m = 0) => { const x = new Date(base); x.setHours(h, m, 0, 0); return x.toISOString(); };
const diaISO = (n: number) => { const x = new Date(base); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const diaHora = (n: number, h = 8) => { const x = new Date(base); x.setDate(x.getDate() + n); x.setHours(h, 0, 0, 0); return x.toISOString(); };

/** Mapa da demonstração: alguns endereços reais de Curitiba; o resto cai num ponto inventado perto do centro. */
const LUGARES: [string, string, number, number][] = [
  ['derosso', 'R. Francisco Derosso, 1500 - Xaxim, Curitiba - PR', -25.501, -49.2633],
  ['winston', 'Av. Winston Churchill, 2500 - Pinheirinho, Curitiba - PR', -25.5135, -49.295],
  ['torres', 'Av. das Torres, 1200 - Uberaba, Curitiba - PR', -25.46, -49.23],
  ['auto center', 'Auto Center Silva - Boqueirão, Curitiba - PR', -25.499, -49.238],
  ['boqueir', 'R. Waldemar Loureiro Campos, 900 - Boqueirão, Curitiba - PR', -25.497, -49.24],
  ['argentina', 'Av. República Argentina, 3000 - Portão, Curitiba - PR', -25.474, -49.295],
  ['batel', 'Av. do Batel, 1800 - Batel, Curitiba - PR', -25.443, -49.288],
  ['izaac', 'R. Izaac Ferreira da Cruz, 3000 - Sítio Cercado, Curitiba - PR', -25.5402, -49.2655],
  ['palladium', 'Shopping Palladium - Portão, Curitiba - PR', -25.4778, -49.2914],
  ['ponta grossa', 'Ponta Grossa - PR', -25.0945, -50.1633],
];
const semAcento = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function mapaDemo(q: string) {
  const t = semAcento(q);
  const achados = LUGARES.filter(([k]) => t.includes(k)).map(([, texto, lat, lng]) => ({ texto, lat, lng }));
  if (achados.length) return achados;
  let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const nome = q.trim().replace(/^./, (c) => c.toUpperCase());
  return [{ texto: `${nome}, Curitiba - PR`, lat: -25.43 + ((h % 1600) - 800) / 10000, lng: -49.27 + (((h >> 11) % 1600) - 800) / 10000 }];
}
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (g: number) => (g * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const loja: Loja = {
  id: 'demo', nome: 'Guincho Pinheirinho 24h', documento: null, plano: 'pro_ia', assinatura: 'ativa',
  teste_termina_em: '2026-12-31', meta_mensal: 20000, periodicidade: 'mensal', mp_assinatura_id: null, acesso_ate: null,
  slug: 'guincho-pinheirinho', agendar_ativo: true, agendar_dias: [1, 2, 3, 4, 5, 6], agendar_hora_ini: 8, agendar_hora_fim: 18, agendar_intervalo: 30,
  avaliar_ativo: true, google_review_url: 'https://g.page/r/demo',
  fidelidade_ativo: true, fidelidade_meta: 10, fidelidade_premio: 'Um socorro grátis',
  comissao_tipo: 'percentual', comissao_valor: 10,
  base_endereco: 'Av. Winston Churchill, 2500 - Pinheirinho, Curitiba - PR', base_lat: -25.5135, base_lng: -49.295, tarifa_km_desloc: null, tarifa_km_retorno: 3,
  pix_chave: '41999990000', pix_nome: 'Guincho Pinheirinho', pix_cidade: 'Curitiba',
  wa_ativo: true, wa_instancia: 'demo', wa_numero: '41999990000', wa_persona: null, wa_proativo_retorno: true, wa_proativo_pronto: true,
  perfil: 'oficina', vagas_funilaria: 1, carros_por_horario: 3,
  pedir_ativo: true, pedir_telefone: '41999990000',
  tarifa_saida: 150, tarifa_km: 4.5, tarifa_franquia_km: 0, tarifa_noturno_pct: 30,
  tarifa_adicionais: [{ nome: 'Patins', valor: 80 }, { nome: 'Veículo rebaixado', valor: 60 }, { nome: 'Retirada de garagem', valor: 100 }, { nome: 'Hora parada', valor: 70 }],
};

export const demoMembro: Membro = {
  loja_id: 'demo', usuario_id: 'u1', papel: 'dono', nome: 'Diego', reboka_lojas: loja,
};

const clientes: Cliente[] = [
  { id: 'c1', nome: 'Patrícia Souza', telefone: '41990000003', origem: 'instagram', nao_contatar: false, observacao: 'Cliente particular', ultimo_contato_em: d(2), demo: true, criado_em: d(40), responsavel_id: 'u2', veiculo: 'Compass branco', placa: 'ABC1D23' },
  { id: 'c2', nome: 'Carlos Mendes', telefone: '41990000001', origem: 'indicacao', nao_contatar: false, observacao: null, ultimo_contato_em: d(10), demo: true, criado_em: d(80), responsavel_id: 'u3', veiculo: 'Hilux prata', placa: 'DEF2E45' },
  { id: 'c3', nome: 'Rafaela Cruz', telefone: '41990000016', origem: 'google', nao_contatar: false, observacao: null, ultimo_contato_em: null, demo: true, criado_em: d(15), responsavel_id: null, veiculo: 'Onix preto', placa: null },
  { id: 'c4', nome: 'Bruno Alves', telefone: '41988880001', origem: 'fachada', nao_contatar: false, observacao: 'Oficina parceira', ultimo_contato_em: d(5), demo: true, criado_em: d(120), responsavel_id: 'u2', veiculo: 'Civic cinza', placa: 'GHI3F67' },
  { id: 'c5', nome: 'André Antunes', telefone: '41990000012', origem: 'instagram', nao_contatar: true, observacao: null, ultimo_contato_em: d(30), demo: true, criado_em: d(60), responsavel_id: null, veiculo: 'Strada vermelha', placa: 'JKL4G89' },
  { id: 'c6', nome: 'Olívia Barros', telefone: '41990000013', origem: 'indicacao', nao_contatar: false, observacao: null, ultimo_contato_em: d(1), demo: true, criado_em: d(25), responsavel_id: 'u3', veiculo: 'HB20 branco', placa: 'MNO5H01' },
];

const equipe: Pessoa[] = [
  { usuario_id: 'u1', nome: 'Diego', papel: 'dono', criado_em: d(200) },
  { usuario_id: 'u2', nome: 'Arthur', papel: 'recepcao', criado_em: d(120) },
  { usuario_id: 'u3', nome: 'Madie', papel: 'gestor', criado_em: d(90) },
];

const fatia = (nome: string, valor: number, quantidade: number) => ({ nome, valor, quantidade });
const resumo: Resumo = {
  faturamento: 18420, recuperado: 3120, atendimentos: 184, retornos: 96, voltaram_apos_contato: 27,
  clientes_atendidas: 151, clientes_novas: 38, contatos: 112, negociacoes_novas: 19,
  fechadas: 12, valor_fechado: 5400, perdidas: 4, valor_perdido: 1200,
  motivos: { preco: 2, fez_em_outro_lugar: 1, sem_resposta: 1 },
  servicos: [fatia('Reboque de carro', 7600, 95), fatia('Reboque de utilitário ou SUV', 4200, 21), fatia('Remoção de sinistro', 3900, 13), fatia('Socorro: bateria (chupeta)', 2720, 55)],
  origens: [fatia('Instagram', 7200, 62), fatia('Indicação', 5400, 48), fatia('Google', 3200, 29), fatia('Fachada', 2620, 45)],
  profissionais: [fatia('Arthur', 9800, 98), fatia('Madie', 8620, 86)],
};

const evolucao: MesEvolucao[] = Array.from({ length: 12 }, (_, i) => {
  const b = 9000 + i * 820 + (i % 3) * 600;
  return { mes: `2026-${String(i + 1).padStart(2, '0')}-01`, faturamento: b, atendimentos: 70 + i * 9, recuperado: 900 + (i % 4) * 500 };
});

const ranking: Ranking[] = [
  { usuario_id: 'u2', nome: 'Arthur', papel: 'recepcao', contatos: 64, voltaram: 18, recuperado: 2100 },
  { usuario_id: 'u3', nome: 'Madie', papel: 'gestor', contatos: 48, voltaram: 9, recuperado: 1020 },
];

const sumidas: Sumida[] = [
  { cliente_id: 'c2', nome: 'Carlos Mendes', telefone: '41990000001', ultimo_contato_em: d(120), ultima_data: d(122), servico_nome: 'Reboque de carro', dias: 122, total: 640, visitas: 8 },
  { cliente_id: 'c4', nome: 'Bruno Alves', telefone: '41988880001', ultimo_contato_em: d(150), ultima_data: d(152), servico_nome: 'Remoção de sinistro', dias: 152, total: 300, visitas: 5 },
  { cliente_id: 'c5', nome: 'André Antunes', telefone: '41990000012', ultimo_contato_em: d(95), ultima_data: d(96), servico_nome: 'Socorro: bateria (chupeta)', dias: 96, total: 180, visitas: 3 },
];

const op = (id: string, nome: string, tel: string, etapa: Etapa, valor: number, serv: string | null, dias: number): Oportunidade => ({
  id, cliente_id: 'c' + id, servico_id: serv ? 's1' : null, etapa, valor_estimado: valor, motivo_perda: null,
  proxima_acao: etapa === 'orcamento_enviado' ? 'Ligar de novo' : null, proxima_acao_em: null, etapa_desde: d(dias), criado_em: d(dias + 2),
  reboka_clientes: { nome, telefone: tel }, reboka_servicos: serv ? { nome: serv } : null,
});
const oportunidades: Oportunidade[] = [
  op('1', 'Rafaela Cruz', '41990000016', 'novo_contato', 180, 'Reboque de carro', 1),
  op('2', 'Marina Prado', '41991112222', 'avaliacao_agendada', 350, 'Reboque de utilitário ou SUV', 3),
  op('3', 'Tiago Nunes', '41993334444', 'avaliacao_feita', 520, 'Remoção de sinistro', 5),
  op('4', 'Letícia Gomes', '41995556666', 'orcamento_enviado', 280, 'Reboque de carro', 6),
  op('5', 'Pedro Lima', '41997778888', 'orcamento_enviado', 640, 'Reboque de moto', 8),
  op('6', 'Sofia Reis', '41999990000', 'fechado', 300, 'Reboque de utilitário ou SUV', 2),
];

const sv = (id: string, nome: string, valor: number): Servico => ({ id, nome, ciclo_retorno_dias: null, ciclo_retorno_km: null, valor_medio: valor, ativo: true, adicional: false, dura_dias: null });
const servicos: Servico[] = [
  sv('s1', 'Reboque de carro', 250), sv('s2', 'Reboque de moto', 180), sv('s3', 'Reboque de utilitário ou SUV', 320),
  sv('s4', 'Remoção de sinistro', 380), sv('s5', 'Socorro: bateria (chupeta)', 120), sv('s6', 'Socorro: troca de pneu', 120), sv('s7', 'Socorro: pane seca', 130),
];

const modelos: Modelo[] = [
  { id: 'm1', titulo: 'A caminho', texto: 'Oi, {nome}! O guincho já saiu e está a caminho.' },
];

const min = (n: number) => new Date(Date.now() - n * 60000).toISOString();
const ch = (id: string, nome: string, telefone: string, veiculo: string, placa: string | null, servico_nome: string, origem: string, destino: string, km: number, valor: number,
  status: Agendamento['status'], inicio: string, x: Partial<Agendamento> = {}): Agendamento => ({
  id, nome, telefone, veiculo, placa, servico_nome, origem, destino, km, valor, status, inicio, criado_em: inicio, previsao_entrega: null, vaga: null,
  noturno: false, adicionais: [], motorista: null, pagador: null, pago: false, observacao: null, ...x });
const agendamentos: Agendamento[] = [
  ch('a1', 'Thaís Guedes', '41990000020', 'Onix branco', 'RTY7A21', 'Reboque de carro', 'Av. das Torres, 1200, Uberaba', 'Auto Center Silva, Boqueirão', 14, 213, 'fila', min(4), { cotacao_enviada_em: min(2) }),
  ch('a2', 'Rafael Cordeiro', '41990000021', 'CG 160 vermelha', null, 'Reboque de moto', 'R. Izaac Ferreira da Cruz, Sítio Cercado', 'Residência, Xaxim', 0, 0, 'fila', min(11), { observacao: 'Pneu traseiro furado', canal: 'link', origem_lat: -25.5402, origem_lng: -49.2655, tem_foto: true, destino: 'R. Francisco Derosso, 1500 - Xaxim, Curitiba - PR', destino_lat: -25.501, destino_lng: -49.2633 }),
  ch('a3', 'Patrícia Souza', '41990000003', 'Compass branco', 'ABC1D23', 'Reboque de utilitário ou SUV', 'BR-277, km 78, sentido litoral', 'Concessionária Jeep, Rebouças', 31, 370, 'em_servico', min(26), { motorista: 'Arthur', adicionais: [{ nome: 'Patins', valor: 80 }] }),
  ch('a4', 'Oficina do Beto', '41988880001', 'Civic cinza', 'GHI3F67', 'Reboque de carro', 'R. Francisco Derosso, 3400, Xaxim', 'Oficina do Beto, Pinheirinho', 9, 191, 'pronto', min(48), { motorista: 'Madie', pagador: 'Oficina do Beto' }),
  ch('a5', 'Carlos Mendes', '41990000001', 'Hilux prata', 'DEF2E45', 'Socorro: bateria (chupeta)', 'Shopping Palladium, estacionamento G2', 'No local', 5, 120, 'entregue', min(140), { motorista: 'Arthur', pago: true }),
  ch('a6', 'Seguradora Aliança', '41990000040', 'HB20 branco', 'MNO5H01', 'Remoção de sinistro', 'Linha Verde com Av. Mal. Floriano', 'Pátio da seguradora, CIC', 22, 324, 'entregue', min(200), { motorista: 'Madie', pagador: 'Seguradora Aliança', noturno: true }),
  ch('a7', 'Bruno Alves', '41988880009', 'Strada vermelha', 'JKL4G89', 'Reboque de carro', 'R. João Bettega, 5000, CIC', 'Mecânica Dois Irmãos, Portão', 12, 204, 'confirmado', diaHora(1, 9)),
  // Agendados espalhados pelos próximos dias, para a agenda ter o que mostrar.
  ch('a8', 'Auto Center Silva', '41988880011', 'Corolla prata', 'PQR6I12', 'Reboque de carro', 'R. Waldemar Loureiro Campos, 900, Boqueirão', 'Auto Center Silva, Hauer', 7, 182, 'confirmado', diaHora(1, 11)),
  ch('a9', 'Marina Prado', '41991112222', 'Gol prata', 'STU7J23', 'Reboque de carro', 'Av. Winston Churchill, 2000, Capão Raso', 'Oficina Central, Ponta Grossa', 110, 645, 'confirmado', diaHora(1, 14)),
  ch('a10', 'Leilão Pátio Sul', '41990000050', 'Fiesta preto', null, 'Remoção de sinistro', 'Pátio Sul, Pinheirinho', 'Pátio do leilão, Araucária', 24, 258, 'confirmado', diaHora(2, 9), { pagador: 'Leilão Pátio Sul' }),
  ch('a11', 'Seguradora Aliança', '41990000040', 'Onix preto', 'VWX8K34', 'Remoção de sinistro', 'R. Francisco Derosso, 1200, Xaxim', 'Oficina credenciada, Centro', 13, 209, 'confirmado', diaHora(4, 8), { pagador: 'Seguradora Aliança' }),
  ch('a12', 'João Ferraz', '41992223333', 'CG 160 azul', null, 'Reboque de moto', 'Av. República Argentina, 3000, Portão', 'R. Izaac Ferreira da Cruz, Sítio Cercado', 9, 191, 'confirmado', diaHora(4, 16)),
  ch('a13', 'Oficina do Beto', '41988880001', 'Saveiro branca', 'YZA9L45', 'Reboque de utilitário ou SUV', 'BR-116, km 115, Pinheirinho', 'Oficina do Beto, Pinheirinho', 6, 177, 'confirmado', diaHora(5, 10), { pagador: 'Oficina do Beto' }),
  ch('a14', 'Camila Rocha', '41993334444', 'HR-V cinza', 'BCD0M56', 'Reboque de utilitário ou SUV', 'R. Itupava, 1500, Alto da XV', 'Concessionária, Batel', 8, 186, 'confirmado', diaHora(0, 17)),
];

const retornos: Retorno[] = [
  { cliente_id: 'c1', cliente: 'Patrícia Souza', telefone: '41990000003', servico: 'Reboque de carro', profissional: null, previsto: diaISO(0), veiculo: 'Compass branco', placa: 'ABC1D23' },
  { cliente_id: 'c6', cliente: 'Olívia Barros', telefone: '41990000013', servico: 'Socorro: bateria (chupeta)', profissional: null, previsto: diaISO(1), veiculo: 'HB20 branco', placa: 'MNO5H01' },
];

// Quem chamar agora: aparece no sino da Agenda.
const pend = (cid: string, cliente: string, telefone: string, motivo: ItemHoje['motivo'], prioridade: number, servico: string, dias: number, valor: number, veiculo: string | null = null): ItemHoje =>
  ({ cliente_id: cid, cliente, telefone, motivo, prioridade, servico, dias, valor_estimado: valor, ciclo_dias: null, referencia: d(dias), veiculo_id: null, veiculo, placa: null, ciclo_km: null, por_km: false });
let pendencias: ItemHoje[] = [
  pend('o5', 'Pedro Lima', '41997778888', 'orcamento_parado', 2, 'Reboque de moto', 8, 640, 'Onix prata'),
  pend('o4', 'Letícia Gomes', '41995556666', 'orcamento_parado', 2, 'Reboque de carro', 6, 280),
  pend('o1', 'Rafaela Cruz', '41990000016', 'novo_sem_resposta', 4, 'Reboque de carro', 1, 180),
];

const avaliacoes: Avaliacao[] = [
  { id: 'av1', nota: 5, comentario: 'Chegou em 20 minutos e cuidou bem do carro!', nome: 'Patrícia S.', criado_em: d(1) },
  { id: 'av2', nota: 5, comentario: 'Melhor guincho da região.', nome: 'Carlos M.', criado_em: d(3) },
  { id: 'av3', nota: 4, comentario: 'Bom serviço, só demorou um pouco.', nome: 'Bruno A.', criado_em: d(6) },
  { id: 'av4', nota: 5, comentario: null, nome: 'Olívia B.', criado_em: d(9) },
];

const cartoes: Cartao[] = [
  { cliente_id: 'c1', cliente: 'Patrícia Souza', telefone: '41990000003', veiculo: 'Compass branco', placa: 'ABC1D23', selos: 7, resgates: 1 },
  { cliente_id: 'c4', cliente: 'Bruno Alves', telefone: '41988880001', veiculo: 'Civic cinza', placa: 'GHI3F67', selos: 9, resgates: 0 },
  { cliente_id: 'c2', cliente: 'Carlos Mendes', telefone: '41990000001', veiculo: 'Hilux prata', placa: 'DEF2E45', selos: 4, resgates: 2 },
];

const planos: Plano[] = [
  { id: 'p1', nome: 'Convênio oficina', preco_mensal: 120, servicos_mes: 4, ativo: true },
  { id: 'p2', nome: 'Convênio frota', preco_mensal: 220, servicos_mes: null, ativo: true },
];

const mensalistas: Mensalista[] = [
  { id: 'ms1', cliente_id: 'c1', cliente: 'Patrícia Souza', telefone: '41990000003', veiculo: 'Compass branco', placa: 'ABC1D23', plano_id: 'p2', plano: 'Convênio frota', preco_mensal: 220, servicos_mes: null, dia_vencimento: 10, status: 'ativo', usados: 6, pago: true },
  { id: 'ms2', cliente_id: 'c4', cliente: 'Bruno Alves', telefone: '41988880001', veiculo: 'Civic cinza', placa: 'GHI3F67', plano_id: 'p1', plano: 'Convênio oficina', preco_mensal: 120, servicos_mes: 4, dia_vencimento: 5, status: 'ativo', usados: 2, pago: false },
];

const atendimentos: Record<string, Atendimento[]> = {
  c1: [
    { id: 't1', servico_nome: 'Reboque de carro', data: d(16), valor: 80, ciclo_dias: 15, sessao_numero: null, sessoes_total: null, retorno_previsto_em: diaISO(0), profissional: 'Arthur' , veiculo_id: null, km: null, ciclo_km: null},
    { id: 't2', servico_nome: 'Reboque de utilitário ou SUV', data: d(95), valor: 200, ciclo_dias: 90, sessao_numero: null, sessoes_total: null, retorno_previsto_em: d(5), profissional: 'Madie' , veiculo_id: null, km: null, ciclo_km: null},
  ],
};
const contatos: Record<string, Contato[]> = {
  c1: [{ id: 'ct1', canal: 'whatsapp', observacao: 'Pediu cotação pelo WhatsApp', criado_em: d(2) }],
};

// ---- ativação: troca os métodos do api por versões em memória ----
export function ativarDemo() {
  const achar = (id: string) => clientes.find((c) => c.id === id) ?? null;
  const carrosDe = (id: string) => { const c = achar(id); return c?.veiculo ? [{ id: 'v' + id, cliente_id: id, modelo: c.veiculo, placa: c.placa, km: 64200, km_em: d(40), km_mes: 1100 }] : []; };
  Object.assign(api, {
    minhaLoja: async () => demoMembro,
    resumo: async () => resumo,
    evolucao: async () => evolucao,
    ranking: async () => ranking,
    sumidas: async () => sumidas,
    sumidasResumo: async (dias = 90) => { const v = sumidas.filter((s) => s.dias >= dias); return { qtd: v.length, total: v.reduce((t, s) => t + Number(s.total), 0) }; },
    veiculosSugestoes: async () => ['Civic cinza', 'Compass branco', 'Gol prata', 'HB20 branco', 'Hilux prata', 'Onix preto', 'Strada vermelha'],
    ultimosRecebimentos: async () => [
      { id: 'r1', nome: 'Carlos Mendes', servico_nome: 'Remoção de sinistro', valor: 300, data: d(0) },
      { id: 'r2', nome: 'Thaís Guedes', servico_nome: 'Reboque de utilitário ou SUV', valor: 200, data: d(0) },
      { id: 'r3', nome: 'Marina Prado', servico_nome: 'Reboque de carro', valor: 80, data: d(0) },
      { id: 'r4', nome: 'Patrícia Souza', servico_nome: 'Reboque de carro', valor: 80, data: d(1) },
    ],
    oportunidades: async () => oportunidades,
    negociacoesDaCliente: async (cid: string) => oportunidades.filter((o) => o.cliente_id === cid),
    hoje: async () => pendencias,
    clientes: async (busca: string) => {
      const t = (busca || '').trim().toLowerCase();
      return t ? clientes.filter((c) => c.nome.toLowerCase().includes(t) || c.telefone.includes(t) || (c.veiculo ?? '').toLowerCase().includes(t)) : clientes;
    },
    // O que é só do Reboka (vários carros, km e orçamento com link) também funciona em memória na demonstração.
    cliente: async (id: string) => ({ cliente: achar(id), atendimentos: atendimentos[id] ?? [], contatos: contatos[id] ?? [], veiculos: carrosDe(id) }),
    veiculosDoCliente: async (id: string) => carrosDe(id),
    salvarVeiculo: async () => {}, apagarVeiculo: async () => {},
    orcamento: async () => null,
    salvarOrcamento: async () => { throw new Error('Na demonstração o orçamento não é gravado. Crie sua conta grátis para enviar o link ao cliente.'); },
    totalClientes: async () => clientes.length,
    equipe: async (_l?: string) => equipe,
    convites: async () => [],
    profissionais: async () => equipe.map((p) => p.nome),
    minhasClientes: async () => [],
    todosServicos: async () => servicos,
    servicos: async () => servicos.filter((s) => s.ativo),
    carros: async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { veiculo: achar(id)?.veiculo ?? null, placa: achar(id)?.placa ?? null } as Carro])),
    modelos: async () => modelos,
    agendamentos: async () => agendamentos.slice(),
    retornos: async () => retornos,
    avaliacoes: async () => avaliacoes,
    fidelidade: async () => cartoes,
    planos: async (soAtivos = false) => (soAtivos ? planos.filter((p) => p.ativo) : planos),
    mensalistas: async () => mensalistas,
    patio: async () => [],
    registro: async () => [],
    contagens: async () => ({ clientes: clientes.length, atendimentos: 184, oportunidades: oportunidades.length, contatos: 112, hoje: retornos.length }),
    exportarClientes: async () => clientes.map((c) => ({ ...c, reboka_atendimentos: (atendimentos[c.id] ?? []).map((a) => ({ data: a.data, servico_nome: a.servico_nome, valor: a.valor })) })),
    // escritas: ficam só em memória, para o demo responder ao clique
    criarChamado: async (_l: string, x: Omit<Agendamento, 'id' | 'criado_em' | 'previsao_entrega' | 'vaga' | 'pago'>) => {
      const id = 'novo' + Date.now();
      agendamentos.push({ ...x, id, criado_em: new Date().toISOString(), previsao_entrega: null, vaga: null, pago: false });
      return [{ id }];
    },
    atualizarChamado: async (id: string, x: Partial<Agendamento>) => { const a = agendamentos.find((y) => y.id === id); if (a) Object.assign(a, x); },
    entregarChamado: async (_l: string, a: Agendamento, _s: Servico[], pago: boolean) => { const x = agendamentos.find((y) => y.id === a.id); if (x) { x.status = 'entregue'; x.pago = pago; } },
    chamadosAReceber: async () => agendamentos.filter((a) => a.status === 'entregue' && !a.pago),
    fotoChamado: async () => '/img/demo-foto-pedido.webp',
    salvarPedirConfig: async (_id: string, x: Partial<Loja>) => { Object.assign(loja, x); },
    salvarTarifas: async (_id: string, x: Partial<Loja>) => { Object.assign(loja, x); },
    // Mapa simulado: endereços de Curitiba conhecidos e distância em linha reta × 1,35 (estrada), a 32 km/h de média.
    buscarEndereco: async (q: string) => mapaDemo(q),
    calcularRota: async (pts: { lat: number; lng: number }[]) => pts.slice(1).map((p, i) => {
      const km = Math.round(distKm(pts[i], p) * 1.35 * 10) / 10; return { km, min: Math.round((km / 32) * 60) };
    }),
    criarAgendamento: async (_l: string, x: Partial<Agendamento> & { nome: string; inicio: string; status: Agendamento['status'] }) => {
      const id = 'novo' + Date.now();
      agendamentos.push(ch(id, x.nome, x.telefone ?? '', x.veiculo ?? '', null, x.servico_nome ?? '', '', '', 0, 0, x.status, x.inicio));
      return [{ id }];
    },
    mudarStatusAgendamento: async (id: string, status: Agendamento['status']) => { const a = agendamentos.find((x) => x.id === id); if (a) a.status = status; },
    entregarAgendamento: async (_l: string, a: Agendamento) => { const x = agendamentos.find((y) => y.id === a.id); if (x) x.status = 'entregue'; },
    agendamentoParaPatio: async (_l: string, a: Agendamento) => { const x = agendamentos.find((y) => y.id === a.id); if (x) x.status = 'compareceu'; },
    remarcarAgendamento: async (id: string, ini: string) => { const a = agendamentos.find((x) => x.id === id); if (a) a.inicio = ini; },
    moverJob: async (id: string, m: { vaga?: number | null; inicio?: string; previsao_entrega?: string | null }) => {
      const a = agendamentos.find((x) => x.id === id);
      if (a) { if (m.vaga !== undefined) a.vaga = m.vaga ?? null; if (m.inicio) a.inicio = m.inicio; if (m.previsao_entrega !== undefined) a.previsao_entrega = m.previsao_entrega ?? null; }
    },
    salvarCliente: async (_l: string, x: { id?: string; nome: string; telefone: string; origem: string; veiculo?: string | null; placa?: string | null; observacao?: string | null }) => {
      if (x.id) { const c = achar(x.id); if (c) Object.assign(c, { nome: x.nome, telefone: x.telefone, origem: x.origem, veiculo: x.veiculo ?? null, placa: x.placa ?? null, observacao: x.observacao ?? null }); return x.id; }
      const id = 'c' + Date.now(); clientes.unshift({ id, nome: x.nome, telefone: x.telefone, origem: x.origem, nao_contatar: false, observacao: x.observacao ?? null, ultimo_contato_em: null, demo: true, criado_em: new Date().toISOString().slice(0, 10), responsavel_id: null, veiculo: x.veiculo ?? null, placa: x.placa ?? null }); return id;
    },
    registrarContato: async (_l: string, cid: string) => { pendencias = pendencias.filter((x) => x.cliente_id !== cid); },
    registrarAtendimento: async () => {},
    marcarNaoContatar: async (id: string, v: boolean) => { const c = achar(id); if (c) c.nao_contatar = v; },
    apagarCliente: async (id: string) => { const i = clientes.findIndex((c) => c.id === id); if (i >= 0) clientes.splice(i, 1); },
    salvarServico: async () => {},
    criarServico: async (_l: string, nome: string, ciclo: number | null, valor: number) => { const s: Servico = { id: 's' + Date.now(), nome, ciclo_retorno_dias: ciclo, ciclo_retorno_km: null, valor_medio: valor, ativo: true, adicional: false, dura_dias: null }; servicos.push(s); return s; },
    salvarOportunidade: async () => {},
    moverOportunidade: async (id: string, etapa: Etapa) => { const o = oportunidades.find((x) => x.id === id); if (o) o.etapa = etapa; },
    apagarOportunidade: async (id: string) => { const i = oportunidades.findIndex((o) => o.id === id); if (i >= 0) oportunidades.splice(i, 1); },
    salvarModelo: async () => {},
    salvarLoja: async (_id: string, x: Partial<Loja>) => { Object.assign(loja, x); },
    salvarAgenda: async (_id: string, x: Partial<Loja>) => { Object.assign(loja, x); },
    salvarPixConfig: async (_id: string, x: Partial<Loja>) => { Object.assign(loja, x); },
    salvarFidelidadeConfig: async (_id: string, x: Partial<Loja>) => { Object.assign(loja, x); },
    salvarComissaoConfig: async (_id: string, x: Partial<Loja>) => { Object.assign(loja, x); },
    salvarAvaliacaoConfig: async (_id: string, x: Partial<Loja>) => { Object.assign(loja, x); },
    trocarPlano: async (_id: string, p: Loja['plano']) => { loja.plano = p; },
    marcarSelo: async (_l: string, cid: string) => { const c = cartoes.find((x) => x.cliente_id === cid); if (c) c.selos += 1; return c?.selos ?? 1; },
    resgatarFidelidade: async () => {},
    salvarPlano: async () => {},
    apagarPlano: async () => {},
    adicionarMensalista: async () => {},
    mudarStatusMensalista: async (id: string, s: Mensalista['status']) => { const m = mensalistas.find((x) => x.id === id); if (m) m.status = s; },
    removerMensalista: async () => {},
    registrarPagamento: async () => {},
    convidar: async () => {}, cancelarConvite: async () => {}, mudarPapel: async () => {}, removerPessoa: async () => {},
    popularDemo: async () => 0, limparDemo: async () => 0, aceitarConvites: async () => 0,
  });
  Object.assign(whatsapp, {
    conectar: async () => ({ instancia: 'demo', qr: null, codigo: null }),
    status: async () => ({ conectado: true, estado: 'open' }),
    enviar: async () => ({ ok: true }),
    salvarConfig: async (_l: string, x: Partial<Loja>) => { Object.assign(loja, x); },
    mensagens: async () => [
      { id: 'w1', telefone: '41990000003', nome: 'Patrícia Souza', direcao: 'in' as const, texto: 'Oi, meu carro parou na BR-277. Quanto fica o guincho até o Rebouças?', criado_em: hora(8, 12) },
      { id: 'w2', telefone: '41990000003', nome: 'Patrícia Souza', direcao: 'out' as const, texto: 'Oi, Patrícia! São 31 km: fica R$ 370 com patins. Chego em 25 minutos. Posso mandar?', criado_em: hora(8, 13) },
    ],
  });
  Object.assign(cobranca, {
    saude: async () => ({ cobranca: true, aviso: false, modoTeste: true }),
    assinar: async () => ({ url: '#' }),
    cancelar: async () => ({ situacao: 'ativa' }),
    sincronizar: async () => ({ situacao: 'ativa' }),
  });
}
