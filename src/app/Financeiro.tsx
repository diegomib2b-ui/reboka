import { useEffect, useMemo, useState } from 'react';
import { api, type Loja, type Resumo, type Mensalista, type Agendamento } from './api';
import { Aviso } from './ui';
import { brl, dataBR } from './util';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
type Periodo = 'hoje' | 'sete' | 'mes';

function intervalo(p: Periodo): [string, string] {
  const h = new Date();
  if (p === 'hoje') return [iso(h), iso(h)];
  if (p === 'sete') { const d = new Date(h); d.setDate(h.getDate() - 6); return [iso(d), iso(h)]; }
  return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)];
}
// Mesmo recorte, no período anterior (para o comparativo "nesta altura").
function intervaloAnterior(p: Periodo): [string, string] {
  const h = new Date();
  if (p === 'hoje') { const d = new Date(h); d.setDate(h.getDate() - 1); return [iso(d), iso(d)]; }
  if (p === 'sete') { const a = new Date(h); a.setDate(h.getDate() - 13); const b = new Date(h); b.setDate(h.getDate() - 7); return [iso(a), iso(b)]; }
  const y = h.getFullYear(), m = h.getMonth();
  const ultimoDiaAnt = new Date(y, m, 0).getDate();
  const dia = Math.min(h.getDate(), ultimoDiaAnt);
  return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m - 1, dia))];
}
const ROT_PERIODO: Record<Periodo, string> = { hoje: 'hoje', sete: 'nos últimos 7 dias', mes: 'este mês' };
const ROT_CURTO: Record<Periodo, string> = { hoje: 'hoje', sete: '7 dias', mes: 'este mês' };

