import { useEffect, useRef, useState } from 'react';
import { api, fonteMapa, type Loja, type Lugar, type Ponto } from './api';
import { Icone } from './icones';

/**
 * Trajeto do chamado com os três trechos que o guincho cobra:
 *   deslocamento (de onde o guincho está até o veículo), transporte (do veículo ao destino) e retorno (do destino à base).
 * Com os pontos no mapa, a rota é medida sozinha; os km continuam editáveis. Sem mapa configurado, a pessoa digita os km.
 */
export type Local = { texto: string; lat: number | null; lng: number | null };
export type Partida = 'gps' | 'base' | 'outro';
export type TrajetoDados = {
  partida: Local; modo: Partida; veiculo: Local; destino: Local;
  km: { desloc: string; transporte: string; retorno: string }; min: number | null;
};

export const temPonto = (l: Local | null | undefined): l is Local & Ponto => !!l && l.lat != null && l.lng != null;
const vazio: Local = { texto: '', lat: null, lng: null };
const kmTexto = (n: number | null | undefined) => (n ? String(Number(n)).replace('.', ',') : '');
export const kmNum = (t: string) => Number(t.replace(',', '.')) || 0;
const CHAVE_MODO = 'reboka.partida';

export function baseDe(loja: Loja): Local | null {
  return loja.base_lat != null && loja.base_lng != null ? { texto: loja.base_endereco || 'Base do guincho', lat: Number(loja.base_lat), lng: Number(loja.base_lng) } : null;
}

/** Monta o trajeto inicial a partir do chamado (ou vazio, para um chamado novo). */
export function trajetoInicial(loja: Loja, a?: {
  origem?: string | null; origem_lat?: number | null; origem_lng?: number | null; destino?: string | null; destino_lat?: number | null; destino_lng?: number | null;
  partida_endereco?: string | null; partida_lat?: number | null; partida_lng?: number | null; km?: number | null; km_desloc?: number | null; km_retorno?: number | null; min_rota?: number | null;
}): TrajetoDados {
  const base = baseDe(loja);
  let lembrado: Partida | null = null;
  try { lembrado = localStorage.getItem(CHAVE_MODO) as Partida | null; } catch { /* navegador sem armazenamento */ }
  const salvo = a?.partida_lat != null ? { texto: a.partida_endereco || 'Ponto de partida', lat: Number(a.partida_lat), lng: Number(a.partida_lng) } : null;
  const modo: Partida = salvo ? 'outro' : lembrado === 'gps' ? 'gps' : base ? 'base' : 'gps';
  return {
    partida: salvo ?? (modo === 'base' && base ? base : vazio), modo,
    veiculo: { texto: a?.origem ?? '', lat: a?.origem_lat != null ? Number(a.origem_lat) : null, lng: a?.origem_lng != null ? Number(a.origem_lng) : null },
    destino: { texto: a?.destino ?? '', lat: a?.destino_lat != null ? Number(a.destino_lat) : null, lng: a?.destino_lng != null ? Number(a.destino_lng) : null },
    km: { desloc: kmTexto(a?.km_desloc), transporte: kmTexto(a?.km), retorno: kmTexto(a?.km_retorno) },
    min: a?.min_rota ?? null,
  };
}

/** Campos que a cotação grava no chamado. */
export function camposDoTrajeto(t: TrajetoDados) {
  return {
    origem: t.veiculo.texto.trim() || null, origem_lat: t.veiculo.lat, origem_lng: t.veiculo.lng,
    destino: t.destino.texto.trim() || null, destino_lat: t.destino.lat, destino_lng: t.destino.lng,
    partida_endereco: temPonto(t.partida) ? t.partida.texto : null, partida_lat: t.partida.lat, partida_lng: t.partida.lng,
    km: kmNum(t.km.transporte) || null, km_desloc: kmNum(t.km.desloc) || null, km_retorno: kmNum(t.km.retorno) || null, min_rota: t.min,
  };
}

