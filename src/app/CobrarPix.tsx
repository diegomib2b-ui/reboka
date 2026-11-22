import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { type Loja } from './api';
import { Janela, Aviso } from './ui';
import { brl, gerarPix, linkWhatsApp } from './util';

export default function CobrarPix({ loja, alvo, aoFechar }: {
  loja: Loja;
  alvo: { valor: number; descricao: string; telefone?: string | null; nome?: string | null } | null;
  aoFechar: () => void;
}) {
  const [qr, setQr] = useState('');
  const [copiado, setCopiado] = useState(false);
  const configurado = !!loja.pix_chave;
  const codigo = alvo && configurado
    ? gerarPix(loja.pix_chave!, loja.pix_nome || loja.nome, loja.pix_cidade || 'BRASIL', alvo.valor, alvo.descricao)
    : '';

  useEffect(() => {
    if (!codigo) { setQr(''); return; }
    QRCode.toDataURL(codigo, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(''));
  }, [codigo]);

  function copiar() { navigator.clipboard?.writeText(codigo).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1800); }).catch(() => {}); }
  function enviarWhats() {
    const nome = alvo?.nome?.split(' ')[0] ?? '';
    const texto = `Oi${nome ? ', ' + nome : ''}! Segue o Pix de ${brl(alvo!.valor)} (${alvo!.descricao}). É só copiar e colar no app do seu banco:\n\n${codigo}`;
    window.open(linkWhatsApp(alvo?.telefone ?? '', texto), '_blank', 'noopener');
  }

  return (
    <Janela titulo="Cobrar com Pix" aberta={!!alvo} aoFechar={aoFechar}>
      {!configurado ? (
        <Aviso tipo="info">Configure sua chave Pix em <b>Caixa → Cobrança Pix</b> para gerar o código.</Aviso>
      ) : alvo && (
        <div className="pix-modal">
          <p className="pix-valor">{brl(alvo.valor)}<small>{alvo.descricao}</small></p>
          {qr && <img className="pix-qr" src={qr} alt="QR Code Pix" width={220} height={220} />}
          <label className="pix-codigo">
            <span>Pix copia e cola</span>
            <textarea readOnly rows={3} value={codigo} onFocus={(e) => e.target.select()} />
          </label>
          <div className="acoes">
            <button type="button" className="btn btn-primario" onClick={copiar}>{copiado ? 'Copiado!' : 'Copiar código'}</button>
            {alvo.telefone && <button type="button" className="btn btn-secundario" onClick={enviarWhats}>Enviar no WhatsApp</button>}
          </div>
          <p className="dica">O pagamento cai direto na sua conta — sem taxa de intermediário. Confirme o recebimento no app do seu banco.</p>
        </div>
      )}
    </Janela>
  );
}
