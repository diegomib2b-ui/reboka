import { useEffect, useState, type FormEvent } from 'react';
import { api, type Loja, type Cartao, type Cliente } from './api';
import { Aviso, Vazio, Janela, Campo } from './ui';
import { linkWhatsApp } from './util';

export default function Fidelidade({ loja, aoMudar }: { loja: Loja; aoMudar: () => void }) {
  const [lista, setLista] = useState<Cartao[] | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [meta, setMeta] = useState(String(loja.fidelidade_meta));
  const [premio, setPremio] = useState(loja.fidelidade_premio);
  const [addAberto, setAddAberto] = useState(false);

  const carregar = () => api.fidelidade(loja.id).then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);
  useEffect(() => { setMeta(String(loja.fidelidade_meta)); setPremio(loja.fidelidade_premio); }, [loja.fidelidade_meta, loja.fidelidade_premio]);

  async function salvar(campos: Partial<Loja>) {
    setSalvando(true); setErro('');
    try { await api.salvarFidelidadeConfig(loja.id, campos as never); aoMudar(); } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  async function resgatar(c: Cartao) {
    if (!confirm(`Resgatar "${loja.fidelidade_premio}" para ${c.cliente}?`)) return;
    try { await api.resgatarFidelidade(loja.id, c.cliente_id, loja.fidelidade_meta); await carregar(); } catch (e) { setErro((e as Error).message); }
  }
  async function maisUmSelo(c: Cartao) { try { await api.marcarSelo(loja.id, c.cliente_id); await carregar(); } catch (e) { setErro((e as Error).message); } }

  return (
    <>
      <header className="cabeca">
        <div><h1>Fidelidade</h1><p>Cada serviço vira um selo. Ao completar o cartão, o cliente ganha o prêmio e volta mais.</p></div>
        <button type="button" className="btn btn-primario" onClick={() => setAddAberto(true)} disabled={!loja.fidelidade_ativo}>Dar selo</button>
      </header>

      {erro && <Aviso>{erro}</Aviso>}

      <section className="bloco">
        <div className="bloco-topo">
          <h2>Programa de selos</h2>
          <label className="alterna-check">
            <input type="checkbox" checked={loja.fidelidade_ativo} disabled={salvando} onChange={(e) => salvar({ fidelidade_ativo: e.target.checked })} />
            <span>{loja.fidelidade_ativo ? 'Ativo' : 'Desativado'}</span>
          </label>
        </div>
        {loja.fidelidade_ativo ? (
          <>
            <div className="fid-cfg">
              <label>Selos para o prêmio <input value={meta} onChange={(e) => setMeta(e.target.value)} inputMode="numeric" /></label>
              <label className="fid-premio">Prêmio <input value={premio} onChange={(e) => setPremio(e.target.value)} /></label>
              <button type="button" className="btn btn-secundario" disabled={salvando}
                onClick={() => salvar({ fidelidade_meta: Math.max(2, Number(meta) || 10), fidelidade_premio: premio.trim() || 'Um serviço grátis' })}>Salvar</button>
            </div>
            <p className="dica">Ao entregar um carro no pátio, o cliente já ganha o selo automaticamente. Use “Dar selo” para serviços feitas fora do pátio.</p>
          </>
        ) : (
          <p className="dica">Ative para acumular selos a cada serviço. Exemplo: “A cada 10 serviços, o próximo sai grátis”.</p>
        )}
      </section>

      <h2 className="secao-titulo">Cartões</h2>
      {!lista ? <p className="carregando">Carregando</p> : lista.length === 0 ? (
        <Vazio titulo="Nenhum selo ainda"><p>Conforme os clientes voltam, os cartões aparecem aqui com o progresso até o prêmio.</p></Vazio>
      ) : (
        <ul className="fid-lista">
          {lista.map((c) => {
            const completo = c.selos >= loja.fidelidade_meta;
            return (
              <li key={c.cliente_id} className={`fid-card${completo ? ' fid-completo' : ''}`}>
                <div className="quem">
                  <a href={`#/clientes/${c.cliente_id}`}>{c.cliente}</a>
                  {(c.veiculo || c.placa) && <span className="carro">{c.veiculo}{c.placa && <span className="placa">{c.placa}</span>}</span>}
                  {c.resgates > 0 && <span className="fid-resgates">{c.resgates}× resgatado</span>}
                </div>
                <div className="fid-selos" aria-label={`${c.selos} de ${loja.fidelidade_meta} selos`}>
                  {Array.from({ length: loja.fidelidade_meta }).map((_, i) => (
                    <span key={i} className={`fid-selo${i < c.selos ? ' on' : ''}`}>{i < c.selos ? '✓' : ''}</span>
                  ))}
                </div>
                <div className="fid-acoes">
                  <span className="fid-contagem">{Math.min(c.selos, loja.fidelidade_meta)}/{loja.fidelidade_meta}</span>
                  {completo ? (
                    <button type="button" className="btn btn-primario" onClick={() => resgatar(c)}>Resgatar prêmio</button>
                  ) : (
                    <button type="button" className="btn btn-secundario" onClick={() => maisUmSelo(c)}>+ selo</button>
                  )}
                  {completo && c.telefone && <button type="button" className="btn btn-secundario" onClick={() => window.open(linkWhatsApp(c.telefone!, `Oi, ${c.cliente.split(' ')[0]}! Você completou o cartão fidelidade e ganhou: ${loja.fidelidade_premio}. 🎉 Pode resgatar na próxima visita!`), '_blank', 'noopener')}>Avisar</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Janela titulo="Dar selo" aberta={addAberto} aoFechar={() => setAddAberto(false)}>
        <FormSelo lojaId={loja.id} aoSalvar={() => { setAddAberto(false); carregar(); }} />
      </Janela>
    </>
  );
}

function FormSelo({ lojaId, aoSalvar }: { lojaId: string; aoSalvar: () => void }) {
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<Cliente[]>([]);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (busca.trim().length < 2) { setAchados([]); return; }
    const t = setTimeout(() => api.clientes(busca).then((l) => setAchados(l.slice(0, 6))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [busca]);
  async function dar(c: Cliente, e: FormEvent) {
    e.preventDefault();
    try { await api.marcarSelo(lojaId, c.id); aoSalvar(); } catch (e) { setErro((e as Error).message); }
  }
  return (
    <form className="form-grade" onSubmit={(e) => e.preventDefault()}>
      {erro && <Aviso>{erro}</Aviso>}
      <Campo rotulo="Cliente" dica="Busque por nome, telefone ou placa">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: João, 41999..., ABC1D23" autoFocus />
      </Campo>
      {achados.length > 0 && (
        <ul className="patio-achados">
          {achados.map((c) => (
            <li key={c.id}><button type="button" onClick={(e) => dar(c, e)}>
              <strong>{c.nome}</strong>{(c.veiculo || c.placa) && <span>{c.veiculo}{c.placa ? ` · ${c.placa}` : ''}</span>}
            </button></li>
          ))}
        </ul>
      )}
    </form>
  );
}
