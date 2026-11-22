-- Agenda no lugar do pátio, serviços de vários dias (funilaria e pintura), boxes e capacidade por horário.
-- No AppLavaCar estas mudanças foram aplicadas direto no banco; aqui ficam registradas e adaptadas à oficina.

-- O agendamento passa a carregar também as fases do pátio.
alter table reboka_agendamentos drop constraint if exists reboka_agendamentos_status_check;
alter table reboka_agendamentos add constraint reboka_agendamentos_status_check
  check (status = any (array['pendente','confirmado','cancelado','compareceu','fila','em_servico','pronto','entregue']::text[]));

-- Serviço longo (funilaria, pintura, retífica): quantos dias ocupa. Vazio = serviço de horas.
alter table reboka_servicos add column if not exists dura_dias integer;
-- Previsão de entrega (por dia) e box onde o carro fica, para serviços de vários dias.
alter table reboka_agendamentos add column if not exists previsao_entrega date, add column if not exists vaga integer;
-- Perfil do negócio: muda os textos e o que aparece primeiro na Agenda.
alter table reboka_lojas
  add column if not exists perfil text not null default 'oficina' check (perfil in ('oficina', 'funilaria', 'misto')),
  add column if not exists vagas_funilaria integer not null default 1,   -- boxes de funilaria e pintura
  add column if not exists carros_por_horario integer not null default 1; -- elevadores: carros atendidos ao mesmo tempo
grant update (perfil, vagas_funilaria, carros_por_horario) on reboka_lojas to authenticated;

-- Retornos previstos numa janela de datas, para os alertas da Agenda.
-- Diferente do AppLavaCar: conta por carro e vale o que vier antes, tempo ou quilometragem estimada.
create or replace function reboka_retornos(p_ini date, p_fim date)
returns table (cliente_id uuid, cliente text, telefone text, servico text, profissional text, previsto date, veiculo text, placa text, por_km boolean)
language sql stable set search_path = public as $$
  select * from (
    select distinct on (a.cliente_id, a.veiculo_id, a.servico_id)
      a.cliente_id, p.nome, p.telefone, a.servico_nome, a.profissional,
      least(a.retorno_previsto_em, reboka_retorno_km(a.data, a.ciclo_km, v.km_mes)) as previsto,
      case when v.id is null then p.veiculo else v.modelo end,
      case when v.id is null then p.placa else v.placa end,
      (reboka_retorno_km(a.data, a.ciclo_km, v.km_mes) < coalesce(a.retorno_previsto_em, 'infinity'::date)) is true
    from reboka_atendimentos a
    join reboka_clientes p on p.id = a.cliente_id
    left join reboka_veiculos v on v.id = a.veiculo_id
    where (a.retorno_previsto_em is not null or a.ciclo_km is not null) and a.sessoes_total is null and not p.nao_contatar
    order by a.cliente_id, a.veiculo_id, a.servico_id, a.data desc
  ) r where r.previsto between p_ini and p_fim;
$$;
revoke execute on function reboka_retornos(date, date) from public, anon;
grant execute on function reboka_retornos(date, date) to authenticated;

-- Quantos clientes estão parados e quanto já gastaram (faixa de oportunidade no topo da Agenda).
create or replace function reboka_reativacao_resumo(p_dias int default 240)
returns table (qtd bigint, total numeric) language sql stable set search_path = public as $$
  select count(*)::bigint, coalesce(sum(r.total), 0)::numeric from reboka_reativacao r where r.dias >= p_dias;
$$;
revoke execute on function reboka_reativacao_resumo(int) from public, anon;
grant execute on function reboka_reativacao_resumo(int) to authenticated;

-- Agendamento público: "ocupado" agora é horário lotado (atingiu a capacidade). Serviço de vários dias não conta.
-- O dia é o da oficina (São Paulo), não o do servidor.
create or replace function reboka_agenda_ocupados(p_slug text, p_dia date)
returns table (inicio timestamptz) language sql stable security definer set search_path = public as $$
  select a.inicio from reboka_agendamentos a
  join reboka_lojas l on l.id = a.loja_id
  where l.slug = p_slug and a.status <> 'cancelado' and a.previsao_entrega is null
    and a.inicio >= (p_dia::timestamp at time zone 'America/Sao_Paulo')
    and a.inicio < ((p_dia + 1)::timestamp at time zone 'America/Sao_Paulo')
  group by a.inicio, l.carros_por_horario
  having count(*) >= l.carros_por_horario;
$$;

create or replace function reboka_agendar(p_slug text, p_nome text, p_telefone text, p_veiculo text, p_servico text, p_inicio timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_loja uuid; v_lim int; v_qtd int; v_id uuid;
begin
  select id, carros_por_horario into v_loja, v_lim from reboka_lojas where slug = p_slug and agendar_ativo = true;
  if v_loja is null then raise exception 'Agendamento indisponível.'; end if;
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'Informe seu nome.'; end if;
  if p_inicio < now() then raise exception 'Escolha um horário futuro.'; end if;
  select count(*) into v_qtd from reboka_agendamentos a
    where a.loja_id = v_loja and a.inicio = p_inicio and a.status <> 'cancelado' and a.previsao_entrega is null;
  if v_qtd >= v_lim then raise exception 'Esse horário acabou de esgotar.'; end if;
  insert into reboka_agendamentos (loja_id, nome, telefone, veiculo, servico_nome, inicio)
    values (v_loja, trim(p_nome), nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), ''),
            nullif(trim(coalesce(p_veiculo, '')), ''), nullif(trim(coalesce(p_servico, '')), ''), p_inicio)
    returning id into v_id;
  return v_id;
end $$;

-- Configurações que a gestão edita pelo painel. A tabela de oficinas só aceita alteração coluna a coluna (ver 0001),
-- então cada coluna nova precisa ser liberada aqui; plano e assinatura continuam só com o servidor.
grant update (slug, agendar_ativo, agendar_dias, agendar_hora_ini, agendar_hora_fim, agendar_intervalo,
  avaliar_ativo, google_review_url, fidelidade_ativo, fidelidade_meta, fidelidade_premio,
  comissao_tipo, comissao_valor, pix_chave, pix_nome, pix_cidade,
  wa_ativo, wa_persona, wa_proativo_retorno, wa_proativo_pronto) on reboka_lojas to authenticated;
