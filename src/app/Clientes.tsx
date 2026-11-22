import { Icone } from './icones';
import { useEffect, useState, type FormEvent } from 'react';
import { api, limparPlaca, type Cliente, type Pessoa } from './api';
import { Janela, Campo, Aviso, Vazio } from './ui';
import { telefoneBR, dataBR, ROTULO_ORIGEM, linkWhatsApp } from './util';
import { SilhuetaCarro, categoriaVeiculo, rotuloCategoria } from './carro';

const iniciais = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function FormCliente({ lojaId, inicial, aoSalvar, aoCancelar }: {
  lojaId: string; inicial?: Cliente; aoSalvar: (id: string) => void; aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [telefone, setTelefone] = useState(inicial ? telefoneBR(inicial.telefone) : '');
  // Carro e placa só aparecem no cadastro novo: viram o primeiro carro. Depois, os carros são geridos na ficha.
  const [veiculo, setVeiculo] = useState('');
  const [placa, setPlaca] = useState('');
  const [origem, setOrigem] = useState(inicial?.origem ?? 'instagram');
  const [observacao, setObservacao] = useState(inicial?.observacao ?? '');
  const [erro, setErro] = useState('');
  const [equipe, setEquipe] = useState<Pessoa[]>([]);
  const [veiculos, setVeiculos] = useState<string[]>([]);
  const [responsavel, setResponsavel] = useState(inicial?.responsavel_id ?? '');
  useEffect(() => { api.equipe(lojaId).then(setEquipe).catch(() => {}); api.veiculosSugestoes().then(setVeiculos).catch(() => {}); }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (telefone.replace(/\D/g, '').length < 10) { setErro('Informe o telefone com DDD.'); return; }
    try { aoSalvar(await api.salvarCliente(lojaId, { id: inicial?.id, nome, telefone, veiculo, placa, origem, observacao, responsavel_id: equipe.length > 1 ? responsavel || null : undefined })); }
    catch (e) { setErro((e as Error).message); }
  }

  return (
    <form onSubmit={enviar}>
      <Campo rotulo="Nome"><input required value={nome} onChange={(e) => setNome(e.target.value)} /></Campo>
      <Campo rotulo="WhatsApp, com DDD"><input required inputMode="tel" placeholder="(41) 99999-0000" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Campo>
      {!inicial && (
        <div className="dupla">
          <Campo rotulo="Carro" dica="Modelo e ano. Outros carros entram depois, na ficha."><input list="lista-veiculos-cli" placeholder="Corolla 2019" value={veiculo} onChange={(e) => setVeiculo(e.target.value)} />{veiculos.length > 0 && <datalist id="lista-veiculos-cli">{veiculos.map((v) => <option key={v} value={v} />)}</datalist>}</Campo>
          <Campo rotulo="Placa"><input placeholder="ABC1D23" autoCapitalize="characters" value={placa} onChange={(e) => setPlaca(limparPlaca(e.target.value))} /></Campo>
        </div>
      )}
      {!inicial && veiculo.trim() && (
        <div className="carro-previa">
          <SilhuetaCarro texto={veiculo} tamanho={92} />
          <span>{rotuloCategoria(categoriaVeiculo(veiculo))}<small>pela descrição do carro</small></span>
        </div>
      )}
      <Campo rotulo="Como chegou até você">
        <select value={origem} onChange={(e) => setOrigem(e.target.value)}>
          {Object.entries(ROTULO_ORIGEM).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
        </select>
      </Campo>
      {equipe.length > 1 && (
        <Campo rotulo="Responsável" dica="Quem cuida do contato com este cliente.">
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            <option value="">Ninguém definido</option>
            {equipe.map((p) => <option key={p.usuario_id} value={p.usuario_id}>{p.nome}</option>)}
          </select>
        </Campo>
      )}
      <Campo rotulo="Observação" dica="Exemplo: deixa o carro cedo e busca depois das 18h.">
        <textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </Campo>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="acoes">
        <button type="button" className="btn btn-secundario" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario">Salvar</button>
      </div>
    </form>
  );
}

/** " e mais 1 carro", quando o cliente tem mais de um. */
const maisCarros = (p: Cliente) => { const n = (p.carros?.split(' | ').length ?? 1) - 1; return n > 0 ? ` e mais ${n} ${n === 1 ? 'carro' : 'carros'}` : ''; };

export default function Clientes({ lojaId, gestao }: { lojaId: string; gestao: boolean }) {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<Cliente[] | null>(null);
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);

  useEffect(() => {
    // Espera a pessoa parar de digitar (250 ms) antes de consultar o banco.
    const t = setTimeout(() => api.clientes(busca).then(setLista).catch((e) => setErro(e.message)), busca ? 250 : 0);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <>
      <header className="cabeca cli-cabeca">
        <div className="cli-tit">
          <h1>Clientes</h1>
          <p>{lista ? `${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'}${busca ? ' na busca' : ''}` : 'Carregando'}</p>
        </div>
        <div className="botoes">
          {gestao && <a className="btn btn-secundario" href="#/importar" title="Importar planilha"><Icone nome="importar" tamanho={22} /><span>Importar planilha</span></a>}
          <button type="button" className="btn btn-primario" onClick={() => setNova(true)} title="Novo cliente"><Icone nome="somar" tamanho={22} /><span>Novo cliente</span></button>
        </div>
      </header>

      <label className="campo busca cli-busca">
        <span>Buscar por nome, telefone, carro ou placa</span>
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Exemplo: Carlos, 99999 ou ABC1D23" />
      </label>

      {erro && <Aviso>{erro}</Aviso>}
      {lista && lista.length === 0 && (busca
        ? <Vazio titulo="Nada encontrado"><p>Nenhum cliente com "{busca}".</p></Vazio>
        : <Vazio titulo="Nenhum cliente ainda"><p>Cadastre o primeiro, <a href="#/importar">importe sua planilha</a> ou use os dados de exemplo do <a href="#/teste">painel de teste</a>.</p></Vazio>)}

      {/* Desktop: tabela rica */}
      {lista && lista.length > 0 && (
        <div className="tab-clientes-wrap">
          <table className="tab-clientes">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Veículo</th>
                <th>Placa</th>
                <th>Telefone</th>
                <th>Origem</th>
                <th>Último contato</th>
                <th aria-label="Ações"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td className="tc-cliente">
                    <a href={`#/clientes/${p.id}`}>
                      <span className="inicial pequena" aria-hidden="true">{iniciais(p.nome)}</span>
                      <span className="tc-nome">
                        <b>{p.nome}</b>
                        {p.nao_contatar && <span className="chip chip-vencido">Não contatar</span>}
                        {p.demo && <span className="chip chip-ok">Exemplo</span>}
                      </span>
                    </a>
                  </td>
                  <td>{p.veiculo || <span className="tc-vazio">—</span>}</td>
                  <td>{p.placa ? <span className="placa">{p.placa}</span> : <span className="tc-vazio">—</span>}</td>
                  <td className="tc-tel">{telefoneBR(p.telefone)}</td>
                  <td>{ROTULO_ORIGEM[p.origem] ?? p.origem}</td>
                  <td>{p.ultimo_contato_em ? dataBR(p.ultimo_contato_em) : <span className="tc-vazio">Sem contato</span>}</td>
                  <td className="tc-acoes">
                    {!p.nao_contatar && <a className="ic-acao ic-wa" href={linkWhatsApp(p.telefone, '')} target="_blank" rel="noopener" title="Chamar no WhatsApp" aria-label="Chamar no WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.4A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-2.5.7.7-2.4-.2-.3A8 8 0 0 1 12 4z"/><path d="M9.5 7.2c-.2 0-.4.07-.6.3-.2.22-.78.76-.78 1.85 0 1.08.8 2.13.9 2.28.12.15 1.56 2.5 3.84 3.4 1.9.75 2.3.6 2.7.56.42-.04 1.3-.53 1.48-1.05.18-.52.18-.96.13-1.05-.05-.1-.2-.15-.42-.26-.22-.11-1.3-.64-1.5-.72-.2-.07-.35-.1-.5.11-.14.22-.56.72-.69.87-.13.15-.25.17-.47.06-.22-.11-.93-.34-1.78-1.1-.66-.58-1.1-1.3-1.23-1.52-.13-.22-.01-.34.1-.45.1-.1.22-.26.33-.39.1-.13.14-.22.21-.37.07-.15.04-.28-.02-.39-.05-.11-.5-1.2-.68-1.64-.18-.43-.36-.37-.5-.38h-.42z"/></svg></a>}
                    <button type="button" className="ic-acao" title="Editar" aria-label="Editar" onClick={() => setEditando(p)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
                    <a className="ic-acao" href={`#/clientes/${p.id}`} title="Abrir ficha" aria-label="Abrir ficha"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg></a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile: lista em cartões */}
      {lista && lista.length > 0 && (
        <ul className="lista-clientes">
          {lista.map((p) => (
            <li key={p.id}>
              <a className="cli-link" href={`#/clientes/${p.id}`}>
                <span className="inicial" aria-hidden="true">{iniciais(p.nome)}</span>
                <span className="quem">
                  <b>{p.nome}{p.nao_contatar && <span className="chip chip-vencido cli-nc">Não contatar</span>}</b>
                  <span>{p.veiculo ? <>{p.veiculo}{p.placa && <span className="placa">{p.placa}</span>}{maisCarros(p)} · </> : p.placa ? <><span className="placa">{p.placa}</span>{maisCarros(p)} · </> : null}{telefoneBR(p.telefone)}</span>
                </span>
                <span className="lista-chevron" aria-hidden="true">›</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <Janela titulo={editando ? 'Editar cliente' : 'Novo cliente'} aberta={nova || !!editando} aoFechar={() => { setNova(false); setEditando(null); }}>
        <FormCliente lojaId={lojaId} inicial={editando ?? undefined} aoCancelar={() => { setNova(false); setEditando(null); }} aoSalvar={(id) => { setNova(false); setEditando(null); if (!editando) location.hash = `#/clientes/${id}`; else api.clientes(busca).then(setLista).catch(() => {}); }} />
      </Janela>
    </>
  );
}
