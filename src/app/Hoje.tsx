import { useEffect, useState } from 'react';
import { api, type ItemHoje, type Modelo } from './api';
import { MODELOS_PADRAO } from './Mensagens';
import { Anel, Janela, Aviso, Vazio, SkLista } from './ui';
import { brl, preencher, linkWhatsApp, diasDesde, fraseCiclo } from './util';

export const INFO: Record<ItemHoje['motivo'], { modelo: string; chip: string; texto: (i: ItemHoje) => string; cor: string }> = {
  retorno_vencido: { modelo: 'Retorno de serviço', chip: 'vencido', cor: 'var(--marca)',
    texto: (i) => (i.dias === 0 ? 'Retorno vence hoje' : `Retorno venceu há ${i.dias} ${i.dias === 1 ? 'dia' : 'dias'}`) + (i.por_km ? ', pela quilometragem' : '') },
  orcamento_parado: { modelo: 'Orçamento sem resposta', chip: 'atencao', cor: 'var(--ambar)',
    texto: (i) => `Orçamento parado há ${i.dias} dias` },
  pacote_atrasado: { modelo: 'Pacote em aberto', chip: 'atencao', cor: 'var(--ambar)',
    texto: (i) => (i.dias === 0 ? 'Próxima etapa do plano vence hoje' : `Etapa do plano atrasada há ${i.dias} ${i.dias === 1 ? 'dia' : 'dias'}`) },
  novo_sem_resposta: { modelo: 'Contato novo', chip: 'ok', cor: 'var(--marca)',
    texto: (i) => (i.dias === 0 ? 'Contato novo de hoje' : `Contato novo há ${i.dias} ${i.dias === 1 ? 'dia' : 'dias'}`) },
  pos_servico: { modelo: 'Pós-serviço', chip: 'ok', cor: 'var(--marca)',
    texto: (i) => `Pós-serviço: atendido há ${i.dias} dias` },
  itens_recusados: { modelo: 'Itens do orçamento para depois', chip: 'atencao', cor: 'var(--ambar)',
    texto: (i) => `Deixou itens do orçamento para depois há ${i.dias} dias` },
};

export function mensagemPara(i: ItemHoje, modelos: Modelo[], linkAvaliar = '') {
  const titulo = INFO[i.motivo].modelo;
  const m = modelos.find((x) => x.titulo === titulo)?.texto ?? MODELOS_PADRAO.find((x) => x.titulo === titulo)?.texto ?? '';
  const texto = preencher(m, { nome: i.cliente, servico: i.servico, dias: diasDesde(i.referencia) });
  // No pós-serviço, o link de avaliação vai junto quando a empresa tem a avaliação ligada.
  return i.motivo === 'pos_servico' && linkAvaliar ? `${texto} Se puder, conta pra gente como foi: ${linkAvaliar}` : texto;
}

