-- Reboka — schema inicial
-- O prefixo reboka_ permite dividir o banco com outros produtos (hoje: projeto Enter-Labs) e sair para um banco próprio depois.

-- O dia da oficina. O banco roda em UTC, onde o dia vira às 21h de Brasília; por isso as contas de prazo
-- ("retorno vence hoje", "orçamento parado há 3 dias") usam esta função, e não a data do servidor.
-- Assim o fuso fica dentro do próprio Reboka e o schema funciona igual em banco compartilhado ou próprio.
create function reboka_dia() returns date language sql stable set search_path = '' as
$$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Multi-tenant: toda tabela de negócio tem loja_id e RLS (Row Level Security),
-- ou seja, o próprio banco impede que uma oficina leia dados de outra.

-- ---------- tipos ----------
create type reboka_papel as enum ('dono', 'gestor', 'recepcao');
create type reboka_plano as enum ('essencial', 'equipe');
create type reboka_assinatura as enum ('teste', 'ativa', 'atrasada', 'pausada', 'cancelada');
create type reboka_origem as enum ('instagram', 'google', 'indicacao', 'site', 'whatsapp', 'outro');
create type reboka_etapa as enum
  ('novo_contato', 'avaliacao_agendada', 'avaliacao_feita', 'orcamento_enviado', 'fechado', 'perdido');
create type reboka_motivo_perda as enum ('preco', 'fez_em_outro_lugar', 'desistiu', 'sem_resposta', 'outro');
create type reboka_canal as enum ('whatsapp', 'telefone', 'presencial', 'outro');

-- ---------- oficinas e equipe ----------
create table reboka_lojas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text,                                  -- CNPJ ou CPF, para nota fiscal
  plano reboka_plano not null default 'essencial',
  assinatura reboka_assinatura not null default 'teste',
  teste_termina_em timestamptz not null default now() + interval '14 days',
  criado_em timestamptz not null default now()
);

create table reboka_membros (
  loja_id uuid not null references reboka_lojas on delete cascade,
  usuario_id uuid not null references auth.users on delete cascade,
  papel reboka_papel not null default 'recepcao',
  nome text not null,
  criado_em timestamptz not null default now(),
  primary key (loja_id, usuario_id)
);
create index reboka_membros_usuario_idx on reboka_membros (usuario_id);

-- Funções auxiliares das políticas. SECURITY DEFINER evita recursão de RLS em membros.
create or replace function reboka_minhas_lojas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select loja_id from reboka_membros where usuario_id = auth.uid()
$$;

create or replace function reboka_sou_gestor(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reboka_membros
    where loja_id = c and usuario_id = auth.uid() and papel in ('dono', 'gestor')
  )
$$;

-- ---------- cadastro ----------
create table reboka_servicos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas on delete cascade,
  nome text not null,
  ciclo_retorno_dias int check (ciclo_retorno_dias is null or ciclo_retorno_dias > 0),
  valor_medio numeric(10,2) not null default 0 check (valor_medio >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (loja_id, nome)
);

create table reboka_clientes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas on delete cascade,
  nome text not null,
  telefone text not null,                          -- só dígitos, com DDD
  origem reboka_origem not null default 'outro',
  nao_contatar boolean not null default false,
  observacao text,
  responsavel_id uuid references auth.users on delete set null,
  ultimo_contato_em timestamptz,
  demo boolean not null default false,             -- criado pelo painel de teste
  criado_em timestamptz not null default now(),
  unique (loja_id, telefone)
);
create index reboka_clientes_nome_idx on reboka_clientes (loja_id, lower(nome));

create table reboka_oportunidades (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas on delete cascade,
  cliente_id uuid not null references reboka_clientes on delete cascade,
  servico_id uuid references reboka_servicos on delete set null,
  etapa reboka_etapa not null default 'novo_contato',
  valor_estimado numeric(10,2) not null default 0 check (valor_estimado >= 0),
  motivo_perda reboka_motivo_perda,
  proxima_acao text,
  proxima_acao_em date,
  etapa_desde timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  check (motivo_perda is null or etapa = 'perdido')
);
create index reboka_oportunidades_etapa_idx on reboka_oportunidades (loja_id, etapa);

create table reboka_atendimentos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas on delete cascade,
  cliente_id uuid not null references reboka_clientes on delete cascade,
  servico_id uuid references reboka_servicos on delete set null,
  servico_nome text not null,                 -- cópia do nome no dia do atendimento
  data date not null default reboka_dia(),
  valor numeric(10,2) not null default 0 check (valor >= 0),
  ciclo_dias int check (ciclo_dias is null or ciclo_dias > 0),  -- cópia do ciclo no dia
  sessao_numero int check (sessao_numero is null or sessao_numero > 0),
  sessoes_total int check (sessoes_total is null or sessoes_total > 0),
  -- Coluna gerada: o banco calcula sozinho a data de retorno (data + ciclo).
  retorno_previsto_em date generated always as (data + ciclo_dias) stored,
  criado_em timestamptz not null default now(),
  check (sessao_numero is null or sessoes_total is null or sessao_numero <= sessoes_total)
);
create index reboka_atendimentos_retorno_idx on reboka_atendimentos (loja_id, retorno_previsto_em);
create index reboka_atendimentos_cliente_idx on reboka_atendimentos (cliente_id, data desc);

create table reboka_contatos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas on delete cascade,
  cliente_id uuid not null references reboka_clientes on delete cascade,
  usuario_id uuid references auth.users on delete set null,
  canal reboka_canal not null default 'whatsapp',
  observacao text,
  criado_em timestamptz not null default now()
);
create index reboka_contatos_cliente_idx on reboka_contatos (cliente_id, criado_em desc);

create table reboka_modelos (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas on delete cascade,
  titulo text not null,
  texto text not null,                             -- aceita {nome}, {servico}, {tempo}
  criado_em timestamptz not null default now()
);

-- ---------- automações no banco ----------
-- Registrar um contato atualiza o "último contato" do cliente.
create or replace function reboka_tg_ultimo_contato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update reboka_clientes set ultimo_contato_em = new.criado_em where id = new.cliente_id;
  return new;
end $$;
create trigger contatos_ultimo_contato after insert on reboka_contatos
  for each row execute function reboka_tg_ultimo_contato();

-- Mudar a etapa de uma oportunidade zera o relógio "há quantos dias está parada".
create or replace function reboka_tg_troca_etapa() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.etapa is distinct from old.etapa then new.etapa_desde := now(); end if;
  return new;
end $$;
create trigger oportunidades_etapa before update on reboka_oportunidades
  for each row execute function reboka_tg_troca_etapa();

-- Oficina nova já nasce com servicos e modelos de exemplo (editáveis).
create or replace function reboka_tg_semear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into reboka_servicos (loja_id, nome, ciclo_retorno_dias, valor_medio) values
    (new.id, 'Troca de óleo e filtro', 180, 280),
    (new.id, 'Alinhamento e balanceamento', 180, 180),
    (new.id, 'Revisão completa', 365, 950),
    (new.id, 'Higienização do ar-condicionado', 365, 160),
    (new.id, 'Troca de pastilhas de freio', 365, 420);
  insert into reboka_modelos (loja_id, titulo, texto) values
    (new.id, 'Retorno de serviço', 'Oi, {nome}! Já faz {tempo} da última {servico} do seu carro. Está na hora de fazer de novo. Quer que eu reserve um horário nesta semana?'),
    (new.id, 'Orçamento sem resposta', 'Oi, {nome}! Passando para saber se ficou alguma dúvida sobre o orçamento de {servico}. Se preferir, posso te ligar rapidinho.'),
    (new.id, 'Pacote em aberto', 'Oi, {nome}! Está na hora da próxima etapa do seu plano de {servico}. Vamos marcar?'),
    (new.id, 'Reativação', 'Oi, {nome}! Faz {tempo} que seu carro não passa por aqui. Quer que eu reserve um horário para uma checagem?');
  return new;
end $$;
create trigger lojas_semear after insert on reboka_lojas
  for each row execute function reboka_tg_semear();

-- Cadastro: cria a oficina e já coloca quem chamou como dona. Chamada pelo app logo após o signup.
create or replace function reboka_criar_loja(nome_loja text, nome_usuario text, plano_escolhido reboka_plano default 'essencial')
returns uuid language plpgsql security definer set search_path = public as $$
declare nova uuid;
begin
  if auth.uid() is null then raise exception 'É preciso estar logado'; end if;
  insert into reboka_lojas (nome, plano) values (nome_loja, plano_escolhido) returning id into nova;
  insert into reboka_membros (loja_id, usuario_id, papel, nome) values (nova, auth.uid(), 'dono', nome_usuario);
  return nova;
end $$;

-- ---------- tela Hoje ----------
-- security_invoker faz a view respeitar a RLS de quem consulta.
create view reboka_hoje with (security_invoker = true) as
-- 1) retornos vencidos (só o atendimento mais recente de cada cliente + servico)
select * from (
  select distinct on (a.cliente_id, a.servico_id)
    a.loja_id, a.cliente_id, p.nome as cliente, p.telefone,
    'retorno_vencido'::text as motivo, 1 as prioridade,
    a.servico_nome as servico,
    (reboka_dia() - a.retorno_previsto_em) as dias,
    coalesce(pr.valor_medio, a.valor) as valor_estimado,
    a.ciclo_dias, a.data as referencia
  from reboka_atendimentos a
  join reboka_clientes p on p.id = a.cliente_id
  left join reboka_servicos pr on pr.id = a.servico_id
  where not p.nao_contatar and (p.ultimo_contato_em is null or p.ultimo_contato_em < now() - interval '3 days') and a.sessoes_total is null and a.retorno_previsto_em is not null
  order by a.cliente_id, a.servico_id, a.data desc
) r where r.dias >= 0
union all
-- 2) orçamentos parados há 3 dias ou mais
select o.loja_id, o.cliente_id, p.nome, p.telefone,
  'orcamento_parado', 2, pr.nome,
  (reboka_dia() - (o.etapa_desde at time zone 'America/Sao_Paulo')::date), o.valor_estimado, null::int, (o.etapa_desde at time zone 'America/Sao_Paulo')::date
