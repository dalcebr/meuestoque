-- Lojas que vencem nos próximos 7 dias
select name, slug, owner_email, expires_at
from public.admin_store_overview
where status = 'active' and expires_at between now() and now() + interval '7 days'
order by expires_at;

-- Lojas vencidas
select name, slug, owner_email, expires_at
from public.admin_store_overview
where expires_at < now()
order by expires_at desc;

-- Espaço usado por loja (registros)
select s.name, count(*) as registros, pg_size_pretty(sum(pg_column_size(r.data))::bigint) as tamanho
from public.store_records r join public.stores s on s.id = r.store_id
group by s.name order by sum(pg_column_size(r.data)) desc;
