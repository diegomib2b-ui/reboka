/** Ícones de traço do painel. Um conjunto só, para o menu e os títulos falarem a mesma língua visual. */
const TRACOS: Record<string, string[]> = {
  hoje: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  patio: ['M5 13l1.6-4.8A2 2 0 0 1 8.5 7h7a2 2 0 0 1 1.9 1.2L19 13', 'M4 13h16v4H4z', 'M8 17v1.5', 'M16 17v1.5'],
  agenda: ['M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  estrela: ['M12 3.5l2.6 5.3 5.8.85-4.2 4.1 1 5.75-5.2-2.75-5.2 2.75 1-5.75-4.2-4.1 5.8-.85z'],
  selo: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M8.5 12.2l2.3 2.3 4.7-4.7'],
  caixa: ['M3 7.5h18v11H3z', 'M3 11.5h18', 'M7 15h4'],
  robo: ['M7 9h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M12 5v4', 'M12 4.5a1 1 0 1 0 0-.01', 'M9.5 14h.01', 'M14.5 14h.01', 'M3 12v3', 'M21 12v3'],
  funil: ['M4 5h4v14H4z', 'M10 5h4v9h-4z', 'M16 5h4v6h-4z'],
  clientes: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 20c0-4 3.6-6 8-6s8 2 8 6'],
  resultados: ['M3 20h18', 'M6 20v-9', 'M11 20V5', 'M16 20v-6', 'M20 20v-3'],
  reativar: ['M20 12a8 8 0 1 1-2.3-5.6', 'M20 4v5h-5'],
  servicos: ['M8 6h12', 'M8 12h12', 'M8 18h12', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  teste: ['M9 3h6', 'M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3', 'M7.5 15h9'],
  ajuda: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M9.6 9.2a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 1.9', 'M12 17h.01'],
  sair: ['M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4', 'M10 8l-4 4 4 4', 'M6 12h10'],
  mais: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5', 'M12 8h.01'],
  sobe: ['M4 16l5-5 4 4 7-7', 'M15 8h5v5'],
  desce: ['M4 8l5 5 4-4 7 7', 'M15 16h5v-5'],
  moeda: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.6.8-2.6 2s1 1.7 2.6 2 2.7.8 2.7 2-1.2 2-2.7 2c-1.2 0-2.2-.5-2.7-1.3', 'M12 6.5V8', 'M12 16v1.5'],
  volta: ['M4 12a8 8 0 1 0 2.3-5.6', 'M4 4v5h5'],
  equipe: ['M9 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M2.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5', 'M16 5.2a3.5 3.5 0 0 1 0 6.6', 'M18 14.8c2.1.6 3.5 2.3 3.5 5.2'],
  conta: ['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', 'M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.600l1.8 1.800M16.6 16.600l1.8 1.800M5.6 18.400l1.8-1.800M16.6 7.400l1.8-1.8'],
  mensagem: ['M4 5h16v11H9l-5 4z'],
  somar: ['M12 5v14', 'M5 12h14'],
  menu: ['M4 6.5h16', 'M4 12h16', 'M4 17.5h16'],
  baixo: ['M6 9l6 6 6-6'],
  elo: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  etiqueta: ['M4 4h7.5l8.5 8.5-7.500 7.500L4 11.5z', 'M8.2 8.2h.01'],
  importar: ['M12 4v11', 'M8 11l4 4 4-4', 'M4 20h16'],
  convidar: ['M10 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z', 'M3.5 20c0-3.6 2.9-5.5 6.5-5.5 1.300 0 2.500.25 3.500.7', 'M18 14v6', 'M15 17h6'],
};

export function Icone({ nome, tamanho = 20 }: { nome: keyof typeof TRACOS | string; tamanho?: number }) {
  return (
    <svg className="icone" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(TRACOS[nome] ?? []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
