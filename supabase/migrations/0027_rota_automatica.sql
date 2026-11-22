-- Reboka: valor calculado pela rota. O chamado passa a ter três trechos:
--   deslocamento (de onde o guincho está até o veículo), transporte (do veículo ao destino) e retorno (do destino à base).

-- A base do guincho (pátio) e o preço por km de cada trecho. Preço vazio no deslocamento ou no retorno = o mesmo do transporte.
alter table reboka_lojas
  add column if not exists base_endereco text,
  add column if not exists base_lat numeric(9,6),
  add column if not exists base_lng numeric(9,6),
  add column if not exists tarifa_km_desloc numeric(8,2),
  add column if not exists tarifa_km_retorno numeric(8,2);
grant update (base_endereco, base_lat, base_lng, tarifa_km_desloc, tarifa_km_retorno) on reboka_lojas to authenticated;

-- No chamado: o ponto de partida do guincho, o destino no mapa e os km de cada trecho.
-- A coluna km continua sendo o transporte (do veículo ao destino), como antes.
alter table reboka_agendamentos
  add column if not exists partida_endereco text,
  add column if not exists partida_lat numeric(9,6),
  add column if not exists partida_lng numeric(9,6),
  add column if not exists destino_lat numeric(9,6),
  add column if not exists destino_lng numeric(9,6),
  add column if not exists km_desloc numeric(7,1),
  add column if not exists km_retorno numeric(7,1),
  add column if not exists min_rota integer;          -- minutos de estrada dos três trechos, pela rota (a agenda usa para o tamanho do bloco)
