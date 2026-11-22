import { useEffect, useState, type FormEvent } from 'react';
import { api, type PedirInfo } from './api';
import { LogoMarca } from './ui';
import { linkWhatsApp } from './util';

// Página pública "Pedir guincho": o cliente preenche no celular e o pedido cai como chamado Novo no painel do guincho.
// ?g=demo mostra um exemplo sem gravar nada, para o guincheiro ver como o cliente enxerga.
const DEMO: PedirInfo = { nome: 'Guincho Pinheirinho 24h', telefone: '41999990000',
  servicos: ['Reboque de carro', 'Reboque de moto', 'Reboque de utilitário ou SUV', 'Socorro: bateria (chupeta)', 'Socorro: troca de pneu', 'Socorro: pane seca'] };

type Posicao = { lat: number; lng: number; precisao: number };

export default function Pedir() {
  const slug = new URLSearchParams(location.search).get('g') ?? '';
  const demo = slug === 'demo';
  const [info, setInfo] = useState<PedirInfo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [servico, setServico] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [veiculo, setVeiculo] = useState('');
  const [placa, setPlaca] = useState('');
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  const [obs, setObs] = useState('');
  const [pos, setPos] = useState<Posicao | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroPos, setErroPos] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState('');
  const [passo, setPasso] = useState(0);

  useEffect(() => {
    if (demo) { setInfo(DEMO); setCarregando(false); return; }
    if (!slug) { setCarregando(false); return; }
    api.pedirInfo(slug).then(setInfo).catch(() => {}).finally(() => setCarregando(false));
  }, [slug]);

  // O aviso de erro some assim que a pessoa corrige o campo.
  useEffect(() => { setErro(''); }, [pos, origem, nome, telefone]);

  function localizar() {
    if (!navigator.geolocation) { setErroPos('Este celular não liberou a localização. Escreva o endereço abaixo.'); return; }
    setBuscando(true); setErroPos('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: Math.round(p.coords.accuracy) }); setBuscando(false); },
      () => { setErroPos('Não consegui pegar a localização. Escreva o endereço ou um ponto de referência.'); setBuscando(false); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  // Assistente em 3 passos: uma pergunta por tela, para quem está na rua com o carro parado.
  const PASSOS = ['Onde você está', 'O que aconteceu', 'Seus dados'];
  const telOk = telefone.replace(/\D/g, '').length >= 10;
  function validar(p: number) {
    if (p === 0 && !pos && !origem.trim()) return 'Use a localização ou escreva o endereço.';
    if (p === 2 && nome.trim().length < 2) return 'Informe seu nome.';
    if (p === 2 && !telOk) return 'Informe um WhatsApp com DDD.';
    return '';
  }
  function ir(p: number) { setErro(''); setPasso(p); window.scrollTo({ top: 0 }); }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const falta = validar(passo);
    if (falta) { setErro(falta); return; }
    if (passo < PASSOS.length - 1) { ir(passo + 1); return; }
    setEnviando(true); setErro('');
    try {
      if (!demo) await api.pedir(slug, { nome, telefone, veiculo, placa, servico, origem, destino, observacao: obs, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
      setPronto(true);
    } catch (e) { setErro((e as Error).message); setEnviando(false); }
  }

  if (carregando) return <div className="ag-centro"><p>Carregando…</p></div>;
  if (!info) return <div className="ag-centro"><div className="ag-aviso"><h1>Link indisponível</h1><p>Este link de pedidos não está ativo. Ligue direto para o guincho.</p></div></div>;
  if (pronto) return (
    <div className="ag-centro"><div className="ag-ok">
      <div className="ag-check">✓</div>
      <h1>Pedido enviado!</h1>
      <p><b>{info.nome}</b> recebeu seu pedido e vai responder no seu WhatsApp com o valor e o tempo de chegada.</p>
      <p className="ag-sub">Fique em local seguro e com o pisca-alerta ligado.</p>
      {info.telefone && <a className="ag-confirmar pd-wpp" href={linkWhatsApp(info.telefone, `Oi! Acabei de pedir um guincho pelo link. Meu nome é ${nome.trim()}.`)} target="_blank" rel="noopener">Falar com o guincho no WhatsApp</a>}
      {demo && <p className="ag-sub">Este é um exemplo: nada foi gravado.</p>}
    </div></div>
  );

  return (
    <div className="ag-pagina">
      <header className="ag-topo"><LogoMarca /><span>{info.nome}</span></header>
      <form className="ag-main" onSubmit={enviar} noValidate>
        <div className="pd-progresso" role="progressbar" aria-valuemin={1} aria-valuemax={PASSOS.length} aria-valuenow={passo + 1} aria-label={`Passo ${passo + 1} de ${PASSOS.length}`}>
          {PASSOS.map((_, i) => <i key={i} className={i <= passo ? 'on' : ''} />)}
        </div>
        <p className="pd-passo">Passo {passo + 1} de {PASSOS.length}</p>

        {passo === 0 && (
          <section>
            <h1>Onde o veículo está?</h1>
            <p className="ag-sub">O guincho responde no seu WhatsApp com o valor antes de sair.</p>
            <div className="ag-bloco">
              <button type="button" className={`pd-local${pos ? ' ok' : ''}`} onClick={localizar} disabled={buscando}>
                {buscando ? 'Buscando sua localização…' : pos ? 'Localização enviada. Tocar para atualizar' : 'Usar minha localização'}
              </button>
              {pos && <p className="pd-nota">Posição capturada, com precisão de cerca de {pos.precisao} m.</p>}
              {erroPos && <p className="ag-erro">{erroPos}</p>}
              <label className="ag-campo"><span>{pos ? 'Ponto de referência (opcional)' : 'Ou escreva o endereço'}</span>
                <input value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Rua, número, bairro ou referência" maxLength={200} /></label>
              <label className="ag-campo"><span>Para onde levar (opcional)</span>
                <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Oficina, casa ou bairro" maxLength={200} /></label>
            </div>
          </section>
        )}

        {passo === 1 && (
          <section>
            <h1>O que você precisa?</h1>
            <p className="ag-sub">Escolha o serviço e diga qual é o veículo.</p>
            {info.servicos.length > 0 && (
              <div className="ag-bloco">
                <div className="ag-chips pd-servicos">
                  {info.servicos.map((s) => (
                    <button key={s} type="button" aria-pressed={servico === s} className={servico === s ? 'on' : ''} onClick={() => setServico(servico === s ? '' : s)}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="ag-bloco">
              <div className="pd-dupla">
                <label className="ag-campo"><span>Veículo</span><input value={veiculo} onChange={(e) => setVeiculo(e.target.value)} placeholder="Onix branco" maxLength={80} /></label>
                <label className="ag-campo"><span>Placa (opcional)</span><input value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="ABC1D23" maxLength={8} /></label>
              </div>
              <label className="ag-campo"><span>Observação (opcional)</span><input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Roda travada, sem chave, carro rebaixado" maxLength={300} /></label>
            </div>
          </section>
        )}

        {passo === 2 && (
          <section>
            <h1>Como o guincho fala com você?</h1>
            <p className="ag-sub">A resposta com o valor chega neste WhatsApp.</p>
            <div className="ag-bloco">
              <label className="ag-campo"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" autoComplete="name" maxLength={80} /></label>
              <label className="ag-campo"><span>WhatsApp</span><input type="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(41) 99999-9999" autoComplete="tel" /></label>
            </div>
            <dl className="pd-resumo">
              <dt>Onde está</dt><dd>{[pos ? 'Localização do celular' : '', origem.trim()].filter(Boolean).join(' · ')}<button type="button" onClick={() => ir(0)}>Alterar</button></dd>
              {destino.trim() && <><dt>Para onde</dt><dd>{destino.trim()}</dd></>}
              <dt>Pedido</dt><dd>{[servico, veiculo.trim(), placa.trim().toUpperCase()].filter(Boolean).join(' · ') || 'Não informado'}<button type="button" onClick={() => ir(1)}>Alterar</button></dd>
            </dl>
          </section>
        )}

        {erro && <p className="ag-erro" role="alert">{erro}</p>}
        <div className="pd-nav">
          {passo > 0 && <button type="button" className="pd-voltar" onClick={() => ir(passo - 1)}>Voltar</button>}
          <button className="ag-confirmar" disabled={enviando}>{passo < PASSOS.length - 1 ? 'Continuar' : enviando ? 'Enviando…' : 'Enviar pedido'}</button>
        </div>
        {passo === PASSOS.length - 1 && <p className="pd-nota pd-centro">Seus dados vão só para {info.nome}, para atender este pedido.</p>}
      </form>
      <footer className="ag-rodape">Pedido por <b>Reboka</b></footer>
    </div>
  );
}
