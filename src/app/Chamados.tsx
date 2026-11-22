import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, type Loja, type Agendamento, type Servico, type Adicional } from './api';
import { Janela, Campo, Aviso, SkCard } from './ui';
import CobrarPix from './CobrarPix';
import { brl, cotar, linkWhatsApp, telefoneBR } from './util';

// Fases do chamado. No banco são os status do motor (ver migration 0024).
type Fase = 'fila' | 'em_servico' | 'pronto' | 'entregue';
const FASES: { v: Fase; rot: string; vazio: string }[] = [
  { v: 'fila', rot: 'Novos', vazio: 'Nenhum chamado esperando.' },
  { v: 'em_servico', rot: 'A caminho', vazio: 'Nenhum guincho na rua.' },
  { v: 'pronto', rot: 'Carregados', vazio: 'Nenhum veículo em cima do caminhão.' },
  { v: 'entregue', rot: 'Entregues hoje', vazio: 'Nada entregue hoje ainda.' },
];
const ROT: Record<string, string> = { confirmado: 'Agendado', fila: 'Novo', compareceu: 'Novo', pendente: 'Novo', em_servico: 'A caminho', pronto: 'Carregado', entregue: 'Entregue', cancelado: 'Cancelado' };
const faseDe = (s: Agendamento['status']): Fase | 'agendado' =>
  s === 'confirmado' ? 'agendado' : s === 'em_servico' || s === 'pronto' || s === 'entregue' ? s : 'fila';

const haQuanto = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `há ${h} h${m % 60 ? ` ${m % 60} min` : ''}` : new Date(iso).toLocaleDateString('pt-BR');
};
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const hojeLocal = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const rotaMaps = (origem: string, destino: string) =>
  `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origem)}&destination=${encodeURIComponent(destino)}&travelmode=driving`;
