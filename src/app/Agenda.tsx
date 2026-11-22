import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, type Loja, type Agendamento, type Servico, type Retorno, type ItemHoje, type Modelo } from './api';
import Pendencias from './Pendencias';
import { Janela, Aviso } from './ui';
import CobrarPix from './CobrarPix';
import { brl, linkWhatsApp, telefoneBR, soDigitos, dataBR } from './util';

const iniciais = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
const isoLocal = (d: Date) => d.toLocaleDateString('en-CA');

type Fase = Agendamento['status'];
const ST_META: Record<string, { rot: string; cor: string; ev: string }> = {
  pendente: { rot: 'Pendente', cor: 'var(--cinza)', ev: 'ev-pendente' },
  confirmado: { rot: 'Confirmado', cor: '#5B8CFF', ev: 'ev-confirmado' },
  fila: { rot: 'Na fila', cor: 'var(--marca)', ev: 'ev-fila' },
  compareceu: { rot: 'Na fila', cor: 'var(--marca)', ev: 'ev-fila' },
  em_servico: { rot: 'Em serviço', cor: 'var(--ambar)', ev: 'ev-em_servico' },
  pronto: { rot: 'Pronto', cor: 'var(--verde)', ev: 'ev-pronto' },
  entregue: { rot: 'Entregue', cor: '#93A6AD', ev: 'ev-entregue' },
  cancelado: { rot: 'Cancelado', cor: '#C0392B', ev: 'ev-pendente' },
};
const FASES: { v: Fase; rot: string }[] = [
  { v: 'fila', rot: 'Na fila' }, { v: 'em_servico', rot: 'Em serviço' },
  { v: 'pronto', rot: 'Pronto' }, { v: 'entregue', rot: 'Entregue' },
];

const DIAS = [['seg', 1], ['ter', 2], ['qua', 3], ['qui', 4], ['sex', 5], ['sáb', 6], ['dom', 0]] as const;
const LETRA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = (n: number) => String(n).padStart(2, '0');
const slugify = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const inicioDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const mesmoDia = (a: Date, b: Date) => inicioDia(a).getTime() === inicioDia(b).getTime();
function segunda(d: Date) { const x = inicioDia(d); const g = (x.getDay() + 6) % 7; x.setDate(x.getDate() - g); return x; }
function horas(de: number, ate: number) { return Array.from({ length: ate - de + 1 }, (_, i) => de + i); }

const HORA_PX = 62;

