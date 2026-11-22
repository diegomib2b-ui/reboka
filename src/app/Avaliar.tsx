import { useEffect, useState } from 'react';
import { api, type AvaliarInfo } from './api';
import { LogoMarca } from './ui';

function Estrelas({ nota, onPick, grande }: { nota: number; onPick?: (n: number) => void; grande?: boolean }) {
  return (
    <div className={`av-estrelas${grande ? ' av-grande' : ''}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        onPick
          ? <button key={n} type="button" aria-label={`${n} estrelas`} className={n <= nota ? 'on' : ''} onClick={() => onPick(n)}>★</button>
          : <span key={n} className={n <= nota ? 'on' : ''}>★</span>
      ))}
    </div>
  );
}

export default function Avaliar() {
  const slug = new URLSearchParams(location.search).get('l') ?? '';
  const [info, setInfo] = useState<AvaliarInfo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState('');
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!slug) { setCarregando(false); return; }
    api.avaliarInfo(slug).then(setInfo).catch(() => {}).finally(() => setCarregando(false));
  }, [slug]);

  async function enviar() {
    if (!nota) return;
    setEnviando(true); setErro('');
    try {
      const url = await api.avaliar(slug, nota, comentario, nome);
      if (url) { location.href = url; return; }  // nota alta -> Google
      setPronto(true);
    } catch (e) { setErro((e as Error).message); setEnviando(false); }
  }

  if (carregando) return <div className="ag-centro"><p>Carregando…</p></div>;
  if (!info) return <div className="ag-centro"><div className="ag-aviso"><h1>Avaliação indisponível</h1><p>Este link não está ativo.</p></div></div>;
  if (pronto) return (
    <div className="ag-centro"><div className="ag-ok">
      <div className="ag-check">✓</div>
      <h1>Obrigado pelo retorno!</h1>
      <p className="ag-sub">Sua opinião ajuda o {info.nome} a melhorar sempre.</p>
    </div></div>
  );

  const alta = nota >= 4;
  return (
    <div className="ag-pagina">
      <header className="ag-topo"><LogoMarca /><span>{info.nome}</span></header>
      <main className="ag-main av-main">
        <h1>Como foi o serviço?</h1>
        <p className="ag-sub">Toque nas estrelas para avaliar o {info.nome}.</p>
        <Estrelas nota={nota} onPick={setNota} grande />

        {nota > 0 && (
          <section className="ag-bloco">
            <h2>{alta ? 'O que você mais gostou? (opcional)' : 'O que podemos melhorar?'}</h2>
            <textarea className="av-texto" rows={4} value={comentario} onChange={(e) => setComentario(e.target.value)}
              placeholder={alta ? 'Atendimento, capricho no serviço…' : 'Conte o que não ficou bom — vamos resolver.'} />
            <label className="ag-campo" style={{ marginTop: 14 }}><span>Seu nome (opcional)</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" /></label>
            {erro && <p className="ag-erro">{erro}</p>}
            <button type="button" className="ag-confirmar" onClick={enviar} disabled={enviando}>
              {enviando ? 'Enviando…' : alta && info.google_url ? 'Avaliar no Google' : 'Enviar avaliação'}
            </button>
            {alta && info.google_url && <p className="ag-sub" style={{ textAlign: 'center', marginTop: 10 }}>Você será levado ao Google para publicar.</p>}
          </section>
        )}
      </main>
      <footer className="ag-rodape">Avaliação por <b>Reboka</b></footer>
    </div>
  );
}
