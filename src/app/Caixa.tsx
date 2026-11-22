import { useEffect, useMemo, useState } from 'react';
import { api, type Loja, type Resumo } from './api';
import { Aviso } from './ui';
import { brl } from './util';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
type Periodo = 'hoje' | 'sete' | 'mes';
function intervalo(p: Periodo): [string, string] {
  const hoje = new Date();
  if (p === 'hoje') return [iso(hoje), iso(hoje)];
  if (p === 'sete') { const d = new Date(hoje); d.setDate(hoje.getDate() - 6); return [iso(d), iso(hoje)]; }
  return [iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), iso(hoje)];
}

export default function Caixa({ loja, aoMudar }: { loja: Loja; aoMudar: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>('hoje');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState('');
  const [tipo, setTipo] = useState(loja.comissao_tipo);
  const [valor, setValor] = useState(String(Number(loja.comissao_valor)));
  const [salvando, setSalvando] = useState(false);
  const [pixChave, setPixChave] = useState(loja.pix_chave ?? '');
  const [pixNome, setPixNome] = useState(loja.pix_nome ?? '');
  const [pixCidade, setPixCidade] = useState(loja.pix_cidade ?? '');
  const [pixSalvo, setPixSalvo] = useState(false);

  useEffect(() => {
    setResumo(null);
    const [de, ate] = intervalo(periodo);
    api.resumo(loja.id, de, ate).then(setResumo).catch((e) => setErro(e.message));
  }, [periodo, loja.id]);
  useEffect(() => { setTipo(loja.comissao_tipo); setValor(String(Number(loja.comissao_valor))); }, [loja.comissao_tipo, loja.comissao_valor]);
  useEffect(() => { setPixChave(loja.pix_chave ?? ''); setPixNome(loja.pix_nome ?? ''); setPixCidade(loja.pix_cidade ?? ''); }, [loja.pix_chave, loja.pix_nome, loja.pix_cidade]);

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
  const carros = resumo?.atendimentos ?? 0;
  const fat = resumo?.faturamento ?? 0;

  return (
    <>
      <header className="cabeca">
        <div><h1>Caixa</h1><p>O quanto entrou e a comissão de cada motorista, por período.</p></div>
      </header>

      <div className="pilulas periodos" role="group" aria-label="Período">
        <button type="button" aria-pressed={periodo === 'hoje'} onClick={() => setPeriodo('hoje')}>Hoje</button>
        <button type="button" aria-pressed={periodo === 'sete'} onClick={() => setPeriodo('sete')}>7 dias</button>
        <button type="button" aria-pressed={periodo === 'mes'} onClick={() => setPeriodo('mes')}>Este mês</button>
      </div>

      {!resumo ? <p className="carregando">Carregando</p> : (
        <>
          <div className="caixa-cartoes">
            <div className="caixa-cartao"><small>Faturamento</small><b>{brl(fat)}</b></div>
            <div className="caixa-cartao"><small>Carros</small><b>{carros}</b></div>
            <div className="caixa-cartao"><small>Ticket médio</small><b>{brl(carros ? fat / carros : 0)}</b></div>
            <div className="caixa-cartao"><small>Comissão total</small><b>{brl(comissaoTotal)}</b></div>
          </div>

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
            <p className="dica">Com a chave configurada, você gera o Pix copia-e-cola e o QR Code na hora (em Contratos, por exemplo). O dinheiro cai direto na sua conta, sem taxa de intermediário.</p>
          </section>

          <h2 className="secao-titulo">Por motorista</h2>
          {mecanicos.length === 0 ? <p className="dica">Nenhum atendimento com motorista no período. Marque o motorista ao entregar o carro no pátio.</p> : (
            <div className="tabela-caixa">
              <div className="tc-cab"><span>Motorista</span><span>Carros</span><span>Faturamento</span><span>Comissão</span></div>
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
        </>
      )}
    </>
  );
}
