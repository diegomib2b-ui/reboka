import { useEffect, useState, type FormEvent } from 'react';
import { api, type Servico } from './api';
import { Janela, Campo, Aviso } from './ui';
import { brl } from './util';

export default function Servicos({ lojaId }: { lojaId: string }) {
  const [lista, setLista] = useState<Servico[] | null>(null);
  const [editando, setEditando] = useState<Servico | 'novo' | null>(null);
  const [erro, setErro] = useState('');

  const carregar = () => api.todosServicos().then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  if (erro) return <Aviso>{erro}</Aviso>;
  if (!lista) return <p className="carregando">Carregando</p>;

  return (
    <>
      <header className="cabeca">
        <div>
          <h1>Serviços</h1>
          <p>Os tipos de reboque e de socorro que você atende. O reboque é cotado pela Tabela de preço (saída + km), em Chamados. O socorro usa o preço fechado daqui.</p>
        </div>
        <button type="button" className="btn btn-primario" onClick={() => setEditando('novo')}>Novo serviço</button>
      </header>

      <ul className="lista-procs">
        {lista.map((p) => (
          <li key={p.id} className={p.ativo ? '' : 'inativo'}>
            <div className="quem">
              <b>{p.nome}</b>
              <span>{/^socorro/i.test(p.nome) ? 'Preço fechado' : 'Valor médio; a cotação sai por km'}</span>
            </div>
            {!p.ativo && <span className="chip chip-atencao">Desativado</span>}
            <div className="valor">{brl(p.valor_medio)}</div>
            <button type="button" className="btn btn-secundario" onClick={() => setEditando(p)}>Editar</button>
          </li>
        ))}
      </ul>

      <Janela titulo={editando === 'novo' ? 'Novo serviço' : 'Editar serviço'} aberta={!!editando} aoFechar={() => setEditando(null)}>
        {editando && <Form lojaId={lojaId} inicial={editando === 'novo' ? undefined : editando} aoCancelar={() => setEditando(null)} aoSalvar={() => { setEditando(null); carregar(); }} />}
      </Janela>
    </>
  );
}

function Form({ lojaId, inicial, aoSalvar, aoCancelar }: { lojaId: string; inicial?: Servico; aoSalvar: () => void; aoCancelar: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [ciclo, setCiclo] = useState(inicial?.ciclo_retorno_dias ? String(inicial.ciclo_retorno_dias) : '');
  const [km, setKm] = useState(inicial?.ciclo_retorno_km ? String(inicial.ciclo_retorno_km) : '');
  const [valor, setValor] = useState(inicial ? String(Number(inicial.valor_medio)) : '');
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);
  const [adicional, setAdicional] = useState(inicial?.adicional ?? false);
  const [multiDias, setMultiDias] = useState(!!(inicial?.dura_dias && inicial.dura_dias >= 2));
  const [dias, setDias] = useState(inicial?.dura_dias ? String(inicial.dura_dias) : '2');
  const [erro, setErro] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    try {
      await api.salvarServico(lojaId, { id: inicial?.id, nome: nome.trim(), ciclo_retorno_dias: Number(ciclo) > 0 ? Math.round(Number(ciclo)) : null, ciclo_retorno_km: Number(km) > 0 ? Math.round(Number(km)) : null, valor_medio: Number(valor) || 0, ativo, adicional, dura_dias: multiDias && Number(dias) >= 2 ? Math.round(Number(dias)) : null });
      aoSalvar();
    } catch (e) { setErro((e as Error).message); }
  }

  return (
    <form onSubmit={enviar}>
      <Campo rotulo="Nome" dica="Comece com “Socorro:” para cobrar preço fechado, sem km."><input required value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
      <Campo rotulo="Valor (R$)"><input type="number" min="0" step="10" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
      {inicial && <label className="marcar"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Aparece na lista ao abrir um chamado</label>}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="acoes">
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario">Salvar</button>
      </div>
    </form>
  );
}
