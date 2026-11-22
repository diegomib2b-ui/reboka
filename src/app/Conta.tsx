import { useEffect, useState, type FormEvent } from 'react';
import { api, cobranca, sb, LIMITE_CLIENTES, type Loja, type Papel } from './api';
import { Campo, Aviso, Janela } from './ui';
import { brl, dataBR, telefoneBR, ROTULO_ORIGEM } from './util';

import { planos, DESCONTO_ANUAL } from '../data/site';

const RESUMO: Record<Loja['plano'], string> = { essencial: 'Até 1.000 clientes, 1 usuário', equipe: 'Até 7.000 clientes, equipe, comissão por motorista e registro', pro_ia: 'Plano Frota' };
const PLANOS = planos.map((p) => ({ id: p.id as Loja['plano'], nome: p.nome, preco: p.precoMensal, resumo: RESUMO[p.id as Loja['plano']] }));
const anual = (mensal: number) => Math.round(mensal * 12 * (1 - DESCONTO_ANUAL) * 100) / 100;
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });

export default function Conta({ loja, papel, aoMudar }: { loja: Loja; papel: Papel; aoMudar: () => void }) {
  const [nome, setNome] = useState(loja.nome);
  const [documento, setDocumento] = useState(loja.documento ?? '');
  const [meta, setMeta] = useState(loja.meta_mensal ? String(Number(loja.meta_mensal)) : '');
  const [perfil, setPerfil] = useState<Loja['perfil']>(loja.perfil ?? 'oficina');
  const [vagas, setVagas] = useState(String(loja.vagas_funilaria ?? 1));
  const [total, setTotal] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ onde: string; tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [exportando, setExportando] = useState(false);
  const limite = LIMITE_CLIENTES[loja.plano];
  const [ciclo, setCiclo] = useState<'mensal' | 'anual'>('mensal');
  const [escolhido, setEscolhido] = useState<Loja['plano']>(loja.plano);
  const [emailMP, setEmailMP] = useState('');
  const [pronta, setPronta] = useState<boolean | null>(null);
  const [indo, setIndo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const ativa = loja.assinatura === 'ativa';
  const dona = papel === 'dono';

  useEffect(() => {
    cobranca.saude().then((s) => setPronta(s.cobranca)).catch(() => setPronta(false));
    // Se há uma tentativa de assinatura em aberto, confere no servidor se o pagamento já passou.
    if (loja.assinatura !== 'ativa' && loja.mp_assinatura_id) cobranca.sincronizar().then((r) => { if (r.situacao === 'ativa') aoMudar(); }).catch(() => {});
    sb.auth.getSession().then(({ data }) => setEmailMP((e) => e || data.session?.user.email || ''));
  }, []);

  async function assinar(e: FormEvent) {
    e.preventDefault(); setIndo(true); setMsg(null);
    try { location.href = (await cobranca.assinar(escolhido, ciclo, emailMP)).url; }
    catch (e) { setMsg({ onde: 'assinar', tipo: 'erro', texto: (e as Error).message }); setIndo(false); }
  }
  async function cancelar() {
    setCancelando(false);
    try { await cobranca.cancelar(); setMsg({ onde: 'plano', tipo: 'ok', texto: 'Assinatura cancelada. O acesso continua até o fim do período já pago.' }); aoMudar(); }
    catch (e) { setMsg({ onde: 'plano', tipo: 'erro', texto: (e as Error).message }); }
  }

  useEffect(() => { api.totalClientes().then(setTotal).catch(() => {}); }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    try {
      await api.salvarLoja(loja.id, { nome: nome.trim(), documento: documento.trim() || null, meta_mensal: Number(meta) > 0 ? Number(meta) : null, perfil, vagas_funilaria: Math.max(1, Number(vagas) || 1) });
      setMsg({ onde: 'dados', tipo: 'ok', texto: 'Dados salvos.' }); aoMudar();
    } catch (e) { setMsg({ onde: 'dados', tipo: 'erro', texto: (e as Error).message }); }
  }
  async function trocar(plano: Loja['plano']) {
    try { await api.trocarPlano(loja.id, plano); setMsg({ onde: 'plano', tipo: 'ok', texto: 'Plano alterado.' }); aoMudar(); }
    catch (e) { setMsg({ onde: 'plano', tipo: 'erro', texto: (e as Error).message }); }
  }
  async function exportar() {
    setExportando(true);
    try {
      const linhas = await api.exportarClientes();
      const cel = (v: unknown) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const csv = [['Nome', 'Telefone', 'Carro', 'Placa', 'Origem', 'Não contatar', 'Observação', 'Cadastro', 'Último serviço', 'Data do último serviço', 'Total gasto'],
        ...linhas.map((p) => {
          const ats = [...p.reboka_atendimentos].sort((a, b) => b.data.localeCompare(a.data));
          return [p.nome, telefoneBR(p.telefone), p.veiculo ?? '', p.placa ?? '', ROTULO_ORIGEM[p.origem] ?? p.origem, p.nao_contatar ? 'Sim' : 'Não', p.observacao ?? '', dataBR(p.criado_em),
            ats[0]?.servico_nome ?? '', ats[0] ? dataBR(ats[0].data) : '', ats.reduce((s, a) => s + Number(a.valor), 0).toFixed(2).replace('.', ',')];
        })].map((l) => l.map(cel).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      Object.assign(document.createElement('a'), { href: url, download: 'reboka-clientes.csv' }).click();
      URL.revokeObjectURL(url);
      setMsg({ onde: 'exportar', tipo: 'ok', texto: `${linhas.length} clientes exportadas.` });
    } catch (e) { setMsg({ onde: 'exportar', tipo: 'erro', texto: (e as Error).message }); }
    setExportando(false);
  }

  return (
    <>
      <header className="cabeca"><div><h1>Conta</h1><p>Dados da empresa, plano e seus dados.</p></div></header>

      <section className="bloco">
        <h2>Dados da empresa</h2>
        <form onSubmit={salvar}>
          <div className="dupla">
            <Campo rotulo="Nome da empresa"><input required value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
            <Campo rotulo="CNPJ ou CPF" dica="Usado na nota fiscal da assinatura."><input value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" /></Campo>
          </div>
          <Campo rotulo="Meta de faturamento do mês (R$)" dica="Aparece em Resultados como uma barra de progresso. Em branco, sem meta.">
            <input type="number" min="0" step="500" inputMode="numeric" value={meta} onChange={(e) => setMeta(e.target.value)} />
          </Campo>
          {msg?.onde === 'dados' && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
          <div className="acoes"><button className="btn btn-primario">Salvar</button></div>
        </form>
      </section>

      <section className="bloco" id="plano">
        <h2>Plano e assinatura</h2>
        <p className="mudo">{ativa
          ? `Assinatura ativa: plano ${loja.plano === 'essencial' ? 'Essencial' : 'Frota'}, cobrança ${loja.periodicidade ?? 'mensal'} pelo Mercado Pago.`
          : loja.assinatura === 'teste'
            ? new Date(loja.teste_termina_em) > new Date()
              ? `Teste grátis até ${dataBR(loja.teste_termina_em)}. Durante o teste dá para alternar entre os planos e conhecer os dois.`
              : `O teste grátis terminou em ${dataBR(loja.teste_termina_em)}. Escolha um plano para continuar.`
            : loja.acesso_ate && new Date(loja.acesso_ate) > new Date()
              ? `Assinatura cancelada. O acesso continua até ${dataBR(loja.acesso_ate)}.`
              : 'Sem assinatura ativa. Escolha um plano para continuar usando.'}</p>
        <div className="planos-conta">
          {PLANOS.map((p) => (
            <div key={p.id} className={`plano-conta${loja.plano === p.id ? ' atual' : ''}`}>
              <b>{p.nome}</b><span className="preco">{brl(p.preco)} por mês</span><span>{p.resumo}</span>
              {loja.plano === p.id ? <span className="chip chip-ok">{ativa ? 'Plano assinado' : 'Plano atual'}</span>
                : loja.assinatura === 'teste' && dona ? <button type="button" className="btn btn-secundario" onClick={() => trocar(p.id)}>Testar este plano</button> : null}
            </div>
          ))}
        </div>
        {msg?.onde === 'plano' && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
        {total !== null && (
          <div className="uso">
            <p><b>{total.toLocaleString('pt-BR')}</b> de {limite.toLocaleString('pt-BR')} clientes do plano</p>
            <span className="trilho" role="img" aria-label={`${Math.round((total / limite) * 100)}% do limite de clientes usado`}><span style={{ width: `${Math.min(100, (total / limite) * 100)}%` }} /></span>
          </div>
        )}

        {ativa && dona && (
          <div className="botoes topo"><button type="button" className="btn btn-perigo" onClick={() => setCancelando(true)}>Cancelar assinatura</button></div>
        )}

        {!ativa && dona && (
          <form className="assinar" onSubmit={assinar}>
            <h3>Assinar</h3>
            {pronta === false && <Aviso tipo="info">A cobrança ainda não foi ligada neste ambiente. O formulário abaixo passa a funcionar assim que as chaves do Mercado Pago forem configuradas.</Aviso>}
            <fieldset className="alterna">
              <legend className="so-leitor">Plano</legend>
              {PLANOS.map((p) => (
                <label key={p.id}><input type="radio" name="plano-assinar" checked={escolhido === p.id} onChange={() => setEscolhido(p.id)} /> {p.nome}</label>
              ))}
            </fieldset>
            <fieldset className="alterna">
              <legend className="so-leitor">Forma de cobrança</legend>
              {(['mensal', 'anual'] as const).map((c) => {
                const mensal = PLANOS.find((p) => p.id === escolhido)!.preco;
                return (
                  <label key={c}><input type="radio" name="ciclo" checked={ciclo === c} onChange={() => setCiclo(c)} />
                    <span>{c === 'mensal' ? `Mensal: ${reais(mensal)} por mês` : `Anual: ${reais(anual(mensal))} por ano (${Math.round(DESCONTO_ANUAL * 100)}% de desconto)`}</span>
                  </label>
                );
              })}
            </fieldset>
            <Campo rotulo="E-mail da sua conta do Mercado Pago" dica="Precisa ser o mesmo e-mail com que você entra no Mercado Pago, senão o pagamento é recusado.">
              <input required type="email" value={emailMP} onChange={(e) => setEmailMP(e.target.value)} />
            </Campo>
            {msg?.onde === 'assinar' && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
            <div className="acoes">
              <button className="btn btn-primario" disabled={indo || pronta === false}>{indo ? 'Abrindo o Mercado Pago' : 'Assinar pelo Mercado Pago'}</button>
            </div>
            <p className="dica">Você conclui o pagamento no site do Mercado Pago e volta para cá. Sem fidelidade no plano mensal.</p>
          </form>
        )}
        {!dona && !ativa && <p className="dica">Só quem criou a conta pode assinar.</p>}
      </section>

      <Janela titulo="Cancelar assinatura" aberta={cancelando} aoFechar={() => setCancelando(false)}>
        <p>A cobrança para e a empresa continua com acesso até o fim do período já pago. Os dados ficam guardados e dá para exportar antes.</p>
        <div className="acoes">
          <button type="button" className="btn btn-secundario" onClick={() => setCancelando(false)}>Manter assinatura</button>
          <button type="button" className="btn btn-perigo" onClick={cancelar}>Cancelar assinatura</button>
        </div>
      </Janela>

      <section className="bloco">
        <h2>Seus dados</h2>
        <p className="mudo">Baixe todos os clientes em uma planilha (CSV), com o último serviço e o total gasto. Os dados são da empresa e podem ser levados a qualquer momento.</p>
        <div className="botoes topo"><button type="button" className="btn btn-secundario" disabled={exportando} onClick={exportar}>{exportando ? 'Preparando' : 'Exportar clientes'}</button></div>
        {msg?.onde === 'exportar' && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
      </section>
    </>
  );
}
