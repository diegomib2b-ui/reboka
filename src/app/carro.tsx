/**
 * Silhueta do carro por categoria, a partir do texto "Carro" (modelo + cor).
 * Tudo local: sem API, sem custo, sem rede. Reconhece o modelo por palavra-chave
 * (o termo mais específico vence: "onix plus" -> sedan antes de "onix" -> hatch)
 * e tinge a silhueta pela cor citada no texto.
 */

export type Categoria = 'hatch' | 'sedan' | 'suv' | 'picape' | 'moto' | 'generico';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// modelo -> categoria. Termos compostos primeiro; a função escolhe o mais longo que casar.
const MODELOS: [string, Categoria][] = [
  // SUV (vem antes de picape/sedan para pegar "hilux sw4", "corolla cross")
  ['hilux sw4', 'suv'], ['sw4', 'suv'], ['corolla cross', 'suv'], ['compass', 'suv'], ['creta', 'suv'],
  ['tracker', 'suv'], ['renegade', 'suv'], ['kicks', 'suv'], ['captur', 'suv'], ['duster', 'suv'],
  ['tiguan', 'suv'], ['t-cross', 'suv'], ['tcross', 'suv'], ['nivus', 'suv'], ['pulse', 'suv'],
  ['fastback', 'suv'], ['hr-v', 'suv'], ['hrv', 'suv'], ['ecosport', 'suv'], ['tucson', 'suv'],
  ['sportage', 'suv'], ['2008', 'suv'], ['3008', 'suv'], ['territory', 'suv'], ['bronco', 'suv'],
  ['taos', 'suv'], ['tiggo', 'suv'], ['haval', 'suv'], ['wrv', 'suv'], ['wr-v', 'suv'], ['kardian', 'suv'],
  // Picape
  ['hilux', 'picape'], ['s10', 'picape'], ['ranger', 'picape'], ['amarok', 'picape'], ['toro', 'picape'],
  ['strada', 'picape'], ['saveiro', 'picape'], ['montana', 'picape'], ['oroch', 'picape'], ['frontier', 'picape'],
  ['l200', 'picape'], ['triton', 'picape'], ['maverick', 'picape'], ['ram ', 'picape'], ['f-250', 'picape'],
  ['f250', 'picape'], ['courier', 'picape'], ['hoggar', 'picape'],
  // Sedan
  ['onix plus', 'sedan'], ['hb20s', 'sedan'], ['corolla', 'sedan'], ['civic', 'sedan'], ['sentra', 'sedan'],
  ['versa', 'sedan'], ['city', 'sedan'], ['voyage', 'sedan'], ['prisma', 'sedan'], ['cronos', 'sedan'],
  ['virtus', 'sedan'], ['jetta', 'sedan'], ['logan', 'sedan'], ['cobalt', 'sedan'], ['grand siena', 'sedan'],
  ['siena', 'sedan'], ['accord', 'sedan'], ['altima', 'sedan'], ['sandero sedan', 'sedan'], ['ka sedan', 'sedan'],
  // Hatch
  ['gol', 'hatch'], ['onix', 'hatch'], ['hb20', 'hatch'], ['polo', 'hatch'], ['argo', 'hatch'],
  ['208', 'hatch'], ['sandero', 'hatch'], ['march', 'hatch'], ['up', 'hatch'], ['kwid', 'hatch'],
  ['mobi', 'hatch'], ['celta', 'hatch'], ['ka', 'hatch'], ['fox', 'hatch'], ['fiesta', 'hatch'],
  ['uno', 'hatch'], ['palio', 'hatch'], ['c3', 'hatch'], ['picanto', 'hatch'], ['i30', 'hatch'],
  ['golf', 'hatch'], ['fit', 'hatch'], ['yaris', 'hatch'], ['bravo', 'hatch'], ['punto', 'hatch'],
  // Moto
  ['cg ', 'moto'], ['biz', 'moto'], ['pop ', 'moto'], ['fan', 'moto'], ['titan', 'moto'], ['fazer', 'moto'],
  ['factor', 'moto'], ['xre', 'moto'], ['bros', 'moto'], ['pcx', 'moto'], ['nmax', 'moto'], ['cb ', 'moto'],
  ['hornet', 'moto'], ['mt-03', 'moto'], ['mt-07', 'moto'], ['ninja', 'moto'], ['harley', 'moto'],
  ['dafra', 'moto'], ['shineray', 'moto'], ['xj6', 'moto'], ['twister', 'moto'], ['elite', 'moto'],
];

