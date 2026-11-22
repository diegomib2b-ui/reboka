-- Vários carros por cliente e retorno por quilometragem.
-- O retorno de um serviço passa a vencer por tempo OU por km, o que vier antes. Como ninguém lê o painel do carro
-- todo dia, o km é estimado: cada carro tem uma média de km por mês, calculada pelas leituras já registradas
-- (sem histórico, vale 1.000 km por mês, a média de um carro de passeio no Brasil).

-- ---------- carros ----------
create table reboka_veiculos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas on delete cascade,
  cliente_id uuid not null references reboka_clientes on delete cascade,
  modelo text,                                   -- modelo e ano, como a oficina fala: "Corolla 2019"
  placa text check (placa is null or placa ~ '^[A-Z0-9]{5,8}$'),
  km int check (km is null or km >= 0),          -- última leitura do painel
  km_em date,                                    -- dia dessa leitura
  km_mes int,                                    -- média calculada pelo banco; vazio enquanto não há duas leituras
  criado_em timestamptz not null default now(),
  check (modelo is not null or placa is not null)
);
create index reboka_veiculos_cliente_idx on reboka_veiculos (cliente_id, criado_em);
create index reboka_veiculos_placa_idx on reboka_veiculos (loja_id, placa);
alter table reboka_veiculos enable row level security;
create policy veiculos_membros on reboka_veiculos for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
revoke all on reboka_veiculos from anon;

alter table reboka_servicos add column ciclo_retorno_km int check (ciclo_retorno_km is null or ciclo_retorno_km > 0);
alter table reboka_atendimentos
  add column veiculo_id uuid references reboka_veiculos on delete set null,
  add column km int check (km is null or km >= 0),                  -- leitura do painel no dia do serviço
  add column ciclo_km int check (ciclo_km is null or ciclo_km > 0); -- cópia do ciclo por km no dia
create index reboka_atendimentos_veiculo_idx on reboka_atendimentos (veiculo_id, data desc);

-- Na ficha do cliente, veiculo e placa viram um resumo do carro principal (o mais antigo) e "carros" guarda
-- todos juntos para a busca. Quem manda agora é a tabela de carros; estas colunas são só cópia.
alter table reboka_clientes add column carros text;

create or replace function reboka_tg_veiculo_resumo() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if tg_op = 'DELETE' then cid := old.cliente_id; else cid := new.cliente_id; end if;
  update reboka_clientes c set
    veiculo = (select v.modelo from reboka_veiculos v where v.cliente_id = cid order by v.criado_em, v.id limit 1),
    placa = (select v.placa from reboka_veiculos v where v.cliente_id = cid order by v.criado_em, v.id limit 1),
    carros = (select string_agg(concat_ws(' ', v.modelo, v.placa), ' | ' order by v.criado_em, v.id) from reboka_veiculos v where v.cliente_id = cid)
  where c.id = cid;
  return null;
end $$;
create trigger veiculos_resumo after insert or delete or update of modelo, placa on reboka_veiculos
  for each row execute function reboka_tg_veiculo_resumo();

-- Carros que já estavam na ficha do cliente viram linhas da tabela nova.
insert into reboka_veiculos (loja_id, cliente_id, modelo, placa, criado_em)
select loja_id, id, veiculo, placa, criado_em from reboka_clientes where veiculo is not null or placa is not null;
update reboka_atendimentos a set veiculo_id = v.id from reboka_veiculos v where v.cliente_id = a.cliente_id and a.veiculo_id is null;

-- ---------- média de km por mês ----------
-- Roda antes de gravar o carro: pega a leitura mais antiga e a mais nova e divide os km pelos dias.
-- Exemplo: 62.000 km em 1º de março e 65.000 km em 1º de junho dão cerca de 1.000 km por mês.
create or replace function reboka_tg_veiculo_km() returns trigger
language plpgsql security definer set search_path = public as $$
declare pri record; ult record; media numeric;
begin
  if new.km is not null and new.km_em is null then new.km_em := reboka_dia(); end if;
  if new.km is null then new.km_em := null; end if;
  select a.data, a.km into ult from reboka_atendimentos a where a.veiculo_id = new.id and a.km is not null order by a.data desc, a.km desc limit 1;
  select a.data, a.km into pri from reboka_atendimentos a where a.veiculo_id = new.id and a.km is not null order by a.data, a.km limit 1;
  -- a leitura de um atendimento mais recente vale mais que a guardada no carro
  if ult.km is not null and (new.km is null or ult.data > new.km_em) then new.km := ult.km; new.km_em := ult.data; end if;
  -- sem leitura em atendimento, compara com a leitura anterior do próprio carro
  if pri.km is null and tg_op = 'UPDATE' and old.km is not null then pri := row(old.km_em, old.km); end if;
  if pri.km is not null and new.km is not null and new.km_em - pri.data >= 30 and new.km > pri.km then
    media := (new.km - pri.km)::numeric / (new.km_em - pri.data) * 30.44;
    if media between 30 and 20000 then new.km_mes := round(media); end if;
  end if;
  return new;
