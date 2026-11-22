import { useEffect, useState, type FormEvent } from 'react';
import { api, whatsapp, type Loja, type Patio, type StatusPatio, type Servico, type Cliente } from './api';
import { Janela, Campo, Aviso, Vazio, SkCard } from './ui';
import { brl, linkWhatsApp, telefoneBR } from './util';
import CobrarPix from './CobrarPix';

const iniciais = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const FASE: Record<StatusPatio, { rot: string; classe: string }> = {
  fila: { rot: 'Na fila', classe: 't-fila' },
  em_servico: { rot: 'Em serviço', classe: 't-em_servico' },
  pronto: { rot: 'Pronto', classe: 't-pronto' },
  entregue: { rot: 'Entregue', classe: 't-pronto' },
};

const COLUNAS: { chave: StatusPatio; titulo: string; vazio: string }[] = [
  { chave: 'fila', titulo: 'Na fila', vazio: 'Fila vazia' },
  { chave: 'em_servico', titulo: 'Em serviço', vazio: 'Nenhum carro em serviço agora' },
  { chave: 'pronto', titulo: 'Pronto', vazio: 'Nada pronto ainda' },
];
const msgPronto = (c: Patio) =>
  `Oi, ${c.nome.split(' ')[0]}! ${c.veiculo ? `Seu ${c.veiculo}` : 'Seu carro'} já está pronto aqui na empresa. Pode retirar quando quiser. 🚗✨`;

