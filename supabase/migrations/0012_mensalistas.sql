-- Mensalistas: planos recorrentes da oficina e seus assinantes.
-- Uso do mês é contado pelos atendimentos do cliente no mês corrente.
-- Cobrança automática (Mercado Pago/Pix) entra depois; por ora o pagamento é registrado à mão.

create table reboka_planos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas(id) on delete cascade,
  nome text not null,
  preco_mensal numeric(10,2) not null default 0,
  servicos_mes int,                 -- null = ilimitado
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table reboka_mensalistas (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas(id) on delete cascade,
  cliente_id uuid not null references reboka_clientes(id) on delete cascade,
  plano_id uuid not null references reboka_planos(id) on delete restrict,
  dia_vencimento int not null default 10 check (dia_vencimento between 1 and 28),
  status text not null default 'ativo' check (status in ('ativo','pausado','cancelado')),
  inicio date not null default reboka_dia(),
  criado_em timestamptz not null default now(),
  unique (loja_id, cliente_id)
);

create table reboka_mensalista_pagamentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas(id) on delete cascade,
  mensalista_id uuid not null references reboka_mensalistas(id) on delete cascade,
  competencia date not null,        -- primeiro dia do mês de referência
  valor numeric(10,2) not null default 0,
  pago_em timestamptz not null default now(),
  unique (mensalista_id, competencia)
);

alter table reboka_planos enable row level security;
alter table reboka_mensalistas enable row level security;
alter table reboka_mensalista_pagamentos enable row level security;
create policy planos_membros on reboka_planos for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
create policy mensalistas_membros on reboka_mensalistas for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
create policy mensalista_pag_membros on reboka_mensalista_pagamentos for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));

-- Lista de assinantes enriquecida: dados do cliente e do plano, uso do mês e se já pagou a competência atual.
create or replace function reboka_mensalistas_lista(c uuid)
returns table (
  id uuid, cliente_id uuid, cliente text, telefone text, veiculo text, placa text,
  plano_id uuid, plano text, preco_mensal numeric, servicos_mes int,
  dia_vencimento int, status text, usados bigint, pago boolean
)
language sql stable security definer set search_path = public as $$
  select m.id, m.cliente_id, cl.nome, cl.telefone, cl.veiculo, cl.placa,
         p.id, p.nome, p.preco_mensal, p.servicos_mes,
         m.dia_vencimento, m.status,
         (select count(*) from reboka_atendimentos a
            where a.cliente_id = m.cliente_id
              and a.data >= date_trunc('month', reboka_dia())::date
              and a.data <  (date_trunc('month', reboka_dia()) + interval '1 month')::date) as usados,
         exists (select 1 from reboka_mensalista_pagamentos pg
            where pg.mensalista_id = m.id
              and pg.competencia = date_trunc('month', reboka_dia())::date) as pago
    from reboka_mensalistas m
    join reboka_clientes cl on cl.id = m.cliente_id
    join reboka_planos p on p.id = m.plano_id
   where m.loja_id = c
   order by m.status, cl.nome;
$$;
revoke execute on function reboka_mensalistas_lista(uuid) from public, anon;
grant execute on function reboka_mensalistas_lista(uuid) to authenticated;
