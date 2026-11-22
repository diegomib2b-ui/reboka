import { useEffect, useRef, useState, type FormEvent } from 'react';
import { sb, api, cobranca, acessoLiberado, type Membro } from './api';
import { LogoMarca, Campo, Aviso } from './ui';
import Chamados from './Chamados';
import Avaliacoes from './Avaliacoes';
import Financeiro from './Financeiro';
import Clientes from './Clientes';
import Ficha from './Ficha';
import Teste from './Teste';
import Importar from './Importar';
import Resultados from './Resultados';
import Servicos from './Servicos';
import Equipe from './Equipe';
import Conta from './Conta';
import { Icone } from './icones';
import { MODO_DEMO, demoMembro, ativarDemo } from './demo';

// Modo demonstração (?demo=1): troca o api por dados fictícios antes de qualquer tela montar.
if (MODO_DEMO) ativarDemo();

// Puxar para atualizar (mobile) — o PWA standalone não tem o refresh nativo.
export function PuxarAtualizar() {
  const [dist, setDist] = useState(0);
  const [recarregando, setRecarregando] = useState(false);
  const distRef = useRef(0); const puxando = useRef(false); const y0 = useRef(0); const recRef = useRef(false);
  useEffect(() => {
    const LIMITE = 72;
    const noTopo = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
    const bloqueado = () => !!document.querySelector('dialog[open]');
    const pôr = (d: number) => { distRef.current = d; setDist(d); };
    const onStart = (e: TouchEvent) => {
      if (recRef.current || bloqueado() || !noTopo()) { puxando.current = false; return; }
      y0.current = e.touches[0].clientY; puxando.current = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!puxando.current || recRef.current) return;
      const d = e.touches[0].clientY - y0.current;
      if (d <= 0) { pôr(0); return; }
      if (!noTopo()) { puxando.current = false; pôr(0); return; }
      e.preventDefault();
      pôr(Math.min(d * 0.5, 110));
    };
    const onEnd = () => {
      if (!puxando.current) return; puxando.current = false;
      if (distRef.current >= LIMITE) { recRef.current = true; setRecarregando(true); setTimeout(() => location.reload(), 350); }
      else pôr(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
  }, []);
  if (dist === 0 && !recarregando) return null;
  const prog = Math.min(dist / 72, 1);
  return (
    <div className="ptr" style={{ transform: `translateY(${recarregando ? 56 : dist}px)`, opacity: recarregando ? 1 : prog }} aria-hidden="true">
      <span className={`ptr-ico${recarregando ? ' girando' : ''}`} style={recarregando ? undefined : { transform: `rotate(${prog * 300}deg)` }}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></svg>
      </span>
    </div>
  );
}

/** Rota pelo trecho depois do # (ex.: /app/#/clientes/123). Não precisa de servidor: funciona em hospedagem estática. */
function useRota() {
  const ler = () => location.hash.replace(/^#\/?/, '') || 'chamados';
  const [rota, setRota] = useState(ler);
  useEffect(() => {
    const f = () => setRota(ler());
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return rota;
}

type Item = { rota: string; texto: string; icone: string; gestao?: boolean };
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: 'Dia a dia', itens: [
    { rota: 'chamados', texto: 'Chamados', icone: 'agenda' },
    { rota: 'clientes', texto: 'Clientes', icone: 'clientes' },
  ] },
  { titulo: 'Gestão', itens: [
    { rota: 'resultados', texto: 'Resultados', icone: 'resultados', gestao: true },
    { rota: 'financeiro', texto: 'Financeiro', icone: 'caixa', gestao: true },
    { rota: 'servicos', texto: 'Serviços', icone: 'servicos', gestao: true },
    { rota: 'avaliacoes', texto: 'Avaliações', icone: 'estrela', gestao: true },
    { rota: 'equipe', texto: 'Equipe', icone: 'equipe', gestao: true },
    { rota: 'conta', texto: 'Conta', icone: 'conta', gestao: true },
  ] },
];
// Telas do motor que o guincho não usa nesta fase (agenda por horário, funil de orçamento, reativação, contratos,
// fidelidade e a Atendente IA, que ainda agenda por horário e precisa aprender a cotar) continuam no código, fora do menu. Quem digitar o endereço antigo cai em Chamados.
const FORA_DO_MENU = ['agenda', 'hoje', 'patio', 'funil', 'reativar', 'mensalistas', 'fidelidade', 'atendente', 'mensagens'];
const TESTE: Item = { rota: 'teste', texto: 'Painel de teste', icone: 'teste', gestao: true };
/** Telas que só a gestão abre. O atendente que digitar o endereço cai de volta em Chamados. */
const SO_GESTAO = ['resultados', 'financeiro', 'servicos', 'mensagens', 'equipe', 'conta', 'teste', 'importar'];

// Organização da tela "Mais": grupos com cabeçalho, no lugar do paredão de itens.
const MAIS_GRUPOS: { titulo: string; rotas: string[] }[] = [
  { titulo: 'Números', rotas: ['resultados'] },
  { titulo: 'Operação e atendimento', rotas: ['servicos', 'equipe', 'avaliacoes'] },
];
const MAIS_DESC: Record<string, string> = {
  resultados: 'Faturamento e desempenho',
  servicos: 'Tipos de reboque e socorro',
  equipe: 'Motoristas e atendentes',
  avaliacoes: 'O que os clientes acharam',
  conta: 'Dados, assinatura e Pix',
};
function Chev() {
  return <svg className="mais-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
}

export default function App() {
  const rota = useRota();
  const [estado, setEstado] = useState<'carregando' | 'sem-loja' | 'pronto'>('carregando');
  const [membro, setMembro] = useState<Membro | null>(null);
  const [minSplash, setMinSplash] = useState(true); // garante que a abertura com a marca apareça ao entrar
  const [erro, setErro] = useState('');
  useEffect(() => { const t = setTimeout(() => setMinSplash(false), 900); return () => clearTimeout(t); }, []);

  async function carregar() {
    if (MODO_DEMO) { setMembro(demoMembro); setEstado('pronto'); return; }
    const { data } = await sb.auth.getSession();
    if (!data.session) { location.replace('/entrar/'); return; }
    try {
      let m = await api.minhaLoja();
      // Quem foi convidado entra na empresa que convidou, antes de qualquer empresa própria ser criada.
      if (!m && (await api.aceitarConvites()) > 0) m = await api.minhaLoja();
      const pendente = localStorage.getItem('reboka_cadastro');
      if (!m && pendente) {
        const c = JSON.parse(pendente);
        if (c.loja && c.nome) { await api.criarLoja(c.loja, c.nome, c.plano ?? 'essencial'); m = await api.minhaLoja(); }
      }
      if (m) localStorage.removeItem('reboka_cadastro');
      // Volta do Mercado Pago: o endereço traz o número da assinatura. Confirmamos no servidor e limpamos o endereço.
      const volta = new URLSearchParams(location.search).get('preapproval_id');
      if (m && volta) {
        await cobranca.sincronizar(volta).catch(() => {});
        history.replaceState(null, '', '/app/#/conta');
        m = await api.minhaLoja();
      }
      setMembro(m);
      setEstado(m ? 'pronto' : 'sem-loja');
    } catch (e) { setErro((e as Error).message); }
  }
  useEffect(() => { carregar(); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [rota]);
  async function sair() { if (MODO_DEMO) { location.replace('/'); return; } await sb.auth.signOut(); location.replace('/'); }

  if (erro) return <div className="centro"><Aviso>Não foi possível carregar o painel: {erro}</Aviso></div>;
  if (estado === 'carregando' || minSplash) return (
    <div className="splash">
      <div className="splash-marca"><LogoMarca tamanho={92} texto={false} /></div>
      <span className="splash-dots" aria-label="Carregando"><i></i><i></i><i></i></span>
    </div>
  );
  if (estado === 'sem-loja') return <NovaLoja aoCriar={carregar} aoSair={sair} />;

  const loja = membro!.reboka_lojas;
  const papel = membro!.papel;
  const gestao = papel !== 'recepcao';
  const diasTeste = Math.ceil((new Date(loja.teste_termina_em).getTime() - Date.now()) / 86400000);
  let [base, id] = rota.split('/');
  if (FORA_DO_MENU.includes(base)) base = 'chamados';
  if (base === 'caixa') base = 'financeiro'; // Caixa virou Financeiro
  if (!gestao && SO_GESTAO.includes(base)) base = 'chamados';
  // Sem teste nem assinatura valendo, só a tela de conta (para assinar ou exportar os dados) fica aberta.
  const liberado = acessoLiberado(loja);
  if (!liberado && base !== 'mais') base = gestao ? 'conta' : 'bloqueado';
  const ativa = base === 'importar' ? (id === 'exemplo' ? 'teste' : 'clientes') : base;
  const plano = loja.plano === 'essencial' ? 'Plano Essencial' : 'Plano Frota';
  const pode = (i: Item) => gestao || !i.gestao;
  const link = (m: Item) => (
    <a key={m.rota} href={`#/${m.rota}`} aria-current={ativa === m.rota ? 'page' : undefined}><Icone nome={m.icone} />{m.texto}</a>
  );
  // Abas do mobile: Chamados, Clientes, Financeiro e Mais.
  const porRota = (r: string) => GRUPOS.flatMap((g) => g.itens).find((i) => i.rota === r)!;
  const abas: Item[] = [porRota('chamados'), porRota('clientes'), ...(gestao ? [porRota('financeiro')] : []), { rota: 'mais', texto: 'Mais', icone: 'mais' }];
  const doMais = [...GRUPOS.flatMap((g) => g.itens), TESTE].filter((i) => pode(i) && !abas.some((a) => a.rota === i.rota));
  const porRotaOpc = (r: string) => GRUPOS.flatMap((g) => g.itens).find((i) => i.rota === r);
  const linhaMais = (i: Item) => (
    <a key={i.rota} href={`#/${i.rota}`} className="mais-row">
      <span className="mais-ic"><Icone nome={i.icone} /></span>
      <span className="mais-q"><b>{i.texto}</b>{MAIS_DESC[i.rota] && <small>{MAIS_DESC[i.rota]}</small>}</span>
      <Chev />
    </a>
  );

  return (
    <div className="casca">
      <PuxarAtualizar />
      <div className="topo-m"><span>{base === 'mais' ? 'Mais' : base === 'importar' ? 'Importar clientes' : id && base === 'clientes' ? 'Cliente' : porRotaOpc(base)?.texto ?? (base === 'teste' ? 'Painel de teste' : 'Reboka')}</span></div>
      {MODO_DEMO && <span className="demo-selo" role="status">Demonstração</span>}
      {loja.assinatura === 'teste' && (
        <div className="faixa" role="status">
          <span><Icone nome="info" tamanho={18} /> {diasTeste > 0 ? `Você está no teste grátis: ${diasTeste} ${diasTeste === 1 ? 'dia restante' : 'dias restantes'}` : 'Seu teste grátis terminou'}</span>
          <a href={gestao ? '#/conta' : '/#planos'}>{diasTeste > 0 ? 'Ver planos' : 'Assinar'}</a>
        </div>
      )}
      {loja.assinatura !== 'teste' && loja.assinatura !== 'ativa' && (
        <div className="faixa" role="status">
          <span><Icone nome="info" tamanho={18} /> {liberado ? `Assinatura cancelada. Acesso até ${new Date(loja.acesso_ate!).toLocaleDateString('pt-BR')}` : 'Sem assinatura ativa'}</span>
          {gestao && <a href="#/conta">Assinar</a>}
        </div>
      )}
      <aside className="lateral">
        <a href="#/chamados" className="marca"><LogoMarca /></a>
        <div className="loja-caixa">
          <span className="inicial" aria-hidden="true">{loja.nome[0]?.toUpperCase()}</span>
          <span><b>{loja.nome}</b><small>{plano}</small></span>
        </div>
        <nav aria-label="Painel">
          {GRUPOS.map((g) => g.itens.some(pode) && (
            <div key={g.titulo} className="grupo-menu">
              <span className="titulo-grupo">{g.titulo}</span>
              {g.itens.filter(pode).map(link)}
            </div>
          ))}
        </nav>
        <div className="lateral-pe">
          {gestao && link(TESTE)}
          <a href="/ajuda/" target="_blank" rel="noopener"><Icone nome="ajuda" />Ajuda</a>
          <div className="usuario">
            <span className="inicial pequena" aria-hidden="true">{membro!.nome[0]?.toUpperCase()}</span>
            <span className="nome-usuario">{membro!.nome}</span>
            <button type="button" onClick={sair} aria-label="Sair da conta"><Icone nome="sair" /></button>
          </div>
        </div>
      </aside>
      <main className="conteudo">
        <div className={`folha${base === 'funil' || base === 'resultados' || base === 'clientes' || base === 'chamados' || base === 'financeiro' ? ' folha-larga' : ''}`}>
          {base === 'bloqueado' && (
            <header className="cabeca"><div><h1>Acesso pausado</h1><p>O teste grátis ou a assinatura desta empresa terminou. Peça a quem administra a conta para assinar um plano. Os dados continuam guardados.</p></div></header>
          )}
          {!liberado && base === 'conta' && <Aviso tipo="info">{loja.assinatura === 'teste' ? 'O teste grátis terminou.' : 'A assinatura não está ativa.'} Assine um plano para voltar a usar o painel. Seus dados continuam guardados e você pode exportá-los abaixo.</Aviso>}
          {base === 'chamados' && <Chamados loja={loja} gestao={gestao} aoMudar={carregar} />}
          {base === 'clientes' && !id && <Clientes lojaId={loja.id} gestao={gestao} />}
          {base === 'clientes' && id && <Ficha lojaId={loja.id} clienteId={id} gestao={gestao} />}
          {base === 'importar' && <Importar lojaId={loja.id} demo={id === 'exemplo'} />}
          {base === 'resultados' && <Resultados loja={loja} />}
          {base === 'financeiro' && <Financeiro loja={loja} aoMudar={carregar} />}
          {base === 'servicos' && <Servicos lojaId={loja.id} />}
          {base === 'avaliacoes' && <Avaliacoes loja={loja} aoMudar={carregar} />}
          {base === 'equipe' && <Equipe loja={loja} euId={membro!.usuario_id} />}
          {base === 'conta' && <Conta loja={loja} papel={papel} aoMudar={carregar} />}
          {base === 'teste' && <Teste loja={loja} />}
          {base === 'mais' && (
            <div className="mais">
              <h1 className="mais-titulo">Mais</h1>
              <a href="#/conta" className="mais-conta">
                <span className="mais-av" aria-hidden="true">{loja.nome[0]?.toUpperCase()}</span>
                <span className="mais-q"><b>{loja.nome}</b><small>{plano} · Conta de {membro!.nome}</small></span>
                <Chev />
              </a>
              {MAIS_GRUPOS.map((g) => {
                const itens = g.rotas.map(porRotaOpc).filter((i): i is Item => !!i && pode(i));
                if (!itens.length) return null;
                return (
                  <section key={g.titulo} className="mais-secao">
                    <div className="mais-gtit">{g.titulo}</div>
                    <div className="mais-grupo">{itens.map(linhaMais)}</div>
                  </section>
                );
              })}
              <section className="mais-secao">
                <div className="mais-gtit">Conta</div>
                <div className="mais-grupo">
                  {(() => { const c = porRotaOpc('conta'); return c && pode(c) ? linhaMais(c) : null; })()}
                  <a href="/ajuda/" className="mais-row" target="_blank" rel="noopener">
                    <span className="mais-ic"><Icone nome="ajuda" /></span>
                    <span className="mais-q"><b>Ajuda</b></span>
                    <Chev />
                  </a>
                  <button type="button" className="mais-row mais-sair" onClick={sair}>
                    <span className="mais-ic"><Icone nome="sair" /></span>
                    <span className="mais-q"><b>Sair da conta</b></span>
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </main>
      <nav className="abas" aria-label="Painel">
        {abas.map((m) => (
          <a key={m.rota} href={`#/${m.rota}`} aria-current={(m.rota === 'mais' ? m.rota === ativa || doMais.some((i) => i.rota === ativa) : ativa === m.rota) ? 'page' : undefined}><Icone nome={m.icone} />{m.texto}</a>
        ))}
      </nav>
    </div>
  );
}

function NovaLoja({ aoCriar, aoSair }: { aoCriar: () => void; aoSair: () => void }) {
  const [nome, setNome] = useState('');
  const [loja, setLoja] = useState('');
  const [erro, setErro] = useState('');
  async function enviar(e: FormEvent) {
    e.preventDefault();
    try { await api.criarLoja(loja, nome, 'essencial'); aoCriar(); } catch (e) { setErro((e as Error).message); }
  }
  return (
    <div className="centro">
      <form className="auth-cartao" onSubmit={enviar}>
        <LogoMarca />
        <h1>Vamos criar sua empresa</h1>
        <p className="sub">Só falta isso para abrir o painel.</p>
        <Campo rotulo="Seu nome"><input required value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Nome do guincho"><input required value={loja} onChange={(e) => setLoja(e.target.value)} /></Campo>
        {erro && <Aviso>{erro}</Aviso>}
        <button className="btn btn-primario">Criar empresa</button>
        <p className="troca"><button type="button" className="link" onClick={aoSair}>Sair desta conta</button></p>
      </form>
    </div>
  );
}
