-- Fidelidade: cartão de selos por cliente. A cada serviço entregue, ganha um selo; ao bater a meta, resgata o prêmio.

alter table reboka_lojas
  add column fidelidade_ativo boolean not null default false,
  add column fidelidade_meta int not null default 10,
  add column fidelidade_premio text not null default 'Uma troca de óleo grátis';

create table reboka_fidelidade (
  loja_id uuid not null references reboka_lojas(id) on delete cascade,
  cliente_id uuid not null references reboka_clientes(id) on delete cascade,
  selos int not null default 0,
  resgates int not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (loja_id, cliente_id)
);

alter table reboka_fidelidade enable row level security;
create policy fidelidade_membros on reboka_fidelidade for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));

-- Marca um selo (usado ao entregar um carro). Só conta se a fidelidade estiver ativa.
create or replace function reboka_fidelidade_marcar(c_loja uuid, c_cliente uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare v_ativo boolean; v_selos int;
begin
  if c_cliente is null then return 0; end if;
  select fidelidade_ativo into v_ativo from reboka_lojas where id = c_loja;
  if not coalesce(v_ativo, false) then return 0; end if;
  if c_loja not in (select reboka_minhas_lojas()) then raise exception 'Sem acesso.'; end if;
  insert into reboka_fidelidade (loja_id, cliente_id, selos) values (c_loja, c_cliente, 1)
    on conflict (loja_id, cliente_id) do update set selos = reboka_fidelidade.selos + 1, atualizado_em = now()
    returning selos into v_selos;
  return v_selos;
end $$;

-- Lista de cartões com dados do cliente, ordenada por quem está mais perto do prêmio.
create or replace function reboka_fidelidade_lista(c uuid)
returns table (cliente_id uuid, cliente text, telefone text, veiculo text, placa text, selos int, resgates int)
language sql stable security definer set search_path = public as $$
  select f.cliente_id, cl.nome, cl.telefone, cl.veiculo, cl.placa, f.selos, f.resgates
  from reboka_fidelidade f
  join reboka_clientes cl on cl.id = f.cliente_id
  where f.loja_id = c and (f.selos > 0 or f.resgates > 0)
  order by f.selos desc, cl.nome;
$$;

revoke execute on function reboka_fidelidade_marcar(uuid, uuid), reboka_fidelidade_lista(uuid) from public, anon;
grant execute on function reboka_fidelidade_marcar(uuid, uuid), reboka_fidelidade_lista(uuid) to authenticated;
