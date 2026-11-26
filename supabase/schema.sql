-- 联名日历 · Supabase 数据库结构
-- 使用方法：在 Supabase 项目的 SQL Editor 里粘贴并执行本文件，
-- 然后再执行 seed.sql 导入首批种子活动。
-- 本文件可重复执行（建表 / 策略均用 IF NOT EXISTS 保护）。

-- ============ events：共享日历上的活动（所有人共用同一张表） ============
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand text not null,
  partner text,
  type text not null default 'collab'
    check (type in ('collab', 'promo')),
  category text not null default '奶茶',
  start_date date not null,
  end_date date,
  description text not null default '',
  price_note text,
  source_url text,
  order_name text,
  order_hint text,
  origin text not null default 'seed'
    check (origin in ('seed', 'user', 'manual', 'auto')),
  source_label text,
  created_at timestamptz not null default now()
);

create index if not exists events_start_date_idx on public.events (start_date);
create index if not exists events_end_date_idx on public.events (end_date);
create index if not exists events_type_idx on public.events (type);

-- ============ submissions：投稿链接记录（用于拦重复链接） ============
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  status text not null default 'done'
    check (status in ('pending', 'done', 'failed')),
  event_id uuid references public.events (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists submissions_url_idx on public.submissions (url);

-- ============ 行级安全策略（RLS） ============
alter table public.events enable row level security;
alter table public.submissions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'events' and policyname = 'events_select_all'
  ) then
    create policy "events_select_all" on public.events
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'events' and policyname = 'events_insert_all'
  ) then
    create policy "events_insert_all" on public.events
      for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'submissions' and policyname = 'submissions_select_all'
  ) then
    create policy "submissions_select_all" on public.submissions
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'submissions' and policyname = 'submissions_insert_all'
  ) then
    create policy "submissions_insert_all" on public.submissions
      for insert with check (true);
  end if;
end $$;

-- ============ purchases：登录用户的购买记录（每人只能看到自己的） ============
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid references public.events (id) on delete set null,
  title text not null,
  brand text,
  price numeric(10, 2) not null default 0,
  date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists purchases_user_id_idx on public.purchases (user_id);
create index if not exists purchases_date_idx on public.purchases (date);

alter table public.purchases enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'purchases' and policyname = 'purchases_select_own'
  ) then
    create policy "purchases_select_own" on public.purchases
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'purchases' and policyname = 'purchases_insert_own'
  ) then
    create policy "purchases_insert_own" on public.purchases
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'purchases' and policyname = 'purchases_update_own'
  ) then
    create policy "purchases_update_own" on public.purchases
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'purchases' and policyname = 'purchases_delete_own'
  ) then
    create policy "purchases_delete_own" on public.purchases
      for delete using (auth.uid() = user_id);
  end if;
end $$;

-- ============ 迁移：给已建好的 events 表扩展 origin（加入 'auto'） ============
do $$
begin
  alter table public.events drop constraint if exists events_origin_check;
  alter table public.events add constraint events_origin_check
    check (origin in ('seed', 'user', 'manual', 'auto'));
exception when others then
  raise notice 'origin 约束扩展跳过（已有约束命名可能不同，不影响使用）：%', sqlerrm;
end $$;
