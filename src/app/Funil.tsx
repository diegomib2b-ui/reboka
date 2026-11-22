import { useEffect, useState, type FormEvent, type DragEvent } from 'react';
import { api, orcamentoDe, type Oportunidade, type Etapa, type Servico, type Cliente } from './api';
import FormOrcamento from './Orcamento';
import { Janela, Campo, Aviso, Vazio } from './ui';
import { brl, diasDesde, dataBR, telefoneBR, ROTULO_ORIGEM } from './util';

export const ETAPAS: { id: Etapa; nome: string }[] = [
  { id: 'novo_contato', nome: 'Novo contato' },
  { id: 'avaliacao_agendada', nome: 'Diagnóstico agendado' },
  { id: 'avaliacao_feita', nome: 'Diagnóstico feito' },
  { id: 'orcamento_enviado', nome: 'Orçamento enviado' },
  { id: 'fechado', nome: 'Aprovado' },
];
const MOTIVOS: Record<string, string> = {
  preco: 'Achou caro', fez_em_outro_lugar: 'Fez em outra empresa', desistiu: 'Desistiu do serviço',
  sem_resposta: 'Parou de responder', outro: 'Outro motivo',
};
const DIAS_FECHADO = 30;

/** Há quanto tempo o cartão está na etapa, e se já passou do ponto de cobrar. */
function parada(o: Oportunidade) {
  const dias = diasDesde(o.etapa_desde);
  const limite = o.etapa === 'novo_contato' ? 1 : o.etapa === 'orcamento_enviado' ? 3 : o.etapa === 'fechado' ? Infinity : 7;
  const texto = dias === 0 ? 'Desde hoje' : dias === 1 ? 'Há 1 dia' : `Há ${dias} dias`;
  return { texto, atrasada: dias >= limite };
}

