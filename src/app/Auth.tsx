import { useEffect, useState, type FormEvent } from 'react';
import { sb } from './api';
import { Campo, Aviso } from './ui';

const ERROS: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos e tente entrar de novo.',
  'User already registered': 'Já existe uma conta com esse e-mail. Use "Entrar".',
};
const traduzir = (m: string) =>
  ERROS[m] ?? (m.includes('Password should be') ? 'A senha precisa ter pelo menos 6 caracteres.'
    : m.includes('rate limit') ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' : m);

/** Formulário de cadastro e de login. Depois de entrar, manda para o painel (/app/). */
export default function Auth({ modo }: { modo: 'cadastro' | 'entrar' }) {
  const [nome, setNome] = useState('');
  const [loja, setLoja] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const [tela, setTela] = useState<'normal' | 'esqueci' | 'enviada' | 'nova'>('normal');
  // Link de convite: /cadastro/?convite=email. A pessoa não cria empresa, entra na de quem convidou.
  const convite = modo === 'cadastro' ? new URLSearchParams(location.search).get('convite') : null;

  useEffect(() => {
    if (convite) setEmail(convite);
    // O link "redefinir senha" do e-mail volta para /entrar/ com type=recovery no endereço.
    const recuperando = location.hash.includes('type=recovery') || location.search.includes('recuperar');
    if (recuperando) setTela('nova');
    const { data: escuta } = sb.auth.onAuthStateChange((evento) => { if (evento === 'PASSWORD_RECOVERY') setTela('nova'); });
    if (!recuperando) sb.auth.getSession().then(({ data }) => { if (data.session) location.replace('/app/'); });
    return () => escuta.subscription.unsubscribe();
  }, []);

  async function pedirLink(e: FormEvent) {
    e.preventDefault(); setErro(''); setOcupado(true);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/entrar/?recuperar` });
    setOcupado(false);
    if (error) setErro(traduzir(error.message)); else setTela('enviada');
  }
  async function trocarSenha(e: FormEvent) {
    e.preventDefault(); setErro(''); setOcupado(true);
    const { error } = await sb.auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) setErro(error.message.includes('session') ? 'O link expirou. Peça um novo em "Esqueci minha senha".' : traduzir(error.message));
    else location.replace('/app/');
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(''); setOcupado(true);
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        location.replace('/app/');
        return;
      }
      const plano = new URLSearchParams(location.search).get('plano') === 'equipe' ? 'equipe' : 'essencial';
      // Guardamos nome e empresa para criar a empresa no primeiro acesso, mesmo se o e-mail precisar de confirmação antes.
      if (convite) localStorage.removeItem('reboka_cadastro');
      else localStorage.setItem('reboka_cadastro', JSON.stringify({ nome, loja, plano }));
      const { data, error } = await sb.auth.signUp({
        email, password: senha,
        // 'produto' fica gravado no cadastro para identificar a origem do usuário.
        options: { data: { nome, produto: 'reboka' }, emailRedirectTo: `${location.origin}/entrar/` },
      });
      if (error) throw error;
      if (data.session) location.replace('/app/');
      else setEnviado(true);
    } catch (e) {
      setErro(traduzir((e as Error).message));
    } finally {
      setOcupado(false);
    }
  }

  if (enviado) {
    return (
      <div className="auth-cartao">
        <h1>Confirme seu e-mail</h1>
        <p>Enviamos um link de confirmação para <b>{email}</b>. Abra o e-mail, toque no link e depois entre com sua senha.</p>
        <a className="btn btn-primario" href="/entrar/">Ir para o login</a>
      </div>
    );
  }

  if (tela === 'esqueci' || tela === 'enviada') {
    return (
      <form className="auth-cartao" onSubmit={pedirLink}>
        <h1>Redefinir senha</h1>
        {tela === 'enviada' ? (
          <p>Se existe uma conta com <b>{email}</b>, enviamos um link para criar uma senha nova. Confira também a caixa de spam.</p>
        ) : (
          <>
            <p className="sub">Informe o e-mail da conta. Enviamos um link para você criar uma senha nova.</p>
            <Campo rotulo="E-mail"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Campo>
            {erro && <Aviso>{erro}</Aviso>}
            <button className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Aguarde' : 'Enviar link'}</button>
          </>
        )}
        <p className="troca"><button type="button" className="link" onClick={() => { setTela('normal'); setErro(''); }}>Voltar para o login</button></p>
      </form>
    );
  }
  if (tela === 'nova') {
    return (
      <form className="auth-cartao" onSubmit={trocarSenha}>
        <h1>Crie uma senha nova</h1>
        <Campo rotulo="Senha nova" dica="Pelo menos 6 caracteres."><input required type="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" /></Campo>
        {erro && <Aviso>{erro}</Aviso>}
        <button className="btn btn-primario" disabled={ocupado}>{ocupado ? 'Aguarde' : 'Salvar e entrar'}</button>
      </form>
    );
  }

  return (
    <form className="auth-cartao" onSubmit={enviar}>
      <h1>{convite ? 'Entre na equipe' : modo === 'cadastro' ? 'Teste o Reboka por 14 dias' : 'Entrar'}</h1>
      {convite ? <p className="sub">Você recebeu um convite para o Reboka de uma empresa. Crie sua conta com o e-mail do convite.</p>
        : modo === 'cadastro' && <p className="sub">Sem cartão de crédito. Em um minuto você abre o primeiro chamado.</p>}
      {modo === 'cadastro' && (
        <>
          <Campo rotulo="Seu nome"><input required value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" /></Campo>
          {!convite && <Campo rotulo="Nome da empresa"><input required value={loja} onChange={(e) => setLoja(e.target.value)} autoComplete="organization" /></Campo>}
        </>
      )}
      <Campo rotulo="E-mail"><input required type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Campo>
      <Campo rotulo="Senha" dica={modo === 'cadastro' ? 'Pelo menos 6 caracteres.' : undefined}>
        <div className="auth-senha">
          <input required type={verSenha ? 'text' : 'password'} name="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === 'cadastro' ? 'new-password' : 'current-password'} />
          <button type="button" className="auth-olho" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={verSenha}>
            {verSenha
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.9 17.9A10.3 10.3 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.1-6M9.9 4.2A10.3 10.3 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
          </button>
        </div>
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <button className="btn btn-primario" disabled={ocupado}>
        {ocupado ? 'Aguarde' : modo === 'cadastro' ? 'Criar conta' : 'Entrar'}
      </button>
      {modo === 'cadastro'
        ? <p className="troca">Ao criar a conta você aceita os <a href="/termos/">termos de uso</a> e a <a href="/privacidade/">política de privacidade</a>. Já tem conta? <a href="/entrar/">Entrar</a></p>
        : <p className="troca"><button type="button" className="link" onClick={() => { setTela('esqueci'); setErro(''); }}>Esqueci minha senha</button><br />Ainda não tem conta? <a href="/cadastro/">Testar grátis</a></p>}
    </form>
  );
}
