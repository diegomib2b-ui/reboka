-- Cada cliente tem o carro (modelo e ano) e a placa na ficha.
-- Um carro por cliente no MVP; quem tem dois carros anota o segundo na observação.
alter table reboka_clientes add column veiculo text, add column placa text;
alter table reboka_clientes add constraint reboka_clientes_placa_formato check (placa is null or placa ~ '^[A-Z0-9]{5,8}$');
create index reboka_clientes_placa_idx on reboka_clientes (loja_id, placa);

-- Painel de teste: dá carro e placa aos clientes de exemplo.
-- SECURITY INVOKER (padrão): passa pela RLS, então só mexe na própria oficina.
create or replace function reboka_popular_demo_veiculos(c uuid) returns int
language plpgsql set search_path = public as $$
declare
  carros text[] := array['Corolla 2019', 'Hilux 2018', 'Compass 2020', 'HB20 2017', 'Onix 2021', 'T-Cross 2022',
    'Civic 2016', 'Kwid 2020', 'Renegade 2018', 'Polo 2019', 'Strada 2021', 'Creta 2019'];
  n int;
begin
  if c not in (select reboka_minhas_lojas()) then raise exception 'Oficina não encontrada'; end if;
  update reboka_clientes cl set
    veiculo = carros[1 + (o.ordem - 1) % array_length(carros, 1)],
    -- placa de exemplo no padrão Mercosul (3 letras, 1 número, 1 letra, 2 números)
    placa = chr(65 + o.ordem % 26) || chr(66 + (o.ordem * 7) % 24) || chr(67 + (o.ordem * 3) % 23)
      || (o.ordem % 10)::text || chr(65 + (o.ordem * 5) % 26) || lpad(((o.ordem * 37) % 100)::text, 2, '0')
  from (select id, row_number() over (order by criado_em, id)::int as ordem from reboka_clientes where loja_id = c and demo) o
  where cl.id = o.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function reboka_popular_demo_veiculos(uuid) from public, anon;
grant execute on function reboka_popular_demo_veiculos(uuid) to authenticated;