const primeiro = (n: string) => n.trim().split(' ')[0];
// Ponto de partida para o mapa: a posição do celular do cliente, quando ele enviou pelo link; senão, o endereço escrito.
const partida = (a: Agendamento) => (a.origem_lat != null && a.origem_lng != null ? `${a.origem_lat},${a.origem_lng}` : a.origem || '');
const pontoMaps = (a: Agendamento) => `https://www.google.com/maps/search/?api=1&query=${a.origem_lat},${a.origem_lng}`;
const slugify = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export default function Chamados({ loja, gestao, aoMudar }: { loja: Loja; gestao: boolean; aoMudar: () => void }) {
  const [lista, setLista] = useState<Agendamento[] | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [motoristas, setMotoristas] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<Fase>('fila');
  const [novo, setNovo] = useState(false);
  const [sel, setSel] = useState<Agendamento | null>(null);
  const [despachar, setDespachar] = useState<Agendamento | null>(null);
  const [entregar, setEntregar] = useState<Agendamento | null>(null);
  const [pix, setPix] = useState<Agendamento | null>(null);
  const [tarifas, setTarifas] = useState(false);
  const [linkAberto, setLinkAberto] = useState(false);
  const [, setTique] = useState(0);

  const carregar = () => api.agendamentos().then(setLista).catch((e) => setErro(e.message));
  useEffect(() => {
    carregar();
    api.servicos().then(setServicos).catch(() => {});
    api.equipe(loja.id).then((e) => setMotoristas(e.map((p) => p.nome))).catch(() => {});
    // A cada minuto: atualiza o "há X min" dos cartões e busca pedidos novos que chegaram pelo link.
    const t = setInterval(() => { setTique((n) => n + 1); carregar(); }, 60000);
    return () => clearInterval(t);
  }, []);

  const vivos = (lista ?? []).filter((a) => a.status !== 'cancelado');
  const agendados = vivos.filter((a) => faseDe(a.status) === 'agendado').sort((a, b) => a.inicio.localeCompare(b.inicio));
  const porFase = (f: Fase) => vivos.filter((a) => faseDe(a.status) === f && (f !== 'entregue' || hojeLocal(a.inicio)))
    .sort((a, b) => (f === 'entregue' ? b.inicio.localeCompare(a.inicio) : a.inicio.localeCompare(b.inicio)));
  const entreguesHoje = porFase('entregue');
  const faturado = entreguesHoje.reduce((s, a) => s + (Number(a.valor) || 0), 0);
  const aReceber = vivos.filter((a) => a.status === 'entregue' && !a.pago).reduce((s, a) => s + (Number(a.valor) || 0), 0);

  async function mudar(a: Agendamento, status: Agendamento['status'], extra: Partial<Agendamento> = {}) {
    try {
      if (Object.keys(extra).length) await api.atualizarChamado(a.id, extra);
      await api.mudarStatusAgendamento(a.id, status);
      setSel(null); setDespachar(null); await carregar();
    } catch (e) { setErro((e as Error).message); }
  }
  async function concluir(a: Agendamento, pago: boolean) {
    try { await api.entregarChamado(loja.id, a, servicos, pago); setEntregar(null); setSel(null); await carregar(); }
    catch (e) { setErro((e as Error).message); }
  }
  function whats(a: Agendamento, tipo: 'cotacao' | 'caminho' | 'entregue') {
    const n = primeiro(a.nome);
    const texto = tipo === 'cotacao'
      ? `Oi, ${n}! O guincho${a.origem ? ` saindo de ${a.origem}` : ''}${a.destino ? ` até ${a.destino}` : ''}${a.km ? ` (${Number(a.km)} km)` : ''} fica em ${brl(a.valor ?? 0)}. Posso mandar o caminhão agora?`
      : tipo === 'caminho'
        ? `Oi, ${n}! O guincho já saiu e está a caminho${a.motorista ? `, com o motorista ${a.motorista}` : ''}. Qualquer coisa me chame por aqui.`
        : `Oi, ${n}! Seu veículo foi entregue${a.destino ? ` em ${a.destino}` : ''}. Obrigado pela confiança.`;
    window.open(linkWhatsApp(a.telefone ?? '', texto), '_blank', 'noopener');
  }

  function acao(a: Agendamento) {
    const f = faseDe(a.status);
    if (f === 'agendado') return <button type="button" className="btn btn-secundario" onClick={(e) => { e.stopPropagation(); mudar(a, 'fila'); }}>Abrir chamado</button>;
    if (f === 'fila') return <button type="button" className="btn btn-primario" onClick={(e) => { e.stopPropagation(); setDespachar(a); }}>Despachar</button>;
    if (f === 'em_servico') return <button type="button" className="btn btn-primario" onClick={(e) => { e.stopPropagation(); mudar(a, 'pronto'); }}>Carreguei</button>;
    if (f === 'pronto') return <button type="button" className="btn btn-primario" onClick={(e) => { e.stopPropagation(); setEntregar(a); }}>Entregar</button>;
    return a.pago ? <span className="chip chip-ok">Recebido</span> : <span className="chip chip-atencao">A receber</span>;
  }

  function cartao(a: Agendamento) {
    const f = faseDe(a.status);
    return (
      <article key={a.id} className={`ch-card ch-${f}`} role="button" tabIndex={0} onClick={() => setSel(a)} onKeyDown={(e) => e.key === 'Enter' && setSel(a)}>
        <header>
          <span className="ch-tempo">{f === 'agendado' ? quando(a.inicio) : haQuanto(a.inicio)}</span>
          <b className="ch-valor">{a.valor ? brl(a.valor) : 'Sem cotação'}</b>
        </header>
        <h3>{a.nome}</h3>
        <p className="ch-veic">{[a.veiculo, a.placa].filter(Boolean).join(' · ') || 'Veículo não informado'}{a.servico_nome ? ` · ${a.servico_nome}` : ''}</p>
        {(a.origem || a.destino) && (
          <ol className="ch-rota">
            <li><i className="ch-pt ch-pt-a" aria-hidden="true" />{a.origem || 'Origem não informada'}</li>
            <li><i className="ch-pt ch-pt-b" aria-hidden="true" />{a.destino || 'Destino não informado'}{a.km ? <em>{Number(a.km)} km</em> : null}</li>
          </ol>
        )}
        <footer>
          <span className="ch-tags">
            {a.canal === 'link' && <span className="chip chip-ok">Pelo link</span>}
            {a.motorista && <span className="chip chip-neutro">{a.motorista}</span>}
            {a.pagador && <span className="chip chip-neutro">Paga: {a.pagador}</span>}
          </span>
          {acao(a)}
        </footer>
      </article>
    );
  }

  return (
    <>
      <header className="cabeca ch-cabeca">
        <div>
          <h1>Chamados</h1>
          <p>Do pedido à entrega: cote, despache e receba sem sair desta tela.</p>
        </div>
        <div className="ch-topo-acoes">
          {gestao && <button type="button" className="btn btn-secundario" onClick={() => setLinkAberto(true)}>Link de pedidos</button>}
          {gestao && <button type="button" className="btn btn-secundario" onClick={() => setTarifas(true)}>Tabela de preço</button>}
          <button type="button" className="btn btn-primario ch-novo-desk" onClick={() => setNovo(true)}>Novo chamado</button>
        </div>
      </header>

      {erro && <Aviso>{erro}</Aviso>}

      <div className="ch-kpis">
        <div><small>Esperando</small><b>{porFase('fila').length}</b></div>
        <div><small>Na rua</small><b>{porFase('em_servico').length + porFase('pronto').length}</b></div>
        <div><small>Faturado hoje</small><b>{brl(faturado)}</b></div>
        <div><small>A receber</small><b>{brl(aReceber)}</b></div>
      </div>

      {agendados.length > 0 && (
        <section className="ch-agendados">
          <h2>Agendados</h2>
          <div className="ch-lista">{agendados.map(cartao)}</div>
        </section>
      )}

      <div className="ch-abas" role="tablist">
        {FASES.map((f) => (
          <button key={f.v} type="button" role="tab" aria-selected={aba === f.v} className={aba === f.v ? 'on' : ''} onClick={() => setAba(f.v)}>
            {f.rot}<span>{porFase(f.v).length}</span>
          </button>
        ))}
      </div>

      <div className="ch-quadro">
        {FASES.map((f) => {
          const itens = porFase(f.v);
          return (
            <section key={f.v} className={`ch-col ch-col-${f.v}${aba === f.v ? ' on' : ''}`}>
              <h2>{f.rot}<span>{itens.length}</span></h2>
              {lista === null ? <SkCard /> : itens.length === 0 ? <p className="ch-nada">{f.vazio}</p> : itens.map(cartao)}
            </section>
          );
        })}
      </div>

      <button type="button" className="ag-fab ch-fab" aria-label="Novo chamado" onClick={() => setNovo(true)}>+</button>

      <Janela titulo="Novo chamado" aberta={novo} aoFechar={() => setNovo(false)} larga>
        {novo && <FormChamado loja={loja} servicos={servicos} aoCancelar={() => setNovo(false)} aoSalvar={async () => { setNovo(false); setAba('fila'); await carregar(); }} />}
      </Janela>

      <Janela titulo="Despachar o guincho" aberta={!!despachar} aoFechar={() => setDespachar(null)}>
        {despachar && <Despacho a={despachar} motoristas={motoristas} aoCancelar={() => setDespachar(null)}
          aoConfirmar={(m, avisar) => { const a = { ...despachar, motorista: m }; if (avisar && a.telefone) whats(a, 'caminho'); mudar(despachar, 'em_servico', { motorista: m || null }); }} />}
      </Janela>

      <Janela titulo="Entregar e receber" aberta={!!entregar} aoFechar={() => setEntregar(null)}>
        {entregar && (
          <div className="ch-entrega">
            <p className="pix-valor">{brl(entregar.valor ?? 0)}<small>{entregar.nome} · {entregar.servico_nome || 'Guincho'}</small></p>
            {loja.pix_chave && <button type="button" className="btn btn-secundario" onClick={() => setPix(entregar)}>Cobrar com Pix</button>}
            <button type="button" className="btn btn-primario" onClick={() => concluir(entregar, true)}>Recebi agora</button>
            <button type="button" className="btn btn-secundario" onClick={() => concluir(entregar, false)}>Fica a receber{entregar.pagador ? ` de ${entregar.pagador}` : ''}</button>
            <p className="dica">O valor entra no Financeiro. O que fica a receber aparece no topo desta tela até você marcar como recebido.</p>
          </div>
        )}
      </Janela>

      <Janela titulo={sel ? `${ROT[sel.status]} · ${sel.nome}` : ''} aberta={!!sel} aoFechar={() => setSel(null)}>
        {sel && (
          <div className="det">
            <div className="det-sec">
              <span className="det-rot">Cliente</span>
              <div className="det-lin"><span className="det-val"><b>{sel.nome}</b>{sel.telefone ? ` · ${telefoneBR(sel.telefone)}` : ''}</span></div>
              <div className="det-lin"><span className="det-val">{[sel.veiculo, sel.placa].filter(Boolean).join(' · ') || 'Veículo não informado'}</span></div>
            </div>
            <div className="det-sec">
              <span className="det-rot">Trajeto</span>
              <ol className="ch-rota">
                <li><i className="ch-pt ch-pt-a" aria-hidden="true" />{sel.origem || 'Origem não informada'}</li>
                <li><i className="ch-pt ch-pt-b" aria-hidden="true" />{sel.destino || 'Destino não informado'}{sel.km ? <em>{Number(sel.km)} km</em> : null}</li>
              </ol>
              {sel.origem_lat != null && <a className="link" href={pontoMaps(sel)} target="_blank" rel="noopener">Ver no mapa onde o cliente está</a>}
              {partida(sel) && sel.destino && <a className="link" href={rotaMaps(partida(sel), sel.destino)} target="_blank" rel="noopener">Abrir a rota no Google Maps</a>}
            </div>
            <div className="det-sec">
              <span className="det-rot">Cobrança</span>
              <div className="det-lin"><span className="det-val"><b>{sel.valor ? brl(sel.valor) : 'Sem cotação'}</b>{sel.servico_nome ? ` · ${sel.servico_nome}` : ''}{sel.noturno ? ' · noturno' : ''}</span></div>
              {sel.adicionais?.length > 0 && <div className="det-lin"><span className="det-val">Adicionais: {sel.adicionais.map((x) => x.nome).join(', ')}</span></div>}
              {sel.pagador && <div className="det-lin"><span className="det-val">Quem paga: {sel.pagador}</span></div>}
              {sel.motorista && <div className="det-lin"><span className="det-val">Motorista: {sel.motorista}</span></div>}
              {sel.observacao && <div className="det-lin"><span className="det-val">{sel.observacao}</span></div>}
            </div>
            <div className="acoes ch-det-acoes">
              {sel.telefone && sel.status !== 'entregue' && <button type="button" className="btn btn-wpp" onClick={() => whats(sel, faseDe(sel.status) === 'fila' || faseDe(sel.status) === 'agendado' ? 'cotacao' : 'caminho')}>{faseDe(sel.status) === 'fila' || faseDe(sel.status) === 'agendado' ? 'Enviar cotação' : 'Avisar que está a caminho'}</button>}
              {sel.status === 'entregue' && !sel.pago && <button type="button" className="btn btn-primario" onClick={async () => { await api.atualizarChamado(sel.id, { pago: true }); setSel(null); carregar(); }}>Marcar como recebido</button>}
              {sel.status === 'entregue' && sel.telefone && <button type="button" className="btn btn-wpp" onClick={() => whats(sel, 'entregue')}>Avisar a entrega</button>}
              {sel.status !== 'entregue' && acao(sel)}
              {sel.status !== 'entregue' && <button type="button" className="btn btn-tonal t-cancel" onClick={() => mudar(sel, 'cancelado')}>Cancelar chamado</button>}
            </div>
          </div>
        )}
      </Janela>

      <Janela titulo="Link de pedidos" aberta={linkAberto} aoFechar={() => setLinkAberto(false)}>
        {linkAberto && <LinkPedidos loja={loja} aoMudar={aoMudar} />}
      </Janela>

      <Janela titulo="Tabela de preço" aberta={tarifas} aoFechar={() => setTarifas(false)}>
        {tarifas && <Tarifas loja={loja} aoCancelar={() => setTarifas(false)} aoSalvar={() => { setTarifas(false); aoMudar(); }} />}
      </Janela>

      <CobrarPix loja={loja} alvo={pix ? { valor: Number(pix.valor) || 0, descricao: pix.servico_nome || 'Guincho', telefone: pix.telefone, nome: pix.nome } : null} aoFechar={() => setPix(null)} />
    </>
  );
}

