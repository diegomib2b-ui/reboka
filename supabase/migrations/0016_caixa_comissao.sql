-- Caixa + comissão: configuração de comissão do mecânico na loja.
-- O cálculo reusa o resumo existente (faturamento e carros por profissional); aqui guardamos só a regra.
alter table reboka_lojas
  add column comissao_tipo text not null default 'percentual' check (comissao_tipo in ('percentual','fixo')),
  add column comissao_valor numeric(10,2) not null default 0;  -- % quando percentual, R$/carro quando fixo