export default function PatioTela({ loja }: { loja: Loja }) {
  const lojaId = loja.id;
  const [carros, setCarros] = useState<Patio[] | null>(null);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [erro, setErro] = useState('');
  const [addAberto, setAddAberto] = useState(false);
  const [detalhe, setDetalhe] = useState<Patio | null>(null);

  const carregar = () => api.patio().then(setCarros).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); api.servicos().then(setServicos).catch(() => {}); }, []);

  async function mover(c: Patio, status: StatusPatio) {
    try {
      await api.patioMover(c.id, status);
      // Aviso automático de "carro pronto" pela IA, se o dono ligou essa opção.
      if (status === 'pronto' && loja.wa_ativo && loja.wa_proativo_pronto && c.telefone) {
        whatsapp.enviar(c.telefone, msgPronto(c)).catch(() => {});
      }
      await carregar();
    } catch (e) { setErro((e as Error).message); }
  }
  async function entregar(c: Patio) {
    try { await api.patioEntregar(lojaId, c, servicos); await carregar(); } catch (e) { setErro((e as Error).message); }
  }
  async function remover(c: Patio) {
    if (!confirm(`Tirar ${c.nome} do pátio?`)) return;
    try { await api.patioRemover(c.id); await carregar(); } catch (e) { setErro((e as Error).message); }
  }
  async function avisar(c: Patio) {
    window.open(linkWhatsApp(c.telefone ?? '', msgPronto(c)), '_blank', 'noopener');
    try { await api.patioAvisado(c.id); await carregar(); } catch { /* ignora */ }
  }

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!carros) return (
    <>
      <header className="cabeca patio-cabeca"><div><h1>Pátio</h1><p>Carregando o pátio…</p></div></header>
      <div className="patio-colunas">
        {COLUNAS.map((col) => (
          <section key={col.chave} className={`patio-coluna patio-${col.chave}`}>
            <h2>{col.titulo}</h2>
            <div className="patio-pista"><SkCard /><SkCard /></div>
          </section>
        ))}
      </div>
    </>
  );

  const porColuna = (s: StatusPatio) => carros.filter((c) => c.status === s);
  const faturando = carros.filter((c) => c.status !== 'fila').reduce((s, c) => s + Number(c.valor), 0);

  return (
    <>
      <header className="cabeca patio-cabeca">
        <div>
          <h1>Pátio</h1>
          <p>{carros.length === 0 ? 'Nenhum carro no pátio agora.'
            : <>{carros.length} {carros.length === 1 ? 'carro' : 'carros'} no pátio, <b>{brl(faturando)}</b> em andamento</>}</p>
        </div>
        <button type="button" className="btn btn-secundario patio-add" onClick={() => setAddAberto(true)}>+ Adicionar</button>
      </header>

      {carros.length === 0 ? (
        <Vazio titulo="Pátio vazio">
          <p>Adicione os carros conforme chegam. Acompanhe cada um da fila até ficar pronto e avise o cliente no WhatsApp com um toque.</p>
          <p><button type="button" className="btn btn-secundario" onClick={() => setAddAberto(true)}>Adicionar primeiro carro</button></p>
        </Vazio>
      ) : (
        <div className="patio-colunas">
          {COLUNAS.map((col) => {
            const lista = porColuna(col.chave);
            return (
              <section key={col.chave} className={`patio-coluna patio-${col.chave}`}>
                <h2>{col.titulo} <span className="patio-contador">{lista.length}</span>
                  {lista.length > 1 && <span className="patio-arraste">arraste →</span>}</h2>
                {lista.length === 0 ? <p className="patio-nada">{col.vazio}</p> : (
                  <div className="patio-pista">
                    {lista.map((c) => (
                      <article key={c.id} className="patio-carro" role="button" tabIndex={0}
                        onClick={() => setDetalhe(c)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setDetalhe(c); }}>
                        <div className="patio-topo">
                          <strong>{c.nome}</strong>
                          <button type="button" className="patio-x" aria-label="Tirar do pátio" onClick={(e) => { e.stopPropagation(); remover(c); }}>×</button>
                        </div>
                        {(c.veiculo || c.placa) && <p className="patio-veiculo">{c.veiculo}{c.placa && <span className="placa">{c.placa}</span>}</p>}
                        <p className="patio-servico">{c.servico_nome ?? 'Sem serviço'}{Number(c.valor) > 0 && <> · <b>{brl(c.valor)}</b></>}</p>
                        <div className="patio-acoes">
                          <span className="patio-mecanico">{c.mecanico ? `Motorista: ${c.mecanico}` : ''}</span>
                          {col.chave === 'fila' && <button type="button" className="btn btn-tonal" onClick={(e) => { e.stopPropagation(); mover(c, 'em_servico'); }}>Começar →</button>}
                          {col.chave === 'em_servico' && <button type="button" className="btn btn-tonal t-em_servico" onClick={(e) => { e.stopPropagation(); mover(c, 'pronto'); }}>Marcar pronto ✓</button>}
                          {col.chave === 'pronto' && <>
                            {c.telefone && <button type="button" className="btn btn-tonal t-pronto" onClick={(e) => { e.stopPropagation(); avisar(c); }}>{c.avisado_em ? 'Avisar de novo' : 'Avisar'}</button>}
                            <button type="button" className="btn btn-tonal t-pronto" onClick={(e) => { e.stopPropagation(); entregar(c); }}>Entregar →</button>
                          </>}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Janela titulo="Adicionar carro ao pátio" aberta={addAberto} aoFechar={() => setAddAberto(false)}>
        <FormAdd lojaId={lojaId} servicos={servicos} aoSalvar={() => { setAddAberto(false); carregar(); }} />
      </Janela>

      {detalhe && <DetalheAtendimento loja={loja} carro={detalhe} servicos={servicos}
        onMover={async (c, s) => { await mover(c, s); setDetalhe(null); }}
        onEntregar={async (c) => { await entregar(c); setDetalhe(null); }}
        onAvisar={(c) => avisar(c)}
        onServico={async (c, nome, valor) => { try { await api.patioDefinirServico(c.id, nome, valor); setDetalhe(null); await carregar(); } catch (e) { setErro((e as Error).message); } }}
        aoFechar={() => setDetalhe(null)} />}
    </>
  );
}

function FormAdd({ lojaId, servicos, aoSalvar }: { lojaId: string; servicos: Servico[]; aoSalvar: () => void }) {
  const [modo, setModo] = useState<'cadastrado' | 'avulso'>('cadastrado');
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [placa, setPlaca] = useState('');
  const [servico, setServico] = useState('');
  const [valor, setValor] = useState('');
  const [mecanico, setMecanico] = useState('');
  const [extras, setExtras] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const principais = servicos.filter((s) => !s.adicional);
  const adicionais = servicos.filter((s) => s.adicional);

  function recalcular(nomeServico: string, extrasSet: Set<string>) {
    const base = servicos.find((s) => s.nome === nomeServico);
    const soma = (base ? Number(base.valor_medio) : 0) + adicionais.filter((a) => extrasSet.has(a.nome)).reduce((s, a) => s + Number(a.valor_medio), 0);
    setValor(soma ? String(soma) : '');
  }
  function toggleExtra(nome: string) {
    const novo = new Set(extras); novo.has(nome) ? novo.delete(nome) : novo.add(nome);
    setExtras(novo); recalcular(servico, novo);
  }

  useEffect(() => {
    if (modo !== 'cadastrado' || cliente || busca.trim().length < 2) { setAchados([]); return; }
    const t = setTimeout(() => api.clientes(busca).then((l) => setAchados(l.slice(0, 6))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [busca, modo, cliente]);

  function escolher(c: Cliente) {
    setCliente(c); setNome(c.nome); setTelefone(c.telefone ?? ''); setVeiculo(c.veiculo ?? ''); setPlaca(c.placa ?? ''); setBusca(''); setAchados([]);
  }
  function limparCliente() { setCliente(null); setNome(''); setTelefone(''); setVeiculo(''); setPlaca(''); }

  function aoEscolherServico(nomeServico: string) {
    setServico(nomeServico);
    recalcular(nomeServico, extras);
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setErro('Informe o nome ou escolha um cliente.'); return; }
    setSalvando(true); setErro('');
    try {
      const nomeCompleto = [servico, ...adicionais.filter((a) => extras.has(a.nome)).map((a) => a.nome)].filter(Boolean).join(' + ') || null;
      await api.patioAdicionar(lojaId, {
        cliente_id: cliente?.id ?? null, nome, telefone, veiculo, placa,
        servico_nome: nomeCompleto, valor: valor ? Number(valor) : 0, mecanico,
      });
      aoSalvar();
    } catch (e) { setErro((e as Error).message); setSalvando(false); }
  }

  return (
    <form onSubmit={enviar} className="form-grade">
      {erro && <Aviso>{erro}</Aviso>}
      <div className="pilulas" role="group" aria-label="Tipo">
        <button type="button" aria-pressed={modo === 'cadastrado'} onClick={() => { setModo('cadastrado'); limparCliente(); }}>Cliente cadastrado</button>
        <button type="button" aria-pressed={modo === 'avulso'} onClick={() => { setModo('avulso'); limparCliente(); }}>Avulso</button>
      </div>

      {modo === 'cadastrado' && !cliente && (
        <Campo rotulo="Buscar cliente" dica="Nome, telefone ou placa">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: João, 41999..., ABC1D23" autoFocus />
        </Campo>
      )}
      {achados.length > 0 && (
        <ul className="patio-achados">
          {achados.map((c) => (
            <li key={c.id}><button type="button" onClick={() => escolher(c)}>
              <strong>{c.nome}</strong>{(c.veiculo || c.placa) && <span>{c.veiculo}{c.placa ? ` · ${c.placa}` : ''}</span>}
            </button></li>
          ))}
        </ul>
      )}
      {cliente && (
        <div className="patio-escolhido">
          <span><strong>{cliente.nome}</strong>{cliente.veiculo ? ` · ${cliente.veiculo}` : ''}</span>
          <button type="button" className="btn btn-secundario" onClick={limparCliente}>Trocar</button>
        </div>
      )}

      {(modo === 'avulso' || cliente) && (
        <>
          {modo === 'avulso' && <Campo rotulo="Nome"><input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></Campo>}
          <div className="form-dupla">
            <Campo rotulo="Veículo"><input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} placeholder="Ex.: Corolla prata" /></Campo>
            <Campo rotulo="Placa"><input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ABC1D23" /></Campo>
          </div>
          {modo === 'avulso' && <Campo rotulo="WhatsApp" dica="Para avisar quando ficar pronto"><input value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" placeholder="(41) 99999-9999" /></Campo>}
          <div className="form-dupla">
            <Campo rotulo="Serviço">
              <select value={servico} onChange={(e) => aoEscolherServico(e.target.value)}>
                <option value="">Escolher</option>
                {principais.map((s) => <option key={s.id} value={s.nome}>{s.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Valor (R$)"><input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" /></Campo>
          </div>
          {adicionais.length > 0 && (
            <Campo rotulo="Adicionais" dica="Somam no valor">
              <div className="pilulas">
                {adicionais.map((a) => (
                  <button type="button" key={a.id} aria-pressed={extras.has(a.nome)} onClick={() => toggleExtra(a.nome)}>{a.nome} +{brl(a.valor_medio)}</button>
                ))}
              </div>
            </Campo>
          )}
          <Campo rotulo="Motorista" dica="Opcional"><input value={mecanico} onChange={(e) => setMecanico(e.target.value)} placeholder="Quem vai fazer o serviço" /></Campo>
        </>
      )}

      <div className="acoes">
        <button type="submit" className="btn btn-primario" disabled={salvando}>{salvando ? 'Adicionando…' : 'Adicionar à fila'}</button>
      </div>
    </form>
  );
}

/** Tela de detalhe do atendimento (abre ao tocar no card do pátio). */
function DetalheAtendimento({ loja, carro, servicos, onMover, onEntregar, onAvisar, onServico, aoFechar }: {
  loja: Loja;
  carro: Patio;
  servicos: Servico[];
  onMover: (c: Patio, s: StatusPatio) => void;
  onEntregar: (c: Patio) => void;
  onAvisar: (c: Patio) => void;
  onServico: (c: Patio, nome: string, valor: number) => void;
  aoFechar: () => void;
}) {
  const [cobrar, setCobrar] = useState(false);
  const [stAberto, setStAberto] = useState(false);
  const [svAberto, setSvAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const f = FASE[carro.status];
  function copiarTel() { if (carro.telefone) navigator.clipboard?.writeText(carro.telefone).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }).catch(() => {}); }
  return (
    <>
      <Janela titulo="Atendimento" aberta={true} aoFechar={aoFechar}>
        <div className="det">
          <section className="det-sec">
            <span className="det-rot">Status</span>
            <button type="button" className={`det-pill det-pill-btn ${f.classe}`} onClick={() => setStAberto((v) => !v)}>
              <i /> {f.rot} <span className="det-chev">{stAberto ? '⌄' : '›'}</span>
            </button>
            {stAberto && (
              <div className="det-opcoes">
                {(['fila', 'em_servico', 'pronto'] as StatusPatio[]).filter((s) => s !== carro.status).map((s) => (
                  <button key={s} type="button" className={`btn btn-tonal ${FASE[s].classe}`} onClick={() => onMover(carro, s)}>{FASE[s].rot}</button>
                ))}
              </div>
            )}
          </section>

          {(carro.veiculo || carro.placa) && (
            <section className="det-sec">
              <span className="det-rot">Veículo</span>
              <div className="det-lin"><span className="det-ico">🚗</span>
                <span className="det-val">{carro.veiculo}{carro.placa && <span className="placa">{carro.placa}</span>}</span></div>
            </section>
          )}

          <section className="det-sec">
            <span className="det-rot">Cliente</span>
            {carro.cliente_id ? (
              <a className="det-lin det-click" href={`#/clientes/${carro.cliente_id}`} onClick={aoFechar}>
                <span className="det-av">{iniciais(carro.nome)}</span><span className="det-val">{carro.nome}</span><span className="det-chev det-push">›</span>
              </a>
            ) : (
              <div className="det-lin"><span className="det-av">{iniciais(carro.nome)}</span><span className="det-val">{carro.nome}</span></div>
            )}
          </section>

          {carro.telefone && (
            <section className="det-sec">
              <span className="det-rot">Telefone</span>
              <div className="det-lin"><span className="det-ico">📞</span>
                <button type="button" className="det-tel" onClick={copiarTel}>{copiado ? 'Copiado!' : telefoneBR(carro.telefone)}</button>
                <a className="btn btn-wpp det-push" href={linkWhatsApp(carro.telefone, '')} target="_blank" rel="noopener">conversar</a></div>
            </section>
          )}

          {carro.mecanico && (
            <section className="det-sec">
              <span className="det-rot">Motorista</span>
              <div className="det-lin"><span className="det-av cinza">{iniciais(carro.mecanico)}</span>
                <span className="det-val">{carro.mecanico}</span></div>
            </section>
          )}

          <section className="det-sec">
            <span className="det-rot">Serviço e pagamento</span>
            <button type="button" className="det-lin det-lin-btn" onClick={() => setSvAberto(true)}>
              <span className="det-ico">✨</span>
              <span className="det-val">{carro.servico_nome ?? 'Sem serviço'}{Number(carro.valor) > 0 && <> · <b>{brl(carro.valor)}</b></>}</span>
              <span className="det-chev det-push">›</span>
            </button>
          </section>

          <div className="det-cta">
            {carro.status === 'fila' && <button type="button" className="btn btn-primario det-grande" onClick={() => onMover(carro, 'em_servico')}>Começar serviço</button>}
            {carro.status === 'em_servico' && <button type="button" className="btn btn-primario det-grande" onClick={() => onMover(carro, 'pronto')}>Marcar como pronto</button>}
            {carro.status === 'pronto' && <>
              {carro.telefone && <button type="button" className="btn btn-tonal t-pronto det-grande" onClick={() => onAvisar(carro)}>{carro.avisado_em ? 'Avisar de novo' : 'Avisar no WhatsApp'}</button>}
              <button type="button" className="btn btn-primario det-grande" onClick={() => onEntregar(carro)}>Entregar carro</button>
            </>}
          </div>
        </div>
      </Janela>

      {/* Página inteira de Serviço e pagamento */}
      <Janela titulo="Serviço e pagamento" aberta={svAberto} aoFechar={() => setSvAberto(false)}>
        <div className="sv-pagina">
          <span className="sv-rot">Trocar serviço</span>
          <div className="sv-lista">
            {servicos.filter((s) => s.ativo).map((s) => {
              const atual = s.nome === carro.servico_nome;
              return (
                <button key={s.id} type="button" className={`sv-item${atual ? ' sel' : ''}`} onClick={() => onServico(carro, s.nome, s.valor_medio)}>
                  <span className="sv-nome">{s.nome}</span>
                  <span className="sv-preco">{brl(s.valor_medio)}</span>
                  {atual && <span className="sv-check">✓</span>}
                </button>
              );
            })}
          </div>
          {Number(carro.valor) > 0 && (
            <div className="sv-pag">
              <span className="sv-rot">Pagamento</span>
              <div className="sv-total"><span>Total</span><b>{brl(carro.valor)}</b></div>
              {loja.pix_chave
                ? <button type="button" className="btn btn-primario sv-cobrar" onClick={() => { setSvAberto(false); setCobrar(true); }}>Cobrar no Pix</button>
                : <p className="sv-dica">Configure sua chave Pix no Caixa para cobrar por aqui.</p>}
            </div>
          )}
        </div>
      </Janela>

      {cobrar && <CobrarPix loja={loja}
        alvo={{ valor: carro.valor, descricao: carro.servico_nome ?? 'Serviço', telefone: carro.telefone, nome: carro.nome }}
        aoFechar={() => setCobrar(false)} />}
    </>
  );
}
