-- Terceiro plano: Pro IA (inclui o Atendente IA). Adiciona o valor ao enum (sem usá-lo nesta transação).
alter type reboka_plano add value if not exists 'pro_ia';