export default function Financeiro({ loja, aoMudar }: { loja: Loja; aoMudar: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [fatAnterior, setFatAnterior] = useState<number | null>(null);
  const [mens, setMens] = useState<Mensalista[]>([]);
  const [recebs, setRecebs] = useState<{ id: string; nome: string | null; servico_nome: string | null; valor: number; data: string }[]>([]);
  const [erro, setErro] = useState('');
  // Config (herdada do antigo Caixa)
  const [tipo, setTipo] = useState(loja.comissao_tipo);
  const [valor, setValor] = useState(String(Number(loja.comissao_valor)));
  const [salvando, setSalvando] = useState(false);
  const [pixChave, setPixChave] = useState(loja.pix_chave ?? '');
  const [pixNome, setPixNome] = useState(loja.pix_nome ?? '');
  const [pixCidade, setPixCidade] = useState(loja.pix_cidade ?? '');
  const [pixSalvo, setPixSalvo] = useState(false);

  useEffect(() => {
    setResumo(null); setFatAnterior(null);
    const [de, ate] = intervalo(periodo);
    const [de0, ate0] = intervaloAnterior(periodo);
    api.resumo(loja.id, de, ate).then(setResumo).catch((e) => setErro(e.message));
    api.resumo(loja.id, de0, ate0).then((r) => setFatAnterior(r.faturamento)).catch(() => setFatAnterior(null));
  }, [periodo, loja.id]);
  useEffect(() => {
    api.mensalistas(loja.id).then(setMens).catch(() => {});
    api.ultimosRecebimentos(8).then(setRecebs).catch(() => {});
  }, [loja.id]);
  useEffect(() => { setTipo(loja.comissao_tipo); setValor(String(Number(loja.comissao_valor))); }, [loja.comissao_tipo, loja.comissao_valor]);
  useEffect(() => { setPixChave(loja.pix_chave ?? ''); setPixNome(loja.pix_nome ?? ''); setPixCidade(loja.pix_cidade ?? ''); }, [loja.pix_chave, loja.pix_nome, loja.pix_cidade]);

  // A receber do guincho: chamados entregues e ainda não pagos, somados por quem paga.
  const [pendentes, setPendentes] = useState<Agendamento[]>([]);
  useEffect(() => { api.chamadosAReceber().then(setPendentes).catch(() => {}); }, []);
  const pendenteTotal = pendentes.reduce((t, a) => t + (Number(a.valor) || 0), 0);
  const pagadores = new Set(pendentes.map((a) => a.pagador || a.nome)).size;

  async function salvarComissao() {
    setSalvando(true); setErro('');
    try { await api.salvarComissaoConfig(loja.id, { comissao_tipo: tipo, comissao_valor: Number(valor) || 0 }); aoMudar(); }
    catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }
  async function salvarPix() {
    setSalvando(true); setErro('');
    try { await api.salvarPixConfig(loja.id, { pix_chave: pixChave.trim() || null, pix_nome: pixNome.trim() || null, pix_cidade: pixCidade.trim() || null }); aoMudar(); setPixSalvo(true); setTimeout(() => setPixSalvo(false), 1800); }
    catch (e) { setErro((e as Error).message); } finally { setSalvando(false); }
  }

  const comissaoDe = (fat: number, carros: number) => loja.comissao_tipo === 'percentual' ? fat * Number(loja.comissao_valor) / 100 : carros * Number(loja.comissao_valor);
  const mecanicos = useMemo(() => (resumo?.profissionais ?? []).slice().sort((a, b) => b.valor - a.valor), [resumo]);
  const comissaoTotal = mecanicos.reduce((s, l) => s + comissaoDe(Number(l.valor), Number(l.quantidade)), 0);

  if (erro) return <Aviso>{erro}</Aviso>;

  const fat = resumo?.faturamento ?? 0;
  const carros = resumo?.atendimentos ?? 0;
  const ticket = carros ? fat / carros : 0;
  const variacao = fatAnterior && fatAnterior > 0 ? Math.round((fat - fatAnterior) / fatAnterior * 100) : null;
  const hoje = new Date();
  const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  const rotuloComp = periodo === 'mes' ? `${mesAnterior} nesta altura` : periodo === 'sete' ? '7 dias anteriores' : 'ontem';

  const vencidos = mens.filter((m) => m.status === 'ativo' && !m.pago && Number(m.dia_vencimento) <= hoje.getDate());
  const aReceberTotal = vencidos.reduce((s, m) => s + Number(m.preco_mensal), 0);

  return (
    <>
      <header className="cabeca"><div><h1>Financeiro</h1><p>O quanto você ganhou — tudo automático, sem lançar nada.</p></div></header>

      <div className="pilulas periodos" role="group" aria-label="Período">
        <button type="button" aria-pressed={periodo === 'hoje'} onClick={() => setPeriodo('hoje')}>Hoje</button>
        <button type="button" aria-pressed={periodo === 'sete'} onClick={() => setPeriodo('sete')}>7 dias</button>
        <button type="button" aria-pressed={periodo === 'mes'} onClick={() => setPeriodo('mes')}>Este mês</button>
      </div>

      {!resumo ? <p className="carregando">Carregando</p> : (
        <>
          <div className="fin-painel">
            <div className="fin-hero">
              <div className="fin-rot">
                <span className="fin-cifra">R$</span> Você ganhou {ROT_PERIODO[periodo]}
              </div>
              <div className="fin-big">{brl(fat)}</div>
              {variacao !== null && (
                <span className={`fin-chip ${variacao >= 0 ? 'pos' : 'neg'}`}>
                  {variacao >= 0 ? '▲' : '▼'} {variacao >= 0 ? '+' : ''}{variacao}% vs. {rotuloComp}
                </span>
              )}
            </div>
            <div className="fin-cards">
              <div className="fin-mini rec">
                <div className="r">A receber</div>
                <div className="v">{brl(pendenteTotal)}</div>
                <div className="d">{pendentes.length === 0 ? 'nenhum chamado em aberto' : `${pendentes.length} ${pendentes.length === 1 ? 'chamado' : 'chamados'} de ${pagadores} ${pagadores === 1 ? 'pagador' : 'pagadores'}`}</div>
              </div>
              <div className="fin-mini">
                <div className="r">Comissão a pagar</div>
                <div className="v">{brl(comissaoTotal)}</div>
                <div className="d">equipe, {ROT_CURTO[periodo]}</div>
              </div>
              <div className="fin-mini">
                <div className="r">Ticket médio</div>
                <div className="v">{brl(ticket)}</div>
                <div className="d">{carros} {carros === 1 ? 'chamado' : 'chamados'} {ROT_CURTO[periodo]}</div>
              </div>
            </div>
          </div>

          <h2 className="secao-titulo">Últimos recebimentos</h2>
          {recebs.length === 0 ? <p className="dica">Assim que você entregar um carro com valor, o recebimento aparece aqui automaticamente.</p> : (
            <ul className="fin-receb">
              {recebs.map((r) => (
                <li key={r.id}>
                  <span className="ini">{r.nome?.[0]?.toUpperCase() ?? '•'}</span>
                  <div className="q"><b>{r.nome ?? 'Cliente'}</b><span>{r.servico_nome ?? 'Serviço'} · {dataBR(r.data)}</span></div>
                  <span className="val">{brl(r.valor)}</span>
                </li>
              ))}
            </ul>
          )}

          <details className="fin-mais">
            <summary>Detalhes e ajustes</summary>

            <section className="bloco">
              <div className="bloco-topo"><h2>Comissão do motorista</h2></div>
              <div className="fid-cfg">
                <label>Tipo
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as 'percentual' | 'fixo')}>
                    <option value="percentual">% do serviço</option>
                    <option value="fixo">R$ por carro</option>
                  </select>
                </label>
                <label>{tipo === 'percentual' ? 'Percentual (%)' : 'Valor por carro (R$)'}<input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" /></label>
                <button type="button" className="btn btn-secundario" onClick={salvarComissao} disabled={salvando}>Salvar</button>
              </div>
              <p className="dica">Exemplo: {loja.comissao_tipo === 'percentual' ? `${Number(loja.comissao_valor)}% de um serviço de R$ 80 = ${brl(80 * Number(loja.comissao_valor) / 100)}` : `${brl(Number(loja.comissao_valor))} por carro lavado`}.</p>
            </section>

            <section className="bloco">
              <div className="bloco-topo"><h2>Cobrança Pix</h2></div>
              <div className="fid-cfg">
                <label className="fid-premio">Chave Pix<input value={pixChave} onChange={(e) => setPixChave(e.target.value)} placeholder="CPF, celular, e-mail ou aleatória" /></label>
              </div>
              <div className="fid-cfg">
                <label className="fid-premio">Nome do recebedor<input value={pixNome} onChange={(e) => setPixNome(e.target.value)} placeholder={loja.nome} /></label>
                <label>Cidade<input value={pixCidade} onChange={(e) => setPixCidade(e.target.value)} placeholder="Curitiba" /></label>
                <button type="button" className="btn btn-secundario" onClick={salvarPix} disabled={salvando}>{pixSalvo ? 'Salvo!' : 'Salvar'}</button>
              </div>
              <p className="dica">Com a chave configurada, você gera o Pix copia-e-cola e o QR Code na hora. O dinheiro cai direto na sua conta, sem taxa de intermediário.</p>
            </section>

            <h2 className="secao-titulo">Por motorista</h2>
            {mecanicos.length === 0 ? <p className="dica">Nenhum atendimento com motorista no período. Marque o motorista ao despachar o chamado.</p> : (
              <div className="tabela-caixa">
                <div className="tc-cab"><span>Motorista</span><span>Chamados</span><span>Faturamento</span><span>Comissão</span></div>
                {mecanicos.map((l) => (
                  <div key={l.nome} className="tc-linha">
                    <span>{l.nome}</span><span>{Number(l.quantidade)}</span><span>{brl(l.valor)}</span><span className="tc-comissao">{brl(comissaoDe(Number(l.valor), Number(l.quantidade)))}</span>
                  </div>
                ))}
              </div>
            )}

            {resumo.servicos.length > 0 && (
              <>
                <h2 className="secao-titulo">Por serviço</h2>
                <div className="tabela-caixa">
                  {resumo.servicos.map((s) => (
                    <div key={s.nome} className="tc-linha tc-servico"><span>{s.nome}</span><span>{Number(s.quantidade)}×</span><span>{brl(s.valor)}</span></div>
                  ))}
                </div>
              </>
            )}
          </details>
        </>
      )}
    </>
  );
}
