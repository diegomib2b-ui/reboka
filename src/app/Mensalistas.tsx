import { useEffect, useState, type FormEvent } from 'react';
import { api, type Loja, type Plano, type Mensalista, type Cliente } from './api';
import { Janela, Campo, Aviso, Vazio } from './ui';
import { brl, linkWhatsApp } from './util';
import CobrarPix from './CobrarPix';

const STATUS: Record<Mensalista['status'], { rotulo: string; chip: string }> = {
  ativo: { rotulo: 'Ativo', chip: 'ok' },
  pausado: { rotulo: 'Pausado', chip: 'atencao' },
  cancelado: { rotulo: 'Cancelado', chip: 'neutro' },
};
const msgCobranca = (m: Mensalista) =>
  `Oi, ${m.cliente.split(' ')[0]}! Passando pra lembrar da mensalidade do seu plano ${m.plano} (${brl(m.preco_mensal)}), vencimento dia ${m.dia_vencimento}. Qualquer dúvida é só chamar! 🚗`;

export default function Mensalistas({ loja }: { loja: Loja }) {
  const lojaId = loja.id;
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [lista, setLista] = useState<Mensalista[] | null>(null);
  const [erro, setErro] = useState('');
  const [editPlano, setEditPlano] = useState<Plano | 'novo' | null>(null);
  const [addAssinante, setAddAssinante] = useState(false);
  const [pixAlvo, setPixAlvo] = useState<{ valor: number; descricao: string; telefone?: string | null; nome?: string | null } | null>(null);

  const carregar = () => Promise.all([api.planos(), api.mensalistas(lojaId)])
    .then(([p, m]) => { setPlanos(p); setLista(m); }).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  async function pagar(m: Mensalista) { try { await api.registrarPagamento(lojaId, m); await carregar(); } catch (e) { setErro((e as Error).message); } }
  async function status(m: Mensalista, s: Mensalista['status']) { try { await api.mudarStatusMensalista(m.id, s); await carregar(); } catch (e) { setErro((e as Error).message); } }
  async function remover(m: Mensalista) { if (!confirm(`Remover ${m.cliente} dos contratos?`)) return; try { await api.removerMensalista(m.id); await carregar(); } catch (e) { setErro((e as Error).message); } }
  async function apagarPlano(p: Plano) { if (!confirm(`Apagar o plano ${p.nome}?`)) return; try { await api.apagarPlano(p.id); await carregar(); } catch { setErro('Não dá pra apagar um plano com assinantes. Desative-o.'); } }

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!planos || !lista) return <p className="carregando">Carregando</p>;

  const ativos = lista.filter((m) => m.status === 'ativo');
  const recorrente = ativos.reduce((s, m) => s + Number(m.preco_mensal), 0);

  return (
    <>
      <header className="cabeca">
        <div>
          <h1>Contratos</h1>
          <p>{ativos.length === 0 ? 'Crie planos de manutenção para frotas e clientes fixos e tenha receita recorrente.'
            : <>{ativos.length} {ativos.length === 1 ? 'assinante ativo' : 'assinantes ativos'}, <b>{brl(recorrente)}</b> por mês</>}</p>
        </div>
        <button type="button" className="btn btn-primario" onClick={() => setAddAssinante(true)} disabled={planos.filter((p) => p.ativo).length === 0}>Novo assinante</button>
      </header>

      {/* Planos */}
      <section className="bloco">
        <div className="bloco-topo">
          <h2>Planos</h2>
          <button type="button" className="btn btn-secundario" onClick={() => setEditPlano('novo')}>Novo plano</button>
        </div>
        {planos.length === 0 ? (
          <p className="dica">Nenhum plano ainda. Exemplo: “Frota leve: 2 revisões por mês, R$ 480”.</p>
        ) : (
          <ul className="planos">
            {planos.map((p) => (
              <li key={p.id} className={`plano${p.ativo ? '' : ' plano-inativo'}`}>
                <div>
                  <strong>{p.nome}</strong>
                  <span>{p.servicos_mes ? `${p.servicos_mes} serviços/mês` : 'Serviços ilimitados'}{p.ativo ? '' : ' · inativo'}</span>
                </div>
                <div className="plano-preco">{brl(p.preco_mensal)}<small>/mês</small></div>
                <div className="plano-acoes">
                  <button type="button" className="link" onClick={() => setEditPlano(p)}>Editar</button>
                  <button type="button" className="link" onClick={() => apagarPlano(p)}>Apagar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Assinantes */}
      {lista.length === 0 ? (
        <Vazio titulo="Nenhum contrato ainda">
          <p>Depois de criar um plano, cadastre as empresas e clientes que pagam mensalidade. O uso do mês é contado automático pelos atendimentos.</p>
        </Vazio>
      ) : (
        <ul className="mensalistas">
          {lista.map((m) => {
            const st = STATUS[m.status];
            return (
              <li key={m.id} className="mensalista">
                <div className="quem">
                  <a href={`#/clientes/${m.cliente_id}`}>{m.cliente}</a>
                  {(m.veiculo || m.placa) && <span className="carro">{m.veiculo}{m.placa && <span className="placa">{m.placa}</span>}</span>}
                  <span className="mensalista-plano">{m.plano} · {brl(m.preco_mensal)}/mês · vence dia {m.dia_vencimento}</span>
                  <span className={`chip chip-${st.chip}`}>{st.rotulo}</span>
                </div>
                <div className="mensalista-uso">
                  <b>{m.servicos_mes ? `${m.usados}/${m.servicos_mes}` : m.usados}</b>
                  <small>{m.servicos_mes ? 'serviços no mês' : 'serviços (ilimitado)'}</small>
                  <span className={`chip chip-${m.pago ? 'ok' : 'atencao'}`}>{m.pago ? 'Pago este mês' : 'Pagamento em aberto'}</span>
                </div>
                <div className="mensalista-acoes">
                  {!m.pago && m.status !== 'cancelado' && <button type="button" className="btn btn-primario" onClick={() => pagar(m)}>Registrar pagamento</button>}
                  {loja.pix_chave && m.status !== 'cancelado' && <button type="button" className="btn btn-secundario" onClick={() => setPixAlvo({ valor: Number(m.preco_mensal), descricao: `Mensalidade ${m.plano}`, telefone: m.telefone, nome: m.cliente })}>Pix</button>}
                  {m.telefone && <button type="button" className="btn btn-secundario" onClick={() => window.open(linkWhatsApp(m.telefone!, msgCobranca(m)), '_blank', 'noopener')}>Cobrar no WhatsApp</button>}
                  <details className="mensalista-mais">
                    <summary aria-label="Mais opções">⋯</summary>
                    <div className="gaveta-mini">
                      {m.status !== 'ativo' && <button type="button" onClick={() => status(m, 'ativo')}>Reativar</button>}
                      {m.status === 'ativo' && <button type="button" onClick={() => status(m, 'pausado')}>Pausar</button>}
                      {m.status !== 'cancelado' && <button type="button" onClick={() => status(m, 'cancelado')}>Cancelar</button>}
                      <button type="button" onClick={() => remover(m)}>Remover</button>
                    </div>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Janela titulo={editPlano === 'novo' ? 'Novo plano' : 'Editar plano'} aberta={!!editPlano} aoFechar={() => setEditPlano(null)}>
        {editPlano && <FormPlano lojaId={lojaId} inicial={editPlano === 'novo' ? null : editPlano} aoSalvar={() => { setEditPlano(null); carregar(); }} />}
      </Janela>
      <Janela titulo="Novo assinante" aberta={addAssinante} aoFechar={() => setAddAssinante(false)}>
        <FormAssinante lojaId={lojaId} planos={planos.filter((p) => p.ativo)} aoSalvar={() => { setAddAssinante(false); carregar(); }} />
      </Janela>
      <CobrarPix loja={loja} alvo={pixAlvo} aoFechar={() => setPixAlvo(null)} />
    </>
  );
}

function FormPlano({ lojaId, inicial, aoSalvar }: { lojaId: string; inicial: Plano | null; aoSalvar: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [preco, setPreco] = useState(inicial ? String(Number(inicial.preco_mensal)) : '');
  const [ilimitado, setIlimitado] = useState(inicial ? inicial.servicos_mes === null : false);
  const [servicosMes, setServicosMes] = useState(inicial?.servicos_mes ? String(inicial.servicos_mes) : '');
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);
  const [erro, setErro] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setErro('Dê um nome ao plano.'); return; }
    try {
      await api.salvarPlano(lojaId, { id: inicial?.id, nome: nome.trim(), preco_mensal: Number(preco) || 0,
        servicos_mes: ilimitado ? null : Number(servicosMes) || 0, ativo });
      aoSalvar();
    } catch (e) { setErro((e as Error).message); }
  }
  return (
    <form onSubmit={enviar} className="form-grade">
      {erro && <Aviso>{erro}</Aviso>}
      <Campo rotulo="Nome do plano"><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Plano Básico" autoFocus /></Campo>
      <div className="form-dupla">
        <Campo rotulo="Preço mensal (R$)"><input value={preco} onChange={(e) => setPreco(e.target.value)} inputMode="decimal" placeholder="0,00" /></Campo>
        <Campo rotulo="Serviços por mês"><input value={servicosMes} onChange={(e) => setServicosMes(e.target.value)} inputMode="numeric" placeholder="Ex.: 4" disabled={ilimitado} /></Campo>
      </div>
      <label className="check"><input type="checkbox" checked={ilimitado} onChange={(e) => setIlimitado(e.target.checked)} /> Serviços ilimitados</label>
      <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Plano ativo (disponível para novos assinantes)</label>
      <div className="acoes"><button type="submit" className="btn btn-primario">Salvar plano</button></div>
    </form>
  );
}

function FormAssinante({ lojaId, planos, aoSalvar }: { lojaId: string; planos: Plano[]; aoSalvar: () => void }) {
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [planoId, setPlanoId] = useState(planos[0]?.id ?? '');
  const [dia, setDia] = useState('10');
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (cliente || busca.trim().length < 2) { setAchados([]); return; }
    const t = setTimeout(() => api.clientes(busca).then((l) => setAchados(l.slice(0, 6))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [busca, cliente]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!cliente) { setErro('Escolha um cliente cadastrado.'); return; }
    if (!planoId) { setErro('Escolha um plano.'); return; }
    try {
      await api.adicionarMensalista(lojaId, { cliente_id: cliente.id, plano_id: planoId, dia_vencimento: Math.min(28, Math.max(1, Number(dia) || 10)) });
      aoSalvar();
    } catch (e) { setErro((e as Error).message); }
  }
  return (
    <form onSubmit={enviar} className="form-grade">
      {erro && <Aviso>{erro}</Aviso>}
      {!cliente ? (
        <Campo rotulo="Cliente" dica="Busque por nome, telefone ou placa">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: João, 41999..., ABC1D23" autoFocus />
        </Campo>
      ) : (
        <div className="patio-escolhido">
          <span><strong>{cliente.nome}</strong>{cliente.veiculo ? ` · ${cliente.veiculo}` : ''}</span>
          <button type="button" className="btn btn-secundario" onClick={() => setCliente(null)}>Trocar</button>
        </div>
      )}
      {achados.length > 0 && (
        <ul className="patio-achados">
          {achados.map((c) => (
            <li key={c.id}><button type="button" onClick={() => { setCliente(c); setBusca(''); setAchados([]); }}>
              <strong>{c.nome}</strong>{(c.veiculo || c.placa) && <span>{c.veiculo}{c.placa ? ` · ${c.placa}` : ''}</span>}
            </button></li>
          ))}
        </ul>
      )}
      <div className="form-dupla">
        <Campo rotulo="Plano">
          <select value={planoId} onChange={(e) => setPlanoId(e.target.value)}>
            {planos.map((p) => <option key={p.id} value={p.id}>{p.nome} — {brl(p.preco_mensal)}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Vence todo dia"><input value={dia} onChange={(e) => setDia(e.target.value)} inputMode="numeric" placeholder="10" /></Campo>
      </div>
      <div className="acoes"><button type="submit" className="btn btn-primario">Cadastrar contrato</button></div>
    </form>
  );
}