end $$;
create trigger veiculos_km before insert or update on reboka_veiculos
  for each row execute function reboka_tg_veiculo_km();

-- Registrar, corrigir ou apagar um atendimento com km refaz a conta do carro.
create or replace function reboka_tg_atendimento_km() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' and old.veiculo_id is not null then
    update reboka_veiculos set km_em = km_em where id = old.veiculo_id;
  end if;
  if tg_op <> 'DELETE' and new.veiculo_id is not null and (tg_op = 'INSERT' or new.veiculo_id is distinct from old.veiculo_id) then
    update reboka_veiculos set km_em = km_em where id = new.veiculo_id;
  end if;
  return null;
end $$;
create trigger atendimentos_km after insert or delete or update of km, data, veiculo_id on reboka_atendimentos
  for each row execute function reboka_tg_atendimento_km();

-- Dia em que o carro deve atingir o km do retorno, pela média dele.
-- Exemplo: troca de óleo a cada 10.000 km num carro que roda 2.000 km por mês vence em 5 meses, não em 6.
create or replace function reboka_retorno_km(feito_em date, ciclo_km int, km_mes int) returns date
language sql immutable set search_path = '' as $$
  select case when ciclo_km is null then null else feito_em + ceil(ciclo_km * 30.44 / coalesce(km_mes, 1000))::int end
$$;

revoke execute on function reboka_tg_veiculo_resumo(), reboka_tg_veiculo_km(), reboka_tg_atendimento_km() from public, anon, authenticated;

-- ---------- tela Hoje: por carro, por tempo ou por km ----------
-- As colunas novas entram no fim, então a visão é trocada no lugar, sem apagar nada.
create or replace view reboka_hoje with (security_invoker = true) as
-- 1) retornos vencidos (só o atendimento mais recente de cada carro + serviço)
select * from (
  select distinct on (a.cliente_id, a.veiculo_id, a.servico_id)
    a.loja_id, a.cliente_id, p.nome as cliente, p.telefone,
    'retorno_vencido'::text as motivo, 1 as prioridade,
    a.servico_nome as servico,
    (reboka_dia() - least(a.retorno_previsto_em, reboka_retorno_km(a.data, a.ciclo_km, v.km_mes))) as dias,
    coalesce(pr.valor_medio, a.valor) as valor_estimado,
    a.ciclo_dias, a.data as referencia,
    a.veiculo_id,
    case when v.id is null then p.veiculo else v.modelo end as veiculo,
    case when v.id is null then p.placa else v.placa end as placa,
    a.ciclo_km,
    (reboka_retorno_km(a.data, a.ciclo_km, v.km_mes) < coalesce(a.retorno_previsto_em, 'infinity'::date)) is true as por_km
  from reboka_atendimentos a
  join reboka_clientes p on p.id = a.cliente_id
  left join reboka_servicos pr on pr.id = a.servico_id
  left join reboka_veiculos v on v.id = a.veiculo_id
  where not p.nao_contatar and (p.ultimo_contato_em is null or p.ultimo_contato_em < now() - interval '3 days') and a.sessoes_total is null
    and (a.retorno_previsto_em is not null or a.ciclo_km is not null)
  order by a.cliente_id, a.veiculo_id, a.servico_id, a.data desc
) r where r.dias >= 0
union all
-- 2) orçamentos parados há 3 dias ou mais
select o.loja_id, o.cliente_id, p.nome, p.telefone,
  'orcamento_parado', 2, pr.nome,
  (reboka_dia() - (o.etapa_desde at time zone 'America/Sao_Paulo')::date), o.valor_estimado, null::int, (o.etapa_desde at time zone 'America/Sao_Paulo')::date,
  null::uuid, p.veiculo, p.placa, null::int, false
