-- Reboka: o agendamento do motor vira o CHAMADO de guincho.
-- As fases reaproveitam os status que já existem, só com outro nome na tela:
--   confirmado = agendado | fila = novo | em_servico = a caminho | pronto = carregado | entregue = entregue
alter table reboka_agendamentos
  add column if not exists origem text,
  add column if not exists destino text,
  add column if not exists km numeric(7,1),
  add column if not exists valor numeric(10,2),
  add column if not exists noturno boolean not null default false,
  add column if not exists adicionais jsonb not null default '[]'::jsonb,  -- [{nome, valor}]
  add column if not exists motorista text,
  add column if not exists placa text,
  add column if not exists pagador text,                                   -- oficina, seguradora ou empresa que paga depois
  add column if not exists pago boolean not null default false,
  add column if not exists observacao text;

-- Tabela de preço do guincho: a cotação sai destes números.
alter table reboka_lojas
  add column if not exists tarifa_saida numeric(10,2) not null default 150,
  add column if not exists tarifa_km numeric(10,2) not null default 4.50,
  add column if not exists tarifa_franquia_km integer not null default 0,      -- km já incluídos na saída
  add column if not exists tarifa_noturno_pct integer not null default 30,     -- acréscimo à noite, domingo e feriado
  add column if not exists tarifa_adicionais jsonb not null default
    '[{"nome":"Patins","valor":80},{"nome":"Veículo rebaixado","valor":60},{"nome":"Retirada de garagem","valor":100},{"nome":"Hora parada","valor":70}]'::jsonb;

-- O atendimento guarda quem pagou depois (a receber por empresa).
alter table reboka_atendimentos add column if not exists pagador text, add column if not exists pago boolean not null default true;

-- Empresa nova já nasce com os serviços e as mensagens de guincho.
create or replace function reboka_tg_semear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into reboka_servicos (loja_id, nome, valor_medio) values
    (new.id, 'Reboque de carro', 250),
    (new.id, 'Reboque de moto', 180),
    (new.id, 'Reboque de utilitário ou SUV', 320),
    (new.id, 'Remoção de sinistro', 380),
    (new.id, 'Socorro: bateria (chupeta)', 120),
    (new.id, 'Socorro: troca de pneu', 120),
    (new.id, 'Socorro: pane seca', 130);
  insert into reboka_modelos (loja_id, titulo, texto) values
    (new.id, 'Cotação', 'Oi, {nome}! O guincho fica em {valor}. Posso mandar o caminhão agora?'),
    (new.id, 'A caminho', 'Oi, {nome}! O guincho já saiu e está a caminho. Qualquer coisa me chame por aqui.'),
    (new.id, 'Entregue', 'Oi, {nome}! Seu veículo foi entregue no destino. Obrigado pela confiança.'),
    (new.id, 'Parceria com oficina', 'Oi, {nome}! Aqui é do guincho. Quando um cliente seu precisar de reboque, pode me chamar direto por este número.');
  return new;
end $$;
