import { useEffect, useState } from 'react';
import { api, cobranca, type Loja } from './api';
import { Aviso } from './ui';
import { dataBR } from './util';
import { baixarExemplo } from './Importar';

/** Painel de teste: popula e limpa dados de exemplo para clicar no fluxo inteiro sem cadastrar nada à mão. */
export default function Teste({ loja }: { loja: Loja }) {
  const [n, setN] = useState<Awaited<ReturnType<typeof api.contagens>> | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [saude, setSaude] = useState<{ cobranca: boolean; aviso: boolean; modoTeste: boolean } | null | 'erro'>(null);
  useEffect(() => { cobranca.saude().then(setSaude).catch(() => setSaude('erro')); }, []);
  const contar = () => api.contagens().then(setN).catch((e) => setMsg({ tipo: 'erro', texto: e.message }));
  useEffect(() => { contar(); }, []);

  async function rodar(acao: 'popular' | 'limpar') {
    setOcupado(true); setMsg(null);
    try {
      const q = acao === 'popular' ? await api.popularDemo(loja.id) : await api.limparDemo(loja.id);
      setMsg({ tipo: 'ok', texto: acao === 'popular' ? `${q} clientes de exemplo criados. Abra a Agenda.` : `${q} clientes de exemplo removidos.` });
      await contar();
    } catch (e) { setMsg({ tipo: 'erro', texto: (e as Error).message }); }
    setOcupado(false);
  }

  return (
    <>
      <header className="cabeca">
        <div>
          <h1>Painel de teste</h1>
          <p>Crie dados de exemplo para testar o fluxo clicando. Eles ficam marcados como "Exemplo" e não se misturam com clientes reais.</p>
        </div>
      </header>

      <section className="bloco">
        <h2>Dados de exemplo</h2>
        <div className="botoes">
          <button type="button" className="btn btn-primario" disabled={ocupado} onClick={() => rodar('popular')}>Popular dados de exemplo</button>
          <button type="button" className="btn btn-secundario" disabled={ocupado} onClick={() => rodar('limpar')}>Limpar dados de exemplo</button>
        </div>
        {msg && <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>}
        <p className="dica">São 21 clientes: retornos vencidos por tempo e por quilometragem, um cliente com dois carros, planos de manutenção, dois orçamentos com itens já enviados, negociações perdidas e três que voltaram depois de um contato.</p>
      </section>

      <section className="bloco">
        <h2>Importação de planilha</h2>
        <p className="mudo">Baixe a planilha de exemplo e importe em modo de teste. Ela tem 8 linhas, com uma repetida e uma sem telefone de propósito, e um serviço que ainda não existe (troca de correia dentada).</p>
        <div className="botoes topo">
          <button type="button" className="btn btn-secundario" onClick={baixarExemplo}>Baixar planilha de exemplo</button>
          <a className="btn btn-secundario" href="#/importar/exemplo">Importar em modo de teste</a>
        </div>
      </section>

      <section className="bloco">
        <h2>O que há no banco agora</h2>
        {n ? (
          <dl className="numeros">
            <div><dt>Clientes</dt><dd>{n.clientes}</dd></div>
            <div><dt>Atendimentos</dt><dd>{n.atendimentos}</dd></div>
            <div><dt>Oportunidades</dt><dd>{n.oportunidades}</dd></div>
            <div><dt>Contatos</dt><dd>{n.contatos}</dd></div>
            <div><dt>Em Retorno (semana)</dt><dd>{n.hoje}</dd></div>
          </dl>
        ) : <p className="carregando">Carregando</p>}
      </section>

      <section className="bloco">
        <h2>Roteiro de teste</h2>
        <ol className="roteiro">
          <li>Popule os dados de exemplo.</li>
          <li>Abra <a href="#/hoje">Hoje</a> e toque em "Chamar no WhatsApp" na primeira cliente. Ela deve sair da lista.</li>
          <li>Abra <a href="#/clientes">Clientes</a>, busque "Fernanda" e registre uma troca de óleo com data de 7 meses atrás. Ela deve aparecer nos Alertas de retorno, no sino da Agenda.</li>
          <li>Cadastre um cliente novo com o seu WhatsApp e teste a mensagem.</li>
          <li>Abra o <a href="#/funil">Funil</a> e arraste o Paulo de "Orçamento enviado" para "Aprovado". No celular, use o seletor do cartão.</li>
          <li>No Funil, mova a Renata para "Perdida" e escolha um motivo. Depois reabra em "Ver negociações perdidas".</li>
          <li>Importe a planilha de exemplo em modo de teste: devem entrar 6 clientes e 5 atendimentos.</li>
          <li>Abra <a href="#/resultados">Resultados</a> e troque o período. "Voltou após contato" deve mostrar os clientes que retornaram depois de uma mensagem.</li>
          <li>Em <a href="#/reativar">Reativação</a>, chame a primeira da lista. Ela ganha o selo "Chamada".</li>
          <li>Em <a href="#/servicos">Serviços</a>, mude o ciclo do alinhamento para 120 dias e registre um atendimento novo.</li>
          <li>Em <a href="#/mensagens">Mensagens</a>, mude um texto e confira nos Alertas de retorno.</li>
          <li>Em <a href="#/conta">Conta</a>, teste o plano Equipe, defina uma meta do mês e exporte os clientes.</li>
          <li>No plano Equipe, abra <a href="#/equipe">Equipe</a>, convide outro e-mail seu como Atendente e copie o convite. Entrando com ele, o menu não mostra Resultados.</li>
          <li>Volte a <a href="#/resultados">Resultados</a>: agora aparecem origem, profissional e o ranking da equipe.</li>
        </ol>
      </section>

      <section className="bloco">
        <h2>Cobrança</h2>
        {saude === null ? <p className="carregando">Verificando</p> : saude === 'erro' ? <Aviso>O servidor de cobrança não respondeu.</Aviso> : (
          <dl className="numeros">
            <div><dt>Mercado Pago</dt><dd className="texto">{saude.cobranca ? (saude.modoTeste ? 'Modo de teste' : 'Produção') : 'Não configurado'}</dd></div>
            <div><dt>Aviso de pagamento</dt><dd className="texto">{saude.aviso ? 'Protegido' : 'Sem segredo'}</dd></div>
          </dl>
        )}
        <p className="dica">Para testar sem gastar: com as chaves de teste do Mercado Pago, abra <a href="#/conta">Conta</a>, clique em "Assinar" e pague com um cartão de teste, usando o e-mail de um comprador de teste criado no painel do Mercado Pago.</p>
      </section>

      <section className="bloco">
        <h2>Conta</h2>
        <p className="mudo">{loja.nome}. Plano {loja.plano === 'pro_ia' ? 'Pro IA' : loja.plano === 'equipe' ? 'Equipe' : 'Essencial'}, em {loja.assinatura}. Teste até {dataBR(loja.teste_termina_em)}.</p>
      </section>
    </>
  );
}