const CORES: [RegExp, string][] = [
  [/\bpret[oa]\b|\bnegr[oa]\b/, '#2b2f36'],
  [/\bbranc[oa]\b/, '#e4e8f0'],
  [/\bprat(a|eado)\b/, '#c6ccd6'],
  [/\b(cinza|grafite|chumbo)\b/, '#878d99'],
  [/\bvermelh[oa]\b|\brub[io]\b/, '#d23b3b'],
  [/\bazul\b/, '#2C57E0'],
  [/\bverde\b/, '#1E9E6A'],
  [/\bamarel[oa]\b/, '#E6B800'],
  [/\blaranja\b/, '#E8742A'],
  [/\b(vinho|bordo|bordo)\b/, '#7a1f2b'],
  [/\bmarrom\b|\bcaramelo\b/, '#6b4a2b'],
  [/\bbege\b|\bareia\b/, '#d2c3a0'],
  [/\bdourad[oa]\b|\bchampagne\b/, '#C9A227'],
  [/\brox[oa]\b|\blil[as]\b/, '#6a3fb5'],
  [/\bros[a]\b/, '#e05a9c'],
];

// normaliza: sem acento, só letras/números, espaço nas bordas (casa por palavra inteira)
const norm = (s: string) => ` ${semAcento(s).replace(/[^a-z0-9]+/g, ' ').trim()} `;

export function categoriaVeiculo(texto: string | null | undefined): Categoria {
  if (!texto) return 'generico';
  const t = norm(texto);
  let achou: Categoria = 'generico';
  let tam = 0;
  for (const [kw, cat] of MODELOS) {
    const n = norm(kw);
    if (t.includes(n) && n.length > tam) { achou = cat; tam = n.length; }
  }
  return achou;
}

export function corVeiculo(texto: string | null | undefined): string {
  if (!texto) return '#9aa4bd';
  const t = semAcento(texto);
  for (const [re, cor] of CORES) if (re.test(t)) return cor;
  return '#9aa4bd';
}

const ROTULO: Record<Categoria, string> = {
  hatch: 'Hatch', sedan: 'Sedã', suv: 'SUV', picape: 'Picape', moto: 'Moto', generico: 'Veículo',
};
export const rotuloCategoria = (c: Categoria) => ROTULO[c];

const CORPO: Record<Exclude<Categoria, 'moto'>, string> = {
  hatch: 'M6,46 L10,32 C12,27 16,25 22,24 L44,24 L56,15 C60,12 66,11 74,11 L88,12 C98,13 104,17 108,24 L113,34 L114,46 Z',
  sedan: 'M4,46 L8,34 C10,30 14,28 20,27 L40,26 L54,17 C58,14 66,13 78,13 L92,14 C100,15 104,19 108,26 L116,36 L117,46 Z',
  suv: 'M6,46 L8,30 C9,24 13,21 20,20 L44,20 L52,12 C56,9 62,8 72,8 L94,9 C104,10 110,14 113,22 L116,34 L117,46 Z',
  picape: 'M4,46 L7,32 C8,27 12,25 18,24 L36,24 L44,15 C47,12 52,11 60,11 L74,12 C78,12 80,14 81,18 L81,30 L116,30 L117,46 Z',
  generico: 'M5,46 L9,33 C11,28 15,26 21,25 L43,25 L55,16 C59,13 65,12 75,12 L90,13 C100,14 105,18 109,25 L115,35 L116,46 Z',
};

export function SilhuetaCarro({ texto, tamanho = 120 }: { texto: string | null | undefined; tamanho?: number }) {
  const cat = categoriaVeiculo(texto);
  const cor = corVeiculo(texto);
  const h = Math.round(tamanho * 0.5);
  const clara = '#f2f5fb';
  if (cat === 'moto') {
    return (
      <svg className="silhueta" viewBox="0 0 120 60" width={tamanho} height={h} aria-label="Moto" role="img">
        <g fill="none" stroke={cor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="30" cy="42" r="13" /><circle cx="92" cy="42" r="13" />
          <path d="M30,42 L52,30 L70,30 L84,42" /><path d="M52,30 L60,20 L80,20" />
          <path d="M70,30 L62,42" /><path d="M80,20 L88,26" />
        </g>
        <circle cx="30" cy="42" r="4" fill={cor} /><circle cx="92" cy="42" r="4" fill={cor} />
      </svg>
    );
  }
  const body = CORPO[cat];
  return (
    <svg className="silhueta" viewBox="0 0 120 60" width={tamanho} height={h} aria-label={ROTULO[cat]} role="img">
      <path d={body} fill={cor} />
      {/* janelas, para dar leitura de carro */}
      <path d={cat === 'picape'
        ? 'M46,17 C48,15 52,14 58,14 L72,14 C75,15 77,16 78,19 L78,24 L46,24 Z'
        : cat === 'suv'
          ? 'M54,14 C57,12 62,11 71,11 L90,12 L100,21 L54,22 Z'
          : 'M57,17 C60,15 65,14 73,14 L88,15 L99,24 L57,25 Z'}
        fill={clara} opacity="0.9" />
      {/* rodas */}
      <circle cx="34" cy="46" r="10" fill="#1b2230" /><circle cx="34" cy="46" r="4.5" fill={clara} />
      <circle cx="90" cy="46" r="10" fill="#1b2230" /><circle cx="90" cy="46" r="4.5" fill={clara} />
    </svg>
  );
}
