-- Reboka: link público "Pedir guincho". O cliente preenche o pedido no celular e ele cai como chamado Novo no quadro.

-- Correção da 0024: a tabela de preço não tinha permissão de edição pelo painel.
-- (Em reboka_lojas o usuário logado só edita as colunas liberadas uma a uma; plano e assinatura ficam com o servidor.)
alter table reboka_lojas
  add column if not exists pedir_ativo boolean not null default false,
  add column if not exists pedir_telefone text;                       -- WhatsApp do guincho, mostrado ao cliente depois do pedido
grant update (tarifa_saida, tarifa_km, tarifa_franquia_km, tarifa_noturno_pct, tarifa_adicionais, pedir_ativo, pedir_telefone)
  on reboka_lojas to authenticated;

alter table reboka_agendamentos
  add column if not exists canal text,                                -- 'link' quando o pedido veio do link público
  add column if not exists cotacao_enviada_em timestamptz,           -- quando a cotação foi mandada ao cliente (decide o próximo passo na fila)
  add column if not exists origem_lat numeric(9,6),
  add column if not exists origem_lng numeric(9,6);

-- O que a página pública precisa saber: nome do guincho, WhatsApp e os serviços (sem preço: quem cota é o guincheiro).
create or replace function reboka_pedir_info(p_slug text)
returns table (nome text, telefone text, servicos json)
language sql stable security definer set search_path = public as $$
  select l.nome, l.pedir_telefone,
    coalesce((select json_agg(s.nome order by s.nome) from reboka_servicos s where s.loja_id = l.id and s.ativo), '[]'::json)
  from reboka_lojas l
  where l.slug = p_slug and l.pedir_ativo = true;
$$;

-- Cria o chamado a partir do link. Valida os campos e limita abuso: o mesmo telefone abre no máximo 3 pedidos por hora,
-- e cada guincho recebe no máximo 40 pedidos pelo link por hora.
create or replace function reboka_pedir(p_slug text, p_nome text, p_telefone text, p_veiculo text, p_placa text, p_servico text,
  p_origem text, p_destino text, p_observacao text, p_lat numeric, p_lng numeric)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_loja uuid; v_id uuid; v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_origem text := nullif(trim(coalesce(p_origem, '')), '');
begin
  select id into v_loja from reboka_lojas where slug = p_slug and pedir_ativo = true;
  if v_loja is null then raise exception 'Este link não está ativo.'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'Informe seu nome.'; end if;
  if length(v_tel) < 10 or length(v_tel) > 13 then raise exception 'Informe um WhatsApp com DDD.'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lng is null or p_lng < -180 or p_lng > 180) then p_lat := null; p_lng := null; end if;
  if p_lat is null then p_lng := null; end if;
  if v_origem is null and p_lat is null then raise exception 'Informe onde o veículo está.'; end if;
  if (select count(*) from reboka_agendamentos a where a.loja_id = v_loja and a.canal = 'link' and a.telefone = v_tel and a.criado_em > now() - interval '1 hour') >= 3
    then raise exception 'Você já enviou pedidos há pouco. Aguarde o contato do guincho.'; end if;
  if (select count(*) from reboka_agendamentos a where a.loja_id = v_loja and a.canal = 'link' and a.criado_em > now() - interval '1 hour') >= 40
    then raise exception 'Muitos pedidos agora. Ligue direto para o guincho.'; end if;
  insert into reboka_agendamentos (loja_id, nome, telefone, veiculo, placa, servico_nome, origem, destino, observacao, origem_lat, origem_lng, inicio, status, canal)
    values (v_loja, left(trim(p_nome), 80), v_tel,
            nullif(left(trim(coalesce(p_veiculo, '')), 80), ''),
            nullif(upper(left(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'), 8)), ''),
            nullif(left(trim(coalesce(p_servico, '')), 80), ''),
            coalesce(left(v_origem, 200), 'Localização enviada pelo celular'),
            nullif(left(trim(coalesce(p_destino, '')), 200), ''),
            nullif(left(trim(coalesce(p_observacao, '')), 300), ''),
            p_lat, p_lng, now(), 'fila', 'link')
    returning id into v_id;
  return v_id;
end $$;

revoke execute on function reboka_pedir_info(text), reboka_pedir(text, text, text, text, text, text, text, text, text, numeric, numeric) from public;
grant execute on function reboka_pedir_info(text), reboka_pedir(text, text, text, text, text, text, text, text, text, numeric, numeric) to anon, authenticated;
