export const brl = (v: number | string) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const dataBR = (iso: string) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR');

/** Data local (do computador da empresa) em AAAA-MM-DD. O banco guarda horários em UTC, então 23h no Brasil já é "amanhã" lá. */
const dataLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export const hojeISO = () => dataLocal(new Date());

/** Dias corridos desde uma data (AAAA-MM-DD) ou um horário completo vindo do banco. */
export const diasDesde = (iso: string) => {
  const dia = iso.length === 10 ? iso : dataLocal(new Date(iso));
  return Math.max(0, Math.round((new Date(hojeISO() + 'T12:00:00').getTime() - new Date(dia + 'T12:00:00').getTime()) / 86400000));
};

export function tempo(dias: number) {
  if (dias >= 345) { const a = Math.round(dias / 365); return a === 1 ? '1 ano' : `${a} anos`; }
  if (dias >= 45) return `${Math.round(dias / 30)} meses`;
  if (dias === 1) return '1 dia';
  return `${dias} dias`;
}

export const soDigitos = (t: string) => t.replace(/\D/g, '');

export function telefoneBR(t: string) {
  const d = soDigitos(t);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

export function linkWhatsApp(telefone: string, texto: string) {
  const d = soDigitos(telefone);
  const numero = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function preencher(modelo: string, c: { nome: string; servico?: string | null; dias?: number | null }) {
  return modelo
    .replaceAll('{nome}', c.nome.trim().split(' ')[0])
    .replaceAll('{servico}', (c.servico ?? 'serviço').toLowerCase())
    .replaceAll('{tempo}', tempo(c.dias ?? 0));
}

export const ROTULO_ORIGEM: Record<string, string> = {
  instagram: 'Instagram', google: 'Google', indicacao: 'Indicação', site: 'Site', whatsapp: 'WhatsApp', outro: 'Outro',
};

/** "veio por Instagram", "veio por indicação", ou "origem não informada". */
export const fraseOrigem = (o: string) =>
  o === 'outro' ? 'origem não informada' : `veio por ${['indicacao', 'site'].includes(o) ? ROTULO_ORIGEM[o].toLowerCase() : ROTULO_ORIGEM[o] ?? o}`;

/** "84.300 km" */
export const kmBR = (n: number) => `${Math.round(n).toLocaleString('pt-BR')} km`;

/** Soma dias a uma data AAAA-MM-DD. */
export const somaDias = (iso: string, dias: number) => new Date(new Date(iso + 'T12:00:00').getTime() + dias * 86400000).toISOString().slice(0, 10);

/** Sem leituras do painel, o Reboka assume a média de um carro de passeio. */
export const KM_MES_PADRAO = 1000;

/**
 * Quando vence o retorno de um atendimento: por tempo ou por km, o que vier antes.
 * A parte do km é uma estimativa pela média do carro (mesma conta da tela Hoje, feita no banco).
 */
export function retornoDe(a: { data: string; ciclo_dias: number | null; ciclo_km: number | null }, kmMes: number | null | undefined) {
  const porTempo = a.ciclo_dias ? somaDias(a.data, a.ciclo_dias) : null;
  const diasKm = a.ciclo_km ? Math.ceil((a.ciclo_km * 30.44) / (kmMes || KM_MES_PADRAO)) : null;
  const porKm = diasKm ? somaDias(a.data, diasKm) : null;
  if (!porTempo && !porKm) return null;
  const venceKm = !!porKm && (!porTempo || porKm < porTempo);
  return { data: (venceKm ? porKm : porTempo) as string, dias: (venceKm ? diasKm : a.ciclo_dias) as number, porKm: venceKm };
}

/** "180 dias ou 10.000 km", "365 dias", "10.000 km" */
export const fraseCiclo = (dias: number | null, km: number | null) =>
  [dias ? `${dias} dias` : '', km ? kmBR(km) : ''].filter(Boolean).join(' ou ');
/** Pix "copia e cola" (BR Code EMV) a partir da chave da empresa. Sem intermediário: o dinheiro cai direto na conta dele. */
function emv(id: string, valor: string) { return id + String(valor.length).padStart(2, '0') + valor; }
function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, '').trim();
export function gerarPix(chave: string, nome: string, cidade: string, valor: number, txid = '***') {
  const conta = emv('00', 'br.gov.bcb.pix') + emv('01', chave.trim());
  const extra = emv('05', (semAcento(txid).slice(0, 25) || '***'));
  let p =
    emv('00', '01') +
    emv('26', conta) +
    emv('52', '0000') +
    emv('53', '986') +
    (valor > 0 ? emv('54', valor.toFixed(2)) : '') +
    emv('58', 'BR') +
    emv('59', (semAcento(nome).toUpperCase().slice(0, 25) || 'EMPRESA')) +
    emv('60', (semAcento(cidade).toUpperCase().slice(0, 15) || 'CIDADE')) +
    emv('62', extra) +
    '6304';
  return p + crc16(p);
}

/** Cotação do guincho: saída + km além da franquia, com acréscimo noturno, mais os adicionais. Arredonda para real cheio. */
export function cotar(t: { tarifa_saida: number; tarifa_km: number; tarifa_franquia_km: number; tarifa_noturno_pct: number }, km: number, noturno: boolean, adicionais: { valor: number }[]) {
  const kmCobrado = Math.max(0, km - Number(t.tarifa_franquia_km));
  const rodagem = kmCobrado * Number(t.tarifa_km);
  const base = Number(t.tarifa_saida) + rodagem;
  const acrescimo = noturno ? base * (Number(t.tarifa_noturno_pct) / 100) : 0;
  const extras = adicionais.reduce((s, a) => s + Number(a.valor), 0);
  return { saida: Number(t.tarifa_saida), kmCobrado, rodagem, acrescimo, extras, total: Math.round(base + acrescimo + extras) };
}
