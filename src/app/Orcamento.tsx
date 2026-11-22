import { useEffect, useState } from 'react';
import { api, orcamentoDe, type Oportunidade, type ItemOrcamento, type Orcamento, type Veiculo } from './api';
import { Campo, Aviso } from './ui';
import { brl, dataBR, hojeISO, somaDias, linkWhatsApp } from './util';

type Linha = { tipo: 'peca' | 'servico'; descricao: string; quantidade: string; valor: string };
const vazia = (tipo: Linha['tipo'] = 'peca'): Linha => ({ tipo, descricao: '', quantidade: '1', valor: '' });
const num = (t: string) => Number(String(t).replace(',', '.')) || 0;
export const linkOrcamento = (token: string) => `${location.origin}/orcamento/?t=${token}`;

/**
 * Orçamento da negociação: peças e mão de obra, com link para o cliente aprovar pelo celular.
 * Primeiro salva (o link só existe depois de salvo); enviar é um segundo toque, para o WhatsApp abrir na hora.
 */
export default function FormOrcamento({ lojaId, o, aoFechar }: { lojaId: string; o: Oportunidade; aoFechar: () => void }) {
  const [orc, setOrc] = useState<Orcamento | null | undefined>(undefined);
  const [carros, setCarros] = useState<Veiculo[]>([]);
  const [carroId, setCarroId] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [obs, setObs] = useState('');
  const [validade, setValidade] = useState(somaDias(hojeISO(), 7));
  const [token, setToken] = useState(orcamentoDe(o)?.token ?? '');
  const [status, setStatus] = useState(orcamentoDe(o)?.status ?? 'rascunho');
  const [mudou, setMudou] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const nome = o.reboka_clientes.nome.split(' ')[0];

  useEffect(() => {
    Promise.all([api.orcamento(o.id), api.veiculosDoCliente(o.cliente_id)]).then(([x, v]) => {
      setOrc(x); setCarros(v);
      setCarroId(x?.veiculo_id ?? v[0]?.id ?? '');
      if (x) {
        setLinhas(x.reboka_orcamento_itens.map((i) => ({ tipo: i.tipo, descricao: i.descricao, quantidade: String(Number(i.quantidade)), valor: String(Number(i.valor_unitario)) })));
        setObs(x.observacao ?? ''); setValidade(x.validade ?? ''); setToken(x.token); setStatus(x.status);
      } else {
        // Começa com o serviço e o valor que já estavam no cartão.
        setLinhas([{ tipo: 'servico', descricao: o.reboka_servicos?.nome ?? '', quantidade: '1', valor: Number(o.valor_estimado) ? String(Number(o.valor_estimado)) : '' }]);
        setMudou(true);
      }
    }).catch((e) => setErro(e.message));
  }, [o.id]);

  const itens: ItemOrcamento[] = linhas.filter((l) => l.descricao.trim()).map((l) => ({ tipo: l.tipo, descricao: l.descricao.trim(), quantidade: num(l.quantidade) || 1, valor_unitario: num(l.valor) }));
  const total = itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0);
  const mexer = (pos: number, campo: keyof Linha, valor: string) => { setLinhas((l) => l.map((x, i) => (i === pos ? { ...x, [campo]: valor } : x))); setMudou(true); };
  const dados = () => ({ veiculo_id: carroId || null, observacao: obs, validade: validade || null, itens });

  async function salvar() {
    setErro(''); setOcupado(true);
    try { setToken(await api.salvarOrcamento(o.id, dados())); setMudou(false); if (status === 'recusado') setStatus('rascunho'); }
    catch (e) { setErro((e as Error).message); }
    setOcupado(false);
  }
  /** Marca como enviado e move o cartão para "Orçamento enviado". */
  async function marcarEnviado(registro: string) {
    try {
      await api.salvarOrcamento(o.id, dados(), true); setStatus('enviado');
      await api.registrarContato(lojaId, o.cliente_id, registro);
    } catch (e) { setErro((e as Error).message); }
  }
  function enviarWhats() {
    const carro = carros.find((v) => v.id === carroId)?.modelo;
    const texto = `Oi, ${nome}! Segue o orçamento${carro ? ` do ${carro}` : ''}: ${linkOrcamento(token)}\nDá para ver os itens e aprovar por ali mesmo. Qualquer dúvida, é só me chamar.`;
    // O WhatsApp abre antes de falar com o banco: navegador bloqueia janela aberta depois de uma espera.
    window.open(linkWhatsApp(o.reboka_clientes.telefone, texto), '_blank', 'noopener');
    marcarEnviado('Orçamento enviado pelo WhatsApp');
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(linkOrcamento(token)); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setErro('Não deu para copiar. Selecione o link e copie à mão.'); }
    if (status !== 'enviado') marcarEnviado('Link do orçamento copiado para enviar');
  }

  if (orc === undefined) return erro ? <Aviso>{erro}</Aviso> : <p className="carregando">Carregando</p>;

  if (status === 'aprovado') {
    const lista = orc?.reboka_orcamento_itens ?? [];
    const aprovado = lista.filter((i) => i.aprovado).reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario), 0);
    return (
      <>
        <Aviso tipo="ok">{nome} aprovou pelo link{orc?.respondido_em ? ` em ${dataBR(orc.respondido_em)}` : ''}: <b>{brl(aprovado)}</b>.</Aviso>
        <ul className="itens-orc itens-lidos">
          {lista.map((i) => (
            <li key={i.id} className={i.aprovado ? '' : 'fora'}>
              <span>{Number(i.quantidade) !== 1 ? `${Number(i.quantidade)} × ` : ''}{i.descricao}{!i.aprovado && <em> (deixou para depois)</em>}</span>
              <b>{brl(Number(i.quantidade) * Number(i.valor_unitario))}</b>
            </li>
          ))}
        </ul>
        <div className="acoes">
          <a className="btn btn-secundario" href={`${linkOrcamento(token)}&previa=1`} target="_blank" rel="noopener">Ver como o cliente</a>
          <a className="btn btn-primario" href={`#/clientes/${o.cliente_id}`} onClick={aoFechar}>Registrar o atendimento</a>
        </div>
      </>
    );
  }

  return (
    <div className="orcamento">
      {status === 'recusado' && <Aviso>{nome} respondeu "agora não". Ajuste os itens e salve para reabrir o mesmo link.</Aviso>}
      {carros.length > 0 && (
        <Campo rotulo="Carro">
          <select value={carroId} onChange={(e) => { setCarroId(e.target.value); setMudou(true); }}>
            {carros.map((v) => <option key={v.id} value={v.id}>{[v.modelo, v.placa].filter(Boolean).join(' · ')}</option>)}
          </select>
        </Campo>
      )}

      <ul className="itens-orc" aria-label="Itens do orçamento">
        {linhas.map((l, pos) => (
          <li key={pos}>
            <label className="tipo"><span className="so-leitor">Tipo do item {pos + 1}</span>
              <select value={l.tipo} onChange={(e) => mexer(pos, 'tipo', e.target.value)}><option value="peca">Peça</option><option value="servico">Mão de obra</option></select>
            </label>
            <label className="desc"><span className="so-leitor">Descrição do item {pos + 1}</span>
              <input placeholder={l.tipo === 'peca' ? 'Exemplo: pastilha de freio dianteira' : 'Exemplo: troca das pastilhas'} value={l.descricao} onChange={(e) => mexer(pos, 'descricao', e.target.value)} />
            </label>
            <label className="qtd"><span>Qtd.</span><input type="number" min="0.01" step="any" inputMode="decimal" value={l.quantidade} onChange={(e) => mexer(pos, 'quantidade', e.target.value)} /></label>
            <label className="val"><span>Valor un. (R$)</span><input type="number" min="0" step="any" inputMode="decimal" value={l.valor} onChange={(e) => mexer(pos, 'valor', e.target.value)} /></label>
            <button type="button" className="tirar" aria-label={`Remover item ${pos + 1}`} onClick={() => { setLinhas((x) => x.filter((_, i) => i !== pos)); setMudou(true); }}>×</button>
          </li>
        ))}
      </ul>
      <div className="mais-itens">
        <button type="button" className="link" onClick={() => { setLinhas((l) => [...l, vazia('peca')]); setMudou(true); }}>Adicionar peça</button>
        <button type="button" className="link" onClick={() => { setLinhas((l) => [...l, vazia('servico')]); setMudou(true); }}>Adicionar mão de obra</button>
        <span className="total-orc">Total <b>{brl(total)}</b></span>
      </div>

      <div className="dupla">
        <Campo rotulo="Válido até"><input type="date" min={hojeISO()} value={validade} onChange={(e) => { setValidade(e.target.value); setMudou(true); }} /></Campo>
        <Campo rotulo="Observação para o cliente"><input placeholder="Exemplo: peças com garantia de 3 meses" value={obs} onChange={(e) => { setObs(e.target.value); setMudou(true); }} /></Campo>
      </div>
      {erro && <Aviso>{erro}</Aviso>}

      {mudou || !token ? (
        <div className="acoes">
          <button type="button" className="btn btn-secundario" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="btn btn-primario" disabled={ocupado || itens.length === 0} onClick={salvar}>Salvar orçamento</button>
        </div>
      ) : (
        <div className="enviar-orc">
          <p><b>{status === 'enviado' ? 'Link enviado.' : 'Orçamento salvo.'}</b> {status === 'enviado' ? `${nome} vê os itens e aprova pelo celular. Você pode reenviar quando quiser.` : `Mande o link para ${nome} ver os itens e aprovar pelo celular.`}</p>
          <p className="link-orc">{linkOrcamento(token)}</p>
          <div className="acoes">
            <a className="btn btn-secundario" href={`${linkOrcamento(token)}&previa=1`} target="_blank" rel="noopener">Ver como o cliente</a>
            <button type="button" className="btn btn-secundario" onClick={copiar}>{copiado ? 'Link copiado' : 'Copiar link'}</button>
            <button type="button" className="btn btn-primario" onClick={enviarWhats}>Enviar pelo WhatsApp</button>
          </div>
        </div>
      )}
    </div>
  );
}
