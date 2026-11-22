import { useEffect, useState, type ReactNode } from 'react';
import { api, type Resumo, type MesEvolucao, type Loja, type Ranking, type Fatia } from './api';
import { Aviso, Dica } from './ui';
import { Icone } from './icones';
import { brl, hojeISO, ROTULO_ORIGEM } from './util';
import { NOME_PAPEL } from './Equipe';

type Periodo = 'hoje' | 'mes' | '30d' | '12m' | 'tudo';
const PERIODOS: { id: Periodo; nome: string }[] = [
  { id: 'hoje', nome: 'Hoje' }, { id: 'mes', nome: 'Este mês' }, { id: '30d', nome: 'Últimos 30 dias' },
  { id: '12m', nome: 'Últimos 12 meses' }, { id: 'tudo', nome: 'Todo o período' },
];
const MOTIVOS: Record<string, string> = {
  preco: 'Achou caro', fez_em_outro_lugar: 'Fez em outro lugar', desistiu: 'Desistiu', sem_resposta: 'Parou de responder', outro: 'Outro motivo',
};

const menos = (iso: string, dias: number) => new Date(new Date(iso + 'T12:00:00').getTime() - dias * 86400000).toISOString().slice(0, 10);

/** Datas do período escolhido e do período anterior de mesmo tamanho, usado para a comparação. */
function intervalos(p: Periodo) {
  const hoje = hojeISO();
  if (p === 'hoje') return { de: hoje, ate: hoje, antes: { de: menos(hoje, 1), ate: menos(hoje, 1) }, comparado: 'ontem' };
  if (p === '30d') return { de: menos(hoje, 29), ate: hoje, antes: { de: menos(hoje, 59), ate: menos(hoje, 30) }, comparado: 'os 30 dias anteriores' };
  if (p === '12m') return { de: menos(hoje, 364), ate: hoje, antes: { de: menos(hoje, 729), ate: menos(hoje, 365) }, comparado: 'os 12 meses anteriores' };
  if (p === 'mes') {
    const [a, m, d] = hoje.split('-').map(Number);
    const mesAnt = new Date(Date.UTC(a, m - 2, 1));
    const ultimoDia = new Date(Date.UTC(a, m - 1, 0)).getUTCDate();
    const ini = mesAnt.toISOString().slice(0, 10);
    return { de: `${hoje.slice(0, 8)}01`, ate: hoje, antes: { de: ini, ate: `${ini.slice(0, 8)}${String(Math.min(d, ultimoDia)).padStart(2, '0')}` }, comparado: 'o mesmo trecho do mês passado' };
  }
  return { de: '2000-01-01', ate: hoje, antes: null, comparado: '' };
}

/** Variação contra o período anterior. `bomSubir` diz se aumento é boa notícia (em "perdidas", não é). */
function Variacao({ atual, antes, bomSubir = true }: { atual: number; antes: number | undefined; bomSubir?: boolean }) {
  if (antes === undefined || (atual === 0 && antes === 0)) return null;
  if (antes === 0) return <span className="var var-neutra">novo</span>;
  const pct = Math.round(((atual - antes) / antes) * 100);
  if (pct === 0) return <span className="var var-neutra">igual</span>;
  const subiu = pct > 0;
  return (
    <span className={`var ${subiu === bomSubir ? 'var-boa' : 'var-ruim'}`}>
      <Icone nome={subiu ? 'sobe' : 'desce'} tamanho={15} />{Math.abs(pct)}%<span className="so-leitor"> {subiu ? 'a mais' : 'a menos'}</span>
    </span>
  );
}

function Metrica({ rotulo, dica, children, variacao }: { rotulo: string; dica?: string; children: ReactNode; variacao?: ReactNode }) {
  return (
    <div className="metrica">
      <dt>{rotulo}{dica && <Dica texto={dica} />}</dt>
      <dd>{children}{variacao}</dd>
    </div>
  );
}

const mesCurto = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
const mesLongo = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

/** Teto "redondo" do eixo: 3.480 vira 4.000, para as linhas de grade caírem em números fáceis de ler. */
function teto(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 4, 5, 8, 10].map((m) => m * p).find((x) => x >= v) ?? 10 * p;
}

