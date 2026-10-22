-- =====================================================================
-- Atualização 3: limite de fotos por produto (definido por plano/loja).
-- Rode no SQL Editor do Supabase DEPOIS das atualizações anteriores.
-- Pode rodar mais de uma vez.
-- =====================================================================

alter table public.stores
  add column if not exists max_photos integer not null default 5
  check (max_photos between 1 and 50);

-- A visão do painel precisa ser recriada para incluir a coluna nova.
drop view if exists public.admin_store_overview;
create view public.admin_store_overview as
select s.*,
       u.email                                   as owner_email,
       u.last_sign_in_at                         as owner_last_sign_in_at,
       (select count(*) from store_members m where m.store_id = s.id)::int as member_count,
       (select count(*) from store_records r where r.store_id = s.id and r.coll = 'products')::int as product_count,
       (select count(*) from store_records r where r.store_id = s.id and r.coll = 'sales')::int as sale_count,
       (select max(r.updated_at) from store_records r where r.store_id = s.id) as last_activity_at
from stores s
left join auth.users u on u.id = s.owner_id;

revoke all on public.admin_store_overview from public, anon, authenticated;
grant select on public.admin_store_overview to service_role;

-- Recusa produto com mais fotos que o plano permite.
-- Se o limite for reduzido, produtos antigos continuam editáveis desde que
-- não ganhem fotos novas.
create or replace function public.enforce_photo_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_max   integer;
  v_new   integer;
  v_old   integer := 0;
begin
  if new.coll <> 'products' then
    return new;
  end if;
  v_new := case when jsonb_typeof(new.data -> 'imgs') = 'array' then jsonb_array_length(new.data -> 'imgs') else 0 end;
  select max_photos into v_max from stores where id = new.store_id;
  if v_max is null or v_new <= v_max then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_old := case when jsonb_typeof(old.data -> 'imgs') = 'array' then jsonb_array_length(old.data -> 'imgs') else 0 end;
  else
    select case when jsonb_typeof(r.data -> 'imgs') = 'array' then jsonb_array_length(r.data -> 'imgs') else 0 end
      into v_old
      from store_records r
     where r.store_id = new.store_id and r.coll = 'products' and r.id = new.id;
    v_old := coalesce(v_old, 0);
  end if;
  if v_new > v_old then
    raise exception 'Seu plano permite até % % por produto.', v_max, case when v_max = 1 then 'foto' else 'fotos' end
      using errcode = 'P0001', hint = 'photo_limit';
  end if;
  return new;
end $$;

drop trigger if exists store_records_photo_limit on public.store_records;
create trigger store_records_photo_limit before insert or update on public.store_records
  for each row execute function public.enforce_photo_limit();

-- Atualiza o cache da API do Supabase com a coluna nova
notify pgrst, 'reload schema';
