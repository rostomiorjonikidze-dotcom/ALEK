-- ALEK VIDEO STUDIO V4 - new isolated tables; no existing ALEK data is modified.
-- Apply once to a dedicated Supabase project (recommended), or deliberately to your ALEK project.
create extension if not exists pgcrypto;

create table if not exists public.video_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 0 check (credits>=0),
  updated_at timestamptz not null default now()
);
create table if not exists public.video_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta<>0),
  reason text not null,
  reference text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists video_ledger_uid_idx on public.video_ledger(user_id,created_at desc);
create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gpu_job_id text unique,
  status text not null default 'queued' check (status in ('queued','running','finished','failed')),
  cost integer not null check (cost>0),
  kind text not null default 'image_to_video',
  person_path text not null,
  garment_path text,
  settings jsonb not null default '{}'::jsonb,
  progress text not null default 'En attente',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists video_jobs_uid_idx on public.video_jobs(user_id,created_at desc);
create index if not exists video_jobs_pending_idx on public.video_jobs(updated_at) where status in ('queued','running');
create table if not exists public.video_payments (
  stripe_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_id text not null,
  credits integer not null check (credits>0),
  amount_cents integer not null check (amount_cents>0),
  created_at timestamptz not null default now()
);
create index if not exists video_payments_uid_idx on public.video_payments(user_id,created_at desc);

alter table public.video_wallets enable row level security;
alter table public.video_ledger enable row level security;
alter table public.video_jobs enable row level security;
alter table public.video_payments enable row level security;
revoke all on public.video_wallets,public.video_ledger,public.video_jobs,public.video_payments from anon,authenticated;
-- Server-side service_role only; all reads/writes through verified Vercel API.

do $$ begin
  if not exists (select 1 from storage.buckets where id='alek-video-assets') then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('alek-video-assets','alek-video-assets',false,12582912,array['image/jpeg','image/png','image/webp']);
  end if;
end $$;

drop policy if exists "alek_video_upload_own" on storage.objects;
create policy "alek_video_upload_own" on storage.objects for insert to authenticated
with check(bucket_id='alek-video-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "alek_video_read_own" on storage.objects;
create policy "alek_video_read_own" on storage.objects for select to authenticated
using(bucket_id='alek-video-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "alek_video_delete_own" on storage.objects;
create policy "alek_video_delete_own" on storage.objects for delete to authenticated
using(bucket_id='alek-video-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.video_wallet_init(p_uid uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare amount integer;
begin
 insert into public.video_wallets(user_id,credits) values(p_uid,0) on conflict(user_id) do nothing;
 select credits into amount from public.video_wallets where user_id=p_uid;
 return coalesce(amount,0);
end $$;

create or replace function public.video_apply_payment(p_session text,p_uid uuid,p_pack text,p_credits integer,p_cents integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_credits<1 or p_credits>100000 or p_cents<1 or length(p_session)>220 or length(p_pack)>50 then
  raise exception 'Invalid payment values';
 end if;
 insert into public.video_payments(stripe_session_id,user_id,pack_id,credits,amount_cents)
 values(p_session,p_uid,p_pack,p_credits,p_cents) on conflict(stripe_session_id) do nothing;
 if not found then return false; end if;
 insert into public.video_wallets(user_id,credits) values(p_uid,0) on conflict(user_id) do nothing;
 update public.video_wallets set credits=credits+p_credits,updated_at=now() where user_id=p_uid;
 insert into public.video_ledger(user_id,delta,reason,reference)
 values(p_uid,p_credits,'stripe_payment','stripe:'||p_session);
 return true;
end $$;

create or replace function public.video_reserve_job(
 p_uid uuid,p_id uuid,p_cost integer,p_kind text,p_person text,p_garment text,p_settings jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare remaining integer;
begin
 if p_cost not in (2,4,6) or p_kind not in ('image_to_video','try_on_video','talking_avatar') then
  raise exception 'Unsupported generation / cost';
 end if;
 insert into public.video_wallets(user_id,credits) values(p_uid,0) on conflict(user_id) do nothing;
 -- Lock wallet to serialize purchases and concurrent reservations.
 select credits into remaining from public.video_wallets where user_id=p_uid for update;
 if (select count(*) from public.video_jobs where user_id=p_uid and status in ('queued','running'))>=2 then
  raise exception 'Maximum 2 active videos per user';
 end if;
 if remaining<p_cost then raise exception 'Insufficient video credits'; end if;
 insert into public.video_jobs(id,user_id,status,cost,kind,person_path,garment_path,settings)
 values(p_id,p_uid,'queued',p_cost,p_kind,p_person,p_garment,coalesce(p_settings,'{}'::jsonb));
 update public.video_wallets set credits=credits-p_cost,updated_at=now() where user_id=p_uid;
 insert into public.video_ledger(user_id,delta,reason,reference)
 values(p_uid,-p_cost,'video_reserved','job:'||p_id::text);
 return remaining-p_cost;
end $$;

create or replace function public.video_attach_gpu(p_id uuid,p_gpu_job_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.video_jobs set gpu_job_id=p_gpu_job_id,status='running',updated_at=now(),progress='Calcul IA en cours'
 where id=p_id and status='queued';
 return found;
end $$;

create or replace function public.video_finalize_job(p_id uuid,p_status text,p_progress text default '',p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare job public.video_jobs%rowtype;
begin
 if p_status not in ('finished','failed') then raise exception 'Invalid terminal status'; end if;
 select * into job from public.video_jobs where id=p_id for update;
 if not found then raise exception 'Job does not exist'; end if;
 if job.status in ('finished','failed') then return false; end if;
 update public.video_jobs set status=p_status,progress=left(coalesce(p_progress,''),300),
 error=left(coalesce(p_error,''),600),updated_at=now() where id=p_id;
 if p_status='failed' then
  insert into public.video_wallets(user_id,credits) values(job.user_id,0) on conflict(user_id) do nothing;
  update public.video_wallets set credits=credits+job.cost,updated_at=now() where user_id=job.user_id;
  insert into public.video_ledger(user_id,delta,reason,reference)
  values(job.user_id,job.cost,'video_refund','refund:'||p_id::text);
 end if;
 return true;
end $$;

revoke all on function public.video_wallet_init(uuid),public.video_apply_payment(text,uuid,text,integer,integer),public.video_reserve_job(uuid,uuid,integer,text,text,text,jsonb),public.video_attach_gpu(uuid,text),public.video_finalize_job(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.video_wallet_init(uuid),public.video_apply_payment(text,uuid,text,integer,integer),public.video_reserve_job(uuid,uuid,integer,text,text,text,jsonb),public.video_attach_gpu(uuid,text),public.video_finalize_job(uuid,text,text,text) to service_role;

create or replace function public.video_owner_grant(p_uid uuid,p_credits integer,p_ref text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_credits<1 or p_credits>50 or p_ref not like 'owner:%' then raise exception 'Invalid owner grant'; end if;
 insert into public.video_ledger(user_id,delta,reason,reference)
 values(p_uid,p_credits,'owner_test_grant',p_ref) on conflict(reference) do nothing;
 if not found then return false; end if;
 insert into public.video_wallets(user_id,credits) values(p_uid,0) on conflict(user_id) do nothing;
 update public.video_wallets set credits=credits+p_credits,updated_at=now() where user_id=p_uid;
 return true;
end $$;
revoke all on function public.video_owner_grant(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.video_owner_grant(uuid,integer,text) to service_role;