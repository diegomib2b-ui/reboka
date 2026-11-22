-- Orçamento com itens e aprovação por link.
-- A oficina monta o orçamento (peças e mão de obra) dentro da negociação e manda um link pelo WhatsApp.
-- O cliente abre no celular, escolhe os itens e aprova; o cartão anda sozinho para "Aprovado".

create type reboka_orc_status as enum ('rascunho', 'enviado', 'aprovado', 'recusado');

create table reboka_orcamentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas on delete cascade,
  oportunidade_id uuid not null unique references reboka_oportunidades on delete cascade,  -- um orçamento por negociação
  veiculo_id uuid references reboka_veiculos on delete set null,
  -- Senha do link: 32 caracteres aleatórios. Quem não tem o link não acha o orçamento.
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status reboka_orc_status not null default 'rascunho',
  observacao text,
  validade date,
  enviado_em timestamptz,
  visto_em timestamptz,          -- primeira vez que o cliente abriu o link
  respondido_em timestamptz,
  criado_em timestamptz not null default now()
);
create table reboka_orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references reboka_orcamentos on delete cascade,
  loja_id uuid not null references reboka_lojas on delete cascade,
  tipo text not null default 'servico' check (tipo in ('peca', 'servico')),
  descricao text not null,
  quantidade numeric(8,2) not null default 1 check (quantidade > 0),
  valor_unitario numeric(10,2) not null default 0 check (valor_unitario >= 0),
  aprovado boolean,              -- vazio até o cliente responder
  ordem int not null default 0
);
create index reboka_orcamento_itens_idx on reboka_orcamento_itens (orcamento_id, ordem);

alter table reboka_orcamentos enable row level security;
alter table reboka_orcamento_itens enable row level security;
create policy orcamentos_membros on reboka_orcamentos for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
create policy orcamento_itens_membros on reboka_orcamento_itens for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
revoke all on reboka_orcamentos, reboka_orcamento_itens from anon;

-- ---------- oficina: salvar (e enviar) ----------
-- Tudo numa chamada só, para não ficar orçamento pela metade se a internet cair no meio.
-- SECURITY INVOKER (padrão): passa pela RLS, então só mexe em negociação da própria oficina.
create or replace function reboka_salvar_orcamento(op uuid, carro uuid, obs text, valido_ate date, itens jsonb, enviar boolean default false)
returns text language plpgsql set search_path = public as $$
declare o record; orc record; total numeric;
begin
  select * into o from reboka_oportunidades where id = op;
  if not found then raise exception 'Negociação não encontrada.'; end if;
  select * into orc from reboka_orcamentos where oportunidade_id = op;
  if found and orc.status = 'aprovado' then raise exception 'O cliente já aprovou este orçamento. Para mudar, crie uma nova negociação.'; end if;
  if not found then
    insert into reboka_orcamentos (loja_id, oportunidade_id, veiculo_id, observacao, validade)
    values (o.loja_id, op, carro, nullif(trim(obs), ''), valido_ate) returning * into orc;
  else
    -- salvar de novo um orçamento recusado reabre a conversa
    update reboka_orcamentos set veiculo_id = carro, observacao = nullif(trim(obs), ''), validade = valido_ate,
      status = case when status = 'recusado' then 'rascunho'::reboka_orc_status else status end,
      respondido_em = null
    where id = orc.id returning * into orc;
  end if;

  delete from reboka_orcamento_itens where orcamento_id = orc.id;
  insert into reboka_orcamento_itens (orcamento_id, loja_id, tipo, descricao, quantidade, valor_unitario, ordem)
  select orc.id, o.loja_id, case when x ->> 'tipo' = 'peca' then 'peca' else 'servico' end, trim(x ->> 'descricao'),
    greatest(coalesce(nullif(x ->> 'quantidade', '')::numeric, 1), 0.01), greatest(coalesce(nullif(x ->> 'valor_unitario', '')::numeric, 0), 0), n::int
  from jsonb_array_elements(coalesce(itens, '[]'::jsonb)) with ordinality t(x, n)
  where trim(coalesce(x ->> 'descricao', '')) <> '';
  if not found then raise exception 'Inclua pelo menos um item no orçamento.'; end if;

  select coalesce(sum(quantidade * valor_unitario), 0) into total from reboka_orcamento_itens where orcamento_id = orc.id;
  update reboka_oportunidades set valor_estimado = total where id = op;
  if enviar then
    update reboka_orcamentos set status = 'enviado', enviado_em = coalesce(enviado_em, now()) where id = orc.id;
    update reboka_oportunidades set etapa = 'orcamento_enviado' where id = op and etapa in ('novo_contato', 'avaliacao_agendada', 'avaliacao_feita');
  end if;
  return orc.token;
end $$;
revoke execute on function reboka_salvar_orcamento(uuid, uuid, text, date, jsonb, boolean) from public, anon;
grant execute on function reboka_salvar_orcamento(uuid, uuid, text, date, jsonb, boolean) to authenticated;

