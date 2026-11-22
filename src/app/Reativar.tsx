import { useEffect, useState } from 'react';
import { api, type Sumida, type Modelo, type Carro } from './api';
import { Aviso, Vazio, JanelaMensagem } from './ui';
import { brl, dataBR, tempo, preencher, linkWhatsApp, diasDesde } from './util';

const FAIXAS = [{ dias: 240, nome: '8 meses ou mais' }, { dias: 365, nome: '1 ano ou mais' }, { dias: 540, nome: '1 ano e meio ou mais' }];
const PADRAO = 'Oi, {nome}! Faz {tempo} que seu carro não passa por aqui. Quer que eu reserve um horário para uma checagem?';

/** Quem já veio, gastou e sumiu. Ordenada por quanto já deixou na empresa: quem mais vale a pena chamar primeiro. */
export default function Reativar({ lojaId }: { lojaId: string }) {
  const [lista, setLista] = useState<Sumida[] | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [faixa, setFaixa] = useState(240);
  const [alvo, setAlvo] = useState<Sumida | null>(null);
  const [erro, setErro] = useState('');

  const [carros, setCarros] = useState<Record<string, Carro>>({});
  const carregar = () => api.sumidas().then((l) => { setLista(l); api.carros(l.map((s) => s.cliente_id)).then(setCarros).catch(() => {}); }).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); api.modelos().then(setModelos).catch(() => {}); }, []);

  async function enviar(texto: string) {
    if (!alvo) return;
    window.open(linkWhatsApp(alvo.telefone, texto), '_blank', 'noopener');
    try { await api.registrarContato(lojaId, alvo.cliente_id, 'Mensagem de reativação'); setAlvo(null); await carregar(); }
    catch (e) { setErro((e as Error).message); }
  }

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!lista) return <p className="carregando">Carregando</p>;
  const visiveis = lista.filter((s) => s.dias >= faixa);
  const total = visiveis.reduce((t, s) => t + Number(s.total), 0);
  const modelo = modelos.find((m) => m.titulo === 'Reativação')?.texto ?? PADRAO;

  return (
    <>
      <header className="cabeca">
        <div>
          <h1>Reativação</h1>
          <p>{visiveis.length === 0 ? 'Ninguém nesta faixa.'
            : <>{visiveis.length} {visiveis.length === 1 ? 'cliente sumido' : 'clientes sumidos'}, que já {visiveis.length === 1 ? 'deixou' : 'deixaram'} <b>{brl(total)}</b> na empresa</>}</p>
        </div>
      </header>

      <div className="pilulas periodos" role="group" aria-label="Tempo sem voltar">
        {FAIXAS.map((f) => <button key={f.dias} type="button" aria-pressed={faixa === f.dias} onClick={() => setFaixa(f.dias)}>{f.nome}</button>)}
      </div>

      {visiveis.length === 0 ? (
        <Vazio titulo="Nenhum cliente sumido">
          <p>Aqui aparece quem já fez serviço e está há {FAIXAS.find((f) => f.dias === faixa)!.nome.replace(' ou mais', '')} ou mais sem voltar.</p>
        </Vazio>
      ) : (
        <ul className="lista-hoje">
          {visiveis.map((s) => {
            const chamada = s.ultimo_contato_em && diasDesde(s.ultimo_contato_em) <= 30;
            return (
              <li key={s.cliente_id} className="item-hoje item-sumida">
                <span className="inicial" aria-hidden="true">{s.nome[0]?.toUpperCase()}</span>
                <div className="quem">
                  <a href={`#/clientes/${s.cliente_id}`}>{s.nome}</a>
                  {carros[s.cliente_id]?.veiculo || carros[s.cliente_id]?.placa ? <span className="carro">{carros[s.cliente_id].veiculo}{carros[s.cliente_id].placa && <span className="placa">{carros[s.cliente_id].placa}</span>}</span> : null}
                  <span>Última visita há {tempo(s.dias)}: {s.servico_nome}</span>
                  <span>{s.visitas} {s.visitas === 1 ? 'visita' : 'visitas'} no total</span>
                  {chamada && <span className="chip chip-ok">Chamado em {dataBR(s.ultimo_contato_em!)}</span>}
                </div>
                <div className="valor">{brl(s.total)}</div>
                <button type="button" className="btn btn-secundario" onClick={() => setAlvo(s)}>Chamar no WhatsApp</button>
              </li>
            );
          })}
        </ul>
      )}

      <JanelaMensagem aberta={!!alvo} nome={alvo?.nome ?? ''} aoFechar={() => setAlvo(null)} aoEnviar={enviar}
        inicial={alvo ? preencher(modelo, { nome: alvo.nome, servico: alvo.servico_nome, dias: alvo.dias }) : ''} />
    </>
  );
}
