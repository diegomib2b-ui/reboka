-- Fixa o search_path da função imutável (aviso do linter de segurança do Supabase).
-- Função sem acesso a tabelas (só um CASE sobre o plano), então é só higiene.
alter function reboka_limite_clientes(reboka_plano) set search_path = public;
