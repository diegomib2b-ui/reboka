-- Equipe (convites e permissões), limite do plano, meta, profissional, relatórios e registro de alterações.

-- ---------- colunas novas ----------
alter table reboka_lojas add column meta_mensal numeric(12,2) check (meta_mensal is null or meta_mensal >= 0);
grant update (meta_mensal) on reboka_lojas to authenticated;
alter table reboka_atendimentos add column profissional text;

-- ---------- limite de clientes por plano ----------
create or replace function reboka_limite_clientes(p reboka_plano) returns int
language sql immutable as $$ select case p when 'equipe' then 7000 else 1000 end $$;

create or replace function reboka_tg_limite() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  select reboka_limite_clientes(plano) into lim from reboka_lojas where id = new.loja_id;
  select count(*) into n from reboka_clientes where loja_id = new.loja_id;
  if n >= lim then raise exception 'Limite de % clientes do plano atingido.', lim; end if;
  return new;
end $$;
create trigger clientes_limite before insert on reboka_clientes
  for each row execute function reboka_tg_limite();

-- Durante o teste grátis, a dona pode alternar entre os planos para conhecer os dois.
create or replace function reboka_trocar_plano(c uuid, novo reboka_plano) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from reboka_membros where loja_id = c and usuario_id = auth.uid() and papel = 'dono') then
    raise exception 'Só quem criou a conta pode trocar o plano.'; end if;
  if (select assinatura from reboka_lojas where id = c) <> 'teste' then
    raise exception 'Depois do teste, a troca de plano é feita na cobrança.'; end if;
  if novo = 'essencial' and (select count(*) from reboka_membros where loja_id = c) > 1 then
    raise exception 'O plano Essencial permite 1 usuário. Remova a equipe antes de trocar.'; end if;
  if novo = 'essencial' and (select count(*) from reboka_clientes where loja_id = c) > 1000 then
    raise exception 'O plano Essencial permite até 1.000 clientes.'; end if;
  update reboka_lojas set plano = novo where id = c;
end $$;

-- ---------- permissões: recepção usa, gestão configura ----------
drop policy servicos_membros on reboka_servicos;
create policy servicos_ler on reboka_servicos for select using (loja_id in (select reboka_minhas_lojas()));
create policy servicos_gerir on reboka_servicos for all
  using (reboka_sou_gestor(loja_id)) with check (reboka_sou_gestor(loja_id));

drop policy modelos_membros on reboka_modelos;
create policy modelos_ler on reboka_modelos for select using (loja_id in (select reboka_minhas_lojas()));
create policy modelos_gerir on reboka_modelos for all
  using (reboka_sou_gestor(loja_id)) with check (reboka_sou_gestor(loja_id));

drop policy clientes_membros on reboka_clientes;
create policy clientes_ler on reboka_clientes for select using (loja_id in (select reboka_minhas_lojas()));
create policy clientes_criar on reboka_clientes for insert with check (loja_id in (select reboka_minhas_lojas()));
create policy clientes_editar on reboka_clientes for update
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
create policy clientes_apagar on reboka_clientes for delete using (reboka_sou_gestor(loja_id));

-- Quem criou a conta não pode ser rebaixado nem removido.
create or replace function reboka_tg_protege_dono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from reboka_lojas where id = old.loja_id) then return coalesce(new, old); end if;
  if old.papel = 'dono' and (tg_op = 'DELETE' or new.papel <> 'dono') then
    raise exception 'Quem criou a conta não pode ser removido nem mudar de função.'; end if;
  if tg_op = 'UPDATE' and new.papel = 'dono' and old.papel <> 'dono' then
    raise exception 'Cada oficina tem um único dono da conta.'; end if;
  return coalesce(new, old);
end $$;
create trigger membros_protege_dono before update or delete on reboka_membros
  for each row execute function reboka_tg_protege_dono();

-- ---------- convites ----------
create table reboka_convites (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas on delete cascade,
  email text not null,
  papel reboka_papel not null default 'recepcao' check (papel <> 'dono'),
  criado_por uuid references auth.users on delete set null,
  criado_em timestamptz not null default now(),
  aceito_em timestamptz,
  unique (loja_id, email)
);
alter table reboka_convites enable row level security;
create policy convites_gestor on reboka_convites for all
  using (reboka_sou_gestor(loja_id)) with check (reboka_sou_gestor(loja_id));
