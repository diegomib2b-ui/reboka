-- Dois lembretes novos na lista "Para chamar" (sino da Agenda):
--  * pós-serviço: 3 dias depois do atendimento, perguntar como ficou o carro (e pedir a avaliação);
--  * itens recusados: 30 dias depois de o cliente aprovar só parte do orçamento, lembrar do que ficou para depois.
-- Os dois somem sozinhos quando alguém registra contato com o cliente. As colunas da lista não mudam.
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
where not p.nao_contatar and (p.ultimo_contato_em is null or p.ultimo_contato_em < now() - interval '3 days') and o.etapa = 'novo_contato'
union all
-- 5) pós-serviço: 3 a 10 dias depois do último atendimento, se ninguém falou com o cliente desde então
select * from (
  select distinct on (a.cliente_id)
    a.loja_id, a.cliente_id, p.nome, p.telefone,
    'pos_servico'::text, 5, a.servico_nome,
    (reboka_dia() - a.data) as dias, a.valor, null::int, a.data,
    a.veiculo_id,
    case when v.id is null then p.veiculo else v.modelo end,
    case when v.id is null then p.placa else v.placa end,
    null::int, false
  from reboka_atendimentos a
  join reboka_clientes p on p.id = a.cliente_id
  left join reboka_veiculos v on v.id = a.veiculo_id
  where not p.nao_contatar
    and (p.ultimo_contato_em is null or (p.ultimo_contato_em at time zone 'America/Sao_Paulo')::date <= a.data)
  order by a.cliente_id, a.data desc, a.criado_em desc
) ps where ps.dias between 3 and 10
union all
-- 6) itens que o cliente deixou para depois no orçamento: lembrar 30 dias após a resposta (some depois do contato; vale por 120 dias)
select o.loja_id, op.cliente_id, p.nome, p.telefone,
  'itens_recusados', 6, x.itens::text,
  (reboka_dia() - (o.respondido_em at time zone 'America/Sao_Paulo')::date), x.total::numeric(10,2), null::int, (o.respondido_em at time zone 'America/Sao_Paulo')::date,
  o.veiculo_id,
  case when v.id is null then p.veiculo else v.modelo end,
  case when v.id is null then p.placa else v.placa end,
  null::int, false
from reboka_orcamentos o
join reboka_oportunidades op on op.id = o.oportunidade_id
join reboka_clientes p on p.id = op.cliente_id
left join reboka_veiculos v on v.id = o.veiculo_id
join lateral (
  select string_agg(i.descricao, ', ' order by i.ordem) as itens, sum(i.quantidade * i.valor_unitario) as total
  from reboka_orcamento_itens i where i.orcamento_id = o.id and i.aprovado is false
) x on x.itens is not null
where o.status = 'aprovado' and not p.nao_contatar
  and reboka_dia() - (o.respondido_em at time zone 'America/Sao_Paulo')::date between 30 and 120
  and (p.ultimo_contato_em is null or p.ultimo_contato_em < o.respondido_em + interval '30 days');
revoke all on reboka_hoje from anon;
