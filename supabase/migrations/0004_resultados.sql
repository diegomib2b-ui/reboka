-- Resultados, reativação e dados de exemplo com histórico.
-- As funções são SECURITY INVOKER (padrão): rodam com a RLS de quem chama, então só enxergam a própria oficina.

-- Resumo de um período. "recuperado" = atendimento que aconteceu até 30 dias depois de um contato registrado.
create or replace function reboka_resumo(c uuid, de date, ate date) returns jsonb
language sql stable set search_path = public as $$
with a as (
  select at.cliente_id, at.valor, at.servico_nome,
    exists (select 1 from reboka_atendimentos x where x.cliente_id = at.cliente_id and x.data < at.data) as retorno,
    exists (select 1 from reboka_contatos k where k.cliente_id = at.cliente_id
            and (k.criado_em at time zone 'America/Sao_Paulo')::date between at.data - 30 and at.data) as apos_contato
  from reboka_atendimentos at where at.loja_id = c and at.data between de and ate
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
      select servico_nome nome, sum(valor) v, count(*) q from a group by 1 order by 2 desc limit 5) y), '[]'::jsonb)
)
$$;

-- Faturamento mês a mês, incluindo meses sem atendimento (generate_series cria a linha vazia).
create or replace function reboka_evolucao(c uuid, meses int default 6)
returns table (mes date, faturamento numeric, atendimentos bigint, recuperado numeric)
language sql stable set search_path = public as $$
  select m::date, coalesce(sum(a.valor), 0), count(a.id),
    coalesce(sum(a.valor) filter (where exists (select 1 from reboka_contatos k where k.cliente_id = a.cliente_id
      and (k.criado_em at time zone 'America/Sao_Paulo')::date between a.data - 30 and a.data)), 0)
  from generate_series(date_trunc('month', reboka_dia()) - (greatest(least(meses, 24), 1) - 1) * interval '1 month',
                       date_trunc('month', reboka_dia()), interval '1 month') m
  left join reboka_atendimentos a on a.loja_id = c and date_trunc('month', a.data) = m
  group by 1 order by 1
$$;

-- Clientes que já vieram e estão há 8 meses ou mais sem voltar (a maior parte dos serviços de oficina volta em 6 meses).
create view reboka_reativacao with (security_invoker = true) as
select p.loja_id, p.id as cliente_id, p.nome, p.telefone, p.ultimo_contato_em,
  u.data as ultima_data, u.servico_nome, (reboka_dia() - u.data) as dias, t.total, t.visitas
from reboka_clientes p
join lateral (select data, servico_nome from reboka_atendimentos a where a.cliente_id = p.id order by data desc limit 1) u on true
join lateral (select sum(valor) as total, count(*) as visitas from reboka_atendimentos a where a.cliente_id = p.id) t on true
where not p.nao_contatar and reboka_dia() - u.data >= 240;

-- Dados de exemplo com histórico: clientes que voltaram depois de um contato, negociações perdidas e meses anteriores.
-- Roda depois de reboka_popular_demo (que apaga os exemplos antigos).
create or replace function reboka_popular_demo_historico(c uuid) returns int
language plpgsql set search_path = public as $$
declare oleo uuid; alinh uuid; revisao uuid; ar uuid; freio uuid; p uuid; n int;
begin
  if c not in (select reboka_minhas_lojas()) then raise exception 'Oficina não encontrada'; end if;
  select id into oleo from reboka_servicos where loja_id = c and nome = 'Troca de óleo e filtro';
  select id into alinh from reboka_servicos where loja_id = c and nome = 'Alinhamento e balanceamento';
  select id into revisao from reboka_servicos where loja_id = c and nome = 'Revisão completa';
  select id into ar from reboka_servicos where loja_id = c and nome = 'Higienização do ar-condicionado';
  select id into freio from reboka_servicos where loja_id = c and nome = 'Troca de pastilhas de freio';

  -- voltaram depois de uma mensagem
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Olívia Barros', '41990000013', 'indicacao', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 385, 280, 180);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 196, 280, 180);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 1, 280, 180);
  insert into reboka_contatos (loja_id, cliente_id, observacao, criado_em) values (c, p, 'Retorno venceu há 9 dias', now() - interval '7 days');
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Priscila Vaz', '41990000014', 'instagram', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, freio, 'Troca de pastilhas de freio', reboka_dia() - 400, 420, 365);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, freio, 'Troca de pastilhas de freio', reboka_dia() - 6, 420, 365);
  insert into reboka_contatos (loja_id, cliente_id, observacao, criado_em) values (c, p, 'Retorno venceu há 27 dias', now() - interval '8 days');
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Queila Matos', '41990000015', 'google', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, alinh, 'Alinhamento e balanceamento', reboka_dia() - 205, 180, 180);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, alinh, 'Alinhamento e balanceamento', reboka_dia() - 16, 180, 180);
  insert into reboka_contatos (loja_id, cliente_id, observacao, criado_em) values (c, p, 'Retorno venceu há 3 dias', now() - interval '22 days');

  -- meses anteriores, para o gráfico
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Rafaela Cruz', '41990000016', 'site', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, revisao, 'Revisão completa', reboka_dia() - 150, 950, 365);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, ar, 'Higienização do ar-condicionado', reboka_dia() - 52, 160, 365);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, alinh, 'Alinhamento e balanceamento', reboka_dia() - 23, 180, 180);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Helena Martins', '41990000019', 'google', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, revisao, 'Revisão completa', reboka_dia() - 100, 950, 365);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 100, 280, 180);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Isabela Rangel', '41990000020', 'indicacao', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, freio, 'Troca de pastilhas de freio', reboka_dia() - 128, 420, 365);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, alinh, 'Alinhamento e balanceamento', reboka_dia() - 128, 180, 180);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Vanessa Lopes', '41990000021', 'instagram', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, revisao, 'Revisão completa', reboka_dia() - 70, 950, 365);

  -- sumiram e têm negociação perdida
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Sueli Paiva', '41990000017', 'indicacao', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 295, 280, 180);
  insert into reboka_oportunidades (loja_id, cliente_id, servico_id, etapa, motivo_perda, valor_estimado, etapa_desde) values
    (c, p, revisao, 'perdido', 'preco', 950, now() - interval '10 days');
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Thaís Guedes', '41990000018', 'instagram', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, alinh, 'Alinhamento e balanceamento', reboka_dia() - 420, 180, 180);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 420, 280, 180);
  insert into reboka_oportunidades (loja_id, cliente_id, servico_id, etapa, motivo_perda, valor_estimado, etapa_desde) values
    (c, p, freio, 'perdido', 'sem_resposta', 420, now() - interval '20 days');

  select count(*) into n from reboka_clientes where loja_id = c and demo;
  return n;
end $$;

revoke execute on function reboka_resumo(uuid, date, date), reboka_evolucao(uuid, int), reboka_popular_demo_historico(uuid) from public, anon;
grant execute on function reboka_resumo(uuid, date, date), reboka_evolucao(uuid, int), reboka_popular_demo_historico(uuid) to authenticated;
revoke all on reboka_reativacao from anon;
