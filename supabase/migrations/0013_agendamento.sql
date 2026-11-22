-- Agendamento online: página pública (link) onde o cliente escolhe serviço e horário.
-- Acesso anônimo só por RPCs SECURITY DEFINER controladas (nunca acesso direto às tabelas).

alter table reboka_lojas
  add column slug text unique,
  add column agendar_ativo boolean not null default false,
  add column agendar_dias int[] not null default '{1,2,3,4,5,6}',  -- 0=dom .. 6=sáb
  add column agendar_hora_ini int not null default 8,
  add column agendar_hora_fim int not null default 18,
  add column agendar_intervalo int not null default 30;            -- minutos por horário

create table reboka_agendamentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas(id) on delete cascade,
  nome text not null,
  telefone text,
  veiculo text,
  servico_nome text,
  inicio timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente','confirmado','cancelado','compareceu')),
  criado_em timestamptz not null default now()
);
create index reboka_agendamentos_loja on reboka_agendamentos (loja_id, inicio);

alter table reboka_agendamentos enable row level security;
create policy agendamentos_membros on reboka_agendamentos for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));

-- Info pública da loja (pela slug) para montar a grade de horários.
create or replace function reboka_agenda_info(p_slug text)
returns table (loja_id uuid, nome text, dias int[], hora_ini int, hora_fim int, intervalo int, servicos json)
language sql stable security definer set search_path = public as $$
  select l.id, l.nome, l.agendar_dias, l.agendar_hora_ini, l.agendar_hora_fim, l.agendar_intervalo,
    coalesce((select json_agg(json_build_object('nome', s.nome, 'valor', s.valor_medio) order by s.nome)
              from reboka_servicos s where s.loja_id = l.id and s.ativo), '[]'::json)
  from reboka_lojas l
  where l.slug = p_slug and l.agendar_ativo = true;
$$;

-- Horários já ocupados num dia, para esconder da grade pública.
create or replace function reboka_agenda_ocupados(p_slug text, p_dia date)
returns table (inicio timestamptz)
language sql stable security definer set search_path = public as $$
  select a.inicio from reboka_agendamentos a
  join reboka_lojas l on l.id = a.loja_id
  where l.slug = p_slug and a.status <> 'cancelado'
    and a.inicio >= p_dia and a.inicio < (p_dia + interval '1 day');
$$;

-- Cria o agendamento validando janela e horário livre.
create or replace function reboka_agendar(p_slug text, p_nome text, p_telefone text, p_veiculo text, p_servico text, p_inicio timestamptz)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_loja uuid; v_id uuid;
begin
  select id into v_loja from reboka_lojas where slug = p_slug and agendar_ativo = true;
  if v_loja is null then raise exception 'Agendamento indisponível.'; end if;
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'Informe seu nome.'; end if;
  if p_inicio < now() then raise exception 'Escolha um horário futuro.'; end if;
  if exists (select 1 from reboka_agendamentos a where a.loja_id = v_loja and a.inicio = p_inicio and a.status <> 'cancelado')
    then raise exception 'Esse horário acabou de ser ocupado.'; end if;
  insert into reboka_agendamentos (loja_id, nome, telefone, veiculo, servico_nome, inicio)
    values (v_loja, trim(p_nome),
            nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), ''),
            nullif(trim(coalesce(p_veiculo, '')), ''),
            nullif(trim(coalesce(p_servico, '')), ''),
            p_inicio)
    returning id into v_id;
  return v_id;
end $$;

revoke execute on function reboka_agenda_info(text), reboka_agenda_ocupados(text, date), reboka_agendar(text, text, text, text, text, timestamptz) from public;
grant execute on function reboka_agenda_info(text), reboka_agenda_ocupados(text, date), reboka_agendar(text, text, text, text, text, timestamptz) to anon, authenticated;
