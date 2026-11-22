import { useEffect, useRef, useState, type ReactNode } from 'react';
import logo from '../data/logo.json';
import { Icone } from './icones';

/** Anel de ciclo: mesma peça da logo e da landing. */
export function Anel({ pct, cor = 'var(--marca)', vencido = false, tamanho = 52, rotulo }: {
  pct: number; cor?: string; vencido?: boolean; tamanho?: number; rotulo: string;
}) {
  const c = 2 * Math.PI * 24;
  const cheio = Math.max(0.04, Math.min(1, pct)) * c;
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" role="img" aria-label={rotulo} className="anel">
      <circle cx="32" cy="32" r="24" fill="none" stroke="var(--nevoa)" strokeWidth="9" />
      <circle cx="32" cy="32" r="24" fill="none" stroke={cor} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${cheio} ${c}`} transform="rotate(-90 32 32)" />
      {vencido && <circle cx="32" cy="8" r="6.5" fill="var(--farol)" stroke="#fff" strokeWidth="2.5" />}
    </svg>
  );
}

export function LogoMarca({ tamanho = 28, cor = '#0A0A0A', realce = 'var(--marca)', texto = true }: { tamanho?: number; cor?: string; realce?: string; texto?: boolean }) {
  const altura = tamanho * 0.84;
  // Sem texto (tela de abertura): só a placa com o k, que é o símbolo da marca.
  if (!texto) return (
    <svg className="logo-app" role="img" aria-label="Reboka" height={tamanho} width={tamanho * logo.iconeLarg / logo.alt} viewBox={logo.iconeVb} style={{ display: 'block', maxWidth: 'none', flexShrink: 0 }}>
      <path fill={realce} d={logo.iconeColchetes} />
      <path fill="#14161A" d={logo.iconeK} />
    </svg>
  );
  return (
    <svg className="logo-app" role="img" aria-label="Reboka" height={altura} width={altura * logo.razao} viewBox={logo.vb} style={{ display: 'block', maxWidth: 'none', flexShrink: 0 }}>
      <path fill={realce} d={logo.colchetes} />
      <path fill={cor} d={`${logo.letras} ${logo.s}`} />
      <path fill="#14161A" d={logo.k} />
    </svg>
  );
}

/** Janela modal usando o <dialog> nativo do navegador (já traz foco preso e fecha com Esc). */
export function Janela({ titulo, aberta, aoFechar, children, larga }: {
  titulo: string; aberta: boolean; aoFechar: () => void; children: ReactNode; larga?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta && !d.open) d.showModal();
    if (!aberta && d.open) d.close();
  }, [aberta]);
  return (
    <dialog ref={ref} className={larga ? 'janela janela-larga' : 'janela'} onClose={aoFechar} onClick={(e) => e.target === ref.current && aoFechar()}>
      {aberta && (
        <div className="janela-corpo">
          <header>
            <h2>{titulo}</h2>
            <button type="button" className="fechar" aria-label="Fechar" onClick={aoFechar}>×</button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <label className="campo">
      <span>{rotulo}</span>
      {children}
      {dica && <small>{dica}</small>}
    </label>
  );
}

export function Aviso({ tipo = 'erro', children }: { tipo?: 'erro' | 'ok' | 'info'; children: ReactNode }) {
  return <p className={`aviso aviso-${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>{children}</p>;
}

export function Vazio({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="vazio">
      <Anel pct={0.04} rotulo="" tamanho={64} />
      <h3>{titulo}</h3>
      <div>{children}</div>
    </div>
  );
}

/** Tela de recurso disponível em plano superior (com ilustração) — estilo Simples Dental. */
export function Upsell({ titulo, subtitulo, itens, cta, href }: {
  titulo: string; subtitulo: string; itens: string[]; cta: string; href: string;
}) {
  return (
    <div className="upsell">
      <svg className="upsell-ilustra" viewBox="0 0 240 150" width="210" height="131" aria-hidden="true">
        <defs><linearGradient id="upg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFD23F" /><stop offset="1" stopColor="#8A5A00" /></linearGradient></defs>
        <rect x="18" y="20" width="204" height="110" rx="18" fill="#E6ECFE" />
        <rect x="38" y="42" width="104" height="24" rx="12" fill="#fff" stroke="#CDEFF7" strokeWidth="1.5" />
        <circle cx="54" cy="54" r="3" fill="#9FC9D6" /><circle cx="66" cy="54" r="3" fill="#9FC9D6" /><circle cx="78" cy="54" r="3" fill="#9FC9D6" />
        <rect x="100" y="80" width="104" height="24" rx="12" fill="url(#upg)" />
        <circle cx="150" cy="92" r="3" fill="#fff" /><circle cx="162" cy="92" r="3" fill="#fff" /><circle cx="174" cy="92" r="3" fill="#fff" />
        <g transform="translate(176 30)"><path d="M14,0 C17,6 23,11 23,16 A9,9 0 1 1 5,16 C5,11 11,6 14,0 Z" fill="url(#upg)" /></g>
        <path d="M150 44 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" fill="#74DDF2" />
      </svg>
      <h2>{titulo}</h2>
      <p>{subtitulo}</p>
      <ul className="upsell-itens">{itens.map((i) => <li key={i}>{i}</li>)}</ul>
      <a className="btn btn-primario upsell-cta" href={href}>{cta}</a>
    </div>
  );
}

/** Placeholder cinza que "pulsa" enquanto os dados carregam (evita tela em branco). */
export function SkCard({ linhas = [60, 85, 45] }: { linhas?: number[] }) {
  return (
    <div className="patio-carro sk-card" aria-hidden="true">
      {linhas.map((l, i) => <span key={i} className="sk" style={{ width: `${l}%` }} />)}
    </div>
  );
}
export function SkLista({ qtd = 4 }: { qtd?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: qtd }).map((_, i) => (
        <div key={i} className="item-hoje sk-item">
          <span className="sk sk-anel" />
          <div className="sk-col"><span className="sk" style={{ width: '55%' }} /><span className="sk" style={{ width: '40%' }} /></div>
          <span className="sk" style={{ width: 60 }} />
          <span className="sk" style={{ width: 120, height: 40, borderRadius: 0 }} />
        </div>
      ))}
    </div>
  );
}

/** "i" que explica um número ao passar o mouse ou focar com o teclado. */
export function Dica({ texto }: { texto: string }) {
  return <span className="info" tabIndex={0} role="note" aria-label={texto} data-dica={texto}><Icone nome="info" tamanho={16} /></span>;
}

/** Janela para revisar a mensagem antes de abrir o WhatsApp. */
export function JanelaMensagem({ aberta, nome, inicial, aoFechar, aoEnviar }: {
  aberta: boolean; nome: string; inicial: string; aoFechar: () => void; aoEnviar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(inicial);
  useEffect(() => { setTexto(inicial); }, [inicial, aberta]);
  return (
    <Janela titulo={`Mensagem para ${nome.split(' ')[0]}`} aberta={aberta} aoFechar={aoFechar}>
      <label className="campo"><span>Revise antes de enviar</span><textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
      <p className="dica">Vai abrir o WhatsApp com este texto. O contato fica registrado na ficha.</p>
      <div className="acoes">
        <button type="button" className="btn btn-secundario" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="btn btn-primario" onClick={() => aoEnviar(texto)}>Abrir WhatsApp</button>
      </div>
    </Janela>
  );
}