export default function Funil({ lojaId }: { lojaId: string }) {
  const [ops, setOps] = useState<Oportunidade[] | null>(null);
  const [procs, setProcs] = useState<Servico[]>([]);
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState(false);
  const [editando, setEditando] = useState<Oportunidade | null>(null);
  const [perdendo, setPerdendo] = useState<Oportunidade | null>(null);
  const [motivo, setMotivo] = useState('preco');
  const [verPerdidas, setVerPerdidas] = useState(false);
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const [fechou, setFechou] = useState<Oportunidade | null>(null);
  const [orcando, setOrcando] = useState<Oportunidade | null>(null);

  const carregar = () => api.oportunidades().then(setOps).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); api.servicos().then(setProcs).catch(() => {}); }, []);
  // O cliente pode aprovar o orçamento pelo link enquanto esta tela está aberta: ao voltar para a aba, recarrega.
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', aoVoltar); window.addEventListener('focus', aoVoltar);
    return () => { document.removeEventListener('visibilitychange', aoVoltar); window.removeEventListener('focus', aoVoltar); };
  }, []);

  async function mover(o: Oportunidade, etapa: Etapa | 'perdido', motivoPerda?: string) {
    if (etapa === o.etapa) return;
    if (etapa === 'perdido' && !motivoPerda) { setMotivo('preco'); setPerdendo(o); return; }
    // Atualização otimista: a tela muda na hora e, se o banco recusar, volta ao que era.
    const antes = ops;
    setOps((l) => l && l.map((x) => (x.id === o.id ? { ...x, etapa, motivo_perda: motivoPerda ?? null, etapa_desde: new Date().toISOString() } : x)));
    setFechou(etapa === 'fechado' ? o : null);
    try { await api.moverOportunidade(o.id, etapa, motivoPerda); }
    catch (e) { setOps(antes); setErro((e as Error).message); }
  }

  function soltar(e: DragEvent, etapa: Etapa) {
    e.preventDefault(); setSobre(null);
    const o = ops?.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    if (o) mover(o, etapa);
  }

  if (!ops) return erro ? <Aviso>{erro}</Aviso> : <p className="carregando">Carregando</p>;

  const abertas = ops.filter((o) => o.etapa !== 'fechado' && o.etapa !== 'perdido');
  const perdidas = ops.filter((o) => o.etapa === 'perdido').sort((a, b) => b.etapa_desde.localeCompare(a.etapa_desde));
  const daEtapa = (e: Etapa) => ops.filter((o) => o.etapa === e && (e !== 'fechado' || diasDesde(o.etapa_desde) <= DIAS_FECHADO));
  const soma = (l: Oportunidade[]) => l.reduce((s, o) => s + Number(o.valor_estimado), 0);

  return (
    <>
      <header className="cabeca">
        <div>
          <h1>Funil</h1>
          <p>{abertas.length === 0 ? 'Nenhuma negociação aberta.'
            : <>{abertas.length} {abertas.length === 1 ? 'negociação aberta' : 'negociações abertas'}, <b>{brl(soma(abertas))}</b> em jogo</>}</p>
        </div>
        <button type="button" className="btn btn-primario" onClick={() => setNova(true)}>Nova negociação</button>
      </header>

      {erro && <Aviso>{erro}</Aviso>}
      {fechou && (
        <Aviso tipo="ok">
          {fechou.reboka_clientes.nome.split(' ')[0]} fechou. <a href={`#/clientes/${fechou.cliente_id}`}>Registrar o atendimento</a> para o retorno já ficar agendado.
        </Aviso>
      )}

      {ops.length === 0 ? (
        <Vazio titulo="Funil vazio">
          <p>Cada pessoa que pede informação vira um cartão aqui, até fechar ou desistir.</p>
          <p><button type="button" className="btn btn-secundario" onClick={() => setNova(true)}>Criar a primeira negociação</button> <a className="btn btn-secundario" href="#/teste">Usar dados de exemplo</a></p>
        </Vazio>
      ) : (
        <div className="funil" role="list" aria-label="Etapas do funil">
          {ETAPAS.map((etapa) => {
            const lista = daEtapa(etapa.id);
            return (
              <section key={etapa.id} role="listitem" className={`coluna${sobre === etapa.id ? ' coluna-alvo' : ''}${etapa.id === 'fechado' ? ' coluna-fechado' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setSobre(etapa.id); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(null); }}
                onDrop={(e) => soltar(e, etapa.id)}>
                <header>
                  <h2>{etapa.nome}</h2>
                  <p>{lista.length === 0 ? 'Nenhuma' : `${lista.length}, ${brl(soma(lista))}`}{etapa.id === 'fechado' ? ` nos últimos ${DIAS_FECHADO} dias` : ''}</p>
                </header>
                {lista.map((o) => {
                  const p = parada(o);
                  const orc = orcamentoDe(o);
                  return (
                    <article key={o.id} className="cartao-op" draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', o.id); e.dataTransfer.effectAllowed = 'move'; }}>
                      <a className="nome" href={`#/clientes/${o.cliente_id}`}>{o.reboka_clientes.nome}</a>
                      <span className="proc">{o.reboka_servicos?.nome ?? 'Servico a definir'}</span>
                      <div className="linha-op">
                        <b>{brl(o.valor_estimado)}</b>
                        <span className={`chip chip-${p.atrasada ? 'atencao' : 'ok'}`}>{p.texto}</span>
                      </div>
                      {orc && orc.status !== 'rascunho' && (
                        <p className={`situacao-orc situacao-${orc.status}`}>{orc.status === 'aprovado' ? 'Aprovado pelo cliente no link'
                          : orc.status === 'recusado' ? 'Cliente respondeu "agora não"'
                          : orc.visto_em ? `Cliente abriu o orçamento em ${dataBR(orc.visto_em)}` : 'Link enviado, ainda não aberto'}</p>
                      )}
                      {o.proxima_acao && <p className="proxima">{o.proxima_acao_em ? `${dataBR(o.proxima_acao_em)}: ` : ''}{o.proxima_acao}</p>}
                      <div className="pe-op">
                        <label>
                          <span className="so-leitor">Mover {o.reboka_clientes.nome} para</span>
                          <select value={o.etapa} onChange={(e) => mover(o, e.target.value as Etapa)}>
                            {ETAPAS.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                            <option value="perdido">Perdida</option>
                          </select>
                        </label>
                        <button type="button" className="link" onClick={() => setOrcando(o)}>{orc ? 'Orçamento' : 'Orçar'}</button>
                        <button type="button" className="link" onClick={() => setEditando(o)}>Editar</button>
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {perdidas.length > 0 && (
        <section className="bloco perdidas">
          <button type="button" className="link" aria-expanded={verPerdidas} onClick={() => setVerPerdidas(!verPerdidas)}>
            {verPerdidas ? 'Ocultar' : 'Ver'} negociações perdidas ({perdidas.length}, {brl(soma(perdidas))})
          </button>
          {verPerdidas && (
            <ul className="historico">
              {perdidas.map((o) => (
                <li key={o.id}>
                  <span className="ponto-historico" />
                  <div className="quem">
                    <a href={`#/clientes/${o.cliente_id}`}>{o.reboka_clientes.nome}</a>
                    <span>{o.reboka_servicos?.nome ?? 'Servico a definir'}, {brl(o.valor_estimado)}. {MOTIVOS[o.motivo_perda ?? 'outro']}, em {dataBR(o.etapa_desde)}.</span>
                  </div>
                  <button type="button" className="btn btn-secundario" onClick={() => mover(o, 'novo_contato')}>Reabrir</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Janela titulo="Nova negociação" aberta={nova} aoFechar={() => setNova(false)}>
        <FormNegociacao lojaId={lojaId} procs={procs} aoCancelar={() => setNova(false)} aoSalvar={() => { setNova(false); carregar(); }} />
      </Janela>

      <Janela titulo={editando ? editando.reboka_clientes.nome : ''} aberta={!!editando} aoFechar={() => setEditando(null)}>
        {editando && <FormEditar lojaId={lojaId} o={editando} procs={procs} aoCancelar={() => setEditando(null)} aoSalvar={() => { setEditando(null); carregar(); }} />}
      </Janela>

      <Janela titulo={orcando ? `Orçamento de ${orcando.reboka_clientes.nome.split(' ')[0]}` : ''} aberta={!!orcando} aoFechar={() => { setOrcando(null); carregar(); }} larga>
        {orcando && <FormOrcamento lojaId={lojaId} o={orcando} aoFechar={() => { setOrcando(null); carregar(); }} />}
      </Janela>

      <Janela titulo="Por que não fechou?" aberta={!!perdendo} aoFechar={() => setPerdendo(null)}>
        <p className="dica sem-topo">Saber o motivo mostra onde a empresa perde venda. A negociação sai do funil e pode ser reaberta depois.</p>
        <fieldset className="opcoes">
          <legend className="so-leitor">Motivo</legend>
          {Object.entries(MOTIVOS).map(([v, r]) => (
            <label key={v}><input type="radio" name="motivo" value={v} checked={motivo === v} onChange={() => setMotivo(v)} /> {r}</label>
          ))}
        </fieldset>
        <div className="acoes">
          <button type="button" className="btn btn-secundario" onClick={() => setPerdendo(null)}>Cancelar</button>
          <button type="button" className="btn btn-primario" onClick={() => { const o = perdendo!; setPerdendo(null); mover(o, 'perdido', motivo); }}>Marcar como perdida</button>
        </div>
      </Janela>
    </>
  );
}

function FormNegociacao({ lojaId, procs, aoSalvar, aoCancelar }: { lojaId: string; procs: Servico[]; aoSalvar: () => void; aoCancelar: () => void }) {
  const [modo, setModo] = useState<'nova' | 'cadastrada'>('nova');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [origem, setOrigem] = useState('instagram');
  const [busca, setBusca] = useState('');
  const [achadas, setAchadas] = useState<Cliente[]>([]);
  const [escolhida, setEscolhida] = useState<Cliente | null>(null);
  const [procId, setProcId] = useState('');
  const [valor, setValor] = useState('');
  const [etapa, setEtapa] = useState<Etapa>('novo_contato');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (modo !== 'cadastrada' || busca.trim().length < 2) { setAchadas([]); return; }
    const t = setTimeout(() => api.clientes(busca).then((l) => setAchadas(l.slice(0, 5))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [busca, modo]);

  function trocarProc(id: string) {
    setProcId(id);
    const p = procs.find((x) => x.id === id);
    if (p) setValor(String(Number(p.valor_medio)));
  }

  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro('');
    if (modo === 'cadastrada' && !escolhida) { setErro('Busque e escolha o cliente.'); return; }
    if (modo === 'nova' && telefone.replace(/\D/g, '').length < 10) { setErro('Informe o telefone com DDD.'); return; }
    setOcupado(true);
    try {
      const pid = modo === 'cadastrada' ? escolhida!.id : await api.salvarCliente(lojaId, { nome, telefone, origem });
      await api.salvarOportunidade(lojaId, { cliente_id: pid, servico_id: procId || null, valor_estimado: Number(valor) || 0, etapa });
      aoSalvar();
    } catch (e) { setErro((e as Error).message); setOcupado(false); }
  }

  return (
    <form onSubmit={enviar}>
      <fieldset className="alterna">
        <legend className="so-leitor">Quem é</legend>
        <label><input type="radio" name="modo" checked={modo === 'nova'} onChange={() => setModo('nova')} /> Contato novo</label>
        <label><input type="radio" name="modo" checked={modo === 'cadastrada'} onChange={() => setModo('cadastrada')} /> Já é cliente</label>
      </fieldset>

      {modo === 'nova' ? (
        <>
          <Campo rotulo="Nome"><input required value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
          <div className="dupla">
            <Campo rotulo="WhatsApp, com DDD"><input required inputMode="tel" placeholder="(41) 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Campo>
            <Campo rotulo="Como chegou">
              <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
                {Object.entries(ROTULO_ORIGEM).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
              </select>
            </Campo>
          </div>
        </>
      ) : escolhida ? (
        <p className="escolhida"><span><b>{escolhida.nome}</b>, {telefoneBR(escolhida.telefone)}</span> <button type="button" className="link" onClick={() => setEscolhida(null)}>Trocar</button></p>
      ) : (
        <>
          <Campo rotulo="Buscar cliente por nome ou telefone"><input type="search" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
          {achadas.length > 0 && (
            <ul className="achadas">
              {achadas.map((p) => <li key={p.id}><button type="button" onClick={() => setEscolhida(p)}><b>{p.nome}</b> <span>{telefoneBR(p.telefone)}</span></button></li>)}
            </ul>
          )}
          {busca.trim().length >= 2 && achadas.length === 0 && <p className="dica sem-topo">Ninguém com esse nome. Use "Contato novo" para cadastrar.</p>}
        </>
      )}

      <Campo rotulo="Serviço de interesse">
        <select value={procId} onChange={(e) => trocarProc(e.target.value)}>
          <option value="">Ainda não sei</option>
          {procs.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
      </Campo>
      <div className="dupla">
        <Campo rotulo="Valor estimado (R$)"><input type="number" min="0" step="10" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
        <Campo rotulo="Etapa">
          <select value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa)}>
            {ETAPAS.filter((x) => x.id !== 'fechado').map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </Campo>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="acoes">
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario" disabled={ocupado}>Criar negociação</button>
      </div>
    </form>
  );
}

function FormEditar({ lojaId, o, procs, aoSalvar, aoCancelar }: { lojaId: string; o: Oportunidade; procs: Servico[]; aoSalvar: () => void; aoCancelar: () => void }) {
  const [procId, setProcId] = useState(o.servico_id ?? '');
  const [valor, setValor] = useState(String(Number(o.valor_estimado)));
  const [acao, setAcao] = useState(o.proxima_acao ?? '');
  const [quando, setQuando] = useState(o.proxima_acao_em ?? '');
  const [erro, setErro] = useState('');
  const [apagar, setApagar] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    try {
      await api.salvarOportunidade(lojaId, { id: o.id, servico_id: procId || null, valor_estimado: Number(valor) || 0, proxima_acao: acao.trim() || null, proxima_acao_em: quando || null });
      aoSalvar();
    } catch (e) { setErro((e as Error).message); }
  }

  if (apagar) return (
    <>
      <p>Isso apaga só esta negociação. O cadastro de <b>{o.reboka_clientes.nome}</b> continua.</p>
      <div className="acoes">
        <button type="button" className="btn btn-secundario" onClick={() => setApagar(false)}>Manter</button>
        <button type="button" className="btn btn-perigo" onClick={() => api.apagarOportunidade(o.id).then(aoSalvar).catch((e) => setErro(e.message))}>Apagar negociação</button>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
    </>
  );

  return (
    <form onSubmit={enviar}>
      <div className="dupla">
        <Campo rotulo="Serviço">
          <select value={procId} onChange={(e) => setProcId(e.target.value)}>
            <option value="">Ainda não sei</option>
            {procs.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Valor estimado (R$)"><input type="number" min="0" step="10" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
      </div>
      <Campo rotulo="Próximo passo" dica="Exemplo: ligar para confirmar o horário ou avisar que a peça chegou."><input value={acao} onChange={(e) => setAcao(e.target.value)} /></Campo>
      <Campo rotulo="Quando"><input type="date" value={quando} onChange={(e) => setQuando(e.target.value)} /></Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="acoes">
        <button type="button" className="btn btn-perigo" onClick={() => setApagar(true)}>Apagar</button>
        <span className="empurra" />
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario">Salvar</button>
      </div>
    </form>
  );
}
