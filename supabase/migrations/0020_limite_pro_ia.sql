-- Pro IA tem o mesmo limite de clientes do Equipe.
create or replace function reboka_limite_clientes(p reboka_plano)
returns integer language sql immutable set search_path to 'public'
as $$ select case p when 'equipe' then 7000 when 'pro_ia' then 7000 else 1000 end $$;
