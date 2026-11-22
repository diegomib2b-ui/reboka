#!/usr/bin/env bash
# Recria do zero o banco de teste local (Postgres na porta 5544 + PostgREST na 3055), em UTC como o Supabase.
# Uso: bash scripts/banco_local.sh   (precisa de /tmp/pg e /tmp/pgrst já preparados; ver scripts/prints_painel.py)
set -e
cd "$(dirname "$0")/.."
P="psql -h /tmp/pg -p 5544 -U postgres -q"
pg_isready -h /tmp/pg -p 5544 >/dev/null 2>&1 || { su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg/data -o '-p 5544 -k /tmp/pg' -l /tmp/pg/log start" >/dev/null; sleep 2; }
pkill postgrest 2>/dev/null || true; sleep 1
$P -c "drop database if exists oficina with (force)" postgres
$P -c "create database oficina" postgres
$P -c "alter database oficina set timezone to 'UTC'" postgres
$P -f /tmp/pg/stub.sql oficina 2>&1 | grep -v "already exists" || true
for f in supabase/migrations/*.sql; do $P -v ON_ERROR_STOP=1 -f "$f" oficina >/dev/null || { echo "FALHOU $f"; exit 1; }; done
$P -c "insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','dono@x.com')" oficina
(nohup /tmp/pgrst/postgrest /tmp/pgrst/conf > /tmp/pgrst/log 2>&1 &)
sleep 2; echo "banco local pronto"
