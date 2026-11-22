-- Cobrança pelo Mercado Pago.
-- Plano, assinatura e periodicidade só mudam pelo servidor (Worker com a chave secreta), nunca pelo navegador:
-- a coluna não tem permissão de UPDATE para o papel authenticated (ver 0001).
alter table reboka_lojas
  add column periodicidade text check (periodicidade in ('mensal', 'anual')),
  add column mp_assinatura_id text,
  add column assinatura_atualizada_em timestamptz;

-- Histórico do que o Mercado Pago avisou. RLS ligada e sem política: só o servidor lê e escreve.
create table reboka_cobranca_eventos (
  id bigint generated always as identity primary key,
  loja_id uuid references reboka_lojas on delete cascade,
  origem text not null,
  status text,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);
create index reboka_cobranca_eventos_idx on reboka_cobranca_eventos (loja_id, criado_em desc);
alter table reboka_cobranca_eventos enable row level security;
revoke all on reboka_cobranca_eventos from anon, authenticated;

-- Quem cancela continua com acesso até o fim do período já pago.
alter table reboka_lojas add column acesso_ate timestamptz;
