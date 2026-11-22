import type { Agendamento } from './api';
import { brl } from './util';

/** Agenda dos chamados com hora marcada: faixa da semana e grade de horas (um dia ou os sete). */

const LETRAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const indice = (d: Date) => (d.getDay() + 6) % 7;   // segunda = 0

export const zeroHora = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const somaDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
export const inicioSemana = (d: Date) => somaDias(zeroHora(d), -indice(d));
export const semanaDe = (d: Date) => Array.from({ length: 7 }, (_, i) => somaDias(inicioSemana(d), i));
export const tituloDia = (d: Date) => ({ semana: CURTOS[indice(d)], resto: `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}` });
export const dataCampo = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Quanto o chamado ocupa o caminhão, em minutos. O banco não guarda hora de término.
 * Com a rota do mapa: minutos de estrada dos três trechos + 30 min (carregar e descarregar).
 * Sem rota: estimativa pelos km — 30 min fixos + 2 min por km até 30 km (cidade) + 1 min por km acima (estrada).
 * Arredonda para cima em blocos de 15 min, com mínimo de 45. Sem km nenhum, 1 hora.
 */
export function duracaoMin(a: Pick<Agendamento, 'km' | 'km_desloc' | 'km_retorno' | 'min_rota'>) {
  const blocos = (m: number) => Math.max(45, Math.ceil(m / 15) * 15);
  if (a.min_rota) return blocos(Number(a.min_rota) + 30);
  const km = (Number(a.km) || 0) + (Number(a.km_desloc) || 0) + (Number(a.km_retorno) || 0);
  if (!km) return 60;
  return blocos(30 + Math.min(km, 30) * 2 + Math.max(0, km - 30));
}

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutoDoDia = (d: Date) => d.getHours() * 60 + d.getMinutes();
const bairro = (t: string | null | undefined) => { const p = (t ?? '').split(',').map((x) => x.trim()).filter(Boolean); return p[p.length - 1] ?? ''; };

export function FaixaSemana({ dia, itens, aoEscolher }: { dia: Date; itens: Agendamento[]; aoEscolher: (d: Date) => void }) {
  const hoje = new Date();
  return (
    <div className="agc-faixa">
      <div className="agc-setas">
        <button type="button" aria-label="Semana anterior" onClick={() => aoEscolher(somaDias(dia, -7))}>‹</button>
        <button type="button" aria-label="Próxima semana" onClick={() => aoEscolher(somaDias(dia, 7))}>›</button>
      </div>
      {semanaDe(dia).map((d, i) => {
        const n = itens.filter((a) => mesmoDia(new Date(a.inicio), d)).length;
        return (
          <button key={i} type="button" className={`agc-dia${mesmoDia(d, dia) ? ' on' : ''}${mesmoDia(d, hoje) ? ' hoje' : ''}`}
            aria-pressed={mesmoDia(d, dia)} aria-label={`${CURTOS[i]} ${d.getDate()}, ${n} agendado${n === 1 ? '' : 's'}`} onClick={() => aoEscolher(d)}>
            <small>{LETRAS[i]}</small><b>{d.getDate()}</b><i className={n ? '' : 'z'} />
          </button>
        );
      })}
    </div>
  );
}

type Bloco = { a: Agendamento; ini: number; fim: number; pista: number };

/** Distribui os blocos do dia em pistas lado a lado quando os horários se sobrepõem. */
function emPistas(doDia: Agendamento[]): { blocos: Bloco[]; pistas: number } {
  const fins: number[] = [];
  const blocos = doDia
    .map((a) => { const ini = minutoDoDia(new Date(a.inicio)); return { a, ini, fim: ini + duracaoMin(a), pista: 0 }; })
    .sort((x, y) => x.ini - y.ini)
    .map((b) => { let p = fins.findIndex((f) => f <= b.ini); if (p < 0) p = fins.length; fins[p] = b.fim; return { ...b, pista: p }; });
  return { blocos, pistas: Math.max(1, fins.length) };
}

export function GradeHoras({ dias, itens, aoAbrir }: { dias: Date[]; itens: Agendamento[]; aoAbrir: (a: Agendamento) => void }) {
  const agora = new Date();
  const umDia = dias.length === 1;
  const colunas = dias.map((d) => ({ d, ...emPistas(itens.filter((a) => mesmoDia(new Date(a.inicio), d))) }));
  const todos = colunas.flatMap((c) => c.blocos);
  // Faixa de horas: das 7h às 19h, esticando para caber o que estiver marcado. No dia de hoje, começa na hora atual.
  const soHoje = umDia && mesmoDia(dias[0], agora);
  const primeiro = todos.length ? Math.min(...todos.map((b) => b.ini)) : 24 * 60;
  let h0 = Math.floor(Math.min(soHoje ? minutoDoDia(agora) : 7 * 60, primeiro) / 60);
  let h1 = Math.ceil(Math.max(19 * 60, ...todos.map((b) => b.fim)) / 60);
  h1 = Math.min(24, Math.max(h1, h0 + 5)); h0 = Math.min(h0, h1 - 5);
  const meias = (h1 - h0) * 2;
  const pos = (m: number) => (m - h0 * 60) / 30;

  return (
    <div className={`agc-grade${umDia ? ' agc-um' : ''}`} style={{ ['--agc-col' as string]: dias.length }}>
      <div className="agc-horas" aria-hidden="true">
        {Array.from({ length: h1 - h0 }, (_, i) => <span key={i}>{hhmm((h0 + i) * 60)}</span>)}
      </div>
      {colunas.map(({ d, blocos, pistas }, i) => (
        <div key={i} className={`agc-col${d.getDay() === 0 || d.getDay() === 6 ? ' fds' : ''}`} style={{ height: `calc(var(--agc-rh) * ${meias})` }}>
          {mesmoDia(d, agora) && minutoDoDia(agora) >= h0 * 60 && minutoDoDia(agora) <= h1 * 60 && <i className="agc-agora" style={{ top: `calc(var(--agc-rh) * ${pos(minutoDoDia(agora))})` }} />}
          {blocos.map(({ a, ini, fim, pista }) => (
            <button key={a.id} type="button" className={`agc-bl${fim - ini < 60 ? ' agc-curto' : ''}`} onClick={() => aoAbrir(a)}
              style={{ top: `calc(var(--agc-rh) * ${pos(ini)})`, height: `calc(var(--agc-rh) * ${(fim - ini) / 30} - 2px)`, left: `calc(${(pista / pistas) * 100}% + 2px)`, width: `calc(${100 / pistas}% - 4px)` }}>
              <time>{hhmm(ini)}{umDia ? ` às ${hhmm(fim)}` : ''}</time>
              <span>{a.nome}</span>
              {umDia && <strong>{a.valor ? brl(a.valor) : 'A cotar'}</strong>}
              {umDia && <p>{[a.veiculo, [bairro(a.origem), bairro(a.destino)].filter(Boolean).join(' → ')].filter(Boolean).join(' · ')}</p>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
