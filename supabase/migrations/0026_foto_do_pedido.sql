-- Reboka: foto do veículo no link "Pedir guincho".
-- A foto fica no Storage (arquivos), não no banco: o banco guarda só a marca "tem foto".
-- Caminho do arquivo: <id do chamado>.jpg, no bucket privado reboka-pedidos.
alter table reboka_agendamentos add column if not exists tem_foto boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reboka-pedidos', 'reboka-pedidos', false, 614400, array['image/jpeg'])   -- até 600 KB, só JPEG
on conflict (id) do nothing;

-- Tira o id do chamado do nome do arquivo; qualquer nome fora do padrão devolve nulo.
create or replace function reboka_foto_pedido_id(p_nome text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then left(p_nome, 36)::uuid end
$$;

-- Só entra foto de um pedido feito pelo link há menos de 15 minutos e que ainda não tem foto.
-- Como o pedido já é limitado (3 por telefone por hora), o envio de fotos herda o mesmo limite.
create or replace function reboka_pode_enviar_foto(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reboka_agendamentos a
    where a.id = reboka_foto_pedido_id(p_nome) and a.canal = 'link' and not a.tem_foto and a.criado_em > now() - interval '15 minutes')
$$;

-- Só a equipe do guincho que recebeu o pedido vê (ou apaga) a foto.
create or replace function reboka_pode_ver_foto(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from reboka_agendamentos a
    where a.id = reboka_foto_pedido_id(p_nome) and a.loja_id in (select reboka_minhas_lojas()))
$$;

drop policy if exists reboka_pedidos_enviar on storage.objects;
drop policy if exists reboka_pedidos_ver on storage.objects;
drop policy if exists reboka_pedidos_apagar on storage.objects;
create policy reboka_pedidos_enviar on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'reboka-pedidos' and reboka_pode_enviar_foto(name));
create policy reboka_pedidos_ver on storage.objects for select to authenticated
  using (bucket_id = 'reboka-pedidos' and reboka_pode_ver_foto(name));
create policy reboka_pedidos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'reboka-pedidos' and reboka_pode_ver_foto(name));

-- Depois do envio, a página avisa o banco; ele confere se o arquivo existe e marca o chamado.
create or replace function reboka_pedir_foto(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update reboka_agendamentos a set tem_foto = true
    where a.id = p_id and a.canal = 'link' and a.criado_em > now() - interval '15 minutes'
      and exists (select 1 from storage.objects o where o.bucket_id = 'reboka-pedidos' and o.name = p_id::text || '.jpg');
  return found;
end $$;

revoke execute on function reboka_foto_pedido_id(text), reboka_pode_enviar_foto(text), reboka_pode_ver_foto(text), reboka_pedir_foto(uuid) from public;
grant execute on function reboka_foto_pedido_id(text), reboka_pode_enviar_foto(text), reboka_pedir_foto(uuid) to anon, authenticated;
grant execute on function reboka_pode_ver_foto(text) to authenticated;
