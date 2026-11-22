/** Leitura e higienizacao de planilhas de clientes. Tudo roda no navegador: o arquivo não sai do computador da empresa até a importação. */

export type Celula = string | number | Date | boolean | null;
export type Campo = 'nome' | 'telefone' | 'veiculo' | 'placa' | 'origem' | 'servico' | 'data' | 'valor' | 'observacao';
export type Mapa = Record<Campo, number>; // posição da coluna na planilha, ou -1 quando não existe

export const CAMPOS: { id: Campo; rotulo: string; obrigatorio?: boolean }[] = [
  { id: 'nome', rotulo: 'Nome', obrigatorio: true },
  { id: 'telefone', rotulo: 'Telefone ou WhatsApp', obrigatorio: true },
  { id: 'veiculo', rotulo: 'Carro (modelo e ano)' },
  { id: 'placa', rotulo: 'Placa' },
  { id: 'servico', rotulo: 'Último serviço' },
  { id: 'data', rotulo: 'Data do último serviço' },
  { id: 'valor', rotulo: 'Valor pago' },
  { id: 'origem', rotulo: 'Como chegou até você' },
  { id: 'observacao', rotulo: 'Observação' },
];

/** Tira acentos e caixa para comparar textos ("Troca de Óleo " = "troca de oleo"). */
export const chave = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** CSV: aceita vírgula ou ponto e vírgula, aspas e quebras de linha dentro de aspas. */
export function lerCSV(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const primeira = t.slice(0, t.search(/\r?\n/) === -1 ? t.length : t.search(/\r?\n/));
  const sep = (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) && primeira.includes(';') ? ';' : primeira.includes('\t') && !primeira.includes(',') ? '\t' : ',';
  const linhas: string[][] = [];
  let linha: string[] = [], campo = '', aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim()));
}

/** Planilhas salvas pelo Excel no Brasil costumam vir em Windows-1252, não em UTF-8. Tenta UTF-8 e, se falhar, usa o outro. */
export function decodificar(bytes: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}

export async function lerArquivo(arquivo: File): Promise<Celula[][]> {
  if (/\.xlsx$/i.test(arquivo.name)) {
    // Importação sob demanda: o leitor de Excel só é baixado quando alguém envia um .xlsx.
    const { readSheet } = await import('read-excel-file/browser');
    const linhas = (await readSheet(arquivo)) as Celula[][];
    return linhas.filter((l) => l.some((c) => c !== null && String(c).trim()));
  }
  if (/\.xls$/i.test(arquivo.name)) throw new Error('Arquivo .xls antigo. No Excel, use "Salvar como" e escolha .xlsx ou CSV.');
  return lerCSV(decodificar(await arquivo.arrayBuffer()));
}

const PISTAS: Record<Campo, string[]> = {
  nome: ['nome', 'cliente'],
  placa: ['placa'],
  veiculo: ['carro', 'veiculo', 'modelo', 'automovel'],
  telefone: ['whatsapp', 'whats', 'celular', 'telefone', 'fone', 'contato', 'tel'],
  servico: ['servico', 'serviço', 'manutencao', 'reparo', 'procedimento'],
  data: ['data', 'ultima visita', 'ultimo atendimento', 'dia'],
  valor: ['valor', 'preco', 'total', 'pago'],
  origem: ['origem', 'como chegou', 'como conheceu', 'canal', 'indicacao'],
  observacao: ['observacao', 'obs', 'anotacao', 'nota'],
};

/** Adivinha qual coluna é qual pelo título. A pessoa confere e corrige na tela. */
export function detectarColunas(cabecalho: Celula[]): Mapa {
  const titulos = cabecalho.map((c) => chave(String(c ?? '')));
  const usadas = new Set<number>();
  const mapa = {} as Mapa;
  for (const campo of Object.keys(PISTAS) as Campo[]) {
    let achou = -1;
    for (const pista of PISTAS[campo]) {
      achou = titulos.findIndex((t, i) => !usadas.has(i) && (t === pista || t.startsWith(pista) || t.includes(pista)));
      if (achou >= 0) break;
    }
    if (achou >= 0) usadas.add(achou);
    mapa[campo] = achou;
  }
  return mapa;
}

/** Só dígitos, sem o 55 do país. Devolve '' quando não parece telefone com DDD. */
export function limparTelefone(v: Celula): string {
  let d = String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : '';
}