from reboka_oportunidades o
join reboka_clientes p on p.id = o.cliente_id
left join reboka_servicos pr on pr.id = o.servico_id
where not p.nao_contatar and (p.ultimo_contato_em is null or p.ultimo_contato_em < now() - interval '3 days') and o.etapa = 'orcamento_enviado' and reboka_dia() - (o.etapa_desde at time zone 'America/Sao_Paulo')::date >= 3
union all
-- 3) planos com etapa atrasada (a última etapa não é a final e o ciclo já passou)
select * from (
  select distinct on (a.cliente_id, a.veiculo_id, a.servico_id)
    a.loja_id, a.cliente_id, p.nome, p.telefone,
    'pacote_atrasado'::text, 3, a.servico_nome,
    (reboka_dia() - least(a.retorno_previsto_em, reboka_retorno_km(a.data, a.ciclo_km, v.km_mes))) as dias, a.valor, a.ciclo_dias, a.data,
    a.veiculo_id,
    case when v.id is null then p.veiculo else v.modelo end,
    case when v.id is null then p.placa else v.placa end,
    a.ciclo_km,
    (reboka_retorno_km(a.data, a.ciclo_km, v.km_mes) < coalesce(a.retorno_previsto_em, 'infinity'::date)) is true
  from reboka_atendimentos a
  join reboka_clientes p on p.id = a.cliente_id
  left join reboka_veiculos v on v.id = a.veiculo_id
  where not p.nao_contatar and (p.ultimo_contato_em is null or p.ultimo_contato_em < now() - interval '3 days') and a.sessoes_total is not null and a.sessao_numero < a.sessoes_total
    and (a.retorno_previsto_em is not null or a.ciclo_km is not null)
  order by a.cliente_id, a.veiculo_id, a.servico_id, a.data desc
) s where s.dias >= 0
union all
-- 4) contatos novos sem primeira resposta
select o.loja_id, o.cliente_id, p.nome, p.telefone,
  'novo_sem_resposta', 4, pr.nome,
  (reboka_dia() - (o.criado_em at time zone 'America/Sao_Paulo')::date), o.valor_estimado, null::int, (o.criado_em at time zone 'America/Sao_Paulo')::date,
  null::uuid, p.veiculo, p.placa, null::int, false
from reboka_oportunidades o
join reboka_clientes p on p.id = o.cliente_id
left join reboka_servicos pr on pr.id = o.servico_id
where not p.nao_contatar and (p.ultimo_contato_em is null or p.ultimo_contato_em < now() - interval '3 days') and o.etapa = 'novo_contato';
revoke all on reboka_hoje from anon;

-- ---------- oficina nova já nasce com o ciclo por km nos serviços ----------
create or replace function reboka_tg_semear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into reboka_servicos (loja_id, nome, ciclo_retorno_dias, ciclo_retorno_km, valor_medio) values
    (new.id, 'Troca de óleo e filtro', 180, 10000, 280),
    (new.id, 'Alinhamento e balanceamento', 180, 10000, 180),
    (new.id, 'Revisão completa', 365, 10000, 950),
    (new.id, 'Higienização do ar-condicionado', 365, null, 160),
    (new.id, 'Troca de pastilhas de freio', 365, 30000, 420);
  insert into reboka_modelos (loja_id, titulo, texto) values
    (new.id, 'Retorno de serviço', 'Oi, {nome}! Já faz {tempo} da última {servico} do seu carro. Está na hora de fazer de novo. Quer que eu reserve um horário nesta semana?'),
    (new.id, 'Orçamento sem resposta', 'Oi, {nome}! Passando para saber se ficou alguma dúvida sobre o orçamento de {servico}. Se preferir, posso te ligar rapidinho.'),
    (new.id, 'Pacote em aberto', 'Oi, {nome}! Está na hora da próxima etapa do seu plano de {servico}. Vamos marcar?'),
    (new.id, 'Reativação', 'Oi, {nome}! Faz {tempo} que seu carro não passa por aqui. Quer que eu reserve um horário para uma checagem?');
  return new;
end $$;
update reboka_servicos set ciclo_retorno_km = case nome when 'Troca de pastilhas de freio' then 30000 else 10000 end
  where ciclo_retorno_km is null and nome in ('Troca de óleo e filtro', 'Alinhamento e balanceamento', 'Revisão completa', 'Troca de pastilhas de freio');

