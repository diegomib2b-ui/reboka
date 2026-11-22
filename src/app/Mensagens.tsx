import { useEffect, useState } from 'react';
import { api, type Modelo } from './api';
import { Aviso } from './ui';
import { preencher } from './util';

/** Os modelos têm título fixo porque cada tela procura o seu pelo título. O texto é da empresa. */
export const MODELOS_PADRAO: { titulo: string; quando: string; texto: string }[] = [
  { titulo: 'Retorno de serviço', quando: 'Sino da Agenda, quando o retorno vence',
    texto: 'Oi, {nome}! Já faz {tempo} da última {servico} do seu carro. Está na hora de fazer de novo. Quer que eu reserve um horário nesta semana?' },
  { titulo: 'Orçamento sem resposta', quando: 'Sino da Agenda, orçamento parado há 3 dias',
    texto: 'Oi, {nome}! Passando para saber se ficou alguma dúvida sobre o orçamento de {servico}. Se preferir, posso te ligar rapidinho.' },
  { titulo: 'Pacote em aberto', quando: 'Sino da Agenda, etapa de plano de manutenção atrasada',
    texto: 'Oi, {nome}! Está na hora da próxima etapa do seu plano de {servico}. Vamos marcar?' },
  { titulo: 'Contato novo', quando: 'Sino da Agenda, contato novo sem resposta',
    texto: 'Oi, {nome}! Aqui é da empresa. Recebi seu pedido sobre {servico}. Posso te passar o valor e os horários?' },
  { titulo: 'Pós-serviço', quando: 'Sino da Agenda, 3 dias depois do atendimento',
    texto: 'Oi, {nome}! Aqui é da empresa. Faz {tempo} que fizemos {servico} no seu carro. Ficou tudo certo? Qualquer coisa, é só me chamar.' },
  { titulo: 'Itens do orçamento para depois', quando: 'Sino da Agenda, 30 dias depois de o cliente aprovar só parte do orçamento',
    texto: 'Oi, {nome}! No último orçamento ficou para depois: {servico}. Quer que eu reserve um horário para resolver isso?' },
  { titulo: 'Reativação', quando: 'Tela Reativação e ficha do cliente',
    texto: 'Oi, {nome}! Faz {tempo} que seu carro não passa por aqui. Quer que eu reserve um horário para uma checagem?' },
];
const EXEMPLO = { nome: 'Carlos Mendes', servico: 'Troca de óleo e filtro', dias: 190 };

export default function Mensagens({ lojaId }: { lojaId: string }) {
  const [salvos, setSalvos] = useState<Modelo[] | null>(null);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ titulo: string; tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = () => api.modelos().then((m) => {
    setSalvos(m);
    setTextos(Object.fromEntries(MODELOS_PADRAO.map((p) => [p.titulo, m.find((x) => x.titulo === p.titulo)?.texto ?? p.texto])));
  }).catch((e) => setAviso({ titulo: '', tipo: 'erro', texto: e.message }));
  useEffect(() => { carregar(); }, []);

  async function salvar(titulo: string) {
    const texto = textos[titulo].trim();
    if (!texto) { setAviso({ titulo, tipo: 'erro', texto: 'A mensagem não pode ficar vazia.' }); return; }
    try {
      await api.salvarModelo(lojaId, { id: salvos?.find((x) => x.titulo === titulo)?.id, titulo, texto });
      await carregar();
      setAviso({ titulo, tipo: 'ok', texto: 'Mensagem salva.' });
    } catch (e) { setAviso({ titulo, tipo: 'erro', texto: (e as Error).message }); }
  }

  if (!salvos) return aviso ? <Aviso>{aviso.texto}</Aviso> : <p className="carregando">Carregando</p>;

  return (
    <>
      <header className="cabeca">
        <div>
          <h1>Mensagens</h1>
          <p>Os textos que abrem prontos no WhatsApp. Use <code>{'{nome}'}</code>, <code>{'{servico}'}</code> e <code>{'{tempo}'}</code>: o Reboka troca pelos dados de cada cliente.</p>
        </div>
      </header>
      {MODELOS_PADRAO.map((p) => {
        const atual = salvos.find((x) => x.titulo === p.titulo)?.texto ?? p.texto;
        const mudou = textos[p.titulo] !== atual;
        return (
          <section key={p.titulo} className="bloco modelo">
            <h2>{p.titulo}</h2>
            <p className="mudo">{p.quando}</p>
            <label className="campo">
              <span className="so-leitor">Texto de {p.titulo}</span>
              <textarea rows={3} value={textos[p.titulo] ?? ''} onChange={(e) => setTextos({ ...textos, [p.titulo]: e.target.value })} />
            </label>
            <p className="previa-msg"><b>Como o cliente recebe</b>{preencher(textos[p.titulo] ?? '', EXEMPLO)}</p>
            <div className="acoes">
              {textos[p.titulo] !== p.texto && <button type="button" className="btn btn-secundario" onClick={() => setTextos({ ...textos, [p.titulo]: p.texto })}>Voltar ao texto original</button>}
              <button type="button" className="btn btn-primario" disabled={!mudou} onClick={() => salvar(p.titulo)}>Salvar</button>
            </div>
            {aviso?.titulo === p.titulo && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
          </section>
        );
      })}
    </>
  );
}
