-- Funilaria e pintura: oficina nova já nasce com serviços de vários dias, que ocupam um box na Agenda.
create or replace function reboka_tg_semear() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into reboka_servicos (loja_id, nome, ciclo_retorno_dias, ciclo_retorno_km, valor_medio, dura_dias) values
    (new.id, 'Troca de óleo e filtro', 180, 10000, 280, null),
    (new.id, 'Alinhamento e balanceamento', 180, 10000, 180, null),
    (new.id, 'Revisão completa', 365, 10000, 950, null),
    (new.id, 'Higienização do ar-condicionado', 365, null, 160, null),
    (new.id, 'Troca de pastilhas de freio', 365, 30000, 420, null),
    (new.id, 'Funilaria e pintura', null, null, 1800, 4),
    (new.id, 'Reparo e pintura de para-choque', null, null, 650, 2),
    (new.id, 'Polimento e cristalização', 365, null, 480, null);
  insert into reboka_modelos (loja_id, titulo, texto) values
    (new.id, 'Retorno de serviço', 'Oi, {nome}! Já faz {tempo} da última {servico} do seu carro. Está na hora de fazer de novo. Quer que eu reserve um horário nesta semana?'),
    (new.id, 'Orçamento sem resposta', 'Oi, {nome}! Passando para saber se ficou alguma dúvida sobre o orçamento de {servico}. Se preferir, posso te ligar rapidinho.'),
    (new.id, 'Pacote em aberto', 'Oi, {nome}! Está na hora da próxima etapa do seu plano de {servico}. Vamos marcar?'),
    (new.id, 'Reativação', 'Oi, {nome}! Faz {tempo} que seu carro não passa por aqui. Quer que eu reserve um horário para uma checagem?');
  return new;
end $$;