export default function Agenda({ loja, aoMudar }: { loja: Loja; aoMudar: () => void }) {
  const [lista, setLista] = useState<Agendamento[] | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [dia, setDia] = useState<Date>(inicioDia(new Date()));
  const [sel, setSel] = useState<Agendamento | null>(null);
  const [cfgAberto, setCfgAberto] = useState(false);
  const [sub, setSub] = useState<'none' | 'status' | 'remarcar'>('none');
  const [novaData, setNovaData] = useState('');
  const [novaHora, setNovaHora] = useState('');
  const [cobrar, setCobrar] = useState(false);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [veiculos, setVeiculos] = useState<string[]>([]);
  const [retAberto, setRetAberto] = useState(false);
  const [retornos, setRetornos] = useState<Retorno[] | null>(null);
  const [pend, setPend] = useState<ItemHoje[] | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [abaAl, setAbaAl] = useState<'chamar' | 'retornos'>('chamar');
  const [mudouId, setMudouId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [nModo, setNModo] = useState<'agora' | 'agendar'>('agora');
  const [nNome, setNNome] = useState('');
  const [nTel, setNTel] = useState('');
  const [nVeic, setNVeic] = useState('');
  const [nServs, setNServs] = useState<string[]>([]);
  const [nData, setNData] = useState('');
  const [nHora, setNHora] = useState('');
  const [nVaga, setNVaga] = useState(1);
  const [servAberto, setServAberto] = useState(false);
  const [vista, setVista] = useState<'dia' | 'semana' | 'vagas'>('semana');
  const [filtroServ, setFiltroServ] = useState('');
  const [filtroAberto, setFiltroAberto] = useState(false); // folha de filtros no mobile (atrás do funil)
  const [pickerAberto, setPickerAberto] = useState(false);
  const [anoView, setAnoView] = useState(new Date().getFullYear());
  useEffect(() => { if (typeof window !== 'undefined' && window.innerWidth <= 820) setVista('dia'); }, []);

  function abrirSel(a: Agendamento) {
    const d = new Date(a.inicio);
    setSel(a); setSub('none');
    setNovaData(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setNovaHora(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }
  async function remarcar() {
    if (!sel || !novaData || !novaHora) return;
    try { await api.remarcarAgendamento(sel.id, new Date(`${novaData}T${novaHora}`).toISOString()); setSel(null); await carregar(); }
    catch (e) { setErro((e as Error).message); }
  }

  const carregar = () => api.agendamentos().then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); api.servicos().then(setServicos).catch(() => {}); api.veiculosSugestoes().then(setVeiculos).catch(() => {}); }, []);

  async function criar() {
    if (!nNome.trim()) { setErro('Informe o nome do cliente.'); return; }
    const duraSel = Math.max(0, ...nServs.map((n) => servicos.find((s) => s.nome === n)?.dura_dias ?? 0));
    const ehJob = duraSel >= 2;
    let inicio: string; let st: Fase; let previsao: string | null = null; let entradaData = '';
    if (ehJob) {
      entradaData = nModo === 'agendar' && nData ? nData : isoLocal(new Date());
      inicio = new Date(`${entradaData}T08:00`).toISOString(); st = 'fila';
      const sai = new Date(`${entradaData}T00:00`); sai.setDate(sai.getDate() + duraSel - 1); previsao = isoLocal(sai);
    } else if (nModo === 'agora') { inicio = new Date().toISOString(); st = 'fila'; }
    else {
      if (!nData || !nHora) { setErro('Escolha data e hora.'); return; }
      inicio = new Date(`${nData}T${nHora}`).toISOString(); st = 'confirmado';
    }
    try {
      await api.criarAgendamento(loja.id, { nome: nNome.trim(), telefone: nTel.trim() || null, veiculo: nVeic.trim() || null, servico_nome: nServs.join(' + ') || null, inicio, status: st, previsao_entrega: previsao, vaga: ehJob ? nVaga : null });
      setNovoAberto(false); setNNome(''); setNTel(''); setNVeic(''); setNServs([]); setNData(''); setNHora(''); setNVaga(1); setServAberto(false); setErro('');
      if (ehJob) setDia(inicioDia(new Date(`${entradaData}T00:00`)));
      else if (nModo === 'agendar' && nData) setDia(inicioDia(new Date(`${nData}T00:00`)));
      await carregar();
    } catch (e) { setErro((e as Error).message); }
  }

  const link = loja.slug ? `${location.origin}/agendar/?l=${loja.slug}` : '';
  const hIni = loja.agendar_hora_ini || 8;
  const hFim = loja.agendar_hora_fim || 19;
  const dur = loja.agendar_intervalo || 30;
  const hoje = inicioDia(new Date());
  const seg = segunda(dia);
  const semana = Array.from({ length: 7 }, (_, i) => { const d = new Date(seg); d.setDate(seg.getDate() + i); return d; });
  // Faixa rolável de dias (3 semanas) centrada no dia selecionado: dá pra scrollar e avançar os dias.
  const faixaDias = Array.from({ length: 21 }, (_, i) => { const d = new Date(dia); d.setDate(dia.getDate() - 10 + i); return inicioDia(d); });
  const chipSelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { chipSelRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [isoLocal(dia), vista]);

  function carregarRetornos() {
    api.retornos(isoLocal(seg), isoLocal(semana[6])).then(setRetornos).catch(() => {});
  }
  // Fase 3: arrastar o job na timeline de Vagas (desktop) — mover de vaga e/ou deslizar os dias.
  function arrastarJob(e: React.PointerEvent<HTMLButtonElement>, a: Agendamento) {
    if (e.button !== 0) return;
    const bar = e.currentTarget;
    const linha = bar.closest('.ag-vagas-linha') as HTMLElement | null;
    const faixa = bar.parentElement as HTMLElement | null;
    if (!linha || !faixa) return;
    const colW = faixa.getBoundingClientRect().width / 7;
    const rowH = linha.offsetHeight || 58;
    const x0 = e.clientX, y0 = e.clientY;
    let dx = 0, dy = 0, moveu = false;
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('ag-barra-arr');
    const mv = (ev: PointerEvent) => {
      dx = ev.clientX - x0; dy = ev.clientY - y0;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moveu = true;
      bar.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const up = () => {
      bar.removeEventListener('pointermove', mv);
      bar.classList.remove('ag-barra-arr'); bar.style.transform = '';
      if (!moveu) { abrirSel(a); return; }
      const sDias = Math.round(dx / colW);
      const sVaga = Math.round(dy / rowH);
      const novaVaga = Math.min(vagasLoja, Math.max(1, (a.vaga ?? 1) + sVaga));
      if (sDias === 0 && novaVaga === (a.vaga ?? 1)) return;
      const ini = new Date(a.inicio); ini.setDate(ini.getDate() + sDias);
      const prev = new Date(`${a.previsao_entrega}T00:00:00`); prev.setDate(prev.getDate() + sDias);
      api.moverJob(a.id, { vaga: novaVaga, inicio: ini.toISOString(), previsao_entrega: isoLocal(prev) })
        .then(() => { marcarMudou(a.id); return carregar(); })
        .catch((err) => setErro((err as Error).message));
    };
    bar.addEventListener('pointermove', mv);
    bar.addEventListener('pointerup', up, { once: true });
  }
  // Clicar na linha do horário abre o novo agendamento já com dia e hora (além do FAB).
  function clicarGrade(e: React.MouseEvent<HTMLDivElement>, d: Date) {
    if ((e.target as HTMLElement).closest('.ag-evento')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, (e.clientY - rect.top) / HORA_PX);
    const interv = loja.agendar_intervalo || 30;
    const slot = Math.floor((hIni * 60 + frac * 60) / interv) * interv;
    setNModo('agendar'); setNData(isoLocal(inicioDia(d))); setNHora(`${pad(Math.floor(slot / 60))}:${pad(slot % 60)}`);
    setNNome(''); setNTel(''); setNVeic(''); setNServs([]); setNVaga(1); setServAberto(false); setErro('');
    setNovoAberto(true);
  }
  // Quem chamar agora (orçamento parado, contato novo, retorno vencido): a antiga tela Hoje, dentro do sino.
  function carregarPend() { api.hoje().then(setPend).catch(() => setPend([])); }
  useEffect(() => { carregarPend(); api.modelos().then(setModelos).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function abrirRetornos() {
    setAbaAl(pend && pend.length > 0 ? 'chamar' : 'retornos');
    setRetAberto(true); carregarPend(); if (retornos === null) carregarRetornos();
  }
  // Atualiza o indicador de retornos sempre que muda a semana em exibição.
  useEffect(() => { carregarRetornos(); }, [isoLocal(seg)]); // eslint-disable-line react-hooks/exhaustive-deps
  function agendarRetorno(r: Retorno) {
    setRetAberto(false);
    setNModo('agendar'); setNNome(r.cliente); setNTel(r.telefone); setNVeic(r.veiculo || '');
    setNServs(r.servico ? [r.servico] : []); setNData(r.previsto.slice(0, 10)); setNHora('');
    setNovoAberto(true);
  }

  const doDia = (lista ?? [])
    .filter((a) => a.status !== 'cancelado' && !a.previsao_entrega && mesmoDia(new Date(a.inicio), dia) && (!filtroServ || a.servico_nome === filtroServ))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));

  const agora = new Date();
  const mostrarAgora = mesmoDia(agora, dia) && agora.getHours() + agora.getMinutes() / 60 >= hIni && agora.getHours() < hFim;
  const topoAgora = (agora.getHours() + agora.getMinutes() / 60 - hIni) * HORA_PX;

  async function alterarConfig(campos: Partial<Loja>) {
    setSalvando(true); setErro('');
    try { await api.salvarAgenda(loja.id, campos); aoMudar(); } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  async function ativar() {
    const slug = loja.slug || `${slugify(loja.nome)}-${Math.random().toString(36).slice(2, 6)}`;
    await alterarConfig({ agendar_ativo: true, slug });
  }
  function toggleDia(n: number) {
    const dias = loja.agendar_dias.includes(n) ? loja.agendar_dias.filter((x) => x !== n) : [...loja.agendar_dias, n];
    alterarConfig({ agendar_dias: dias });
  }
  // Marca o card que acabou de mudar para disparar o pulso (uma vez).
  function marcarMudou(id: string) { setMudouId(id); setTimeout(() => setMudouId((v) => (v === id ? null : v)), 750); }
  async function status(a: Agendamento, s: Agendamento['status']) { try { await api.mudarStatusAgendamento(a.id, s); setSel(null); setSub('none'); marcarMudou(a.id); await carregar(); } catch (e) { setErro((e as Error).message); } }
  async function entregar(a: Agendamento) { try { await api.entregarAgendamento(loja.id, a, servicos); setSel(null); setSub('none'); marcarMudou(a.id); await carregar(); } catch (e) { setErro((e as Error).message); } }
  async function abrirCliente(a: Agendamento) {
    try {
      const ls = await api.clientes(a.telefone ? soDigitos(a.telefone) : a.nome);
      const c = a.telefone ? (ls.find((x) => soDigitos(x.telefone) === soDigitos(a.telefone!)) ?? ls[0]) : ls[0];
      if (c) { setSel(null); location.hash = `#/clientes/${c.id}`; return; }
    } catch { /* ignora */ }
    setErro('Cliente ainda não tem ficha — ela é criada quando o atendimento é entregue.');
  }
  function copiar() { navigator.clipboard?.writeText(link).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); }).catch(() => {}); }
  function moverSemana(delta: number) { const d = new Date(dia); d.setDate(d.getDate() + delta * 7); setDia(d); }
  function mover(delta: number) { const d = new Date(dia); d.setDate(d.getDate() + delta * (vista === 'semana' ? 7 : 1)); setDia(d); }
  const porDia = (d: Date) => (lista ?? []).filter((a) => a.status !== 'cancelado' && !a.previsao_entrega && mesmoDia(new Date(a.inicio), d) && (!filtroServ || a.servico_nome === filtroServ)).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const servicosNaLista = Array.from(new Set((lista ?? []).map((a) => a.servico_nome).filter(Boolean))) as string[];

  // --- Jobs multi-dia (funilaria que dura vários dias) ---
  const ROT_JOB: Record<string, string> = { fila: 'Recebido', compareceu: 'Recebido', confirmado: 'Agendado', em_servico: 'Em execução', pronto: 'Pronto p/ retirada', entregue: 'Entregue', pendente: 'Pendente', cancelado: 'Cancelado' };
  const BG_STATUS: Record<string, string> = { pendente: '#EEF2F4', confirmado: '#EAF0FF', fila: 'var(--nevoa)', compareceu: 'var(--nevoa)', em_servico: '#FBEEDA', pronto: '#E1F5EC', entregue: '#EDF1F3', cancelado: '#EEF2F4' };
  const D3 = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const dataCurta = (d: Date) => `${D3[d.getDay()]} ${d.getDate()}`;
  const jobDatas = (a: Agendamento) => {
    const ent = inicioDia(new Date(a.inicio));
    const sai = inicioDia(new Date(`${a.previsao_entrega!}T00:00:00`));
    const total = Math.max(1, Math.round((+sai - +ent) / 86400000) + 1);
    return { ent, sai, total };
  };
  const jobs = (lista ?? []).filter((a) => a.previsao_entrega && a.status !== 'cancelado' && (!filtroServ || a.servico_nome === filtroServ));
  const jobsSemana = (() => {
    const ws = +seg, we = +semana[6];
    const itens = jobs.map((a) => { const { ent, sai } = jobDatas(a); return { a, es: +ent, ee: +sai }; })
      .filter((j) => j.es <= we && j.ee >= ws).sort((x, y) => x.es - y.es);
    const laneEnd: number[] = [];
    return itens.map((j) => {
      const s = Math.max(0, Math.round((j.es - ws) / 86400000));
      const e = Math.min(6, Math.round((j.ee - ws) / 86400000));
      let lane = laneEnd.findIndex((end) => end < j.es);
      if (lane === -1) { lane = laneEnd.length; laneEnd.push(j.ee); } else laneEnd[lane] = j.ee;
      return { a: j.a, s, e, lane };
    });
  })();
  const jobsDoDia = jobs.filter((a) => { const { ent, sai } = jobDatas(a); return +ent <= +inicioDia(dia) && +inicioDia(dia) <= +sai; })
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  // Formulário: duração do serviço escolhido e previsão de entrega ao vivo
  const duraForm = Math.max(0, ...nServs.map((n) => servicos.find((s) => s.nome === n)?.dura_dias ?? 0));
  const ehJobForm = duraForm >= 2;
  const previsaoForm = (() => {
    if (!ehJobForm) return null;
    const base = nModo === 'agendar' && nData ? nData : isoLocal(new Date());
    const sai = new Date(`${base}T00:00`); sai.setDate(sai.getDate() + duraForm - 1); return sai;
  })();
  // Vagas (fase 2): capacidade e timeline por vaga
  const vagasLoja = Math.max(1, loja.vagas_funilaria || 1);
  const jobsRange = jobs.map((a) => { const { ent, sai } = jobDatas(a); return { a, es: +ent, ee: +sai }; });
  const jobsSemanaVaga = jobsRange.filter((j) => j.es <= +semana[6] && j.ee >= +seg);
  const ocupacaoDia = semana.map((d) => jobsSemanaVaga.filter((j) => j.es <= +inicioDia(d) && +inicioDia(d) <= j.ee).length);
  const conflitoVaga = (() => {
    if (!ehJobForm || !previsaoForm) return false;
    const base = nModo === 'agendar' && nData ? nData : isoLocal(new Date());
    const es = +new Date(`${base}T00:00`); const ee = +previsaoForm;
    return jobs.some((a) => (a.vaga ?? 1) === nVaga && (() => { const { ent, sai } = jobDatas(a); return +ent <= ee && +sai >= es; })());
  })();
  // Lotação do slot escolhido (empresa por horário) — encaixe manual se cheio
  const slotCheio = (() => {
    if (ehJobForm || nModo !== 'agendar' || !nData || !nHora) return null;
    const alvo = +new Date(`${nData}T${nHora}`);
    const qtd = (lista ?? []).filter((a) => !a.previsao_entrega && a.status !== 'cancelado' && +new Date(a.inicio) === alvo).length;
    return { qtd, lim: loja.carros_por_horario, cheio: qtd >= loja.carros_por_horario };
  })();
  const FERIADOS: Record<string, string> = { '01-01': 'Confraternização', '04-21': 'Tiradentes', '05-01': 'Dia do Trabalho', '09-07': 'Independência', '10-12': 'N. Sra. Aparecida', '11-02': 'Finados', '11-15': 'Proclamação da República', '11-20': 'Consciência Negra', '12-25': 'Natal' };
  const feriado = (d: Date) => FERIADOS[`${pad(d.getMonth() + 1)}-${pad(d.getDate())}`] ?? null;
  const agoraDentro = agora.getHours() + agora.getMinutes() / 60 >= hIni && agora.getHours() < hFim;
  const DN = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  function eventoBtn(a: Agendamento, col = 0, cols = 1) {
    const d = new Date(a.inicio);
    const topo = (d.getHours() + d.getMinutes() / 60 - hIni) * HORA_PX;
    const alt = Math.max((dur / 60) * HORA_PX, 52);
    const estilo: CSSProperties = { top: topo, height: alt };
    if (cols > 1) { estilo.left = `calc(${(col / cols) * 100}% + 3px)`; estilo.width = `calc(${100 / cols}% - 6px)`; estilo.right = 'auto'; }
    const meta = ST_META[a.status] ?? ST_META.pendente;
    return (
      <button key={a.id} type="button" className={`ag-evento ${corStatus(a.status)}${a.id === mudouId ? ' ag-evento-mudou' : ''}`} style={estilo} onClick={() => abrirSel(a)}>
        <span className="ev-h">{pad(d.getHours())}:{pad(d.getMinutes())}<span className="ev-st" style={{ color: meta.cor }}>{meta.rot}</span></span>
        <b>{a.nome}</b>
        {a.servico_nome && <span className="ev-s">{a.servico_nome}</span>}
      </button>
    );
  }
  // Distribui em colunas quando há vários veículos no mesmo horário.
  function layoutDia(itens: Agendamento[]) {
    const altPx = Math.max((dur / 60) * HORA_PX, 52);
    const arr = itens.map((a) => { const d = new Date(a.inicio); const s = (d.getHours() + d.getMinutes() / 60 - hIni) * HORA_PX; return { a, s, e: s + altPx, col: 0, cols: 1 }; });
    arr.sort((x, y) => x.s - y.s);
    let cluster: typeof arr = []; let fim = -1;
    const fechar = () => { const lanes: number[] = []; cluster.forEach((ev) => { let p = false; for (let i = 0; i < lanes.length; i++) { if (lanes[i] <= ev.s + 0.5) { ev.col = i; lanes[i] = ev.e; p = true; break; } } if (!p) { ev.col = lanes.length; lanes.push(ev.e); } }); cluster.forEach((ev) => { ev.cols = lanes.length; }); };
    arr.forEach((ev) => { if (cluster.length && ev.s >= fim) { fechar(); cluster = []; fim = -1; } cluster.push(ev); fim = Math.max(fim, ev.e); });
    if (cluster.length) fechar();
    return arr;
  }
  const faixaHoras = horas(hIni, hFim);
  const fimSem = semana[6];
  const tituloPeriodo = vista === 'semana'
    ? (seg.getMonth() === fimSem.getMonth()
        ? `${seg.getDate()}–${fimSem.getDate()} de ${MES[seg.getMonth()]} de ${seg.getFullYear()}`
        : `${seg.getDate()} de ${MES[seg.getMonth()]} – ${fimSem.getDate()} de ${MES[fimSem.getMonth()]} de ${fimSem.getFullYear()}`)
    : `${dia.getDate()} de ${MES[dia.getMonth()]} de ${dia.getFullYear()}`;
  // Versão curta para o cabeçalho compacto do mobile (ex.: "20 de nov, sex")
  const tituloCurto = `${dia.getDate()} de ${MES[dia.getMonth()].slice(0, 3)}, ${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dia.getDay()]}`;

  const corStatus = (s: Agendamento['status']) => (ST_META[s] ?? ST_META.pendente).ev;

  return (
    <>
      <header className="cabeca ag-cabeca">
        <div className="ag-titulo-area">
          <h1>Agenda</h1>
          <button type="button" className="ag-periodo" onClick={() => { setAnoView(dia.getFullYear()); setPickerAberto((v) => !v); }} aria-expanded={pickerAberto}>
            <span className="ag-periodo-full">{tituloPeriodo}</span>
            <span className="ag-periodo-curto">{tituloCurto}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>
          </button>
          {pickerAberto && (
            <div className="ag-picker">
              <div className="ag-picker-top">
                <button type="button" onClick={() => setAnoView((y) => y - 1)} aria-label="Ano anterior">‹</button>
                <span>{anoView}</span>
                <button type="button" onClick={() => setAnoView((y) => y + 1)} aria-label="Próximo ano">›</button>
              </div>
              <div className="ag-picker-meses">
                {MES.map((m, i) => (
                  <button key={i} type="button" className={dia.getFullYear() === anoView && dia.getMonth() === i ? 'on' : ''}
                    onClick={() => { setDia(inicioDia(new Date(anoView, i, Math.min(dia.getDate(), 28)))); setPickerAberto(false); }}>
                    {m.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="ag-ferr">
          {servicosNaLista.length > 0 && (
            <select className="ag-filtro" value={filtroServ} onChange={(e) => setFiltroServ(e.target.value)} aria-label="Filtrar por serviço">
              <option value="">Todos os serviços</option>
              {servicosNaLista.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <button type="button" className="ag-retorno-btn" onClick={abrirRetornos} aria-label={pend && pend.length > 0 ? `Alertas: ${pend.length} para chamar` : 'Alertas'} title="Alertas">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            {pend && pend.length > 0 ? <span className="ag-retorno-num" aria-hidden="true">{pend.length > 9 ? '9+' : pend.length}</span>
              : retornos && retornos.length > 0 && <span className="ag-retorno-dot" aria-hidden="true" />}
          </button>
          {servicosNaLista.length > 0 && (
            <button type="button" className="ag-funil" onClick={() => setFiltroAberto(true)} aria-label="Filtros">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8v6l-4 2v-8z" /></svg>
              {filtroServ && <span className="ag-funil-dot" aria-hidden="true" />}
            </button>
          )}
          <div className="ag-vista" role="tablist">
            <button type="button" className={vista === 'dia' ? 'on' : ''} onClick={() => setVista('dia')}>Dia</button>
            <button type="button" className={vista === 'semana' ? 'on' : ''} onClick={() => setVista('semana')}>Semana</button>
            {loja.perfil !== 'oficina' && <button type="button" className={vista === 'vagas' ? 'on' : ''} onClick={() => setVista('vagas')}>Vagas</button>}
          </div>
          <div className="ag-nav">
            <button type="button" className="ag-seta" onClick={() => mover(-1)} aria-label="Anterior">‹</button>
            <button type="button" className="btn btn-secundario ag-hoje" onClick={() => setDia(hoje)}>Hoje</button>
            <button type="button" className="ag-seta" onClick={() => mover(1)} aria-label="Próximo">›</button>
          </div>
        </div>
      </header>

      {erro && <Aviso>{erro}</Aviso>}

      {vista === 'dia' && (
        <div className="ag-semana">
          {faixaDias.map((d) => {
            const sel = mesmoDia(d, dia);
            const hoj = mesmoDia(d, hoje);
            const qtd = porDia(d).length;
            return (
              <button key={d.toISOString()} ref={sel ? chipSelRef : null} type="button" className={`ag-dia-chip${sel ? ' sel' : ''}${hoj ? ' hoje' : ''}`} onClick={() => setDia(inicioDia(d))}>
                <span className="ag-dia-letra">{LETRA[d.getDay()]}</span>
                <span className="ag-dia-num">{d.getDate()}</span>
                {qtd > 0 && <span className="ag-dia-ponto" />}
              </button>
            );
          })}
        </div>
      )}

      {vista === 'dia' && feriado(dia) && <div className="ag-feriado-dia"><span className="ag-feriado">{feriado(dia)}</span></div>}

      {vista === 'dia' && jobsDoDia.length > 0 && (
        <div className="ag-andamento">
          <div className="ag-andamento-tit">Em andamento · vários dias</div>
          {jobsDoDia.map((a) => {
            const { ent, sai, total } = jobDatas(a);
            const diaN = Math.round((+inicioDia(dia) - +ent) / 86400000) + 1;
            const meta = ST_META[a.status] ?? ST_META.pendente;
            return (
              <button key={a.id} type="button" className={`ag-job${a.status === 'pronto' ? ' ag-job-pronto' : ''}`} style={{ background: BG_STATUS[a.status], borderColor: meta.cor }} onClick={() => abrirSel(a)}>
                <span className="ag-job-info"><b>{a.servico_nome || 'Serviço'}{a.veiculo ? ` — ${a.veiculo}` : ''}</b><small>Entrou {dataCurta(ent)} · previsão {dataCurta(sai)}</small></span>
                <span className="ag-job-tag" style={{ color: meta.cor }}>{ROT_JOB[a.status]}<em>dia {diaN} de {total}</em></span>
              </button>
            );
          })}
        </div>
      )}

      {vista === 'vagas' ? (
        <div className="ag-vagas">
          <div className="ag-vagas-cab">
            <div className="ag-vagas-gut" />
            {semana.map((d, i) => (
              <div key={d.toISOString()} className={`ag-vagas-dcab${mesmoDia(d, hoje) ? ' hoje' : ''}${ocupacaoDia[i] >= vagasLoja ? ' lotado' : ''}`}>
                <span className="ag-sem-dn">{DN[d.getDay()]}</span>
                <span className="ag-sem-dd">{d.getDate()}</span>
                {ocupacaoDia[i] >= vagasLoja && <span className="ag-vagas-lot">lotado</span>}
              </div>
            ))}
          </div>
          {Array.from({ length: vagasLoja }, (_, vi) => vi + 1).map((nv) => (
            <div key={nv} className="ag-vagas-linha">
              <div className="ag-vagas-lbl"><span className="ag-vagas-ic">{nv}</span>Vaga {nv}</div>
              <div className="ag-vagas-faixa">
                {semana.map((d) => <div key={d.toISOString()} className="ag-vagas-cell" />)}
                {jobsSemanaVaga.filter((j) => (j.a.vaga ?? 1) === nv).map((j) => {
                  const s = Math.max(0, Math.round((j.es - +seg) / 86400000));
                  const e = Math.min(6, Math.round((j.ee - +seg) / 86400000));
                  const meta = ST_META[j.a.status] ?? ST_META.pendente;
                  return (
                    <button key={j.a.id} type="button" className={`ag-barra ag-barra-arrastavel${j.a.status === 'pronto' ? ' ag-barra-pronto' : ''}`}
                      style={{ position: 'absolute', left: `calc(${(s / 7) * 100}% + 3px)`, width: `calc(${((e - s + 1) / 7) * 100}% - 6px)`, top: 9, height: 40, background: BG_STATUS[j.a.status], borderColor: meta.cor }}
                      onPointerDown={(ev) => arrastarJob(ev, j.a)}>
                      <b>{j.a.servico_nome || 'Serviço'}{j.a.veiculo ? ` — ${j.a.veiculo}` : ''}</b>
                      <span style={{ color: meta.cor }}>{ROT_JOB[j.a.status]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {jobsSemanaVaga.length === 0 && <p className="dica" style={{ padding: '14px 4px' }}>Nenhum serviço de vários dias nesta semana.</p>}
        </div>
      ) : vista === 'dia' ? (
        <div className="ag-grade">
          <div className="ag-horas-col">
            {faixaHoras.map((h) => <div key={h} className="ag-hora" style={{ height: HORA_PX }}><span>{pad(h)}:00</span></div>)}
          </div>
          <div className="ag-trilha ag-trilha-clic" style={{ height: (hFim - hIni) * HORA_PX }} onClick={(e) => clicarGrade(e, dia)}>
            {faixaHoras.map((h) => <div key={h} className="ag-linha" style={{ top: (h - hIni) * HORA_PX }} />)}
            {mostrarAgora && <div className="ag-agora" style={{ top: topoAgora }}><i /></div>}
            {doDia.length === 0 && <div className="ag-vazio-dia">Nenhum agendamento neste dia</div>}
            {layoutDia(doDia).map((ev) => eventoBtn(ev.a, ev.col, ev.cols))}
          </div>
        </div>
      ) : (
        <div className="ag-sem">
          <div className="ag-sem-cab">
            <div className="ag-sem-gut" />
            {semana.map((d) => {
              const hoj = mesmoDia(d, hoje);
              const fds = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={d.toISOString()} className={`ag-sem-dcab${hoj ? ' hoje' : ''}${fds ? ' fds' : ''}`}>
                  <span className="ag-sem-dn">{DN[d.getDay()]}</span>
                  <span className="ag-sem-dd">{d.getDate()}</span>
                </div>
              );
            })}
          </div>
          {jobsSemana.length > 0 && (
            <div className="ag-multidia">
              <div className="ag-multidia-lbl">Vários dias</div>
              {jobsSemana.map(({ a, s, e, lane }) => {
                const meta = ST_META[a.status] ?? ST_META.pendente;
                return (
                  <button key={a.id} type="button" className={`ag-barra${a.status === 'pronto' ? ' ag-barra-pronto' : ''}`} style={{ gridColumn: `${s + 2} / ${e + 3}`, gridRow: lane + 1, background: BG_STATUS[a.status], borderColor: meta.cor }} onClick={() => abrirSel(a)}>
                    <b>{a.servico_nome || 'Serviço'}{a.veiculo ? ` — ${a.veiculo}` : ''}</b>
                    <span style={{ color: meta.cor }}>{ROT_JOB[a.status]}</span>
                  </button>
                );
              })}
            </div>
          )}
          {semana.some((d) => feriado(d)) && (
            <div className="ag-allday">
              <div className="ag-allday-lbl">Dia inteiro</div>
              {semana.map((d) => {
                const f = feriado(d);
                return <div key={d.toISOString()} className="ag-allday-cell">{f && <span className="ag-feriado">{f}</span>}</div>;
              })}
            </div>
          )}
          <div className="ag-sem-corpo">
            <div className="ag-horas-col">
              {faixaHoras.map((h) => <div key={h} className="ag-hora" style={{ height: HORA_PX }}><span>{pad(h)}:00</span></div>)}
            </div>
            {semana.map((d) => {
              const ehHoje = mesmoDia(d, hoje);
              const fds = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div key={d.toISOString()} className={`ag-trilha ag-trilha-clic ag-sem-col${ehHoje ? ' hoje' : ''}${fds ? ' fds' : ''}`} style={{ height: (hFim - hIni) * HORA_PX }} onClick={(e) => clicarGrade(e, d)}>
                  {faixaHoras.map((h) => <div key={h} className="ag-linha" style={{ top: (h - hIni) * HORA_PX }} />)}
                  {ehHoje && agoraDentro && <div className="ag-agora" style={{ top: topoAgora }}><i /></div>}
                  {layoutDia(porDia(d)).map((ev) => eventoBtn(ev.a, ev.col, ev.cols))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button type="button" className="ag-fab" onClick={() => { setNModo('agora'); setNovoAberto(true); }} aria-label="Novo agendamento">+</button>

      {/* Detalhe do agendamento (premium) */}
      <Janela titulo={sel ? sel.nome : ''} aberta={!!sel} aoFechar={() => { setSel(null); setSub('none'); }}>
        {sel && (() => {
          const d = new Date(sel.inicio);
          const ini = sel.nome.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
          const servs = sel.servico_nome ? (sel.servico_nome.split(' + ').map((n) => servicos.find((s) => s.nome === n.trim())).filter(Boolean) as Servico[]) : [];
          const valorTotal = servs.reduce((t, s) => t + Number(s.valor_medio), 0);
          const preco = valorTotal > 0 ? ` · ${brl(valorTotal)}` : '';
          const subtitulo = [sel.veiculo, sel.servico_nome].filter(Boolean).join(' · ');
          const st = ST_META[sel.status] ?? ST_META.pendente;
          const atual: Fase = sel.status === 'compareceu' ? 'fila' : sel.status;
          return (
          <div className="pd">
            {(subtitulo || preco) && <p className="pd-sub">{subtitulo}{preco}</p>}

            <section className="pd-sec">
              <span className="pd-rot">Status</span>
              <button type="button" className="pd-row" onClick={() => setSub((s) => s === 'status' ? 'none' : 'status')}>
                <span className="pd-status-val"><i className="pd-dot" style={{ background: st.cor }} /><span className="pd-val" style={{ fontWeight: 600 }}>{st.rot}</span></span>
                <span className="pd-chev">{sub === 'status' ? '⌄' : '›'}</span>
              </button>
              {sub === 'status' && (
                <div className="pd-opcoes">
                  {FASES.map((f) => (
                    <button key={f.v} type="button" className={`pd-op${atual === f.v ? ' cur' : ''}`} onClick={() => (f.v === 'entregue' ? entregar(sel) : status(sel, f.v))}>
                      <i className="pd-dot" style={{ background: ST_META[f.v].cor }} />{f.rot}{atual === f.v && <span className="pd-check">✓</span>}
                    </button>
                  ))}
                  <button type="button" className="pd-op cancel" onClick={() => status(sel, 'cancelado')}><i className="pd-dot" style={{ background: '#C0392B' }} />Cancelar</button>
                </div>
              )}
            </section>

            <section className="pd-sec">
              <span className="pd-rot">Cliente</span>
              <button type="button" className="pd-row" onClick={() => abrirCliente(sel)}>
                <span className="pd-cli"><span className="pd-av">{ini}</span><span className="pd-val">{sel.nome}</span></span>
                <span className="pd-chev">›</span>
              </button>
            </section>

            <section className="pd-sec">
              <span className="pd-rot">Horário</span>
              <button type="button" className="pd-row" onClick={() => setSub((s) => s === 'remarcar' ? 'none' : 'remarcar')}>
                <span className="pd-val">{pad(d.getHours())}:{pad(d.getMinutes())} · {d.getDate()}/{pad(d.getMonth() + 1)}</span>
                <span className="pd-chev">{sub === 'remarcar' ? '⌄' : '›'}</span>
              </button>
              {sub === 'remarcar' && (
                <div className="det-remarcar">
                  <div className="det-remarcar-campos">
                    <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
                    <input type="time" value={novaHora} onChange={(e) => setNovaHora(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-primario" onClick={remarcar}>Salvar novo horário</button>
                </div>
              )}
            </section>

            {sel.servico_nome && <section className="pd-sec"><span className="pd-rot">Serviço</span><div className="pd-val">{sel.servico_nome}{preco}</div></section>}
            {sel.telefone && <section className="pd-sec"><span className="pd-rot">Telefone</span>
              <div className="pd-tel"><span className="pd-val">{telefoneBR(sel.telefone)}</span>
              <a className="pd-conversar" href={linkWhatsApp(sel.telefone, `Oi, ${sel.nome.split(' ')[0]}! Sobre o seu atendimento na empresa.`)} target="_blank" rel="noopener">Conversar</a></div></section>}

            {((sel.status === 'pronto' && sel.telefone) || (valorTotal > 0 && loja.pix_chave)) && (
              <div className="pd-acoes">
                {sel.status === 'pronto' && sel.telefone && (
                  <a className="btn btn-wpp" href={linkWhatsApp(sel.telefone, `Oi, ${sel.nome.split(' ')[0]}! Seu ${sel.veiculo || 'carro'} já está pronto para retirada aqui na empresa.`)} target="_blank" rel="noopener">Avisar que está pronto</a>
                )}
                {valorTotal > 0 && loja.pix_chave && (
                  <button type="button" className="btn btn-primario" onClick={() => setCobrar(true)}>Cobrar no Pix</button>
                )}
              </div>
            )}
          </div>
        ); })()}
      </Janela>

      {cobrar && sel && (() => {
        const servs2 = sel.servico_nome ? (sel.servico_nome.split(' + ').map((n) => servicos.find((s) => s.nome === n.trim())).filter(Boolean) as Servico[]) : [];
        const total2 = servs2.reduce((t, s) => t + Number(s.valor_medio), 0);
        return (
          <CobrarPix loja={loja} alvo={{ valor: total2, descricao: sel.servico_nome ?? 'Serviço', telefone: sel.telefone, nome: sel.nome }} aoFechar={() => setCobrar(false)} />
        ); })()}

      {/* Alertas de retorno — previstos para a semana em exibição */}
      <Janela titulo="Alertas" aberta={retAberto} aoFechar={() => setRetAberto(false)}>
        <div className="pilulas pend-abas" role="group" aria-label="Tipo de alerta">
          <button type="button" aria-pressed={abaAl === 'chamar'} onClick={() => setAbaAl('chamar')}>Para chamar{pend && pend.length > 0 ? ` (${pend.length})` : ''}</button>
          <button type="button" aria-pressed={abaAl === 'retornos'} onClick={() => setAbaAl('retornos')}>Retornos da semana{retornos && retornos.length > 0 ? ` (${retornos.length})` : ''}</button>
        </div>
        {abaAl === 'chamar' ? (
          pend === null ? <p className="dica" style={{ margin: 0 }}>Carregando…</p>
            : <Pendencias lojaId={loja.id} itens={pend} modelos={modelos} aoMudar={carregarPend}
                linkAvaliar={loja.avaliar_ativo && loja.slug ? `${location.origin}/avaliar/?l=${loja.slug}` : ''}
                aoAbrirFicha={(id) => { setRetAberto(false); location.hash = `#/clientes/${id}`; }} />
        ) : retornos === null ? (
          <p className="dica" style={{ margin: 0 }}>Carregando retornos…</p>
        ) : (
          <>
            <p className="ret-sub">
              <b>{retornos.length}</b> {retornos.length === 1 ? 'retorno previsto' : 'retornos previstos'} para o período <b>{dataBR(isoLocal(seg))} a {dataBR(isoLocal(semana[6]))}</b>
            </p>
            {retornos.length === 0 ? (
              <p className="dica" style={{ margin: 0 }}>Nenhum retorno previsto nesta semana.</p>
            ) : (
              <ul className="ret-lista">
                {retornos.map((r) => (
                  <li key={r.cliente_id + (r.servico ?? '')} className="ret-item">
                    <span className="ret-ava" aria-hidden="true">{iniciais(r.cliente)}</span>
                    <button type="button" className="ret-info" onClick={() => { setRetAberto(false); location.hash = `#/clientes/${r.cliente_id}`; }}>
                      <b>{r.cliente}</b>
                      <small>{telefoneBR(r.telefone)}{r.veiculo ? ` · ${r.veiculo}` : ''}</small>
                    </button>
                    <div className="ret-meta"><b>{dataBR(r.previsto)}</b><small>{r.servico || 'Serviço'}</small></div>
                    <div className="ret-acoes">
                      <a className="ret-wa" href={linkWhatsApp(r.telefone, `Oi, ${r.cliente.split(' ')[0]}! Está chegando a época do retorno${r.servico ? ` (${r.servico})` : ''}. Quer agendar um horário?`)} target="_blank" rel="noopener" aria-label={`Conversar com ${r.cliente} no WhatsApp`}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.2 14.8l-.3-.2-2.6.7.7-2.5-.2-.3A8 8 0 0 1 12 4zm4.3 10.4c-.2-.1-1.3-.7-1.5-.8s-.4-.1-.5.1-.6.8-.7.9-.3.2-.5 0a6.5 6.5 0 0 1-1.9-1.2 7.2 7.2 0 0 1-1.3-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4a.4.4 0 0 0 0-.4L9.8 8c-.2-.4-.3-.4-.5-.4h-.4a.8.8 0 0 0-.6.3 2.4 2.4 0 0 0-.7 1.8 4.2 4.2 0 0 0 .9 2.2 9.6 9.6 0 0 0 3.7 3.3c.5.2.9.4 1.2.5.5.2 1 .1 1.3.1.4-.1 1.3-.5 1.5-1s.2-.9.1-1z" /></svg>
                      </a>
                      <button type="button" className="ret-ag" onClick={() => agendarRetorno(r)}>Agendar</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Janela>

      {/* Filtros (mobile) — atrás do funil */}
      <Janela titulo="Filtros" aberta={filtroAberto} aoFechar={() => setFiltroAberto(false)}>
        <div className="ag-filtros-lista">
          <button type="button" className={`ag-filtro-op${filtroServ === '' ? ' on' : ''}`} onClick={() => { setFiltroServ(''); setFiltroAberto(false); }}>
            <span>Todos os serviços</span>{filtroServ === '' && <span className="ag-filtro-ck">✓</span>}
          </button>
          {servicosNaLista.map((s) => (
            <button key={s} type="button" className={`ag-filtro-op${filtroServ === s ? ' on' : ''}`} onClick={() => { setFiltroServ(s); setFiltroAberto(false); }}>
              <span>{s}</span>{filtroServ === s && <span className="ag-filtro-ck">✓</span>}
            </button>
          ))}
        </div>
      </Janela>

      {/* Novo agendamento / walk-in */}
      <Janela titulo="Novo agendamento" aberta={novoAberto} aoFechar={() => { setNovoAberto(false); setServAberto(false); }}>
        <p className="pd-sub">Agende ou registre quem chegou agora</p>
        <div className="pf-quando">
          <button type="button" className={nModo === 'agora' ? 'sel' : ''} onClick={() => setNModo('agora')}>Chegou agora</button>
          <button type="button" className={nModo === 'agendar' ? 'sel' : ''} onClick={() => setNModo('agendar')}>Agendar horário</button>
        </div>
        <p className="dica" style={{ margin: '0 0 16px' }}>{ehJobForm ? (nModo === 'agora' ? 'Dá entrada hoje e ocupa vários dias.' : 'Escolha o dia de entrada.') : (nModo === 'agora' ? 'Entra direto na fila do dia.' : 'Escolha a data e a hora do agendamento.')}</p>
        <div className="pf-campo"><label>Cliente</label><input value={nNome} onChange={(e) => setNNome(e.target.value)} placeholder="Nome do cliente" /></div>
        <div className="pf-campo"><label>Telefone</label><input value={nTel} onChange={(e) => setNTel(e.target.value)} placeholder="(41) 90000-0000" inputMode="tel" /></div>
        <div className="pf-campo"><label>Veículo</label><input list="lista-veiculos" value={nVeic} onChange={(e) => setNVeic(e.target.value)} placeholder="Ex.: Civic preto" /></div>
        {veiculos.length > 0 && <datalist id="lista-veiculos">{veiculos.map((v) => <option key={v} value={v} />)}</datalist>}
        <div className="pf-campo"><label>Serviços <span className="pf-dica-inline">(pode marcar vários)</span></label>
          <div className="pf-dd">
            <button type="button" className="pf-dd-trig" aria-expanded={servAberto} onClick={() => setServAberto((v) => !v)}>
              <span className={nServs.length ? '' : 'pf-dd-ph'}>{nServs.length === 0 ? 'Selecionar serviços' : nServs.length === 1 ? nServs[0] : `${nServs.length} serviços selecionados`}</span>
              <svg className="pf-dd-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {servAberto && (
              <div className="pf-dd-menu">
                {servicos.map((s) => {
                  const on = nServs.includes(s.nome);
                  return (
                    <button key={s.id} type="button" className={`pf-dd-item${on ? ' on' : ''}`} onClick={() => setNServs((p) => on ? p.filter((x) => x !== s.nome) : [...p, s.nome])}>
                      <span className={`pf-dd-ck${on ? ' on' : ''}`}>{on ? '✓' : ''}</span>
                      <span className="pf-dd-n">{s.nome}{s.dura_dias && s.dura_dias >= 2 ? <em className="pf-serv-dias">{s.dura_dias} dias</em> : null}</span>
                      <span className="pf-dd-v">{brl(s.valor_medio)}</span>
                    </button>
                  );
                })}
                {servicos.length === 0 && <p className="dica" style={{ margin: 0, padding: '8px 10px' }}>Cadastre serviços na aba Serviços.</p>}
              </div>
            )}
          </div>
        </div>
        {nModo === 'agendar' && (
          <div className="pf-duo">
            <div className="pf-campo"><label>{ehJobForm ? 'Dia de entrada' : 'Data'}</label><input type="date" value={nData} onChange={(e) => setNData(e.target.value)} /></div>
            {!ehJobForm && <div className="pf-campo"><label>Hora</label><input type="time" value={nHora} onChange={(e) => setNHora(e.target.value)} /></div>}
          </div>
        )}
        {slotCheio && slotCheio.cheio && <p className="pf-aviso">Horário lotado ({slotCheio.qtd}/{slotCheio.lim}) — você vai <b>encaixar</b> um a mais.</p>}
        {ehJobForm && previsaoForm && (
          <p className="pf-previsao">Serviço de <b>{duraForm} dias</b> · entrega prevista <b>{dataCurta(previsaoForm)}</b></p>
        )}
        {ehJobForm && vagasLoja > 1 && (
          <div className="pf-campo"><label>Vaga</label>
            <div className="pf-vagas">
              {Array.from({ length: vagasLoja }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" className={`pf-vaga${nVaga === n ? ' on' : ''}`} onClick={() => setNVaga(n)}>Vaga {n}</button>
              ))}
            </div>
          </div>
        )}
        {ehJobForm && conflitoVaga && <p className="pf-aviso">A vaga {nVaga} já tem um serviço nesses dias — dá pra confirmar mesmo assim.</p>}
        <div className="pd-cta"><button type="button" className="btn btn-primario" onClick={criar}>{ehJobForm ? 'Dar entrada' : (nModo === 'agora' ? 'Colocar na fila' : (slotCheio?.cheio ? 'Encaixar' : 'Agendar'))}</button></div>
        <button type="button" className="pf-link" onClick={() => { setNovoAberto(false); setCfgAberto(true); }}>Receber agendamentos pelo link</button>
      </Janela>

      {/* Configuração do agendamento online */}
      <Janela titulo="Agendamento online" aberta={cfgAberto} aoFechar={() => setCfgAberto(false)}>
        <div className="bloco-topo">
          <h3 style={{ margin: 0 }}>Receber pelo link</h3>
          <label className="alterna-check">
            <input type="checkbox" checked={loja.agendar_ativo} disabled={salvando}
              onChange={(e) => (e.target.checked ? ativar() : alterarConfig({ agendar_ativo: false }))} />
            <span>{loja.agendar_ativo ? 'Ativo' : 'Desativado'}</span>
          </label>
        </div>
        {loja.agendar_ativo ? (
          <>
            <div className="ag-link">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-primario" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar'}</button>
            </div>
            <p className="dica">Compartilhe no WhatsApp, Instagram ou recepção. O cliente escolhe serviço e horário sozinho.</p>
            <div className="ag-config">
              <div className="cfg-sec">
                <h3>Dias que atende</h3>
                <div className="pilulas pilulas-dias">
                  {DIAS.map(([rot, n]) => <button key={n} type="button" aria-pressed={loja.agendar_dias.includes(n)} onClick={() => toggleDia(n)}>{rot}</button>)}
                </div>
              </div>
              <div className="cfg-sec">
                <h3>Horário de atendimento</h3>
                <div className="cfg-grade">
                  <label className="cfg-campo"><span>Abre</span><select value={loja.agendar_hora_ini} onChange={(e) => alterarConfig({ agendar_hora_ini: Number(e.target.value) })}>{horas(6, 20).map((h) => <option key={h} value={h}>{pad(h)}:00</option>)}</select></label>
                  <label className="cfg-campo"><span>Fecha</span><select value={loja.agendar_hora_fim} onChange={(e) => alterarConfig({ agendar_hora_fim: Number(e.target.value) })}>{horas(8, 23).map((h) => <option key={h} value={h}>{pad(h)}:00</option>)}</select></label>
                  <label className="cfg-campo"><span>Intervalo</span><select value={loja.agendar_intervalo} onChange={(e) => alterarConfig({ agendar_intervalo: Number(e.target.value) })}>{[15, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select></label>
                </div>
              </div>
              <div className="cfg-sec">
                <h3>Carros por horário</h3>
                <label className="cfg-campo"><span>Quantos carros cabem em cada horário</span>
                  <select value={loja.carros_por_horario} onChange={(e) => alterarConfig({ carros_por_horario: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'carro' : 'carros'}</option>)}</select>
                </label>
                <p className="dica" style={{ margin: '8px 0 0' }}>O cliente não passa disso pelo link. Na agenda, o dono pode encaixar mais um à mão.</p>
              </div>
            </div>
          </>
        ) : <p className="dica">Ative para gerar um link de agendamento. Os pedidos caem direto na sua agenda para confirmar.</p>}
      </Janela>
    </>
  );
}
