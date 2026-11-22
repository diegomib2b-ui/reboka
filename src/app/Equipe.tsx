import { useEffect, useState, type FormEvent } from 'react';
import { api, type Pessoa, type Convite, type Registro, type Papel, type Loja } from './api';
import { Janela, Campo, Aviso } from './ui';
import { dataBR } from './util';

export const NOME_PAPEL: Record<Papel, string> = { dono: 'Dono da conta', gestor: 'Gestão', recepcao: 'Atendente' };
const PODE: [string, boolean, boolean][] = [
  // o que, recepção, gestão
  ['Ver a agenda e os retornos, e chamar no WhatsApp', true, true],
  ['Cadastrar e editar clientes, registrar atendimentos', true, true],
  ['Mover negociações no funil', true, true],
  ['Ver a lista de reativação', true, true],
  ['Ver resultados e faturamento', false, true],
  ['Importar planilha e apagar clientes', false, true],
  ['Editar serviços e mensagens', false, true],
  ['Convidar pessoas e ver o registro de alterações', false, true],
];

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function Equipe({ loja, euId }: { loja: Loja; euId: string }) {
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [registro, setRegistro] = useState<Registro[]>([]);
  const [erro, setErro] = useState('');
  const [convidando, setConvidando] = useState(false);
  const [removendo, setRemovendo] = useState<Pessoa | null>(null);
  const [copiado, setCopiado] = useState('');
  const planoLoja = loja.plano !== 'essencial';

  const carregar = () => Promise.all([api.equipe(loja.id), api.convites(loja.id), planoLoja ? api.registro(loja.id) : Promise.resolve([])])
    .then(([p, c, r]) => { setPessoas(p); setConvites(c); setRegistro(r); }).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  const agir = (f: Promise<unknown>) => { setErro(''); f.then(carregar).catch((e) => setErro(e.message)); };
  const link = (email: string) => `${location.origin}/cadastro/?convite=${encodeURIComponent(email)}`;
  async function copiar(email: string) {
    try { await navigator.clipboard.writeText(`Você recebeu um convite para o Reboka da ${loja.nome}. Crie sua conta com este e-mail (${email}): ${link(email)}`); setCopiado(email); }
    catch { setErro('Não foi possível copiar. Copie o endereço manualmente: ' + link(email)); }
  }

  if (!pessoas) return erro ? <Aviso>{erro}</Aviso> : <p className="carregando">Carregando</p>;

  return (
    <>
      <header className="cabeca">
        <div>
          <h1>Equipe</h1>
          <p>Quem acessa o Reboka da {loja.nome} e o que cada função pode fazer.</p>
        </div>
        {planoLoja && <button type="button" className="btn btn-primario" onClick={() => setConvidando(true)}>Convidar pessoa</button>}
      </header>
      {erro && <Aviso>{erro}</Aviso>}
      {!planoLoja && <Aviso tipo="info">O plano Essencial tem 1 usuário. Equipe, permissões e registro de alterações fazem parte do plano Equipe. <a href="#/conta">Ver planos na conta</a></Aviso>}

      <section className="bloco">
        <h2>Pessoas</h2>
        <ul className="lista-procs">
          {pessoas.map((p) => (
            <li key={p.usuario_id}>
              <div className="quem"><b>{p.nome}{p.usuario_id === euId ? ' (você)' : ''}</b><span>Desde {dataBR(p.criado_em)}</span></div>
              {p.papel === 'dono' || p.usuario_id === euId ? <span className="chip chip-ok">{NOME_PAPEL[p.papel]}</span> : (
                <label><span className="so-leitor">Função de {p.nome}</span>
                  <select className="seletor" value={p.papel} onChange={(e) => agir(api.mudarPapel(loja.id, p.usuario_id, e.target.value as Papel))}>
                    <option value="recepcao">Atendente</option><option value="gestor">Gestão</option>
                  </select>
                </label>
              )}
              <span />
              {p.papel !== 'dono' && p.usuario_id !== euId ? <button type="button" className="btn btn-perigo" onClick={() => setRemovendo(p)}>Remover</button> : <span />}
            </li>
          ))}
        </ul>
        {convites.length > 0 && (
          <>
            <h3 className="sub-bloco">Convites aguardando</h3>
            <ul className="lista-procs">
              {convites.map((c) => (
                <li key={c.id}>
                  <div className="quem"><b>{c.email}</b><span>{NOME_PAPEL[c.papel]}, convite de {dataBR(c.criado_em)}</span></div>
                  <span />
                  <button type="button" className="btn btn-secundario" onClick={() => copiar(c.email)}>{copiado === c.email ? 'Copiado' : 'Copiar convite'}</button>
                  <button type="button" className="btn btn-perigo" onClick={() => agir(api.cancelarConvite(c.id))}>Cancelar</button>
                </li>
              ))}
            </ul>
            <p className="dica">Envie o convite copiado pelo WhatsApp. A pessoa cria a conta com o mesmo e-mail e já entra na empresa.</p>
          </>
        )}
      </section>

      <section className="bloco">
        <h2>O que cada função pode fazer</h2>
        <div className="rolagem">
          <table className="previa permissoes">
            <thead><tr><th>Ação</th><th>Atendente</th><th>Gestão e dono</th></tr></thead>
            <tbody>{PODE.map(([oque, r, g]) => <tr key={oque}><td>{oque}</td><td>{r ? 'Sim' : 'Não'}</td><td>{g ? 'Sim' : 'Não'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      {planoLoja && (
        <section className="bloco">
          <h2>Registro de alterações</h2>
          {registro.length === 0 ? <p className="mudo">Nada registrado ainda. Cadastros, atendimentos, negociações e configurações alterados aparecem aqui, com quem fez e quando.</p> : (
            <ul className="contatos registro">
              {registro.map((r) => <li key={r.id}><b>{quando(r.criado_em)}</b> {r.quem} {r.acao}</li>)}
            </ul>
          )}
          <p className="dica">Mostra as 60 alterações mais recentes. Dados de exemplo não entram.</p>
        </section>
      )}

      <Janela titulo="Convidar pessoa" aberta={convidando} aoFechar={() => setConvidando(false)}>
        {convidando && <FormConvite lojaId={loja.id} aoCancelar={() => setConvidando(false)} aoSalvar={() => { setConvidando(false); carregar(); }} />}
      </Janela>
      <Janela titulo="Remover acesso" aberta={!!removendo} aoFechar={() => setRemovendo(null)}>
        <p><b>{removendo?.nome}</b> deixa de acessar o Reboka desta empresa. O que essa pessoa registrou continua no histórico.</p>
        <div className="acoes">
          <button type="button" className="btn btn-secundario" onClick={() => setRemovendo(null)}>Manter</button>
          <button type="button" className="btn btn-perigo" onClick={() => { const p = removendo!; setRemovendo(null); agir(api.removerPessoa(loja.id, p.usuario_id)); }}>Remover acesso</button>
        </div>
      </Janela>
    </>
  );
}

function FormConvite({ lojaId, aoSalvar, aoCancelar }: { lojaId: string; aoSalvar: () => void; aoCancelar: () => void }) {
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('recepcao');
  const [erro, setErro] = useState('');
  async function enviar(e: FormEvent) {
    e.preventDefault();
    try { await api.convidar(lojaId, email, papel); aoSalvar(); } catch (e) { setErro((e as Error).message); }
  }
  return (
    <form onSubmit={enviar}>
      <Campo rotulo="E-mail da pessoa" dica="Ela precisa criar a conta com este mesmo e-mail."><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
      <Campo rotulo="Função">
        <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
          <option value="recepcao">Atendente: usa o dia a dia, sem ver faturamento</option>
          <option value="gestor">Gestão: vê resultados e configura</option>
        </select>
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="acoes">
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario">Criar convite</button>
      </div>
    </form>
  );
}