/** Aceita 31/12/2025, 31-12-25, 2025-12-31 e datas nativas do Excel. Devolve AAAA-MM-DD ou null. */
export function limparData(v: Celula): string | null {
  if (v === null || v === '') return null;
  const iso = (a: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(a, m - 1, d));
    if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  };
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Número de série do Excel: dias contados a partir de 30/12/1899.
    if (v < 20000 || v > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

/** "R$ 1.200,00" vira 1200. */
export function limparValor(v: Celula): number {
  if (typeof v === 'number') return v > 0 ? v : 0;
  let t = String(v ?? '').replace(/[^\d.,]/g, '');
  if (!t) return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

export function limparOrigem(v: Celula): string {
  const t = chave(String(v ?? ''));
  if (!t) return 'outro';
  if (t.includes('insta')) return 'instagram';
  if (t.includes('google') || t.includes('busca')) return 'google';
  if (t.includes('indica') || t.includes('amig')) return 'indicacao';
  if (t.includes('whats')) return 'whatsapp';
  if (t.includes('site')) return 'site';
  return 'outro';
}

export type Linha = {
  nome: string; telefone: string; origem: string; observacao: string | null;
  servico: string | null; data: string | null; valor: number; veiculo: string | null; placa: string | null;
};
export type Analise = {
  validas: Linha[];
  semTelefone: number; semNome: number; repetidas: number; dataInvalida: number;
  servicos: { nome: string; chave: string; quantidade: number }[];
};

/** Aplica o mapa de colunas e separa o que entra do que fica de fora, com o motivo. */
export function analisar(linhas: Celula[][], mapa: Mapa, hoje: string): Analise {
  const pega = (l: Celula[], c: Campo) => (mapa[c] >= 0 ? l[mapa[c]] ?? null : null);
  const vistos = new Set<string>();
  const procs = new Map<string, { nome: string; chave: string; quantidade: number }>();
  const a: Analise = { validas: [], semTelefone: 0, semNome: 0, repetidas: 0, dataInvalida: 0, servicos: [] };
  for (const l of linhas) {
    const nome = String(pega(l, 'nome') ?? '').replace(/\s+/g, ' ').trim();
    const telefone = limparTelefone(pega(l, 'telefone'));
    if (!nome) { a.semNome++; continue; }
    if (!telefone) { a.semTelefone++; continue; }
    if (vistos.has(telefone)) { a.repetidas++; continue; }
    vistos.add(telefone);
    const servico = String(pega(l, 'servico') ?? '').replace(/\s+/g, ' ').trim() || null;
    const bruta = pega(l, 'data');
    let data = limparData(bruta);
    if (data && data > hoje) data = null;
    if (servico && bruta !== null && String(bruta).trim() && !data) a.dataInvalida++;
    if (servico && data) {
      const k = chave(servico);
      const p = procs.get(k) ?? { nome: servico, chave: k, quantidade: 0 };
      p.quantidade++; procs.set(k, p);
    }
    const obs = String(pega(l, 'observacao') ?? '').trim();
    const veiculo = String(pega(l, 'veiculo') ?? '').replace(/\s+/g, ' ').trim() || null;
    const placaLimpa = String(pega(l, 'placa') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const placa = placaLimpa.length >= 5 && placaLimpa.length <= 8 ? placaLimpa : null;
    a.validas.push({ nome, telefone, origem: limparOrigem(pega(l, 'origem')), observacao: obs || null, servico, data, valor: limparValor(pega(l, 'valor')), veiculo, placa });
  }
  a.servicos = [...procs.values()].sort((x, y) => y.quantidade - x.quantidade);
  return a;
}

/** Planilha de exemplo para baixar. As datas são relativas a hoje para já gerar retornos vencidos. */
export function planilhaExemplo(hoje = new Date()): string {
  const d = (dias: number) => new Date(hoje.getTime() - dias * 86400000).toISOString().slice(0, 10).split('-').reverse().join('/');
  const linhas = [
    ['Nome', 'WhatsApp', 'Carro', 'Placa', 'Último serviço', 'Data', 'Valor', 'Como chegou', 'Observação'],
    ['Helena Martins', '(41) 98888-0001', 'Corolla 2019', 'ABC1D23', 'Troca de óleo e filtro', d(200), 'R$ 280,00', 'Google', ''],
    ['Isabela Rangel', '41 98888-0002', 'Hilux 2018', 'BEX-7A90', 'Revisão completa', d(380), '950,00', 'Indicação do Paulo', 'Prefere contato à tarde'],
    ['Tatiane Moura', '5541988880003', 'Compass 2020', 'RTK4F18', 'Alinhamento e balanceamento', d(200), '180', 'Google', ''],
    ['Vanessa Lopes', '(41) 98888-0004', 'HB20 2017', '', 'Troca de correia dentada', d(50), 'R$ 780,00', 'Instagram', ''],
    ['Roberta Dias', '41988880005', 'Onix 2021', 'JKL9C33', 'Troca de correia dentada', d(20), '780', '', ''],
    ['Simone Farias', '(41) 98888-0006', '', '', '', '', '', 'Site', 'Pediu orçamento de freios'],
    ['Helena Martins', '(41) 98888-0001', 'Corolla 2019', 'ABC1D23', 'Troca de óleo e filtro', d(200), '280', 'Google', 'Linha repetida de propósito'],
    ['Cadastro sem telefone', '', '', '', 'Higienização interna', d(10), '180', '', ''],
  ];
  return '﻿' + linhas.map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(';')).join('\r\n');
}
