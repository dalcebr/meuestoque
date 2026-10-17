-- =====================================================================
-- Atualização 2: limite de produtos por loja, seção inicial padrão do
-- catálogo e fotos de até 10 MB.
-- Rode no SQL Editor do Supabase DEPOIS do 20260101000000_init.sql.
-- Pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Limite de produtos (null = sem limite)
-- ---------------------------------------------------------------------
alter table public.stores
  add column if not exists max_products integer
  check (max_products is null or max_products >= 0);

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

-- Bloqueia no banco a criação de produto além do limite do plano.
-- Editar produtos que já existem continua liberado, mesmo acima do limite.
create or replace function public.enforce_product_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_max   integer;
  v_count integer;
begin
  if new.coll <> 'products' then
    return new;
  end if;
  -- upsert de um produto que já existe = edição, não conta
  if exists (select 1 from store_records
              where store_id = new.store_id and coll = 'products' and id = new.id) then
    return new;
  end if;
  select max_products into v_max from stores where id = new.store_id;
  if v_max is null then
    return new;
  end if;
  -- trava a loja para duas inserções simultâneas não passarem do limite
  perform 1 from stores where id = new.store_id for update;
  select count(*) into v_count from store_records
   where store_id = new.store_id and coll = 'products';
  if v_count >= v_max then
    raise exception 'Seu plano permite até % %. Exclua algum ou mude de plano para cadastrar mais.',
      v_max, case when v_max = 1 then 'produto' else 'produtos' end
      using errcode = 'P0001', hint = 'product_limit';
  end if;
  return new;
end $$;

drop trigger if exists store_records_product_limit on public.store_records;
create trigger store_records_product_limit before insert on public.store_records
  for each row execute function public.enforce_product_limit();

-- ---------------------------------------------------------------------
-- 2. Seção inicial do catálogo: lojas sem título e sem descrição
--    passam a ter um texto padrão (o dono pode mudar em Catálogo).
-- ---------------------------------------------------------------------
insert into public.store_records (store_id, coll, id, data, client_id)
select s.id, 'catalog', 'main', '{}'::jsonb, 'server'
from public.stores s
where not exists (select 1 from public.store_records r
                   where r.store_id = s.id and r.coll = 'catalog' and r.id = 'main');

update public.store_records r
   set data = r.data || jsonb_build_object(
         'store', coalesce(nullif(r.data ->> 'store', ''), s.name),
         'title', 'Confira nossos produtos',
         'desc',  'Escolha o que gostar, monte o carrinho e envie o pedido pelo WhatsApp.'
       ),
       client_id = 'server'
  from public.stores s
 where r.store_id = s.id
   and r.coll = 'catalog' and r.id = 'main'
   and coalesce(r.data ->> 'title', '') = ''
   and coalesce(r.data ->> 'desc', '') = '';

-- ---------------------------------------------------------------------
-- 3. Fotos: limite por arquivo de 5 MB para 10 MB
--    (fotos de celular sem WebP, como no iPhone, saem em PNG e são maiores)
-- ---------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/webp', 'image/png', 'image/jpeg']
 where id = 'store-media';

-- Atualiza o cache da API do Supabase com a coluna nova
notify pgrst, 'reload schema';
