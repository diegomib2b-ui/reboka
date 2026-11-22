import { useEffect, useMemo, useState } from 'react';
import { api, type Servico } from './api';
import { Aviso } from './ui';
import { brl, dataBR, telefoneBR, hojeISO, ROTULO_ORIGEM } from './util';
import { CAMPOS, lerArquivo, detectarColunas, analisar, chave, planilhaExemplo, type Celula, type Mapa, type Campo } from './planilha';

type Resultado = { novas: number; jaExistiam: number; atendimentos: number };

export function baixarExemplo() {
  const url = URL.createObjectURL(new Blob([planilhaExemplo()], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'reboka-planilha-exemplo.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

/** Importação de planilha. `demo` marca os clientes como exemplo, para o painel de teste conseguir limpar depois. */
export default function Importar({ lojaId, demo = false }: { lojaId: string; demo?: boolean }) {
  const [linhas, setLinhas] = useState<Celula[][] | null>(null);
  const [arquivo, setArquivo] = useState('');
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [procs, setProcs] = useState<Servico[]>([]);
  const [ciclos, setCiclos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);
  const [feitas, setFeitas] = useState<number | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [arrastando, setArrastando] = useState(false);

  useEffect(() => { api.todosServicos().then(setProcs).catch((e) => setErro(e.message)); }, []);

  async function abrir(f: File | undefined) {
    if (!f) return;
    setErro(''); setLendo(true); setResultado(null);
    try {
      const l = await lerArquivo(f);
      if (l.length < 2) throw new Error('A planilha precisa de uma linha de títulos e pelo menos um cliente.');
      if (l.length > 20001) throw new Error('A planilha tem mais de 20.000 linhas. Divida em arquivos menores.');
      setLinhas(l); setArquivo(f.name); setMapa(detectarColunas(l[0])); setCiclos({});
    } catch (e) { setErro((e as Error).message || 'Não foi possível ler o arquivo.'); }
    setLendo(false);
  }

  // useMemo: refaz a análise só quando a planilha ou o mapa de colunas mudam, não a cada tecla digitada.
  const analise = useMemo(() => (linhas && mapa ? analisar(linhas.slice(1), mapa, hojeISO()) : null), [linhas, mapa]);
  const conhecidos = useMemo(() => new Map(procs.map((p) => [chave(p.nome), p])), [procs]);
  const novos = analise?.servicos.filter((p) => !conhecidos.has(p.chave)) ?? [];
  const comAtendimento = analise?.validas.filter((l) => l.servico && l.data).length ?? 0;

  async function importar() {
    if (!analise) return;
    setErro(''); setFeitas(0);
    try {
      const mapaProcs = new Map(conhecidos);
      for (const p of novos) {
        const dias = Number(ciclos[p.chave]);
        mapaProcs.set(p.chave, await api.criarServico(lojaId, p.nome, dias > 0 ? Math.round(dias) : null, 0));
      }
      setResultado(await api.importar(lojaId, analise.validas, mapaProcs, chave, demo, setFeitas));
      setLinhas(null); setMapa(null);
      api.todosServicos().then(setProcs).catch(() => {});
    } catch (e) { setErro((e as Error).message); }
    setFeitas(null);
  }

  const titulos = linhas?.[0].map((c, i) => String(c ?? '').trim() || `Coluna ${i + 1}`) ?? [];
  const falta = mapa && (mapa.nome < 0 || mapa.telefone < 0);

  return (
    <>
      <p className="voltar"><a href={demo ? '#/teste' : '#/clientes'}>{demo ? 'Voltar para o painel de teste' : 'Voltar para clientes'}</a></p>
      <header className="cabeca">
        <div>
          <h1>Importar planilha</h1>
          <p>Traga os clientes que hoje estão no Excel ou no Google Planilhas. Com o último serviço e a data, os Alertas de retorno (na Agenda) já mostram quem está com retorno vencido.</p>
        </div>
      </header>

      {demo && <Aviso tipo="info">Modo de teste: os clientes entram marcadas como "Exemplo" e somem ao limpar os dados de exemplo.</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}

      {resultado && (
        <section className="bloco">
          <h2>Importação concluída</h2>
          <dl className="numeros">
            <div><dt>Clientes novos</dt><dd>{resultado.novas}</dd></div>
            <div><dt>Já cadastrados</dt><dd>{resultado.jaExistiam}</dd></div>
            <div><dt>Atendimentos</dt><dd>{resultado.atendimentos}</dd></div>
          </dl>
          {resultado.jaExistiam > 0 && <p className="dica">Quem já tinha o mesmo telefone no Reboka ficou como estava.</p>}
          <div className="botoes topo">
            <a className="btn btn-primario" href="#/hoje">Ver quem chamar hoje</a>
            <a className="btn btn-secundario" href="#/clientes">Ver clientes</a>
          </div>
        </section>
      )}

      {!linhas && (
        <section className="bloco">
          <h2>{resultado ? 'Importar outra planilha' : 'Escolha o arquivo'}</h2>
          <label className={`solta${arrastando ? ' solta-ativa' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); abrir(e.dataTransfer.files[0]); }}>
            <input type="file" accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { abrir(e.target.files?.[0]); e.target.value = ''; }} />
            <b>{lendo ? 'Lendo a planilha' : 'Escolher arquivo ou arrastar para cá'}</b>
            <span>Excel (.xlsx) ou CSV. No Google Planilhas: Arquivo, Fazer download.</span>
          </label>
          <p className="dica">A primeira linha deve ter os títulos das colunas. Nome e telefone são obrigatórios; o resto é opcional. <button type="button" className="link" onClick={baixarExemplo}>Baixar planilha de exemplo</button></p>
        </section>
      )}

      {linhas && mapa && analise && (
        <>
          <section className="bloco">
            <h2>Confira as colunas</h2>
            <p className="mudo">{arquivo}, {linhas.length - 1} {linhas.length === 2 ? 'linha' : 'linhas'}. <button type="button" className="link" onClick={() => { setLinhas(null); setMapa(null); }}>Trocar arquivo</button></p>
            <div className="colunas">
              {CAMPOS.map((c) => (
                <label key={c.id} className="campo">
                  <span>{c.rotulo}{c.obrigatorio ? '' : ' (opcional)'}</span>
                  <select value={mapa[c.id]} onChange={(e) => setMapa({ ...mapa, [c.id as Campo]: Number(e.target.value) })}>
                    <option value={-1}>{c.obrigatorio ? 'Escolha a coluna' : 'Não tem na planilha'}</option>
                    {titulos.map((t, i) => <option key={i} value={i}>{t}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {falta && <Aviso>Indique qual coluna tem o nome e qual tem o telefone.</Aviso>}
          </section>

          {!falta && (
            <>
              <section className="bloco">
                <h2>O que vai entrar</h2>
                <dl className="numeros">
                  <div><dt>Clientes</dt><dd>{analise.validas.length}</dd></div>
                  <div><dt>Com atendimento</dt><dd>{comAtendimento}</dd></div>
                  <div><dt>Sem telefone válido</dt><dd>{analise.semTelefone}</dd></div>
                  <div><dt>Telefone repetido</dt><dd>{analise.repetidas}</dd></div>
                  {analise.semNome > 0 && <div><dt>Sem nome</dt><dd>{analise.semNome}</dd></div>}
                </dl>
                {(analise.semTelefone > 0 || analise.repetidas > 0 || analise.semNome > 0) && <p className="dica">Linhas sem nome, sem telefone com DDD ou com telefone repetido ficam de fora.</p>}
                {analise.dataInvalida > 0 && <p className="dica">{analise.dataInvalida} {analise.dataInvalida === 1 ? 'linha tem' : 'linhas têm'} data que não deu para entender ou que está no futuro. O cliente entra, sem o atendimento.</p>}

                {analise.validas.length > 0 && (
                  <div className="rolagem">
                    <table className="previa">
                      <caption>Primeiras {Math.min(5, analise.validas.length)} de {analise.validas.length}</caption>
                      <thead><tr><th>Nome</th><th>Telefone</th><th>Último serviço</th><th>Data</th><th>Valor</th><th>Origem</th></tr></thead>
                      <tbody>
                        {analise.validas.slice(0, 5).map((l) => (
                          <tr key={l.telefone}>
                            <td>{l.nome}</td><td>{telefoneBR(l.telefone)}</td><td>{l.servico ?? ''}</td>
                            <td>{l.data ? dataBR(l.data) : ''}</td><td>{l.valor ? brl(l.valor) : ''}</td><td>{l.origem === 'outro' ? '' : ROTULO_ORIGEM[l.origem]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {novos.length > 0 && (
                <section className="bloco">
                  <h2>Serviços novos</h2>
                  <p className="mudo">Estes nomes ainda não existem no Reboka. Diga de quantos em quantos dias o cliente costuma voltar. Em branco, o serviço entra sem retorno.</p>
                  <ul className="novos-procs">
                    {novos.map((p) => (
                      <li key={p.chave}>
                        <span><b>{p.nome}</b> <span className="mudo">{p.quantidade} {p.quantidade === 1 ? 'cliente' : 'clientes'}</span></span>
                        <label><span className="so-leitor">Ciclo de retorno de {p.nome}, em dias</span>
                          <input type="number" min="1" inputMode="numeric" placeholder="Dias" value={ciclos[p.chave] ?? ''} onChange={(e) => setCiclos({ ...ciclos, [p.chave]: e.target.value })} />
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="acoes barra-importar">
                {feitas !== null && <span className="mudo" role="status">Importando: {feitas} de {analise.validas.length}</span>}
                <button type="button" className="btn btn-primario" disabled={feitas !== null || analise.validas.length === 0} onClick={importar}>
                  Importar {analise.validas.length} {analise.validas.length === 1 ? 'cliente' : 'clientes'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
