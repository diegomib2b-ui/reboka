-- Pagamento Pix (chave própria da oficina: copia-e-cola/QR, sem intermediário) + adicionais de serviço (upsell).
alter table reboka_lojas
  add column pix_chave text,
  add column pix_nome text,
  add column pix_cidade text;

alter table reboka_servicos
  add column adicional boolean not null default false;  -- serviço marcável como "adicional" no atendimento