-- ---------- registro de alterações: carros entram, cópias e contas automáticas ficam de fora ----------
create or replace function reboka_tg_registro() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; cid uuid; alvo text; verbo text; autor text; pac record; copias text[] := array['ultimo_contato_em', 'veiculo', 'placa', 'carros'];
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
    if tg_op = 'UPDATE' and (to_jsonb(new) - copias) = (to_jsonb(old) - copias) then return null; end if;
    alvo := 'o cadastro de ' || (j ->> 'nome');
  elsif tg_table_name in ('reboka_atendimentos', 'reboka_oportunidades', 'reboka_veiculos') then
    select nome, demo into pac from reboka_clientes where id = (j ->> 'cliente_id')::uuid;
    if not found or pac.demo then return null; end if;
    if tg_table_name = 'reboka_veiculos' then
      -- leitura de km e média são atualizadas a cada atendimento: não viram linha no registro
      if tg_op = 'UPDATE' and (to_jsonb(new) - array['km', 'km_em', 'km_mes']) = (to_jsonb(old) - array['km', 'km_em', 'km_mes']) then return null; end if;
      alvo := 'o carro ' || concat_ws(' ', j ->> 'modelo', j ->> 'placa') || ' de ' || pac.nome;
    elsif tg_table_name = 'reboka_atendimentos' then
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
create trigger registro_veiculos after insert or update or delete on reboka_veiculos for each row execute function reboka_tg_registro();

-- ---------- painel de teste: carros de exemplo, com leituras de km ----------
-- SECURITY INVOKER (padrão): passa pela RLS, então só mexe na própria oficina.
create or replace function reboka_popular_demo_veiculos(c uuid) returns int
language plpgsql set search_path = public as $$
declare
  modelos text[] := array['Corolla 2019', 'Hilux 2018', 'Compass 2020', 'HB20 2017', 'Onix 2021', 'T-Cross 2022',
    'Civic 2016', 'Kwid 2020', 'Renegade 2018', 'Polo 2019', 'Strada 2021', 'Creta 2019'];
  p uuid; v uuid; n int;
begin
  if c not in (select reboka_minhas_lojas()) then raise exception 'Oficina não encontrada'; end if;
  delete from reboka_veiculos x using reboka_clientes cl where cl.id = x.cliente_id and cl.loja_id = c and cl.demo;

  -- um carro por cliente; placa de exemplo no padrão Mercosul (3 letras, 1 número, 1 letra, 2 números)
  insert into reboka_veiculos (loja_id, cliente_id, modelo, placa, criado_em)
  select c, o.id, modelos[1 + (o.ordem - 1) % array_length(modelos, 1)],
    chr(65 + o.ordem % 26) || chr(66 + (o.ordem * 7) % 24) || chr(67 + (o.ordem * 3) % 23)
      || (o.ordem % 10)::text || chr(65 + (o.ordem * 5) % 26) || lpad(((o.ordem * 37) % 100)::text, 2, '0'),
    o.criado_em
  from (select id, criado_em, row_number() over (order by criado_em, id)::int as ordem from reboka_clientes where loja_id = c and demo) o;

  -- cada atendimento ganha o carro, o ciclo por km do serviço e uma leitura de painel (cerca de 1.000 km por mês)
  update reboka_atendimentos a set veiculo_id = x.id,
    ciclo_km = (select s.ciclo_retorno_km from reboka_servicos s where s.id = a.servico_id),
    km = greatest(1500, 30000 + ascii(x.placa) * 600 - (reboka_dia() - a.data) * 33)
  from reboka_veiculos x join reboka_clientes cl on cl.id = x.cliente_id
  where a.cliente_id = x.cliente_id and a.loja_id = c and cl.demo;

  -- Fernanda roda muito (carro de aplicativo): a revisão de 40 dias atrás já venceu por km, bem antes de um ano
  select cl.id, x.id into p, v from reboka_clientes cl join reboka_veiculos x on x.cliente_id = cl.id
    where cl.loja_id = c and cl.demo and cl.nome = 'Fernanda Costa' limit 1;
  if v is not null then
    update reboka_veiculos set km = (select max(a.km) from reboka_atendimentos a where a.veiculo_id = v) + 11500, km_em = reboka_dia() - 2 where id = v;
  end if;

  -- Carlos tem dois carros: o segundo aparece na tela Hoje com o próprio retorno
  select cl.id into p from reboka_clientes cl where cl.loja_id = c and cl.demo and cl.nome = 'Carlos Mendes' limit 1;
  if p is not null then
    insert into reboka_veiculos (loja_id, cliente_id, modelo, placa) values (c, p, 'Saveiro 2015', 'QWE4R56') returning id into v;
    insert into reboka_atendimentos (loja_id, cliente_id, veiculo_id, servico_id, servico_nome, data, valor, ciclo_dias, ciclo_km, km, profissional)
    select c, p, v, s.id, s.nome, reboka_dia() - 200, 180, 180, s.ciclo_retorno_km, 118400, 'João'
    from reboka_servicos s where s.loja_id = c and s.nome = 'Alinhamento e balanceamento';
  end if;

  select count(*) into n from reboka_veiculos x join reboka_clientes cl on cl.id = x.cliente_id where cl.loja_id = c and cl.demo;
  return n;
end $$;
