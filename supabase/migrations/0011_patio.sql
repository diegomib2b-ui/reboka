-- Pátio: fila operacional do dia (carro entra -> em_servico -> pronto -> entregue).
-- Serve tanto para cliente cadastrado quanto para avulso (walk-in sem cadastro).

create table reboka_patio (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas(id) on delete cascade,
  cliente_id uuid references reboka_clientes(id) on delete set null,
  nome text not null,
  telefone text,
  veiculo text,
  placa text,
  servico_nome text,
  valor numeric(10,2) not null default 0,
  mecanico text,
  status text not null default 'fila' check (status in ('fila','em_servico','pronto','entregue')),
  avisado_em timestamptz,
  criado_em timestamptz not null default now(),
  iniciado_em timestamptz,
  pronto_em timestamptz,
  entregue_em timestamptz
);
create index reboka_patio_loja_status on reboka_patio (loja_id, status, criado_em);

alter table reboka_patio enable row level security;
create policy patio_membros on reboka_patio for all
  using (loja_id in (select reboka_minhas_lojas()))
  with check (loja_id in (select reboka_minhas_lojas()));
