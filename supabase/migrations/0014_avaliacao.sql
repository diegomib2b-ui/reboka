-- Avaliação pós-serviço: página pública de nota. Nota alta -> manda pro Google; nota baixa -> feedback interno.

alter table reboka_lojas
  add column avaliar_ativo boolean not null default false,
  add column google_review_url text;

create table reboka_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  loja_id uuid not null references reboka_lojas(id) on delete cascade,
  nota int not null check (nota between 1 and 5),
  comentario text,
  nome text,
  criado_em timestamptz not null default now()
);
create index reboka_avaliacoes_loja on reboka_avaliacoes (loja_id, criado_em);

alter table reboka_avaliacoes enable row level security;
create policy avaliacoes_membros on reboka_avaliacoes for all
  using (loja_id in (select reboka_minhas_lojas())) with check (loja_id in (select reboka_minhas_lojas()));

-- Info pública para a página de avaliação.
create or replace function reboka_avaliar_info(p_slug text)
returns table (loja_id uuid, nome text, google_url text)
language sql stable security definer set search_path = public as $$
  select l.id, l.nome, l.google_review_url
  from reboka_lojas l
  where l.slug = p_slug and l.avaliar_ativo = true;
$$;

-- Registra a avaliação e devolve a URL do Google quando a nota for alta (4-5) e houver link.
create or replace function reboka_avaliar(p_slug text, p_nota int, p_comentario text, p_nome text)
returns text
language plpgsql security definer set search_path = public as $$
declare v_loja uuid; v_url text;
begin
  select id, google_review_url into v_loja, v_url
    from reboka_lojas where slug = p_slug and avaliar_ativo = true;
  if v_loja is null then raise exception 'Avaliação indisponível.'; end if;
  if p_nota is null or p_nota < 1 or p_nota > 5 then raise exception 'Nota inválida.'; end if;
  insert into reboka_avaliacoes (loja_id, nota, comentario, nome)
    values (v_loja, p_nota, nullif(trim(coalesce(p_comentario, '')), ''), nullif(trim(coalesce(p_nome, '')), ''));
  if p_nota >= 4 and v_url is not null then return v_url; end if;
  return null;
end $$;

revoke execute on function reboka_avaliar_info(text), reboka_avaliar(text, int, text, text) from public;
grant execute on function reboka_avaliar_info(text), reboka_avaliar(text, int, text, text) to anon, authenticated;