function FormChamado({ loja, servicos, aoSalvar, aoCancelar }: { loja: Loja; servicos: Servico[]; aoSalvar: () => void; aoCancelar: () => void }) {
  const [nome, setNome] = useState('');
  const [tel, setTel] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [placa, setPlaca] = useState('');
  const [servico, setServico] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [km, setKm] = useState('');
  const [noturno, setNoturno] = useState(() => { const h = new Date().getHours(); return h >= 20 || h < 6 || new Date().getDay() === 0; });
  const [marcados, setMarcados] = useState<string[]>([]);
  const [pagador, setPagador] = useState('');
  const [obs, setObs] = useState('');
  const [agendar, setAgendar] = useState(false);
  const [data, setData] = useState('');
  const [hora, setHora] = useState('');
  const [valorManual, setValorManual] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const opcoes: Adicional[] = loja.tarifa_adicionais ?? [];
  const escolhidos = opcoes.filter((o) => marcados.includes(o.nome));
  const socorro = servicos.find((s) => s.nome === servico && /^socorro/i.test(s.nome));
  // Reboque: saída + km. Socorro (bateria, pneu, pane seca): preço fechado do serviço.
  const c = useMemo(() => cotar(loja, Number(km.replace(',', '.')) || 0, noturno, escolhidos), [loja, km, noturno, marcados.join('|')]);
  const calculado = socorro ? Math.round(Number(socorro.valor_medio) * (noturno ? 1 + loja.tarifa_noturno_pct / 100 : 1) + c.extras) : c.total;
  const valor = valorManual !== null ? Number(valorManual) || 0 : calculado;

  function alternar(n: string) { setMarcados((m) => (m.includes(n) ? m.filter((x) => x !== n) : [...m, n])); }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (agendar && (!data || !hora)) { setErro('Escolha a data e a hora da remoção.'); return; }
    setSalvando(true); setErro('');
    try {
      await api.criarChamado(loja.id, {
        nome: nome.trim(), telefone: tel.trim() || null, veiculo: veiculo.trim() || null, placa: placa.trim().toUpperCase() || null,
        servico_nome: servico || null, origem: origem.trim() || null, destino: destino.trim() || null, km: Number(km.replace(',', '.')) || null,
        valor, noturno, adicionais: escolhidos, motorista: null, pagador: pagador.trim() || null, observacao: obs.trim() || null,
        inicio: agendar ? new Date(`${data}T${hora}`).toISOString() : new Date().toISOString(), status: agendar ? 'confirmado' : 'fila',
      });
      aoSalvar();
    } catch (e) { setErro((e as Error).message); setSalvando(false); }
  }

  return (
    <form onSubmit={enviar} className="ch-form">
      <div className="ch-form-col">
        <div className="dupla">
          <Campo rotulo="Cliente"><input required autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem chamou" /></Campo>
          <Campo rotulo="WhatsApp"><input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(41) 99999-0000" /></Campo>
        </div>
        <div className="dupla">
          <Campo rotulo="Veículo"><input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} placeholder="Onix branco" /></Campo>
          <Campo rotulo="Placa"><input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ABC1D23" maxLength={8} /></Campo>
        </div>
        <Campo rotulo="Serviço">
          <select value={servico} onChange={(e) => { setServico(e.target.value); setValorManual(null); }}>
            <option value="">Escolha</option>
            {servicos.map((s) => <option key={s.id} value={s.nome}>{s.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Onde o veículo está"><input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Rua, número, bairro ou referência" /></Campo>
        <Campo rotulo="Para onde vai"><input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Oficina, casa ou pátio" /></Campo>
        <div className="dupla">
          <Campo rotulo="Distância (km)" dica={origem && destino ? undefined : 'Preencha origem e destino para ver a rota.'}>
            <input inputMode="decimal" value={km} onChange={(e) => { setKm(e.target.value); setValorManual(null); }} placeholder="14" />
          </Campo>
          <Campo rotulo="Quem paga (se não for o cliente)"><input value={pagador} onChange={(e) => setPagador(e.target.value)} placeholder="Oficina, seguradora" /></Campo>
        </div>
        {origem && destino && <a className="link ch-maps" href={rotaMaps(origem, destino)} target="_blank" rel="noopener">Ver a distância no Google Maps</a>}
        <Campo rotulo="Observação"><input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Pneu travado, sem chave, garagem baixa" /></Campo>
      </div>

      <aside className="ch-cot">
        <span className="det-rot">Cotação</span>
        <label className="marcar"><input type="checkbox" checked={noturno} onChange={(e) => { setNoturno(e.target.checked); setValorManual(null); }} /> Noturno, domingo ou feriado (+{loja.tarifa_noturno_pct}%)</label>
        {opcoes.length > 0 && (
          <div className="ch-adic">
            {opcoes.map((o) => (
              <button key={o.nome} type="button" className={marcados.includes(o.nome) ? 'on' : ''} aria-pressed={marcados.includes(o.nome)} onClick={() => { alternar(o.nome); setValorManual(null); }}>
                {o.nome}<small>+{brl(o.valor)}</small>
              </button>
            ))}
          </div>
        )}
        <dl className="ch-conta">
          {socorro ? <><dt>{socorro.nome}</dt><dd>{brl(socorro.valor_medio)}</dd></> : <>
            <dt>Saída</dt><dd>{brl(c.saida)}</dd>
            <dt>{c.kmCobrado.toLocaleString('pt-BR')} km × {Number(loja.tarifa_km).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dt><dd>{brl(c.rodagem)}</dd>
            {noturno && <><dt>Acréscimo noturno</dt><dd>{brl(c.acrescimo)}</dd></>}
          </>}
          {c.extras > 0 && <><dt>Adicionais</dt><dd>{brl(c.extras)}</dd></>}
        </dl>
        <label className="ch-total">
          <span>Valor do chamado</span>
          <span className="ch-total-campo"><i>R$</i><input inputMode="numeric" value={valorManual ?? String(calculado)} onChange={(e) => setValorManual(e.target.value.replace(/[^\d.,]/g, ''))} aria-label="Valor do chamado em reais" /></span>
        </label>
        {valorManual !== null && Number(valorManual) !== calculado && <button type="button" className="link" onClick={() => setValorManual(null)}>Voltar ao valor calculado ({brl(calculado)})</button>}
        <label className="marcar"><input type="checkbox" checked={agendar} onChange={(e) => setAgendar(e.target.checked)} /> É uma remoção agendada</label>
        {agendar && (
          <div className="dupla">
            <Campo rotulo="Data"><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Campo>
            <Campo rotulo="Hora"><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>
          </div>
        )}
        {erro && <Aviso>{erro}</Aviso>}
        <div className="acoes">
          <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
          <button className="btn btn-primario" disabled={salvando}>{agendar ? 'Agendar' : 'Abrir chamado'}</button>
        </div>
      </aside>
    </form>
  );
}

function LinkPedidos({ loja, aoMudar }: { loja: Loja; aoMudar: () => void }) {
  const [tel, setTel] = useState(loja.pedir_telefone ?? '');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState('');
  const link = loja.slug ? `${location.origin}/pedir/?g=${loja.slug}` : '';
  async function salvar(d: { pedir_ativo?: boolean; pedir_telefone?: string | null; slug?: string }) {
    setSalvando(true); setErro('');
    try { await api.salvarPedirConfig(loja.id, d); aoMudar(); } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  // O endereço do link nasce do nome do guincho, com 4 letras sorteadas no fim para não repetir o de outra empresa.
  const ligar = () => salvar({ pedir_ativo: true, slug: loja.slug || `${slugify(loja.nome)}-${Math.random().toString(36).slice(2, 6)}` });
  const copiar = () => navigator.clipboard?.writeText(link).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); }).catch(() => {});
  return (
    <div className="ch-link">
      <p className="dica sem-topo">O cliente abre este link no celular, informa onde está e o pedido cai aqui em <b>Novos</b>. Você confere, cota e despacha.</p>
      <label className="alterna-check">
        <input type="checkbox" checked={loja.pedir_ativo} disabled={salvando} onChange={(e) => (e.target.checked ? ligar() : salvar({ pedir_ativo: false }))} />
        <span>{loja.pedir_ativo ? 'Recebendo pedidos pelo link' : 'Link desligado'}</span>
      </label>
      {loja.pedir_ativo && link && (
        <>
          <div className="ag-link">
            <input readOnly aria-label="Link de pedidos" value={link} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-primario" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar link'}</button>
          </div>
          <div className="ch-link-acoes">
            <a className="btn btn-secundario" href={link} target="_blank" rel="noopener">Ver como o cliente vê</a>
            <a className="btn btn-wpp" href={`https://wa.me/?text=${encodeURIComponent(`Precisa de guincho? Peça por aqui: ${link}`)}`} target="_blank" rel="noopener">Enviar por WhatsApp</a>
          </div>
          <Campo rotulo="Seu WhatsApp de atendimento" dica="Aparece para o cliente depois que ele envia o pedido.">
            <input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} onBlur={() => tel.replace(/\D/g, '') !== (loja.pedir_telefone ?? '') && salvar({ pedir_telefone: tel.replace(/\D/g, '') || null })} placeholder="(41) 99999-0000" />
          </Campo>
          <span className="det-rot">Onde divulgar</span>
          <ul className="ch-link-dicas">
            <li>Na mensagem automática e na bio do WhatsApp Business.</li>
            <li>No perfil do Google e no Instagram.</li>
            <li>Em QR Code no caminhão e no cartão que fica nas oficinas parceiras.</li>
          </ul>
        </>
      )}
      {erro && <Aviso>{erro}</Aviso>}
    </div>
  );
}