-- ---------- cliente: ver e responder pelo link ----------
-- As duas funções abaixo são chamadas sem login, só com o token do link. SECURITY DEFINER para ler além da RLS,
-- mas devolvem apenas o necessário: primeiro nome do cliente, carro, itens e nome da oficina.
create or replace function reboka_orcamento_publico(t text, marcar boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare orc record; r jsonb;
begin
  if t is null or length(t) < 20 then return null; end if;
  select * into orc from reboka_orcamentos where token = t;
  if not found or orc.status = 'rascunho' then return null; end if;
  if marcar and orc.visto_em is null then update reboka_orcamentos set visto_em = now() where id = orc.id; end if;
  select jsonb_build_object(
    'status', orc.status, 'oficina', l.nome, 'cliente', split_part(c.nome, ' ', 1),
    'carro', v.modelo, 'placa', v.placa, 'observacao', orc.observacao, 'validade', orc.validade,
    'vencido', orc.status = 'enviado' and orc.validade is not null and orc.validade < reboka_dia(),
    'respondido_em', orc.respondido_em,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'tipo', i.tipo, 'descricao', i.descricao,
        'quantidade', i.quantidade, 'valor_unitario', i.valor_unitario, 'aprovado', i.aprovado) order by i.ordem, i.id), '[]'::jsonb)
      from reboka_orcamento_itens i where i.orcamento_id = orc.id)
  ) into r
  from reboka_oportunidades o
  join reboka_lojas l on l.id = o.loja_id
  join reboka_clientes c on c.id = o.cliente_id
  left join reboka_veiculos v on v.id = orc.veiculo_id
  where o.id = orc.oportunidade_id;
  return r;
end $$;

-- Aprovar (todos os itens ou só os escolhidos) ou dizer "agora não". Depois de respondido, não muda mais.
create or replace function reboka_orcamento_responder(t text, aprovar boolean, escolhidos uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare orc record; n int; total numeric;
begin
  if t is null or length(t) < 20 then raise exception 'Orçamento não encontrado.'; end if;
  select * into orc from reboka_orcamentos where token = t for update;
  if not found or orc.status = 'rascunho' then raise exception 'Orçamento não encontrado.'; end if;
  if orc.status <> 'enviado' then return reboka_orcamento_publico(t, false); end if;
  if orc.validade is not null and orc.validade < reboka_dia() then raise exception 'Este orçamento venceu. Peça um novo para a oficina.'; end if;

  update reboka_orcamento_itens i set aprovado = aprovar and (escolhidos is null or i.id = any(escolhidos)) where i.orcamento_id = orc.id;
  select count(*) filter (where aprovado), coalesce(sum(quantidade * valor_unitario) filter (where aprovado), 0) into n, total
    from reboka_orcamento_itens where orcamento_id = orc.id;
  if n > 0 then
    update reboka_orcamentos set status = 'aprovado', respondido_em = now(), visto_em = coalesce(visto_em, now()) where id = orc.id;
    -- o cartão anda sozinho, já com o valor do que foi aprovado
    update reboka_oportunidades set etapa = 'fechado', motivo_perda = null, valor_estimado = total where id = orc.oportunidade_id;
  else
    update reboka_orcamentos set status = 'recusado', respondido_em = now(), visto_em = coalesce(visto_em, now()) where id = orc.id;
  end if;
  return reboka_orcamento_publico(t, false);
end $$;
revoke execute on function reboka_orcamento_publico(text, boolean), reboka_orcamento_responder(text, boolean, uuid[]) from public;
grant execute on function reboka_orcamento_publico(text, boolean), reboka_orcamento_responder(text, boolean, uuid[]) to anon, authenticated;

-- ---------- painel de teste: orçamentos de exemplo já enviados ----------
create or replace function reboka_popular_demo_orcamentos(c uuid) returns int
language plpgsql set search_path = public as $$
declare o record; orc uuid; n int := 0;
begin
  if c not in (select reboka_minhas_lojas()) then raise exception 'Oficina não encontrada'; end if;
  for o in select op.id, op.cliente_id, op.valor_estimado, op.etapa_desde from reboka_oportunidades op
    join reboka_clientes cl on cl.id = op.cliente_id
    where op.loja_id = c and cl.demo and op.etapa = 'orcamento_enviado'
      and not exists (select 1 from reboka_orcamentos x where x.oportunidade_id = op.id) loop
    insert into reboka_orcamentos (loja_id, oportunidade_id, veiculo_id, status, validade, enviado_em, observacao)
    values (c, o.id, (select v.id from reboka_veiculos v where v.cliente_id = o.cliente_id order by v.criado_em limit 1),
      'enviado', reboka_dia() + 5, o.etapa_desde, 'Peças com garantia de 3 meses. Serviço feito no mesmo dia.') returning id into orc;
    if o.valor_estimado > 1000 then
      insert into reboka_orcamento_itens (orcamento_id, loja_id, tipo, descricao, quantidade, valor_unitario, ordem) values
        (orc, c, 'servico', 'Mão de obra: troca da correia dentada', 1, 420, 1),
        (orc, c, 'peca', 'Kit correia dentada com tensor', 1, 560, 2),
        (orc, c, 'peca', 'Bomba d''água', 1, 400, 3);
    else
      insert into reboka_orcamento_itens (orcamento_id, loja_id, tipo, descricao, quantidade, valor_unitario, ordem) values
        (orc, c, 'servico', 'Mão de obra: revisão completa', 1, 320, 1),
        (orc, c, 'peca', 'Óleo 5W30 e filtros (óleo, ar e combustível)', 1, 290, 2),
        (orc, c, 'peca', 'Vela de ignição', 4, 45, 3),
        (orc, c, 'servico', 'Troca do fluido de freio', 1, 160, 4);
    end if;
    update reboka_oportunidades set valor_estimado = (select sum(quantidade * valor_unitario) from reboka_orcamento_itens where orcamento_id = orc) where id = o.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function reboka_popular_demo_orcamentos(uuid) from public, anon;
grant execute on function reboka_popular_demo_orcamentos(uuid) to authenticated;
