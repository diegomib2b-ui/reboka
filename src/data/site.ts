// Dados da empresa e dos planos em um lugar só: rodapé, termos e landing leem daqui.
export const empresa = {
  produto: 'Reboka',
  razaoSocial: 'Enter Labs Tecnologia Ltda',
  cnpj: '70.096.212/0001-08',
  endereco: 'R. Fagundes Varela, 384, Jardim Social, Curitiba/PR, CEP 82520-040',
  email: 'contato@reboka.com.br',
};

export const TESTE_GRATIS_DIAS = 14;
export const DESCONTO_ANUAL = 0.2;

// Preços provisórios (herdados do motor). No banco, o plano Frota usa o id "equipe".
export const planos = [
  {
    id: 'essencial',
    nome: 'Essencial',
    paraQuem: 'Para o guincheiro autônomo, com um caminhão.',
    precoMensal: 97,
    limites: 'Até 1.000 clientes, 1 usuário',
    itens: [
      'Quadro de chamados',
      'Cotação por km com a sua tabela de preço',
      'Mensagens prontas no WhatsApp',
      'Cobrança com Pix na entrega',
      'Controle do que ficou a receber',
      'Clientes, financeiro e resultados',
    ],
  },
  {
    id: 'equipe',
    nome: 'Frota',
    paraQuem: 'Para empresas com mais de um caminhão e motoristas.',
    precoMensal: 197,
    destaque: true,
    limites: 'Até 7.000 clientes, usuários ilimitados',
    itens: [
      'Tudo do Essencial',
      'Equipe por convite, com permissões por função',
      'Motorista em cada chamado',
      'Faturamento e comissão por motorista',
      'Meta do mês',
      'Registro de quem alterou o quê',
    ],
  },
];

export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });
