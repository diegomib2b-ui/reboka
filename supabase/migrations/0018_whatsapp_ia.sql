-- Atendimento WhatsApp com IA (Evolution/Baileys + Claude Haiku).
-- Config por loja + log de conversas. As chaves do Evolution e da Anthropic ficam no Worker (segredos), nunca aqui.

alter table reboka_lojas
  add column wa_ativo boolean not null default false,
  add column wa_instancia text unique,              -- nome da instância no Evolution
  add column wa_numero text,                         -- número conectado (só exibição)
  add column wa_persona text,                        -- instruções extras para a IA (tom, regras da loja)
  add column wa_proativo_retorno boolean not null default true,
  add column wa_proativo_pronto boolean not null default true;

create table reboka_wa_mensagens (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas(id) on delete cascade,
  telefone text not null,
  nome text,
  direcao text not null check (direcao in ('in','out')),
  texto text not null,
  criado_em timestamptz not null default now()
);
create index reboka_wa_mensagens_loja on reboka_wa_mensagens (loja_id, telefone, criado_em);

alter table reboka_wa_mensagens enable row level security;
-- Só leitura pelo painel; a escrita é feita pelo Worker (service role, ignora RLS).
create policy wa_msg_ler on reboka_wa_mensagens for select
  using (loja_id in (select reboka_minhas_lojas()));