revoke all on reboka_convites from anon;

create or replace function reboka_convidar(c uuid, email_convidado text, papel_convidado reboka_papel) returns uuid
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(email_convidado)); novo uuid;
begin
  if not reboka_sou_gestor(c) then raise exception 'Só a gestão pode convidar.'; end if;
  if (select plano from reboka_lojas where id = c) <> 'equipe' then
    raise exception 'Convidar equipe faz parte do plano Equipe.'; end if;
  if papel_convidado = 'dono' then raise exception 'Função inválida.'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-mail inválido.'; end if;
  if exists (select 1 from reboka_membros m join auth.users u on u.id = m.usuario_id where m.loja_id = c and lower(u.email) = e) then
    raise exception 'Essa pessoa já faz parte da equipe.'; end if;
  insert into reboka_convites (loja_id, email, papel, criado_por) values (c, e, papel_convidado, auth.uid())
  on conflict (loja_id, email) do update set papel = excluded.papel, aceito_em = null
  returning id into novo;
  return novo;
end $$;

-- Chamada no primeiro acesso de quem ainda não tem oficina: entra nas oficinas que convidaram este e-mail.
create or replace function reboka_aceitar_convites() returns int
language plpgsql security definer set search_path = public as $$
declare e text := lower(auth.jwt() ->> 'email'); r record; n int := 0;
begin
  if auth.uid() is null or e is null then return 0; end if;
  for r in select * from reboka_convites where email = e and aceito_em is null loop
    insert into reboka_membros (loja_id, usuario_id, papel, nome)
    values (r.loja_id, auth.uid(), r.papel,
      coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'nome', ''), initcap(split_part(e, '@', 1))))
    on conflict do nothing;
    update reboka_convites set aceito_em = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- registro de alterações ----------
create table reboka_registro (
  id bigint generated always as identity primary key,
  loja_id uuid not null references reboka_lojas on delete cascade,
  usuario_id uuid,
  quem text not null,
  acao text not null,
  criado_em timestamptz not null default now()
);
create index reboka_registro_idx on reboka_registro (loja_id, criado_em desc);
alter table reboka_registro enable row level security;
create policy registro_gestor on reboka_registro for select using (reboka_sou_gestor(loja_id));
revoke all on reboka_registro from anon;
revoke insert, update, delete on reboka_registro from authenticated;

-- Um gatilho só para todas as tabelas: lê a linha como JSON para não depender do formato de cada uma.
create or replace function reboka_tg_registro() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; cid uuid; alvo text; verbo text; autor text; pac record;
begin
  j := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  cid := (j ->> 'loja_id')::uuid;
  if auth.uid() is null then return null; end if;
  if not exists (select 1 from reboka_lojas where id = cid) then return null; end if;
  select nome into autor from reboka_membros where loja_id = cid and usuario_id = auth.uid();
  if autor is null then return null; end if;
  verbo := case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'apagou' end;

  if tg_table_name = 'reboka_clientes' then
    if (j ->> 'demo')::boolean then return null; end if;
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'ultimo_contato_em') = (to_jsonb(old) - 'ultimo_contato_em') then return null; end if;
    alvo := 'o cadastro de ' || (j ->> 'nome');
  elsif tg_table_name in ('reboka_atendimentos', 'reboka_oportunidades') then
    select nome, demo into pac from reboka_clientes where id = (j ->> 'cliente_id')::uuid;
    if not found or pac.demo then return null; end if;
    if tg_table_name = 'reboka_atendimentos' then
      alvo := 'o atendimento de ' || (j ->> 'servico_nome') || ' de ' || pac.nome;
    elsif tg_op = 'UPDATE' and new.etapa is distinct from old.etapa then
      verbo := 'moveu';
      alvo := 'a negociação de ' || pac.nome || ' para "' || case new.etapa::text
        when 'novo_contato' then 'Novo contato' when 'avaliacao_agendada' then 'Diagnóstico agendado'
        when 'avaliacao_feita' then 'Diagnóstico feito' when 'orcamento_enviado' then 'Orçamento enviado'
        when 'fechado' then 'Aprovado' else 'Perdida' end || '"';
    else
      alvo := 'a negociação de ' || pac.nome;
    end if;
  elsif tg_table_name = 'reboka_servicos' then alvo := 'o servico ' || (j ->> 'nome');
  elsif tg_table_name = 'reboka_modelos' then alvo := 'a mensagem "' || (j ->> 'titulo') || '"';
  elsif tg_table_name = 'reboka_membros' then alvo := 'o acesso de ' || (j ->> 'nome');
  elsif tg_table_name = 'reboka_convites' then alvo := 'o convite para ' || (j ->> 'email');
  else alvo := tg_table_name;
  end if;

  insert into reboka_registro (loja_id, usuario_id, quem, acao) values (cid, auth.uid(), autor, verbo || ' ' || alvo);
  return null;