function Despacho({ a, motoristas, aoConfirmar, aoCancelar }: { a: Agendamento; motoristas: string[]; aoConfirmar: (motorista: string, avisar: boolean) => void; aoCancelar: () => void }) {
  const [m, setM] = useState(a.motorista ?? motoristas[0] ?? '');
  const [avisar, setAvisar] = useState(!!a.telefone);
  return (
    <form onSubmit={(e) => { e.preventDefault(); aoConfirmar(m.trim(), avisar); }}>
      <Campo rotulo="Quem vai atender">
        <input list="ch-motoristas" value={m} onChange={(e) => setM(e.target.value)} placeholder="Nome do motorista" />
      </Campo>
      <datalist id="ch-motoristas">{motoristas.map((n) => <option key={n} value={n} />)}</datalist>
      {a.telefone && <label className="marcar"><input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} /> Abrir o WhatsApp para avisar {primeiro(a.nome)} que o guincho saiu</label>}
      <div className="acoes">
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario">Guincho a caminho</button>
      </div>
    </form>
  );
}

function Tarifas({ loja, aoSalvar, aoCancelar }: { loja: Loja; aoSalvar: () => void; aoCancelar: () => void }) {
  const [saida, setSaida] = useState(String(Number(loja.tarifa_saida)));
  const [km, setKm] = useState(String(Number(loja.tarifa_km)).replace('.', ','));
  const [franquia, setFranquia] = useState(String(loja.tarifa_franquia_km));
  const [noturno, setNoturno] = useState(String(loja.tarifa_noturno_pct));
  const [adic, setAdic] = useState<{ nome: string; valor: string }[]>((loja.tarifa_adicionais ?? []).map((a) => ({ nome: a.nome, valor: String(a.valor) })));
  const [erro, setErro] = useState('');
  const num = (t: string) => Number(t.replace(',', '.')) || 0;
  async function enviar(e: FormEvent) {
    e.preventDefault();
    try {
      await api.salvarTarifas(loja.id, { tarifa_saida: num(saida), tarifa_km: num(km), tarifa_franquia_km: Math.round(num(franquia)), tarifa_noturno_pct: Math.round(num(noturno)),
        tarifa_adicionais: adic.filter((a) => a.nome.trim()).map((a) => ({ nome: a.nome.trim(), valor: num(a.valor) })) });
      aoSalvar();
    } catch (e) { setErro((e as Error).message); }
  }
  const exemplo = cotar({ tarifa_saida: num(saida), tarifa_km: num(km), tarifa_franquia_km: num(franquia), tarifa_noturno_pct: num(noturno) }, 20, false, []).total;
  return (
    <form onSubmit={enviar}>
      <div className="dupla">
        <Campo rotulo="Saída (R$)" dica="Valor fixo para o caminhão sair."><input inputMode="decimal" value={saida} onChange={(e) => setSaida(e.target.value)} /></Campo>
        <Campo rotulo="Por km (R$)"><input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
      </div>
      <div className="dupla">
        <Campo rotulo="Km já incluídos na saída" dica="Zero cobra desde o primeiro km."><input inputMode="numeric" value={franquia} onChange={(e) => setFranquia(e.target.value)} /></Campo>
        <Campo rotulo="Acréscimo noturno (%)" dica="Noite, domingo e feriado."><input inputMode="numeric" value={noturno} onChange={(e) => setNoturno(e.target.value)} /></Campo>
      </div>
      <p className="dica">Exemplo: um reboque de 20 km durante o dia sai por <b>{brl(exemplo)}</b>.</p>
      <span className="det-rot">Adicionais</span>
      {adic.map((a, i) => (
        <div key={i} className="ch-adic-linha">
          <input aria-label="Nome do adicional" value={a.nome} onChange={(e) => setAdic((l) => l.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} placeholder="Patins" />
          <input aria-label="Valor do adicional" inputMode="decimal" value={a.valor} onChange={(e) => setAdic((l) => l.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} placeholder="80" />
          <button type="button" className="fechar" aria-label={`Remover ${a.nome || 'adicional'}`} onClick={() => setAdic((l) => l.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button type="button" className="link" onClick={() => setAdic((l) => [...l, { nome: '', valor: '' }])}>Adicionar outro</button>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="acoes">
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario">Salvar tabela</button>
      </div>
    </form>
  );
}