function Evolucao({ dados }: { dados: MesEvolucao[] }) {
  const [serie, setSerie] = useState<'faturamento' | 'recuperado'>('faturamento');
  const max = teto(Math.max(...dados.map((d) => Number(d[serie]))));
  const nome = serie === 'faturamento' ? 'Faturamento' : 'Voltou após contato';
  return (
    <section className="bloco grafico">
      <header>
        <h2><Icone nome="resultados" /> Evolução</h2>
        <div className="pilulas" role="group" aria-label="Série do gráfico">
          <button type="button" aria-pressed={serie === 'faturamento'} onClick={() => setSerie('faturamento')}>Faturamento</button>
          <button type="button" aria-pressed={serie === 'recuperado'} onClick={() => setSerie('recuperado')}>Voltou após contato</button>
        </div>
      </header>
      <div className="barras" role="img" aria-label={`${nome} por mês, nos últimos ${dados.length} meses. Os valores estão na tabela logo abaixo.`}>
        <div className="linhas-grade" aria-hidden="true">
          {[1, 0.5, 0].map((f) => <span key={f}><i>{brl(max * f)}</i></span>)}
        </div>
        <div className="colunas-barras">
          {dados.map((d, i) => {
            const v = Number(d[serie]);
            return (
              <div key={d.mes} className="barra-mes" tabIndex={0}>
                <span className="balao"><b>{brl(v)}</b>{mesLongo(d.mes)}, {d.atendimentos} {d.atendimentos === 1 ? 'atendimento' : 'atendimentos'}</span>
                <span className={`pilar${i === dados.length - 1 ? ' pilar-atual' : ''}`} style={{ height: `${Math.max((v / max) * 100, v > 0 ? 2 : 0)}%` }} />
                <span className="mes">{mesCurto(d.mes)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <details className="tabela-grafico">
        <summary>Ver em tabela</summary>
        <table className="previa">
          <thead><tr><th>Mês</th><th>Faturamento</th><th>Voltou após contato</th><th>Atendimentos</th></tr></thead>
          <tbody>{dados.map((d) => <tr key={d.mes}><td>{mesLongo(d.mes)}</td><td>{brl(d.faturamento)}</td><td>{brl(d.recuperado)}</td><td>{d.atendimentos}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

function Fatias({ titulo, icone, itens, rotulo, unidade, vazio }: { titulo: string; icone: string; itens: Fatia[]; rotulo?: (n: string) => string; unidade: [string, string]; vazio: string }) {
  const maior = Math.max(1, ...itens.map((i) => Number(i.valor)));
  return (
    <section className="bloco grafico">
      <header><h2><Icone nome={icone} /> {titulo}</h2></header>
      {itens.length === 0 ? <p className="mudo">{vazio}</p> : (
        <ul className="ranking">
          {itens.map((p) => (
            <li key={p.nome}>
              <span className="rotulo"><b>{rotulo ? rotulo(p.nome) : p.nome}</b><span>{brl(p.valor)}, {p.quantidade} {p.quantidade === 1 ? unidade[0] : unidade[1]}</span></span>
              <span className="trilho"><span style={{ width: `${(Number(p.valor) / maior) * 100}%` }} /></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Resultados({ loja }: { loja: Loja }) {
  const lojaId = loja.id;
  const planoLoja = loja.plano !== 'essencial';
  const [rank, setRank] = useState<Ranking[]>([]);
  const [mesAtual, setMesAtual] = useState<number | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [r, setR] = useState<Resumo | null>(null);
  const [ant, setAnt] = useState<Resumo | null>(null);
  const [evo, setEvo] = useState<MesEvolucao[] | null>(null);
  const [agora, setAgora] = useState<{ chamar: number; valorChamar: number; abertas: number; emJogo: number; sumidas: number } | null>(null);
  const [erro, setErro] = useState('');
  const iv = intervalos(periodo);

  useEffect(() => {
    let vale = true; // evita que a resposta de um período antigo sobrescreva a do período novo
    Promise.all([api.resumo(lojaId, iv.de, iv.ate), iv.antes ? api.resumo(lojaId, iv.antes.de, iv.antes.ate) : null])
      .then(([a, b]) => { if (vale) { setR(a); setAnt(b); } }).catch((e) => setErro(e.message));
    if (planoLoja) api.ranking(lojaId, iv.de, iv.ate).then((x) => { if (vale) setRank(x); }).catch(() => {});
    return () => { vale = false; };
  }, [periodo]);

  useEffect(() => {
    api.evolucao(lojaId, 6).then((e) => { setEvo(e); setMesAtual(Number(e[e.length - 1]?.faturamento ?? 0)); }).catch((e) => setErro(e.message));
    Promise.all([api.hoje(), api.oportunidades(), api.sumidas()]).then(([h, o, s]) => {
      const ab = o.filter((x) => x.etapa !== 'fechado' && x.etapa !== 'perdido');
      setAgora({ chamar: h.length, valorChamar: h.reduce((t, i) => t + Number(i.valor_estimado), 0), abertas: ab.length, emJogo: ab.reduce((t, x) => t + Number(x.valor_estimado), 0), sumidas: s.length });
    }).catch((e) => setErro(e.message));
  }, []);

  const ticket = (x: Resumo | null) => (x && x.atendimentos ? Number(x.faturamento) / x.atendimentos : 0);
  const conversao = (x: Resumo | null) => (x && x.fechadas + x.perdidas ? Math.round((x.fechadas / (x.fechadas + x.perdidas)) * 100) : null);
  const a = ant ?? undefined;
  const maiorProc = r ? Math.max(1, ...r.servicos.map((p) => Number(p.valor))) : 1;
  const motivos = r ? Object.entries(r.motivos).sort((x, y) => y[1] - x[1]) : [];

  return (
    <>
      <header className="cabeca">
        <div>
          <h1>Resultados</h1>
          <p>Quanto a empresa faturou e quanto disso voltou depois de um contato feito pelo Reboka.</p>
        </div>
      </header>

      <div className="pilulas periodos" role="group" aria-label="Período">
        {PERIODOS.map((p) => <button key={p.id} type="button" aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>{p.nome}</button>)}
      </div>
      {iv.antes && <p className="comparado">As setas comparam com {iv.comparado}.</p>}
      {erro && <Aviso>{erro}</Aviso>}
      {!r ? <p className="carregando">Carregando</p> : (
        <>
          <section className="destaques">
            <div className="destaque">
              <span className="selo"><Icone nome="moeda" tamanho={26} /></span>
              <h2>Faturamento</h2>
              <p className="numero">{brl(r.faturamento)} <Variacao atual={Number(r.faturamento)} antes={a && Number(a.faturamento)} /></p>
              <p className="apoio">{r.atendimentos} {r.atendimentos === 1 ? 'atendimento registrado' : 'atendimentos registrados'}</p>
            </div>
            <div className="destaque">
              <span className="selo selo-volta"><Icone nome="volta" tamanho={26} /></span>
              <h2>Voltou após contato <Dica texto="Soma dos atendimentos feitos até 30 dias depois de uma mensagem registrada no Reboka." /></h2>
              <p className="numero">{brl(r.recuperado)} <Variacao atual={Number(r.recuperado)} antes={a && Number(a.recuperado)} /></p>
              <p className="apoio">{r.voltaram_apos_contato} {r.voltaram_apos_contato === 1 ? 'cliente voltou' : 'clientes voltaram'}{Number(r.faturamento) > 0 ? `, ${Math.round((Number(r.recuperado) / Number(r.faturamento)) * 100)}% do faturamento` : ''}</p>
            </div>
          </section>

          {loja.meta_mensal && mesAtual !== null && (
            <section className="meta">
              <p><b>Meta do mês:</b> {brl(mesAtual)} de {brl(loja.meta_mensal)}{mesAtual >= Number(loja.meta_mensal) ? '. Meta batida.' : `, faltam ${brl(Number(loja.meta_mensal) - mesAtual)}`}</p>
              <span className="trilho" role="img" aria-label={`${Math.round((mesAtual / Number(loja.meta_mensal)) * 100)}% da meta do mês`}><span style={{ width: `${Math.min(100, (mesAtual / Number(loja.meta_mensal)) * 100)}%` }} /></span>
            </section>
          )}

          <dl className="grupo-metricas">
            <Metrica rotulo="Atendimentos" variacao={<Variacao atual={r.atendimentos} antes={a?.atendimentos} />}>{r.atendimentos}</Metrica>
            <Metrica rotulo="Retornos" dica="Atendimentos de quem já tinha vindo à empresa antes." variacao={<Variacao atual={r.retornos} antes={a?.retornos} />}>{r.retornos}</Metrica>
            <Metrica rotulo="Ticket médio" dica="Faturamento dividido pelo número de atendimentos." variacao={<Variacao atual={ticket(r)} antes={a && ticket(ant)} />}>{brl(ticket(r))}</Metrica>
            <Metrica rotulo="Clientes atendidos" variacao={<Variacao atual={r.clientes_atendidas} antes={a?.clientes_atendidas} />}>{r.clientes_atendidas}</Metrica>
            <Metrica rotulo="Cadastros novos" dica="Clientes cadastrados no período, incluindo os importados de planilha." variacao={<Variacao atual={r.clientes_novas} antes={a?.clientes_novas} />}>{r.clientes_novas}</Metrica>
          </dl>

          <dl className="grupo-metricas">
            <Metrica rotulo="Mensagens enviadas" dica="Contatos registrados ao abrir o WhatsApp pelo Reboka." variacao={<Variacao atual={r.contatos} antes={a?.contatos} />}>{r.contatos}</Metrica>
            <Metrica rotulo="Negociações novas" variacao={<Variacao atual={r.negociacoes_novas} antes={a?.negociacoes_novas} />}>{r.negociacoes_novas}</Metrica>
            <Metrica rotulo="Fechadas" variacao={<Variacao atual={r.fechadas} antes={a?.fechadas} />}>{r.fechadas}<small>{brl(r.valor_fechado)}</small></Metrica>
            <Metrica rotulo="Perdidas" variacao={<Variacao atual={r.perdidas} antes={a?.perdidas} bomSubir={false} />}>{r.perdidas}<small>{brl(r.valor_perdido)}</small></Metrica>
            <Metrica rotulo="Conversão" dica="De cada 100 negociações encerradas no período, quantas fecharam.">{conversao(r) === null ? 'Sem dados' : `${conversao(r)}%`}</Metrica>
          </dl>

          {agora && (
            <dl className="grupo-metricas agora">
              <Metrica rotulo="Para chamar hoje" dica="Situação de agora, não depende do período escolhido."><a href="#/hoje">{agora.chamar}</a><small>{brl(agora.valorChamar)}</small></Metrica>
              <Metrica rotulo="Negociações abertas"><a href="#/funil">{agora.abertas}</a><small>{brl(agora.emJogo)}</small></Metrica>
              <Metrica rotulo="Sem voltar há 8 meses ou mais"><a href="#/reativar">{agora.sumidas}</a></Metrica>
            </dl>
          )}

          <div className="graficos">
            {evo && <Evolucao dados={evo} />}
            <section className="bloco grafico">
              <header><h2><Icone nome="servicos" /> O que mais faturou</h2></header>
              {r.servicos.length === 0 ? <p className="mudo">Nenhum atendimento no período.</p> : (
                <ul className="ranking">
                  {r.servicos.map((p) => (
                    <li key={p.nome}>
                      <span className="rotulo"><b>{p.nome}</b><span>{brl(p.valor)}, {p.quantidade} {p.quantidade === 1 ? 'vez' : 'vezes'}</span></span>
                      <span className="trilho"><span style={{ width: `${(Number(p.valor) / maiorProc) * 100}%` }} /></span>
                    </li>
                  ))}
                </ul>
              )}
              <h3>Por que não fechou</h3>
              {motivos.length === 0 ? <p className="mudo">Nenhuma negociação perdida no período.</p> : (
                <ul className="motivos">{motivos.map(([m, n]) => <li key={m}><span>{MOTIVOS[m] ?? m}</span><b>{n}</b></li>)}</ul>
              )}
            </section>
          </div>

          {planoLoja ? (
            <>
              <div className="graficos iguais">
                <Fatias titulo="De onde vieram" icone="clientes" itens={r.origens} rotulo={(n) => (n === 'outro' ? 'Não informada' : ROTULO_ORIGEM[n] ?? n)} unidade={['cliente', 'clientes']} vazio="Nenhum atendimento no período." />
                <Fatias titulo="Por motorista" icone="equipe" itens={r.profissionais} unidade={['atendimento', 'atendimentos']} vazio="Nenhum atendimento no período." />
              </div>
              <section className="bloco grafico">
                <header><h2><Icone nome="sobe" /> Ranking da equipe</h2></header>
                <div className="rolagem">
                  <table className="previa">
                    <thead><tr><th>Pessoa</th><th>Função</th><th>Mensagens enviadas</th><th>Clientes que voltaram</th><th>Voltou após contato</th></tr></thead>
                    <tbody>{rank.map((p, i) => <tr key={p.usuario_id}><td><b>{i + 1}. {p.nome}</b></td><td>{NOME_PAPEL[p.papel]}</td><td>{p.contatos}</td><td>{p.voltaram}</td><td>{brl(p.recuperado)}</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="dica">Conta para quem enviou a última mensagem antes de o cliente voltar, em até 30 dias.</p>
              </section>
            </>
          ) : (
            <Aviso tipo="info">Relatórios por origem e por motorista e o ranking da equipe fazem parte do plano Equipe. <a href="#/conta">Testar o plano Equipe</a></Aviso>
          )}
        </>
      )}
    </>
  );
}