end $$;

create trigger registro_clientes after insert or update or delete on reboka_clientes for each row execute function reboka_tg_registro();
create trigger registro_atendimentos after insert or update or delete on reboka_atendimentos for each row execute function reboka_tg_registro();
create trigger registro_oportunidades after insert or update or delete on reboka_oportunidades for each row execute function reboka_tg_registro();
create trigger registro_servicos after insert or update or delete on reboka_servicos for each row execute function reboka_tg_registro();
create trigger registro_modelos after insert or update or delete on reboka_modelos for each row execute function reboka_tg_registro();
create trigger registro_membros after insert or update or delete on reboka_membros for each row execute function reboka_tg_registro();
create trigger registro_convites after insert or delete on reboka_convites for each row execute function reboka_tg_registro();

-- ---------- relatórios ----------
-- Resumo do período, agora com origem dos clientes e profissional que atendeu.
create or replace function reboka_resumo(c uuid, de date, ate date) returns jsonb
language sql stable set search_path = public as $$
with a as (
  select at.cliente_id, at.valor, at.servico_nome, coalesce(nullif(trim(at.profissional), ''), 'Não informado') as profissional, p.origem,
    exists (select 1 from reboka_atendimentos x where x.cliente_id = at.cliente_id and x.data < at.data) as retorno,
    exists (select 1 from reboka_contatos k where k.cliente_id = at.cliente_id
            and (k.criado_em at time zone 'America/Sao_Paulo')::date between at.data - 30 and at.data) as apos_contato
  from reboka_atendimentos at join reboka_clientes p on p.id = at.cliente_id
  where at.loja_id = c and at.data between de and ate
), o as (
  select * from reboka_oportunidades where loja_id = c
)
select jsonb_build_object(
  'faturamento', coalesce((select sum(valor) from a), 0),
  'recuperado', coalesce((select sum(valor) from a where apos_contato), 0),
  'atendimentos', (select count(*) from a),
  'retornos', (select count(*) from a where retorno),
  'voltaram_apos_contato', (select count(distinct cliente_id) from a where apos_contato),
  'clientes_atendidas', (select count(distinct cliente_id) from a),
  'clientes_novas', (select count(*) from reboka_clientes where loja_id = c and (criado_em at time zone 'America/Sao_Paulo')::date between de and ate),
  'contatos', (select count(*) from reboka_contatos where loja_id = c and (criado_em at time zone 'America/Sao_Paulo')::date between de and ate),
  'negociacoes_novas', (select count(*) from o where (criado_em at time zone 'America/Sao_Paulo')::date between de and ate),
  'fechadas', (select count(*) from o where etapa = 'fechado' and (etapa_desde at time zone 'America/Sao_Paulo')::date between de and ate),
  'valor_fechado', coalesce((select sum(valor_estimado) from o where etapa = 'fechado' and (etapa_desde at time zone 'America/Sao_Paulo')::date between de and ate), 0),
  'perdidas', (select count(*) from o where etapa = 'perdido' and (etapa_desde at time zone 'America/Sao_Paulo')::date between de and ate),
  'valor_perdido', coalesce((select sum(valor_estimado) from o where etapa = 'perdido' and (etapa_desde at time zone 'America/Sao_Paulo')::date between de and ate), 0),
  'motivos', coalesce((select jsonb_object_agg(m, n) from (
      select coalesce(motivo_perda::text, 'outro') m, count(*) n from o
      where etapa = 'perdido' and (etapa_desde at time zone 'America/Sao_Paulo')::date between de and ate group by 1) x), '{}'::jsonb),
  'servicos', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'valor', v, 'quantidade', q) order by v desc) from (
      select servico_nome nome, sum(valor) v, count(*) q from a group by 1 order by 2 desc limit 5) y), '[]'::jsonb),
  'origens', coalesce((select jsonb_agg(jsonb_build_object('nome', origem, 'valor', v, 'quantidade', q) order by v desc) from (
      select origem::text, sum(valor) v, count(distinct cliente_id) q from a group by 1) z), '[]'::jsonb),
  'profissionais', coalesce((select jsonb_agg(jsonb_build_object('nome', profissional, 'valor', v, 'quantidade', q) order by v desc) from (
      select profissional, sum(valor) v, count(*) q from a group by 1 order by 2 desc limit 8) w), '[]'::jsonb)
)
$$;

