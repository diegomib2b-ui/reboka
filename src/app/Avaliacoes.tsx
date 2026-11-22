import { useEffect, useState } from 'react';
import { api, type Loja, type Avaliacao } from './api';
import { Aviso, Vazio } from './ui';
import { dataBR } from './util';

const slugify = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
const Estrelas = ({ n }: { n: number }) => <span className="av-nota">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? 'on' : ''}>★</span>)}</span>;

export default function Avaliacoes({ loja, aoMudar }: { loja: Loja; aoMudar: () => void }) {
  const [lista, setLista] = useState<Avaliacao[] | null>(null);
  const [url, setUrl] = useState(loja.google_review_url ?? '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => { api.avaliacoes().then(setLista).catch((e) => setErro(e.message)); }, []);
  useEffect(() => { setUrl(loja.google_review_url ?? ''); }, [loja.google_review_url]);

  const link = loja.slug ? `${location.origin}/avaliar/?l=${loja.slug}` : '';

  async function salvar(campos: Partial<Loja>) {
    setSalvando(true); setErro('');
    try { await api.salvarAvaliacaoConfig(loja.id, campos as never); aoMudar(); } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  async function ativar() {
    const slug = loja.slug || `${slugify(loja.nome)}-${Math.random().toString(36).slice(2, 6)}`;
    await salvar({ avaliar_ativo: true, slug });
  }
  function copiar() { navigator.clipboard?.writeText(link).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); }).catch(() => {}); }

  const media = lista && lista.length ? lista.reduce((s, a) => s + a.nota, 0) / lista.length : 0;

  return (
    <>
      <header className="cabeca">
        <div><h1>Avaliações</h1><p>Peça a nota após o serviço. Cliente satisfeito vai pro Google; insatisfeito vira feedback só pra você.</p></div>
      </header>

      {erro && <Aviso>{erro}</Aviso>}

      <section className="bloco">
        <div className="bloco-topo">
          <h2>Pedir avaliação</h2>
          <label className="alterna-check">
            <input type="checkbox" checked={loja.avaliar_ativo} disabled={salvando}
              onChange={(e) => (e.target.checked ? ativar() : salvar({ avaliar_ativo: false }))} />
            <span>{loja.avaliar_ativo ? 'Ativo' : 'Desativado'}</span>
          </label>
        </div>

        {loja.avaliar_ativo ? (
          <>
            <div className="ag-link">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-primario" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar link'}</button>
            </div>
            <p className="dica">Mande esse link no WhatsApp após entregar o carro, ou deixe um QR Code na recepção.</p>
            <div className="ag-config">
              <div>
                <h3>Link do seu Google (para onde mandar as notas altas)</h3>
                <div className="ag-link">
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://g.page/r/..." />
                  <button type="button" className="btn btn-secundario" onClick={() => salvar({ google_review_url: url.trim() || null })} disabled={salvando}>Salvar</button>
                </div>
                <p className="dica">No Google Meu Negócio, copie o link “Pedir avaliações”. Notas 4-5 abrem o Google; notas 1-3 ficam só aqui.</p>
              </div>
            </div>
          </>
        ) : (
          <p className="dica">Ative para gerar um link de avaliação. As notas altas vão pro seu Google; as baixas viram feedback interno, sem exposição pública.</p>
        )}
      </section>

      {lista && lista.length > 0 && (
        <div className="av-resumo">
          <div className="av-media"><b>{media.toFixed(1)}</b><Estrelas n={Math.round(media)} /></div>
          <span>{lista.length} {lista.length === 1 ? 'avaliação' : 'avaliações'}</span>
        </div>
      )}

      <h2 className="secao-titulo">Últimas avaliações</h2>
      {!lista ? <p className="carregando">Carregando</p> : lista.length === 0 ? (
        <Vazio titulo="Nenhuma avaliação ainda"><p>Quando um cliente avaliar pelo link, a nota e o comentário aparecem aqui.</p></Vazio>
      ) : (
        <ul className="av-lista">
          {lista.map((a) => (
            <li key={a.id} className={`av-item${a.nota <= 3 ? ' av-baixa' : ''}`}>
              <div className="av-cab"><Estrelas n={a.nota} /><span className="av-data">{a.nome ? `${a.nome} · ` : ''}{dataBR(a.criado_em)}</span></div>
              {a.comentario && <p className="av-coment">{a.comentario}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
