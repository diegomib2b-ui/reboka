-- Painel de teste: cria e apaga dados de exemplo na oficina de quem chamou.
-- SECURITY INVOKER (padrão): as inserções passam pela RLS, então só funciona na própria oficina.

create or replace function reboka_popular_demo(c uuid) returns int
language plpgsql set search_path = public as $$
declare
  oleo uuid; alinh uuid; revisao uuid; ar uuid; freio uuid;
  p uuid; n int := 0;
begin
  if c not in (select reboka_minhas_lojas()) then raise exception 'Oficina não encontrada'; end if;
  delete from reboka_clientes where loja_id = c and demo;
  select id into oleo from reboka_servicos where loja_id = c and nome = 'Troca de óleo e filtro';
  select id into alinh from reboka_servicos where loja_id = c and nome = 'Alinhamento e balanceamento';
  select id into revisao from reboka_servicos where loja_id = c and nome = 'Revisão completa';
  select id into ar from reboka_servicos where loja_id = c and nome = 'Higienização do ar-condicionado';
  select id into freio from reboka_servicos where loja_id = c and nome = 'Troca de pastilhas de freio';

  -- retornos vencidos e a vencer
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Carlos Mendes', '41990000001', 'google', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 195, 280, 180);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Rogério Pinto', '41990000002', 'indicacao', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, alinh, 'Alinhamento e balanceamento', reboka_dia() - 191, 180, 180);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Patrícia Souza', '41990000003', 'google', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 165, 280, 180);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Fernanda Costa', '41990000004', 'instagram', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, revisao, 'Revisão completa', reboka_dia() - 40, 950, 365);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Marcos Vieira', '41990000005', 'indicacao', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, freio, 'Troca de pastilhas de freio', reboka_dia() - 380, 420, 365);

  -- planos de manutenção (pacotes): etapa atrasada e etapa em dia
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Bianca Rocha', '41990000006', 'site', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias, sessao_numero, sessoes_total) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 190, 250, 180, 2, 4);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Eduardo Duarte', '41990000007', 'instagram', true) returning id into p;
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias, sessao_numero, sessoes_total) values (c, p, oleo, 'Troca de óleo e filtro', reboka_dia() - 60, 250, 180, 1, 3);

  -- funil de orçamentos
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Paulo Nunes', '41990000008', 'instagram', true) returning id into p;
  insert into reboka_oportunidades (loja_id, cliente_id, servico_id, etapa, valor_estimado, etapa_desde) values (c, p, revisao, 'orcamento_enviado', 950, now() - interval '4 days');
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Renata Lima', '41990000009', 'whatsapp', true) returning id into p;
  insert into reboka_oportunidades (loja_id, cliente_id, servico_id, etapa, valor_estimado) values (c, p, freio, 'novo_contato', 420);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Thiago Melo', '41990000010', 'google', true) returning id into p;
  insert into reboka_oportunidades (loja_id, cliente_id, servico_id, etapa, valor_estimado, proxima_acao, proxima_acao_em) values (c, p, alinh, 'avaliacao_agendada', 180, 'Trazer o carro às 8h', reboka_dia() + 2);
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'Bruno Teixeira', '41990000011', 'indicacao', true) returning id into p;
  insert into reboka_oportunidades (loja_id, cliente_id, servico_id, etapa, valor_estimado, etapa_desde) values (c, p, revisao, 'orcamento_enviado', 1380, now() - interval '1 day');
  insert into reboka_clientes (loja_id, nome, telefone, origem, demo) values (c, 'André Antunes', '41990000012', 'outro', true) returning id into p;
  insert into reboka_oportunidades (loja_id, cliente_id, servico_id, etapa, valor_estimado) values (c, p, freio, 'fechado', 420);
  insert into reboka_atendimentos (loja_id, cliente_id, servico_id, servico_nome, data, valor, ciclo_dias) values (c, p, freio, 'Troca de pastilhas de freio', reboka_dia() - 1, 420, 365);

  select count(*) into n from reboka_clientes where loja_id = c and demo;
  return n;
end $$;

create or replace function reboka_limpar_demo(c uuid) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  delete from reboka_clientes where loja_id = c and demo;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function reboka_popular_demo(uuid), reboka_limpar_demo(uuid) from public, anon;
grant execute on function reboka_popular_demo(uuid), reboka_limpar_demo(uuid) to authenticated;