-- Ranking da equipe: mensagens enviadas e quanto voltou depois do contato de cada pessoa.
create or replace function reboka_equipe_resumo(c uuid, de date, ate date)
returns table (usuario_id uuid, nome text, papel reboka_papel, contatos bigint, voltaram bigint, recuperado numeric)
language sql stable set search_path = public as $$
  select m.usuario_id, m.nome, m.papel,
    (select count(*) from reboka_contatos k where k.loja_id = c and k.usuario_id = m.usuario_id and (k.criado_em at time zone 'America/Sao_Paulo')::date between de and ate),
    coalesce(r.voltaram, 0), coalesce(r.recuperado, 0)
  from reboka_membros m
  left join lateral (
    select count(distinct a.cliente_id) as voltaram, sum(a.valor) as recuperado
    from reboka_atendimentos a
    where a.loja_id = c and a.data between de and ate
      and (select k.usuario_id from reboka_contatos k where k.cliente_id = a.cliente_id
           and (k.criado_em at time zone 'America/Sao_Paulo')::date between a.data - 30 and a.data order by k.criado_em desc limit 1) = m.usuario_id
  ) r on true
  where m.loja_id = c
  order by 6 desc, 4 desc, 2
$$;

revoke execute on function reboka_trocar_plano(uuid, reboka_plano), reboka_convidar(uuid, text, reboka_papel),
  reboka_aceitar_convites(), reboka_equipe_resumo(uuid, date, date) from public, anon;
grant execute on function reboka_trocar_plano(uuid, reboka_plano), reboka_convidar(uuid, text, reboka_papel),
  reboka_aceitar_convites(), reboka_equipe_resumo(uuid, date, date) to authenticated;
revoke execute on function reboka_tg_limite(), reboka_tg_protege_dono(), reboka_tg_registro() from public, anon, authenticated;

-- Dados de exemplo: atribui as mensagens a quem populou e distribui os atendimentos entre dois mecânicos,
-- para o ranking e o relatório por funcionário terem o que mostrar no painel de teste.
create or replace function reboka_popular_demo_extra(c uuid) returns void
language plpgsql set search_path = public as $$
begin
  if c not in (select reboka_minhas_lojas()) then raise exception 'Oficina não encontrada'; end if;
  update reboka_contatos k set usuario_id = auth.uid()
    where k.loja_id = c and k.usuario_id is null and exists (select 1 from reboka_clientes p where p.id = k.cliente_id and p.demo);
  update reboka_atendimentos a set profissional = case when a.valor >= 300 then 'Marcos' else 'João' end
    where a.loja_id = c and a.profissional is null and exists (select 1 from reboka_clientes p where p.id = a.cliente_id and p.demo);
end $$;
revoke execute on function reboka_popular_demo_extra(uuid) from public, anon;
grant execute on function reboka_popular_demo_extra(uuid) to authenticated;
