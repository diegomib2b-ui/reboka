import { useEffect, useMemo, useState } from 'react';
import { api, type AgendaInfo } from './api';
import { LogoMarca } from './ui';

const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Próximos N dias que a loja atende, a partir de hoje. */
function proximosDias(diasSemana: number[], quantos = 14): Date[] {
  const out: Date[] = [];
  const d = new Date(); d.setHours(0, 0, 0, 0);
  for (let i = 0; out.length < quantos && i < 60; i++) {
    const dia = new Date(d); dia.setDate(d.getDate() + i);
    if (diasSemana.includes(dia.getDay())) out.push(dia);
  }
  return out;
}
function horariosDoDia(info: AgendaInfo): string[] {
  const out: string[] = [];
  for (let h = info.hora_ini * 60; h + info.intervalo <= info.hora_fim * 60; h += info.intervalo)
    out.push(`${pad(Math.floor(h / 60))}:${pad(h % 60)}`);
  return out;
}

export default function Agendar() {
  const slug = new URLSearchParams(location.search).get('l') ?? '';
  const [info, setInfo] = useState<AgendaInfo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [dia, setDia] = useState<Date | null>(null);
  const [ocupados, setOcupados] = useState<Set<number>>(new Set());
  const [hora, setHora] = useState('');
  const [servico, setServico] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<{ dia: Date; hora: string } | null>(null);

  useEffect(() => {
    if (!slug) { setCarregando(false); return; }
    api.agendaInfo(slug).then((i) => { setInfo(i); if (i?.servicos[0]) setServico(i.servicos[0].nome); }).catch(() => {}).finally(() => setCarregando(false));
  }, [slug]);

  const dias = useMemo(() => (info ? proximosDias(info.dias) : []), [info]);
  const horarios = useMemo(() => (info ? horariosDoDia(info) : []), [info]);

  useEffect(() => {
    if (!dia || !info) return;
    const iso = `${dia.getFullYear()}-${pad(dia.getMonth() + 1)}-${pad(dia.getDate())}`;
    api.agendaOcupados(slug, iso).then((l) => setOcupados(new Set(l.map((s) => new Date(s).getTime())))).catch(() => {});
  }, [dia, info, slug]);

  function slotData(d: Date, hhmm: string) {
    const [h, m] = hhmm.split(':').map(Number);
    const x = new Date(d); x.setHours(h, m, 0, 0); return x;
  }
  function disponivel(d: Date, hhmm: string) {
    const x = slotData(d, hhmm);
    return x.getTime() > Date.now() && !ocupados.has(x.getTime());
  }

  async function confirmar() {
    if (!dia || !hora || !nome.trim()) { setErro('Preencha seu nome, o dia e o horário.'); return; }
    setEnviando(true); setErro('');
    try {
      await api.agendar(slug, { nome, telefone, veiculo, servico, inicio: slotData(dia, hora).toISOString() });
      setPronto({ dia, hora });
    } catch (e) { setErro((e as Error).message); setEnviando(false); }
  }

  if (carregando) return <div className="ag-centro"><p>Carregando…</p></div>;
  if (!info) return (
    <div className="ag-centro">
      <div className="ag-aviso"><h1>Agendamento indisponível</h1><p>Este link não está ativo. Fale direto com a empresa para marcar um horário.</p></div>
    </div>
  );
  if (pronto) return (
    <div className="ag-centro">
      <div className="ag-ok">
        <div className="ag-check">✓</div>
        <h1>Agendamento enviado!</h1>
        <p><b>{DIA_SEMANA[pronto.dia.getDay()]}, {pad(pronto.dia.getDate())}/{pad(pronto.dia.getMonth() + 1)}</b> às <b>{pronto.hora}</b>{servico ? <> · {servico}</> : null}</p>
        <p className="ag-sub">{info.nome} vai confirmar com você. Guarde este horário. 🚗✨</p>
      </div>
    </div>
  );

  return (
    <div className="ag-pagina">
      <header className="ag-topo"><LogoMarca /><span>{info.nome}</span></header>
      <main className="ag-main">
        <h1>Agende seu serviço</h1>
        <p className="ag-sub">Escolha o serviço, o dia e o horário. É rápido.</p>

        {info.servicos.length > 0 && (
          <section className="ag-bloco">
            <h2>Serviço</h2>
            <div className="ag-chips">
              {info.servicos.map((s) => (
                <button key={s.nome} type="button" className={servico === s.nome ? 'on' : ''} onClick={() => setServico(s.nome)}>{s.nome}</button>
              ))}
            </div>
          </section>
        )}

        <section className="ag-bloco">
          <h2>Dia</h2>
          <div className="ag-dias">
            {dias.map((d) => {
              const sel = dia && d.toDateString() === dia.toDateString();
              return (
                <button key={d.toISOString()} type="button" className={sel ? 'on' : ''} onClick={() => { setDia(d); setHora(''); }}>
                  <small>{DIA_SEMANA[d.getDay()]}</small><b>{pad(d.getDate())}</b><small>{pad(d.getMonth() + 1)}</small>
                </button>
              );
            })}
          </div>
        </section>

        {dia && (
          <section className="ag-bloco">
            <h2>Horário</h2>
            <div className="ag-horas">
              {horarios.map((h) => {
                const livre = disponivel(dia, h);
                return <button key={h} type="button" disabled={!livre} className={hora === h ? 'on' : ''} onClick={() => setHora(h)}>{h}</button>;
              })}
            </div>
            {horarios.every((h) => !disponivel(dia, h)) && <p className="ag-sub">Sem horários livres neste dia. Tente outro.</p>}
          </section>
        )}

        {hora && (
          <section className="ag-bloco">
            <h2>Seus dados</h2>
            <label className="ag-campo"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" /></label>
            <label className="ag-campo"><span>WhatsApp</span><input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(41) 99999-9999" /></label>
            <label className="ag-campo"><span>Veículo</span><input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} placeholder="Ex.: Corolla prata" /></label>
            {erro && <p className="ag-erro">{erro}</p>}
            <button type="button" className="ag-confirmar" onClick={confirmar} disabled={enviando}>{enviando ? 'Enviando…' : 'Confirmar agendamento'}</button>
          </section>
        )}

        {erro && !hora && <p className="ag-erro">{erro}</p>}
      </main>
      <footer className="ag-rodape">Agendamento por <b>Reboka</b></footer>
    </div>
  );
}
