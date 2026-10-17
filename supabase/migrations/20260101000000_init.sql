-- =====================================================================
-- Estoque da Loja — esquema multi-loja (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase (ou `supabase db push`).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

-- Quem administra a plataforma (você, que vende os acessos)
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Cada cliente pagante = uma loja
create table if not exists public.stores (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  slug          text not null unique
                check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  status        text not null default 'active' check (status in ('active', 'blocked')),
  plan          text not null default 'basico',
  max_users     integer not null default 1 check (max_users between 1 and 100),
  expires_at    timestamptz,                -- null = sem vencimento
  owner_id      uuid references auth.users (id) on delete set null,
  contact_name  text,
  contact_phone text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Pessoas com acesso a uma loja (dono + equipe)
create table if not exists public.store_members (
  store_id     uuid not null references public.stores (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null check (role in ('owner', 'staff')),
  perms        text[] not null default '{}',
  display_name text not null default '',
  created_at   timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index if not exists store_members_user_idx on public.store_members (user_id);

-- Dados do sistema: um registro por produto, movimentação, venda, cliente...
create table if not exists public.store_records (
  store_id   uuid not null references public.stores (id) on delete cascade,
  coll       text not null check (coll in ('products', 'moves', 'sales', 'customers', 'catalog', 'presets')),
  id         text not null check (char_length(id) between 1 and 64),
  data       jsonb not null,
  seq        bigserial,
  client_id  text,
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, coll, id)
);
create index if not exists store_records_order_idx on public.store_records (store_id, coll, seq);

-- Histórico das ações administrativas
create table if not exists public.audit_log (
  id         bigserial primary key,
  store_id   uuid references public.stores (id) on delete set null,
  actor_id   uuid,
  actor_email text,
  action     text not null,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- ---------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------
create or replace function public.touch_updated()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_table_name = 'store_records' then
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

drop trigger if exists stores_touch on public.stores;
create trigger stores_touch before update on public.stores
  for each row execute function public.touch_updated();

drop trigger if exists store_records_touch on public.store_records;
create trigger store_records_touch before update on public.store_records
  for each row execute function public.touch_updated();

-- ---------------------------------------------------------------------
-- Funções auxiliares (usadas nas políticas RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

create or replace function public.is_member(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members where store_id = p_store and user_id = auth.uid());
$$;

create or replace function public.is_owner(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from store_members
                 where store_id = p_store and user_id = auth.uid() and role = 'owner');
$$;

-- Membro de uma loja liberada e dentro da validade
create or replace function public.is_active_member(p_store uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from store_members m
    join stores s on s.id = m.store_id
    where m.store_id = p_store
      and m.user_id = auth.uid()
      and s.status = 'active'
      and (s.expires_at is null or s.expires_at > now())
  );
$$;

create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- Remove custos do produto antes de publicá-lo no catálogo
create or replace function public.strip_costs(p jsonb)
returns jsonb language sql immutable as $$
  select (p - 'cost') || jsonb_build_object(
    'vars',
    coalesce((
      select jsonb_agg(
               g.val || jsonb_build_object(
                 'opts',
                 coalesce((
                   select jsonb_agg(o.val - 'c' order by o.ord)
                   from jsonb_array_elements(
                          case when jsonb_typeof(g.val -> 'opts') = 'array' then g.val -> 'opts' else '[]'::jsonb end
                        ) with ordinality as o(val, ord)
                 ), '[]'::jsonb)
               )
               order by g.ord)
      from jsonb_array_elements(
             case when jsonb_typeof(p -> 'vars') = 'array' then p -> 'vars' else '[]'::jsonb end
           ) with ordinality as g(val, ord)
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- RPCs usadas pelo front
-- ---------------------------------------------------------------------

-- Catálogo público (sem login): só lojas liberadas, sem custos
create or replace function public.public_catalog(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s stores%rowtype;
begin
  select * into s from stores
   where slug = lower(p_slug)
     and status = 'active'
     and (expires_at is null or expires_at > now());
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'store', jsonb_build_object('name', s.name, 'slug', s.slug),
    'catalog', (select r.data from store_records r
                 where r.store_id = s.id and r.coll = 'catalog' and r.id = 'main'),
    'products', coalesce((select jsonb_agg(strip_costs(r.data) order by r.seq desc)
                            from store_records r
                           where r.store_id = s.id and r.coll = 'products'), '[]'::jsonb)
  );
end $$;

-- O dono troca o endereço do catálogo (/c/<slug>)
create or replace function public.set_store_slug(p_store uuid, p_slug text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v text := lower(trim(p_slug));
begin
  if not is_owner(p_store) or not is_active_member(p_store) then
    raise exception 'Somente o dono da loja pode alterar o endereço.' using errcode = '42501';
  end if;
  if v !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$' then
    raise exception 'Use de 3 a 40 letras minúsculas, números ou hífen.' using errcode = '22023';
  end if;
  if exists (select 1 from stores where slug = v and id <> p_store) then
    raise exception 'Esse endereço já está em uso.' using errcode = '23505';
  end if;
  update stores set slug = v where id = p_store;
  return v;
end $$;

-- Cada pessoa ajusta o próprio nome de exibição
create or replace function public.set_my_display_name(p_store uuid, p_name text)
returns void language sql security definer set search_path = public as $$
  update store_members
     set display_name = left(trim(p_name), 80)
   where store_id = p_store and user_id = auth.uid();
$$;

revoke all on function public.public_catalog(text) from public;
grant execute on function public.public_catalog(text) to anon, authenticated;
revoke all on function public.set_store_slug(uuid, text) from public, anon;
grant execute on function public.set_store_slug(uuid, text) to authenticated;
revoke all on function public.set_my_display_name(uuid, text) from public, anon;
grant execute on function public.set_my_display_name(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Visões para o servidor (Cloudflare Functions, com service_role)
-- ---------------------------------------------------------------------
create or replace view public.admin_store_overview as
select s.*,
       u.email                                   as owner_email,
       u.last_sign_in_at                         as owner_last_sign_in_at,
       (select count(*) from store_members m where m.store_id = s.id)::int as member_count,
       (select count(*) from store_records r where r.store_id = s.id and r.coll = 'products')::int as product_count,
       (select count(*) from store_records r where r.store_id = s.id and r.coll = 'sales')::int as sale_count,
       (select max(r.updated_at) from store_records r where r.store_id = s.id) as last_activity_at
from stores s
left join auth.users u on u.id = s.owner_id;

create or replace view public.member_overview as
select m.store_id, m.user_id, m.role, m.perms, m.display_name, m.created_at,
       u.email, u.last_sign_in_at
from store_members m
join auth.users u on u.id = m.user_id;

revoke all on public.admin_store_overview from public, anon, authenticated;
revoke all on public.member_overview from public, anon, authenticated;
grant select on public.admin_store_overview to service_role;
grant select on public.member_overview to service_role;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.platform_admins enable row level security;
alter table public.stores          enable row level security;
alter table public.store_members   enable row level security;
alter table public.store_records   enable row level security;
alter table public.audit_log       enable row level security;

drop policy if exists "admins: ver a si mesmo" on public.platform_admins;
create policy "admins: ver a si mesmo" on public.platform_admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "lojas: membros e admins leem" on public.stores;
create policy "lojas: membros e admins leem" on public.stores
  for select to authenticated using (is_member(id) or is_platform_admin());

drop policy if exists "membros: próprio registro ou dono" on public.store_members;
create policy "membros: próprio registro ou dono" on public.store_members
  for select to authenticated using (user_id = auth.uid() or is_owner(store_id));

drop policy if exists "registros: ler" on public.store_records;
create policy "registros: ler" on public.store_records
  for select to authenticated using (is_active_member(store_id));

drop policy if exists "registros: criar" on public.store_records;
create policy "registros: criar" on public.store_records
  for insert to authenticated with check (is_active_member(store_id));

drop policy if exists "registros: alterar" on public.store_records;
create policy "registros: alterar" on public.store_records
  for update to authenticated using (is_active_member(store_id)) with check (is_active_member(store_id));

drop policy if exists "registros: excluir" on public.store_records;
create policy "registros: excluir" on public.store_records
  for delete to authenticated using (is_active_member(store_id));

drop policy if exists "auditoria: admins leem" on public.audit_log;
create policy "auditoria: admins leem" on public.audit_log
  for select to authenticated using (is_platform_admin());

-- Alterações em lojas/membros/auditoria só pelo servidor (service_role ignora RLS).

-- ---------------------------------------------------------------------
-- Storage: fotos dos produtos e do catálogo
-- Caminho: <store_id>/<coleção>/<arquivo>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-media', 'store-media', true, 5242880,
        array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "midia: membros leem" on storage.objects;
create policy "midia: membros leem" on storage.objects
  for select to authenticated
  using (bucket_id = 'store-media' and public.is_member(public.try_uuid((storage.foldername(name))[1])));

drop policy if exists "midia: membros enviam" on storage.objects;
create policy "midia: membros enviam" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-media' and public.is_active_member(public.try_uuid((storage.foldername(name))[1])));

drop policy if exists "midia: membros removem" on storage.objects;
create policy "midia: membros removem" on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-media' and public.is_active_member(public.try_uuid((storage.foldername(name))[1])));

-- ---------------------------------------------------------------------
-- Realtime: avisa quando outro aparelho altera os dados
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_records') then
    alter publication supabase_realtime add table public.store_records;
  end if;
end $$;