/** Pede a posição deste celular. */
export function minhaPosicao(): Promise<Ponto> {
  return new Promise((ok, falha) => {
    if (!('geolocation' in navigator)) { falha(new Error('Este aparelho não informa a localização.')); return; }
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => falha(new Error('Não foi possível pegar a localização. Libere o acesso à localização no navegador.')), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}

/** Campo de endereço: ao parar de digitar, procura no mapa e mostra até 4 sugestões para escolher. */
export function CampoEndereco({ rotulo, valor, aoMudar, placeholder, perto, extra, autoFocus }: {
  rotulo: string; valor: Local; aoMudar: (l: Local) => void; placeholder?: string; perto?: Ponto | null; extra?: React.ReactNode; autoFocus?: boolean;
}) {
  const [sugestoes, setSugestoes] = useState<Lugar[]>([]);
  const [buscando, setBuscando] = useState(false);
  const digitou = useRef(false);
  useEffect(() => {
    if (!digitou.current || temPonto(valor) || valor.texto.trim().length < 6) { setSugestoes([]); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      try { const r = await api.buscarEndereco(valor.texto.trim(), perto); if (vivo) setSugestoes((r ?? []).slice(0, 4)); }
      catch { if (vivo) setSugestoes([]); }
      finally { if (vivo) setBuscando(false); }
    }, 700);
    return () => { vivo = false; clearTimeout(t); };
  }, [valor.texto, valor.lat]);
  return (
    <div className="tj-campo">
      <label className="campo">
        <span className="campo-rotulo">{rotulo}</span>
        <span className="tj-entrada">
          <input value={valor.texto} autoFocus={autoFocus} placeholder={placeholder} autoComplete="off"
            onChange={(e) => { digitou.current = true; aoMudar({ texto: e.target.value, lat: null, lng: null }); }} />
          {temPonto(valor) && <i className="tj-ok" title="Ponto marcado no mapa" aria-label="Ponto marcado no mapa"><Icone nome="selo" tamanho={18} /></i>}
        </span>
      </label>
      {extra}
      {(buscando || sugestoes.length > 0) && (
        <ul className="tj-sug" role="listbox" aria-label={`Sugestões para ${rotulo}`}>
          {buscando && sugestoes.length === 0 && <li className="tj-sug-info">Procurando no mapa…</li>}
          {sugestoes.map((s, i) => (
            <li key={i}><button type="button" onClick={() => { digitou.current = false; setSugestoes([]); aoMudar({ texto: s.texto, lat: s.lat, lng: s.lng }); }}>{s.texto}</button></li>
          ))}
          {fonteMapa === 'ors' && sugestoes.length > 0 && <li className="tj-credito"><CreditoMapa /></li>}
        </ul>
      )}
    </div>
  );
}

export default function Trajeto({ loja, valor, aoMudar, foco }: { loja: Loja; valor: TrajetoDados; aoMudar: (t: TrajetoDados) => void; foco?: boolean }) {
  const base = baseDe(loja);
  const [estado, setEstado] = useState<'ocioso' | 'calculando' | 'ok' | 'sem-mapa' | 'erro'>('ocioso');
  const [aviso, setAviso] = useState('');
  const [pegandoGps, setPegandoGps] = useState(false);
  const atual = useRef(valor); atual.current = valor;
  const mudar = (p: Partial<TrajetoDados>) => aoMudar({ ...atual.current, ...p });

  async function usarGps() {
    setPegandoGps(true); setAviso('');
    try {
      const p = await minhaPosicao();
      const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      mudar({ modo: 'gps', partida: { texto: `Onde estou agora (${hora})`, ...p } });
      try { localStorage.setItem(CHAVE_MODO, 'gps'); } catch { /* sem armazenamento */ }
    } catch (e) { setAviso((e as Error).message); }
    finally { setPegandoGps(false); }
  }
  function escolher(m: Partida) {
    if (m === 'gps') { usarGps(); return; }
    if (m === 'base') { mudar({ modo: 'base', partida: base ?? vazio }); try { localStorage.setItem(CHAVE_MODO, 'base'); } catch { /* sem armazenamento */ } return; }
    mudar({ modo: 'outro', partida: vazio });
  }
  // Ao abrir no modo "onde estou", pega a posição se o navegador já tiver permissão.
  useEffect(() => {
    if (valor.modo !== 'gps' || temPonto(valor.partida)) return;
    const perm = (navigator as Navigator & { permissions?: Permissions }).permissions;
    perm?.query({ name: 'geolocation' as PermissionName }).then((s) => { if (s.state === 'granted') usarGps(); }).catch(() => {});
  }, []);

  // Quando os três pontos estão no mapa, mede a rota sozinho (deslocamento, transporte e, com base, o retorno).
  const chave = [valor.partida, valor.veiculo, valor.destino].every(temPonto)
    ? [valor.partida, valor.veiculo, valor.destino, base].filter(temPonto).map((p) => `${p!.lat.toFixed(5)},${p!.lng.toFixed(5)}`).join(';') : '';
  useEffect(() => {
    if (!chave) { setEstado((e) => (e === 'sem-mapa' ? e : 'ocioso')); return; }
    let vivo = true;
    setEstado('calculando'); setAviso('');
    const pontos = [valor.partida, valor.veiculo, valor.destino, ...(base ? [base] : [])] as Ponto[];
    api.calcularRota(pontos.map((p) => ({ lat: p.lat, lng: p.lng }))).then((t) => {
      if (!vivo) return;
      if (!t) { setEstado('sem-mapa'); return; }
      const txt = (n: number) => String(n).replace('.', ',');
      mudar({ km: { desloc: txt(t[0].km), transporte: txt(t[1].km), retorno: t[2] ? txt(t[2].km) : '' }, min: t.reduce((s, x) => s + x.min, 0) });
      setEstado('ok');
    }).catch((e) => { if (vivo) { setEstado('erro'); setAviso((e as Error).message); } });
    return () => { vivo = false; };
  }, [chave]);

  const referencia = base ?? (temPonto(valor.partida) ? valor.partida : null);
  const perto: Ponto | null = referencia && temPonto(referencia) ? { lat: referencia.lat, lng: referencia.lng } : null;
  const kmCampo = (k: keyof TrajetoDados['km'], rot: string) => (
    <label className="tj-km">
      <span>{rot}</span>
      <span className="tj-km-campo"><input inputMode="decimal" value={valor.km[k]} onChange={(e) => mudar({ km: { ...valor.km, [k]: e.target.value } })} placeholder="0" aria-label={`${rot} em km`} /><i>km</i></span>
    </label>
  );
  const total = kmNum(valor.km.desloc) + kmNum(valor.km.transporte) + kmNum(valor.km.retorno);

  return (
    <div className="tj">
      <div className="tj-pt">
        <i className="tj-marca tj-m-guincho" aria-hidden="true" />
        <div className="tj-corpo">
          <span className="campo-rotulo">Guincho sai de</span>
          <div className="tj-opcoes" role="group" aria-label="De onde o guincho sai">
            <button type="button" aria-pressed={valor.modo === 'gps'} onClick={() => escolher('gps')} disabled={pegandoGps}>{pegandoGps ? 'Localizando…' : 'Onde estou agora'}</button>
            {base && <button type="button" aria-pressed={valor.modo === 'base'} onClick={() => escolher('base')}>Base</button>}
            <button type="button" aria-pressed={valor.modo === 'outro'} onClick={() => escolher('outro')}>Outro endereço</button>
          </div>
          {valor.modo === 'outro'
            ? <CampoEndereco rotulo="Endereço de onde o guincho sai" valor={valor.partida} aoMudar={(l) => mudar({ partida: l })} placeholder="Rua, número e bairro" perto={perto} />
            : <p className="tj-texto">{temPonto(valor.partida) ? valor.partida.texto : valor.modo === 'gps' ? 'Toque em "Onde estou agora" para usar a localização deste celular.' : 'Base não cadastrada.'}</p>}
        </div>
      </div>
      <div className="tj-pt">
        <i className="tj-marca tj-m-a" aria-hidden="true" />
        <div className="tj-corpo">
          <CampoEndereco rotulo="Onde o veículo está" valor={valor.veiculo} aoMudar={(l) => mudar({ veiculo: l })} placeholder="Rua, número, bairro ou referência" perto={perto} autoFocus={foco} />
        </div>
      </div>
      <div className="tj-pt">
        <i className="tj-marca tj-m-b" aria-hidden="true" />
        <div className="tj-corpo">
          <CampoEndereco rotulo="Para onde vai" valor={valor.destino} aoMudar={(l) => mudar({ destino: l })} placeholder="Oficina, casa ou pátio" perto={perto} />
        </div>
      </div>
      <div className="tj-pt tj-fim">
        <i className="tj-marca tj-m-base" aria-hidden="true" />
        <div className="tj-corpo">
          <span className="campo-rotulo">Volta para</span>
          <p className="tj-texto">{base ? base.texto : 'Base não cadastrada: cadastre na Tabela de preço para calcular o retorno.'}</p>
        </div>
      </div>

      <div className="tj-kms">
        {kmCampo('desloc', 'Deslocamento')}
        {kmCampo('transporte', 'Transporte')}
        {kmCampo('retorno', 'Retorno')}
      </div>
      <p className={`tj-status${estado === 'erro' ? ' tj-erro' : ''}`} role="status">
        {estado === 'calculando' ? 'Calculando a rota…'
          : estado === 'ok' ? `Rota do mapa: ${total.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km${valor.min ? `, cerca de ${Math.floor(valor.min / 60) ? `${Math.floor(valor.min / 60)} h ` : ''}${valor.min % 60} min de estrada` : ''}. Pode ajustar os km.`
          : estado === 'sem-mapa' ? 'O mapa ainda não está ligado: digite os km de cada trecho.'
          : estado === 'erro' ? aviso
          : aviso || 'Escolha os endereços nas sugestões para calcular a rota sozinho, ou digite os km.'}
      </p>
      {estado === 'ok' && fonteMapa === 'ors' && <p className="tj-credito"><CreditoMapa /></p>}
    </div>
  );
}

/** Crédito exigido pelo OpenRouteService no plano grátis. */
export function CreditoMapa() {
  return <>Rota: © <a href="https://openrouteservice.org/" target="_blank" rel="noopener">openrouteservice.org</a> by HeiGIT · Dados do mapa © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">colaboradores do OpenStreetMap</a></>;
}
