import { Icone } from './icones';
import { useEffect, useState, type FormEvent } from 'react';
import { api, limparPlaca, type Cliente, type Atendimento, type Contato, type Servico, type Modelo, type Oportunidade, type Veiculo } from './api';
import { ETAPAS } from './Funil';
import { Anel, Janela, Campo, Aviso } from './ui';
import { FormCliente } from './Clientes';
import { brl, dataBR, telefoneBR, hojeISO, diasDesde, preencher, linkWhatsApp, fraseOrigem, kmBR, retornoDe, fraseCiclo } from './util';
import { SilhuetaCarro } from './carro';

type Dados = { cliente: Cliente | null; atendimentos: Atendimento[]; contatos: Contato[]; veiculos: Veiculo[] };

/** Situação do retorno: por tempo ou pela quilometragem estimada do carro, o que vier antes. */
function situacao(a: Atendimento, kmMes: number | null | undefined) {
  const r = retornoDe(a, kmMes);
  if (!r) return { pct: 0.04, cor: 'var(--marca)', vencido: false, texto: 'Sem ciclo de retorno', retorno: null };
  const d = diasDesde(a.data);
  const pct = d / r.dias;
  const falta = r.dias - d;
  const como = r.porKm ? ', pela quilometragem' : '';
  if (a.sessoes_total && a.sessao_numero === a.sessoes_total) return { pct: 1, cor: 'var(--verde)', vencido: false, texto: 'Plano concluído', retorno: null };
  if (pct >= 1) return { pct: 1, cor: 'var(--marca)', vencido: true, texto: (falta === 0 ? 'Retorno vence hoje' : `Retorno venceu há ${-falta} dias`) + como, retorno: r.data };
  return { pct, cor: pct >= 0.85 ? 'var(--ambar)' : 'var(--marca)', vencido: false, texto: `Retorno em ${falta} dias${como}`, retorno: r.data };
}

