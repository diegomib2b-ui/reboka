import { useState } from 'react';
import { api, type ItemHoje, type Modelo } from './api';
import { INFO, mensagemPara } from './Hoje';
import { brl, linkWhatsApp, telefoneBR } from './util';

const iniciais = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');

/** Clientes para chamar agora (orçamento parado, contato novo, retorno vencido, etapa de pacote atrasada).
 *  É a antiga tela Hoje, dentro do sino da Agenda. */
export default function Pendencias({ lojaId, itens, modelos, linkAvaliar, aoMudar, aoAbrirFicha }: {
  lojaId: string; linkAvaliar?: string; itens: ItemHoje[]; modelos: Modelo[]; aoMudar: () => void; aoAbrirFicha: (clienteId: string) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const chave = (i: ItemHoje) => i.cliente_id + i.motivo + (i.servico ?? '') + (i.veiculo_id ?? '');
  const total = itens.reduce((s, i) => s + Number(i.valor_estimado), 0);

  function abrir(i: ItemHoje) {
    const k = chave(i);
    if (aberto === k) { setAberto(null); return; }
    setAberto(k); setTexto(mensagemPara(i, modelos, linkAvaliar)); setErro('');
  }
  async function enviar(i: ItemHoje) {
    // Abre o WhatsApp da empresa com o texto pronto. Quem envia é a pessoa, não o sistema.
    window.open(linkWhatsApp(i.telefone, texto), '_blank', 'noopener');
    try { await api.registrarContato(lojaId, i.cliente_id, INFO[i.motivo].texto(i)); setAberto(null); aoMudar(); }
    catch (e) { setErro((e as Error).message); }
  }

  if (itens.length === 0) return <p className="dica" style={{ margin: 0 }}>Ninguém para chamar agora. Orçamento parado, contato novo, pós-serviço e retorno vencido aparecem aqui.</p>;
  return (
    <>
      <p className="ret-sub"><b>{itens.length}</b> {itens.length === 1 ? 'cliente' : 'clientes'} para chamar, <b>{brl(total)}</b> em aberto</p>
      {erro && <p className="dica" role="alert" style={{ color: 'var(--vermelho, #C92A2A)' }}>{erro}</p>}
      <ul className="ret-lista">
        {itens.map((i) => {
          const info = INFO[i.motivo]; const k = chave(i);
          return (
            <li key={k} className="pend-item">
              <div className="ret-item">
                <span className="ret-ava" aria-hidden="true">{iniciais(i.cliente)}</span>
                <button type="button" className="ret-info" onClick={() => aoAbrirFicha(i.cliente_id)}>
                  <b>{i.cliente}</b>
                  <small>{i.servico ?? telefoneBR(i.telefone)}{i.veiculo ? ` · ${i.veiculo}` : ''}</small>
                  <span className={`chip chip-${info.chip} pend-chip`}>{info.texto(i)}</span>
                </button>
                <div className="ret-meta"><b>{brl(i.valor_estimado)}</b></div>
                <div className="ret-acoes">
                  <button type="button" className="ret-ag pend-chamar" aria-expanded={aberto === k} onClick={() => abrir(i)}>Chamar</button>
                </div>
              </div>
              {aberto === k && (
                <div className="pend-msg">
                  <label className="campo"><span>Revise antes de enviar</span>
                    <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
                  <div className="acoes">
                    <button type="button" className="btn btn-secundario" onClick={() => setAberto(null)}>Cancelar</button>
                    <button type="button" className="btn btn-wpp" onClick={() => enviar(i)}>Abrir WhatsApp</button>
                  </div>
                  <p className="dica">O contato fica registrado na ficha e {i.motivo === 'pos_servico' || i.motivo === 'itens_recusados' ? 'este lembrete sai da lista.' : 'o cliente sai da lista por 3 dias.'}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