export default function Hoje({ lojaId, euId }: { lojaId: string; euId: string }) {
  const [minhas, setMinhas] = useState<string[]>([]);
  const [soMinhas, setSoMinhas] = useState(false);
  const [itens, setItens] = useState<ItemHoje[] | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [erro, setErro] = useState('');
  const [alvo, setAlvo] = useState<ItemHoje | null>(null);
  const [texto, setTexto] = useState('');

  const carregar = () => Promise.all([api.hoje(), api.modelos()])
    .then(([h, m]) => { setItens(h); setModelos(m); }).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); api.minhasClientes(euId).then(setMinhas).catch(() => {}); }, []);

  function abrir(i: ItemHoje) { setAlvo(i); setTexto(mensagemPara(i, modelos)); }

  async function enviar() {
    if (!alvo) return;
    // Abre o WhatsApp da empresa com o texto pronto. Quem envia é a pessoa, não o sistema.
    window.open(linkWhatsApp(alvo.telefone, texto), '_blank', 'noopener');
    try {
      await api.registrarContato(lojaId, alvo.cliente_id, INFO[alvo.motivo].texto(alvo));
      setAlvo(null);
      await carregar();
    } catch (e) { setErro((e as Error).message); }
  }

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!itens) return (
    <>
      <header className="cabeca"><div><h1>Hoje</h1><p>Carregando sua lista…</p></div></header>
      <SkLista />
    </>
  );
  const visiveis = soMinhas ? itens.filter((i) => minhas.includes(i.cliente_id)) : itens;
  const total = visiveis.reduce((s, i) => s + Number(i.valor_estimado), 0);

  return (
    <>
      <header className="cabeca">
        <div>
          <h1>Hoje</h1>
          <p>{visiveis.length === 0 ? 'Nenhum cliente para chamar agora.'
            : <>{visiveis.length} {visiveis.length === 1 ? 'cliente' : 'clientes'} para chamar, <b>{brl(total)}</b> em aberto</>}</p>
        </div>
      </header>

      {minhas.length > 0 && itens.length > 0 && (
        <div className="pilulas periodos" role="group" aria-label="Filtro">
          <button type="button" aria-pressed={!soMinhas} onClick={() => setSoMinhas(false)}>Todas</button>
          <button type="button" aria-pressed={soMinhas} onClick={() => setSoMinhas(true)}>Só as minhas</button>
        </div>
      )}

      {visiveis.length === 0 && itens.length > 0 ? (
        <Vazio titulo="Seus clientes estão em dia"><p>Nenhum cliente sob sua responsabilidade para chamar agora.</p></Vazio>
      ) : itens.length === 0 ? (
        <Vazio titulo="Lista em dia">
          <p>Quando um retorno vencer ou um orçamento ficar parado, o cliente aparece aqui.</p>
          <p><a className="btn btn-secundario" href="#/clientes">Cadastrar cliente</a> <a className="btn btn-secundario" href="#/teste">Usar dados de exemplo</a></p>
        </Vazio>
      ) : (
        <ul className="lista-hoje">
          {visiveis.map((i) => {
            const info = INFO[i.motivo];
            const vencido = i.motivo === 'retorno_vencido';
            const pct = vencido ? 1 : i.motivo === 'orcamento_parado' ? Math.min(i.dias / 7, 0.9) : i.motivo === 'pacote_atrasado' ? 0.6 : 0.08;
            return (
              <li key={i.cliente_id + i.motivo + i.servico + (i.veiculo_id ?? '')} className="item-hoje">
                <Anel pct={pct} cor={info.cor} vencido={vencido} rotulo={info.texto(i)} />
                <div className="quem">
                  <a href={`#/clientes/${i.cliente_id}`}>{i.cliente}</a>
                  {i.veiculo || i.placa ? <span className="carro">{i.veiculo}{i.placa && <span className="placa">{i.placa}</span>}</span> : null}
                  <span>{i.servico ?? 'Sem serviço definido'}{i.ciclo_dias || i.ciclo_km ? `, a cada ${fraseCiclo(i.ciclo_dias, i.ciclo_km)}` : ''}</span>
                  <span className={`chip chip-${info.chip}`}>{info.texto(i)}</span>
                </div>
                <div className="valor">{brl(i.valor_estimado)}</div>
                <button type="button" className="btn btn-wpp" onClick={() => abrir(i)}>Chamar no WhatsApp</button>
              </li>
            );
          })}
        </ul>
      )}

      <Janela titulo={alvo ? `Mensagem para ${alvo.cliente.split(' ')[0]}` : ''} aberta={!!alvo} aoFechar={() => setAlvo(null)}>
        <label className="campo">
          <span>Revise antes de enviar</span>
          <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
        <p className="dica">Vai abrir o WhatsApp com este texto. O contato fica registrado na ficha e o cliente sai da lista por 3 dias.</p>
        <div className="acoes">
          <button type="button" className="btn btn-secundario" onClick={() => setAlvo(null)}>Cancelar</button>
          <button type="button" className="btn btn-wpp" onClick={enviar}>Abrir WhatsApp</button>
        </div>
      </Janela>
    </>
  );
}