export default function Ficha({ lojaId, clienteId, gestao }: { lojaId: string; clienteId: string; gestao: boolean }) {
  const [d, setD] = useState<Dados | null>(null);
  const [procs, setProcs] = useState<Servico[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [erro, setErro] = useState('');
  const [janela, setJanela] = useState<'' | 'atendimento' | 'editar' | 'apagar' | 'whats'>('');
  const [carro, setCarro] = useState<Veiculo | 'novo' | null>(null);
  const [texto, setTexto] = useState('');
  const [negs, setNegs] = useState<Oportunidade[]>([]);

  const carregar = () => api.cliente(clienteId).then(setD).catch((e) => setErro(e.message));
  useEffect(() => {
    carregar();
    api.servicos().then(setProcs).catch(() => {});
    api.modelos().then(setModelos).catch(() => {});
    api.negociacoesDaCliente(clienteId).then(setNegs).catch(() => {});
  }, [clienteId]);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!d) return <p className="carregando">Carregando</p>;
  if (!d.cliente) return <Aviso>Cliente não encontrada. <a href="#/clientes">Voltar para a lista</a></Aviso>;
  const p = d.cliente;
  const ultimo = d.atendimentos[0];
  const carroDe = (id: string | null) => d.veiculos.find((v) => v.id === id);

  function abrirWhats() {
    const modelo = modelos.find((m) => m.titulo === (ultimo ? 'Retorno de serviço' : 'Reativação'))?.texto ?? 'Oi, {nome}! Tudo bem?';
    setTexto(preencher(modelo, { nome: p.nome, servico: ultimo?.servico_nome, dias: ultimo ? diasDesde(ultimo.data) : 0 }));
    setJanela('whats');
  }
  async function enviarWhats() {
    window.open(linkWhatsApp(p.telefone, texto), '_blank', 'noopener');
    await api.registrarContato(lojaId, p.id, 'Mensagem enviada pela ficha').catch((e) => setErro(e.message));
    setJanela(''); carregar();
  }
  async function alternarContato() { await api.marcarNaoContatar(p.id, !p.nao_contatar).catch((e) => setErro(e.message)); carregar(); }
  async function apagar() { await api.apagarCliente(p.id).then(() => { location.hash = '#/clientes'; }).catch((e) => setErro(e.message)); }

  return (
    <>
      <p className="voltar"><a href="#/clientes">Voltar para clientes</a></p>
      <header className="cabeca">
        <div className="ficha-ident">
          {p.veiculo && <div className="ficha-carro"><SilhuetaCarro texto={p.veiculo} tamanho={104} /></div>}
          <div>
            <h1>{p.nome}</h1>
            <p>{telefoneBR(p.telefone)}, {fraseOrigem(p.origem)}. Cadastrado em {dataBR(p.criado_em)}.</p>
            {p.nao_contatar && <p><span className="chip chip-vencido">Não contatar</span></p>}
            {p.observacao && <p className="obs">{p.observacao}</p>}
          </div>
        </div>
        <div className="botoes">
          <button type="button" className="btn btn-primario" onClick={() => setJanela('atendimento')} title="Registrar atendimento"><Icone nome="somar" tamanho={22} /><span>Registrar atendimento</span></button>
          <button type="button" className="btn btn-secundario" onClick={abrirWhats} disabled={p.nao_contatar} title="Chamar no WhatsApp"><Icone nome="mensagem" tamanho={22} /><span>Chamar no WhatsApp</span></button>
        </div>
      </header>
      {/* No celular o cabeçalho vira a barra compacta; os dados do cliente descem para este bloco. */}
      <div className="ficha-resumo-m">
        <h2>{p.nome}</h2>
        <p>{telefoneBR(p.telefone)}, {fraseOrigem(p.origem)}. Cadastrado em {dataBR(p.criado_em)}.</p>
        {p.veiculo && <p className="carro">{p.veiculo}</p>}
        {p.nao_contatar && <p><span className="chip chip-vencido">Não contatar</span></p>}
        {p.observacao && <p className="obs">{p.observacao}</p>}
      </div>

      <section className="bloco">
        <div className="bloco-topo">
          <h2>Carros</h2>
          <button type="button" className="btn btn-secundario" onClick={() => setCarro('novo')}>Adicionar carro</button>
        </div>
        {d.veiculos.length === 0 && <p className="mudo">Nenhum carro cadastrado. Com o carro na ficha, o retorno também é avisado pela quilometragem.</p>}
        <ul className="lista-procs lista-carros">
          {d.veiculos.map((v) => (
            <li key={v.id}>
              <div className="quem">
                <b className="carro">{v.modelo}{v.placa && <span className="placa">{v.placa}</span>}</b>
                <span>{v.km === null ? 'Sem leitura do painel. Anote o km no próximo atendimento.'
                  : <>{kmBR(v.km)}{v.km_em ? ` em ${dataBR(v.km_em)}` : ''}{v.km_mes ? `, roda cerca de ${kmBR(v.km_mes)} por mês` : ', média de uso ainda não calculada'}</>}</span>
              </div>
              <button type="button" className="btn btn-secundario" onClick={() => setCarro(v)}>Editar</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="bloco">
        <h2>Atendimentos</h2>
        {d.atendimentos.length === 0 && <p className="mudo">Nenhum atendimento registrado. Ao registrar o primeiro, o retorno já fica agendado.</p>}
        <ul className="historico">
          {d.atendimentos.map((a, pos) => {
            // O status vale para o atendimento mais recente de cada serviço (os anteriores já foram "renovados").
            const i = d.atendimentos.findIndex((x) => x.servico_nome === a.servico_nome && x.veiculo_id === a.veiculo_id) === pos ? 0 : 1;
            const v = carroDe(a.veiculo_id);
            const s = situacao(a, v?.km_mes);
            return (
              <li key={a.id}>
                {i === 0 ? <Anel pct={s.pct} cor={s.cor} vencido={s.vencido} rotulo={s.texto} tamanho={44} /> : <span className="ponto-historico" />}
                <div className="quem">
                  <b>{a.servico_nome}{a.sessoes_total ? `, etapa ${a.sessao_numero} de ${a.sessoes_total}` : ''}</b>
                  {v && d.veiculos.length > 1 && <span className="carro">{v.modelo}{v.placa && <span className="placa">{v.placa}</span>}</span>}
                  <span>{dataBR(a.data)}{a.km !== null ? `, ${kmBR(a.km)}` : ''}{a.profissional ? `, com ${a.profissional}` : ''}{s.retorno ? `, retorno previsto para ${dataBR(s.retorno)}` : ''}</span>
                  {i === 0 && <span className={`chip chip-${s.vencido ? 'vencido' : s.cor === 'var(--ambar)' ? 'atencao' : 'ok'}`}>{s.texto}</span>}
                </div>
                <div className="valor">{brl(a.valor)}</div>
              </li>
            );
          })}
        </ul>
      </section>

      {negs.length > 0 && (
        <section className="bloco">
          <h2>Negociações</h2>
          <ul className="contatos negs">
            {negs.map((o) => (
              <li key={o.id}>
                <span><b>{o.reboka_servicos?.nome ?? 'Servico a definir'}</b> {brl(o.valor_estimado)}, desde {dataBR(o.criado_em)}</span>
                <span className={`chip chip-${o.etapa === 'fechado' ? 'ok' : o.etapa === 'perdido' ? 'vencido' : 'atencao'}`}>{o.etapa === 'perdido' ? 'Perdida' : ETAPAS.find((e) => e.id === o.etapa)?.nome}</span>
              </li>
            ))}
          </ul>
          <p className="dica"><a href="#/funil">Abrir o funil</a> para mover de etapa.</p>
        </section>
      )}

      <section className="bloco">
        <h2>Contatos</h2>
        {d.contatos.length === 0 && <p className="mudo">Nenhum contato registrado.</p>}
        <ul className="contatos">
          {d.contatos.map((c) => <li key={c.id}><b>{dataBR(c.criado_em)}</b> {c.observacao ?? 'Contato por WhatsApp'}</li>)}
        </ul>
      </section>

      <section className="bloco perigo">
        <h2>Dados e privacidade</h2>
        <div className="botoes">
          <button type="button" className="btn btn-secundario" onClick={() => setJanela('editar')}>Editar cadastro</button>
          <button type="button" className="btn btn-secundario" onClick={alternarContato}>{p.nao_contatar ? 'Voltar a contatar' : 'Marcar como não contatar'}</button>
          {gestao && <button type="button" className="btn btn-perigo" onClick={() => setJanela('apagar')}>Apagar cliente</button>}
        </div>
      </section>

      <Janela titulo="Registrar atendimento" aberta={janela === 'atendimento'} aoFechar={() => setJanela('')}>
        <FormAtendimento procs={procs} veiculos={d.veiculos} aoCancelar={() => setJanela('')}
          aoSalvar={async (proc, dados) => { await api.registrarAtendimento(lojaId, p.id, proc, dados); setJanela(''); carregar(); }} />
      </Janela>
      <Janela titulo={carro === 'novo' ? 'Adicionar carro' : 'Editar carro'} aberta={!!carro} aoFechar={() => setCarro(null)}>
        {carro && <FormVeiculo lojaId={lojaId} clienteId={p.id} inicial={carro === 'novo' ? undefined : carro} aoCancelar={() => setCarro(null)} aoSalvar={() => { setCarro(null); carregar(); }} />}
      </Janela>
      <Janela titulo="Editar cadastro" aberta={janela === 'editar'} aoFechar={() => setJanela('')}>
        <FormCliente lojaId={lojaId} inicial={p} aoCancelar={() => setJanela('')} aoSalvar={() => { setJanela(''); carregar(); }} />
      </Janela>
      <Janela titulo={`Mensagem para ${p.nome.split(' ')[0]}`} aberta={janela === 'whats'} aoFechar={() => setJanela('')}>
        <label className="campo"><span>Revise antes de enviar</span><textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
        <div className="acoes">
          <button type="button" className="btn btn-secundario" onClick={() => setJanela('')}>Cancelar</button>
          <button type="button" className="btn btn-primario" onClick={enviarWhats}>Abrir WhatsApp</button>
        </div>
      </Janela>
      <Janela titulo="Apagar cliente" aberta={janela === 'apagar'} aoFechar={() => setJanela('')}>
        <p>Isso apaga o cadastro de <b>{p.nome}</b>, os atendimentos e o histórico de contatos. Não dá para desfazer.</p>
        <div className="acoes">
          <button type="button" className="btn btn-secundario" onClick={() => setJanela('')}>Manter</button>
          <button type="button" className="btn btn-perigo" onClick={apagar}>Apagar cliente</button>
        </div>
      </Janela>
    </>
  );
}

function FormVeiculo({ lojaId, clienteId, inicial, aoSalvar, aoCancelar }: { lojaId: string; clienteId: string; inicial?: Veiculo; aoSalvar: () => void; aoCancelar: () => void }) {
  const [modelo, setModelo] = useState(inicial?.modelo ?? '');
  const [placa, setPlaca] = useState(inicial?.placa ?? '');
  const [km, setKm] = useState(inicial?.km != null ? String(inicial.km) : '');
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const leitura = km.trim() === '' ? null : Math.max(0, Math.round(Number(km)));
    try { await api.salvarVeiculo(lojaId, clienteId, { id: inicial?.id, modelo, placa, km: leitura, kmMudou: leitura !== (inicial?.km ?? null) }); aoSalvar(); }
    catch (e) { setErro((e as Error).message); }
  }
  async function apagar() {
    try { await api.apagarVeiculo(inicial!.id); aoSalvar(); } catch (e) { setErro((e as Error).message); }
  }

  return (
    <form onSubmit={enviar}>
      <div className="dupla">
        <Campo rotulo="Carro" dica="Modelo e ano."><input placeholder="Corolla 2019" value={modelo} onChange={(e) => setModelo(e.target.value)} /></Campo>
        <Campo rotulo="Placa"><input placeholder="ABC1D23" autoCapitalize="characters" value={placa} onChange={(e) => setPlaca(limparPlaca(e.target.value))} /></Campo>
      </div>
      <Campo rotulo="Km no painel hoje (opcional)" dica="Com duas leituras em datas diferentes, o Reboka calcula quanto o carro roda por mês.">
        <input type="number" min="0" step="1" inputMode="numeric" placeholder="84300" value={km} onChange={(e) => setKm(e.target.value)} />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      {confirmar && <p className="dica">Apagar este carro? Os atendimentos continuam na ficha, sem o carro ligado.</p>}
      <div className="acoes">
        {inicial && (confirmar
          ? <button type="button" className="btn btn-perigo" onClick={apagar}>Confirmar e apagar</button>
          : <button type="button" className="btn btn-perigo" onClick={() => setConfirmar(true)}>Apagar carro</button>)}
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario">Salvar</button>
      </div>
    </form>
  );
}

function FormAtendimento({ procs, veiculos, aoSalvar, aoCancelar }: {
  procs: Servico[]; veiculos: Veiculo[]; aoCancelar: () => void;
  aoSalvar: (p: Servico, d: { data: string; valor: number; sessao: number | null; total: number | null; profissional: string; veiculoId: string | null; km: number | null }) => Promise<void>;
}) {
  const [veiculoId, setVeiculoId] = useState(veiculos[0]?.id ?? '');
  const [km, setKm] = useState('');
  const [procId, setProcId] = useState('');
  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState('');
  const [pacote, setPacote] = useState(false);
  const [sessao, setSessao] = useState('1');
  const [total, setTotal] = useState('10');
  const [erro, setErro] = useState('');
  const [profissional, setProfissional] = useState(() => { try { return localStorage.getItem('reboka_profissional') ?? ''; } catch { return ''; } });
  const [nomes, setNomes] = useState<string[]>([]);
  useEffect(() => { api.profissionais().then(setNomes).catch(() => {}); }, []);
  const proc = procs.find((x) => x.id === procId) ?? procs[0];
  const carro = veiculos.find((v) => v.id === veiculoId) ?? veiculos[0];
  useEffect(() => { if (proc && !valor) setValor(String(Number(proc.valor_medio))); }, [proc?.id]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!proc) return;
    if (pacote && Number(sessao) > Number(total)) { setErro('A etapa não pode ser maior que o total do plano.'); return; }
    const leitura = km.trim() === '' ? null : Math.max(0, Math.round(Number(km)));
    // Hodômetro não anda para trás: uma leitura menor que a última costuma ser erro de digitação.
    if (leitura !== null && carro?.km != null && carro.km_em && data >= carro.km_em && leitura < carro.km) {
      setErro(`Este carro já tinha ${kmBR(carro.km)} em ${dataBR(carro.km_em)}. Confira a leitura do painel.`); return;
    }
    try {
      try { localStorage.setItem('reboka_profissional', profissional.trim()); } catch { /* sem armazenamento, só não lembra o nome */ }
      await aoSalvar(proc, { data, valor: Number(valor) || 0, sessao: pacote ? Number(sessao) : null, total: pacote ? Number(total) : null, profissional, veiculoId: carro?.id ?? null, km: leitura });
    }
    catch (e) { setErro((e as Error).message); }
  }
  if (!proc) return <p className="mudo">Nenhum serviço cadastrado.</p>;
  // Sem carro ligado não há como estimar km: vale só o ciclo por tempo.
  const retorno = retornoDe({ data, ciclo_dias: proc.ciclo_retorno_dias, ciclo_km: carro ? proc.ciclo_retorno_km : null }, carro?.km_mes);
  const alvoKm = carro && proc.ciclo_retorno_km && km.trim() !== '' ? Math.round(Number(km)) + proc.ciclo_retorno_km : null;

  return (
    <form onSubmit={enviar}>
      <Campo rotulo="Serviço">
        <select value={proc.id} onChange={(e) => { setProcId(e.target.value); setValor(''); }}>
          {procs.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
        </select>
      </Campo>
      {veiculos.length > 0 && (
        <div className="dupla">
          <Campo rotulo="Carro">
            <select value={carro?.id ?? ''} onChange={(e) => setVeiculoId(e.target.value)}>
              {veiculos.map((v) => <option key={v.id} value={v.id}>{[v.modelo, v.placa].filter(Boolean).join(' · ')}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Km no painel"><input type="number" min="0" step="1" inputMode="numeric" placeholder={carro?.km != null ? String(carro.km) : 'Opcional'} value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
        </div>
      )}
      <div className="dupla">
        <Campo rotulo="Data"><input type="date" required max={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} /></Campo>
        <Campo rotulo="Valor (R$)"><input type="number" min="0" step="10" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
      </div>
      <Campo rotulo="Motorista responsável (opcional)">
        <input list="profissionais" value={profissional} onChange={(e) => setProfissional(e.target.value)} placeholder="Exemplo: João" />
        <datalist id="profissionais">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
      </Campo>
      <label className="marcar"><input type="checkbox" checked={pacote} onChange={(e) => setPacote(e.target.checked)} /> Faz parte de um plano de manutenção (várias etapas)</label>
      {pacote && (
        <div className="dupla">
          <Campo rotulo="Etapa número"><input type="number" min="1" value={sessao} onChange={(e) => setSessao(e.target.value)} /></Campo>
          <Campo rotulo="Total de etapas"><input type="number" min="1" value={total} onChange={(e) => setTotal(e.target.value)} /></Campo>
        </div>
      )}
      <p className="dica">{retorno
        ? <>Retorno a cada {fraseCiclo(proc.ciclo_retorno_dias, carro ? proc.ciclo_retorno_km : null)}: previsto para <b>{dataBR(retorno.data)}</b>{retorno.porKm ? (carro?.km_mes ? `, pelos ${kmBR(carro.km_mes)} que o carro roda por mês` : ', contando 1.000 km por mês') : ''}{alvoKm ? <> ou aos <b>{kmBR(alvoKm)}</b></> : ''}.</>
        : 'Este serviço não tem ciclo de retorno.'}{veiculos.length === 0 && proc.ciclo_retorno_km ? ' Cadastre o carro na ficha para avisar também por quilometragem.' : ''}</p>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="acoes">
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario">Salvar atendimento</button>
      </div>
    </form>
  );
}