from reboka_oportunidades o
join reboka_clientes p on p.id = o.cliente_id
left join reboka_servicos pr on pr.id = o.servico_id
where not p.nao_contatar and (p.ultimo_contato_em is null or p.ultimo_contato_em < now() - interval '3 days') and o.etapa = 'orcamento_enviado' and reboka_dia() - (o.etapa_desde at time zone 'America/Sao_Paulo')::date >= 3
union all
-- 3) pacotes com sessão atrasada (última sessão não é a final e o ciclo já passou)
select * from (
  select distinct on (a.cliente_id, a.servico_id)
    a.loja_id, a.cliente_id, p.nome, p.telefone,
    'pacote_atrasado'::text, 3, a.servico_nome,
    (reboka_dia() - a.retorno_previsto_em) as dias, a.valor, a.ciclo_dias, a.data
  from reboka_atendimentos a
  join reboka_clientes p on p.id = a.cliente_id
  where not p.nao_contatar and (p.ultimo_contato_em is null or p.ultimo_contato_em < now() - interval '3 days') and a.sessoes_total is not null and a.sessao_numero < a.sessoes_total
    and a.retorno_previsto_em is not null
  order by a.cliente_id, a.servico_id, a.data desc
) s where s.dias >= 0
union all
-- 4) contatos novos sem primeira resposta
select o.loja_id, o.cliente_id, p.nome, p.telefone,
  'novo_sem_resposta', 4, pr.nome,
  (reboka_dia() - (o.criado_em at time zone 'America/Sao_Paulo')::date), o.valor_estimado, null::int, (o.criado_em at time zone 'America/Sao_Paulo')::date
from reboka_oportunidades o
join reboka_clientes p on p.id = o.cliente_id
left join reboka_servicos pr on pr.id = o.servico_id
where not p.nao_contatar and (p.ultimo_contato_em is null or p.ultimo_contato_em < now() - interval '3 days') and o.etapa = 'novo_contato';

-- ---------- RLS ----------
alter table reboka_lojas enable row level security;
alter table reboka_membros enable row level security;
alter table reboka_servicos enable row level security;
alter table reboka_clientes enable row level security;
alter table reboka_oportunidades enable row level security;
alter table reboka_atendimentos enable row level security;
alter table reboka_contatos enable row level security;
alter table reboka_modelos enable row level security;

-- Oficina: membros leem; só dono ou gestor edita o nome. Plano e assinatura mudam apenas
-- pelo servidor (webhook de pagamento com service role), nunca pelo navegador.
create policy lojas_ler on reboka_lojas for select using (id in (select reboka_minhas_lojas()));
create policy lojas_editar on reboka_lojas for update using (reboka_sou_gestor(id)) with check (reboka_sou_gestor(id));
revoke update on reboka_lojas from authenticated;
grant update (nome, documento) on reboka_lojas to authenticated;

create policy membros_ler on reboka_membros for select using (loja_id in (select reboka_minhas_lojas()));
create policy membros_gerir on reboka_membros for all using (reboka_sou_gestor(loja_id)) with check (reboka_sou_gestor(loja_id));

-- Tabelas de negócio: qualquer membro da oficina lê e escreve.
create policy servicos_membros on reboka_servicos for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
create policy clientes_membros on reboka_clientes for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
create policy oportunidades_membros on reboka_oportunidades for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
create policy atendimentos_membros on reboka_atendimentos for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
create policy contatos_membros on reboka_contatos for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));
create policy modelos_membros on reboka_modelos for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));

-- Funções com SECURITY DEFINER não devem ser chamadas por visitantes sem login.
revoke execute on function reboka_minhas_lojas(), reboka_sou_gestor(uuid), reboka_criar_loja(text, text, reboka_plano) from public, anon;
grant execute on function reboka_minhas_lojas(), reboka_sou_gestor(uuid), reboka_criar_loja(text, text, reboka_plano) to authenticated;
revoke execute on function reboka_tg_ultimo_contato(), reboka_tg_semear() from public, anon, authenticated;
revoke all on reboka_lojas, reboka_membros, reboka_servicos, reboka_clientes, reboka_oportunidades,
  reboka_atendimentos, reboka_contatos, reboka_modelos, reboka_hoje from anon;
