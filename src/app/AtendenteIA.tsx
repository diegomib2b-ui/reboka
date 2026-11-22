import { useEffect, useRef, useState } from 'react';
import { api, whatsapp, type Loja, type WaMensagem } from './api';
import { Aviso, Upsell } from './ui';
import { dataBR } from './util';

export default function AtendenteIA({ loja, aoMudar }: { loja: Loja; aoMudar: () => void }) {
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [persona, setPersona] = useState(loja.wa_persona ?? '');
  const [conectado, setConectado] = useState<boolean | null>(null);
  const [qr, setQr] = useState('');
  const [conectando, setConectando] = useState(false);
  const [msgs, setMsgs] = useState<WaMensagem[] | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => { setPersona(loja.wa_persona ?? ''); }, [loja.wa_persona]);
  useEffect(() => {
    whatsapp.status().then((s) => setConectado(s.conectado)).catch(() => setConectado(false));
    whatsapp.mensagens(loja.id).then(setMsgs).catch(() => setMsgs([]));
    return () => clearInterval(timer.current);
  }, [loja.id]);

  async function salvar(campos: Partial<Loja>) {
    setSalvando(true); setErro('');
    try { await whatsapp.salvarConfig(loja.id, campos as never); aoMudar(); } catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  async function conectar() {
    setConectando(true); setErro('');
    try {
      const r = await whatsapp.conectar();
      setQr(r.qr ?? '');
      // Verifica a conexão a cada 4s; quando parear, some o QR.
      clearInterval(timer.current);
      timer.current = setInterval(async () => {
        const s = await whatsapp.status().catch(() => ({ conectado: false }));
        if (s.conectado) { setConectado(true); setQr(''); clearInterval(timer.current); }
      }, 4000);
    } catch (e) { setErro((e as Error).message); } finally { setConectando(false); }
  }

  const conversas = agrupar(msgs ?? []);

  // Recurso exclusivo do plano Pro IA.
  if (loja.plano !== 'pro_ia') return (
    <>
      <header className="cabeca"><div><h1>Atendente IA</h1><p>Uma IA responde seus clientes no WhatsApp, agenda serviços e avisa quando o carro está pronto.</p></div></header>
      <Upsell
        titulo="Deixe a IA atender por você"
        subtitulo="No plano Pro IA, uma inteligência responde preços e horários, agenda sozinha e avisa quando o carro fica pronto — tudo pelo WhatsApp, 24h."
        itens={['Responde e agenda 24h, sem você digitar', 'Aviso automático de carro pronto', 'Lembrete de retorno pela própria IA']}
        cta="Conhecer o plano Pro IA"
        href="#/conta" />
    </>
  );

  return (
    <>
      <header className="cabeca">
        <div><h1>Atendente IA</h1><p>Uma IA responde seus clientes no WhatsApp, agenda serviços e avisa quando o carro está pronto.</p></div>
        <label className="alterna-check">
          <input type="checkbox" checked={loja.wa_ativo} disabled={salvando} onChange={(e) => salvar({ wa_ativo: e.target.checked })} />
          <span>{loja.wa_ativo ? 'Ativo' : 'Desativado'}</span>
        </label>
      </header>

      {erro && <Aviso>{erro}</Aviso>}

      {/* Conexão */}
      <section className="bloco">
        <div className="bloco-topo"><h2>Conexão do WhatsApp</h2>
          <span className={`chip chip-${conectado ? 'ok' : 'atencao'}`}>{conectado == null ? '...' : conectado ? 'Conectado' : 'Desconectado'}</span>
        </div>
        {conectado ? (
          <p className="dica">WhatsApp conectado{loja.wa_numero ? '' : ''}. A IA já responde quando o atendimento está ativo.</p>
        ) : qr ? (
          <div className="ia-qr">
            <img src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`} alt="QR Code" width={220} height={220} />
            <p className="dica">No WhatsApp do número da empresa: Aparelhos conectados → Conectar aparelho → escaneie este código.</p>
          </div>
        ) : (
          <>
            <p className="dica">Use um número <b>dedicado</b> à empresa (não o seu pessoal). Clique para gerar o QR e parear.</p>
            <button type="button" className="btn btn-primario" onClick={conectar} disabled={conectando}>{conectando ? 'Gerando…' : 'Conectar WhatsApp'}</button>
          </>
        )}
      </section>

      {/* Comportamento */}
      <section className="bloco">
        <div className="bloco-topo"><h2>Como a IA atende</h2></div>
        <label className="check"><input type="checkbox" checked={loja.wa_proativo_retorno} disabled={salvando} onChange={(e) => salvar({ wa_proativo_retorno: e.target.checked })} /> Lembrar clientes de voltar (retorno vencido), todo dia de manhã</label>
        <label className="check"><input type="checkbox" checked={loja.wa_proativo_pronto} disabled={salvando} onChange={(e) => salvar({ wa_proativo_pronto: e.target.checked })} /> Avisar automático quando o carro fica pronto no pátio</label>
        <label className="campo" style={{ marginTop: 14 }}>
          <span>Instruções para a IA <small>tom, regras, o que pode ou não oferecer</small></span>
          <textarea rows={4} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="Ex.: Seja bem informal. Não dê desconto. Horário de pico é sábado de manhã, evite marcar nesse horário." />
        </label>
        <div className="acoes"><button type="button" className="btn btn-secundario" onClick={() => salvar({ wa_persona: persona.trim() || null })} disabled={salvando}>Salvar instruções</button></div>
      </section>

      {/* Conversas */}
      <h2 className="secao-titulo">Conversas recentes</h2>
      {!msgs ? <p className="carregando">Carregando</p> : conversas.length === 0 ? (
        <p className="dica">Nenhuma conversa ainda. Quando um cliente mandar mensagem no WhatsApp conectado, aparece aqui.</p>
      ) : (
        <ul className="ia-conversas">
          {conversas.map((c) => (
            <li key={c.telefone} className="ia-conversa">
              <div className="ia-conversa-topo"><strong>{c.nome || c.telefone}</strong><span>{dataBR(c.ultima)}</span></div>
              <div className="ia-bolhas">
                {c.mensagens.slice(-4).map((m) => (
                  <span key={m.id} className={`ia-bolha ia-${m.direcao}`}>{m.texto}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function agrupar(msgs: WaMensagem[]) {
  const map = new Map<string, { telefone: string; nome: string | null; ultima: string; mensagens: WaMensagem[] }>();
  for (const m of [...msgs].reverse()) {
    const g = map.get(m.telefone) ?? { telefone: m.telefone, nome: m.nome, ultima: m.criado_em, mensagens: [] };
    g.mensagens.push(m); g.ultima = m.criado_em; if (m.nome) g.nome = m.nome;
    map.set(m.telefone, g);
  }
  return [...map.values()].sort((a, b) => b.ultima.localeCompare(a.ultima)).slice(0, 20);
}
