-- =============================================================
--  STORYTELLER.VTG — ฐานข้อมูลหลังร้าน (Supabase / Postgres)
--  วิธีใช้: Supabase Dashboard › SQL Editor › New query
--           วางไฟล์นี้ทั้งหมด แล้วกด Run (รันซ้ำได้ ไม่พัง)
-- =============================================================

-- ---------- 1) รายชื่อทีมร้านที่มีสิทธิ์เข้าหลังร้าน ----------
create table if not exists public.team_members (
  email      text primary key,
  name       text,
  created_at timestamptz not null default now()
);
alter table public.team_members enable row level security;

-- ฟังก์ชันเช็กว่าคนที่ login อยู่เป็นทีมร้านหรือไม่
create or replace function public.is_team()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "team can read team list" on public.team_members;
create policy "team can read team list" on public.team_members
  for select to authenticated using (public.is_team());

-- ---------- 2) ตารางเสื้อ ----------
create table if not exists public.shirts (
  id          uuid primary key default gen_random_uuid(),
  code        text,
  name        text not null,
  labels      text[] not null default '{}',
  photos      text[] not null default '{}',      -- path ของรูปใน Storage
  chest       text,
  length      text,
  fit         text,
  tag         text,
  style       text,
  condition   numeric(3,1) check (condition is null or (condition >= 0 and condition <= 10)),
  defects     text,
  cost        numeric(12,2) not null default 0,
  extra_cost  numeric(12,2) not null default 0,
  buy_date    date,
  ask_price   numeric(12,2),
  sold        boolean not null default false,
  sold_price  numeric(12,2),
  sold_date   date,
  channel     text,
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shirts_sold_idx     on public.shirts (sold);
create index if not exists shirts_buy_date_idx on public.shirts (buy_date desc);
create index if not exists shirts_labels_idx   on public.shirts using gin (labels);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists shirts_touch on public.shirts;
create trigger shirts_touch before update on public.shirts
  for each row execute function public.touch_updated_at();

alter table public.shirts enable row level security;

drop policy if exists "team read shirts"   on public.shirts;
drop policy if exists "team insert shirts" on public.shirts;
drop policy if exists "team update shirts" on public.shirts;
drop policy if exists "team delete shirts" on public.shirts;
create policy "team read shirts"   on public.shirts for select to authenticated using (public.is_team());
create policy "team insert shirts" on public.shirts for insert to authenticated with check (public.is_team());
create policy "team update shirts" on public.shirts for update to authenticated using (public.is_team()) with check (public.is_team());
create policy "team delete shirts" on public.shirts for delete to authenticated using (public.is_team());

-- ให้ทุกเครื่องที่เปิดหลังร้านอยู่ เห็นข้อมูลอัปเดตทันที (Realtime)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shirts'
  ) then
    alter publication supabase_realtime add table public.shirts;
  end if;
end $$;

-- ---------- 3) ที่เก็บรูปเสื้อ (Storage, แบบส่วนตัว) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shirt-photos', 'shirt-photos', false, 10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "team read photos"   on storage.objects;
drop policy if exists "team upload photos" on storage.objects;
drop policy if exists "team update photos" on storage.objects;
drop policy if exists "team delete photos" on storage.objects;
create policy "team read photos"   on storage.objects for select to authenticated using (bucket_id = 'shirt-photos' and public.is_team());
create policy "team upload photos" on storage.objects for insert to authenticated with check (bucket_id = 'shirt-photos' and public.is_team());
create policy "team update photos" on storage.objects for update to authenticated using (bucket_id = 'shirt-photos' and public.is_team());
create policy "team delete photos" on storage.objects for delete to authenticated using (bucket_id = 'shirt-photos' and public.is_team());

-- ---------- 4) เพิ่มทีมร้าน ----------
-- แก้อีเมลด้านล่างเป็นของคุณ (และทีม) แล้วรัน
-- อีเมลต้องตรงกับบัญชีที่สร้างใน Authentication › Users
insert into public.team_members (email, name) values
  ('keerintorn.non@gmail.com', 'เจ้าของร้าน')
on conflict (email) do nothing;
