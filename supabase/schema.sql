-- Pizza al Horno: pegar en Supabase → SQL → New query → Run
-- Requiere extensión pgcrypto (gen_random_uuid).

create extension if not exists pgcrypto;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(trim(player_name)) between 1 and 18),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

create table if not exists private.leaderboard_contacts (
  entry_id uuid primary key references public.leaderboard_entries(id) on delete cascade,
  phone text not null check (char_length(trim(phone)) between 6 and 24),
  email text not null check (char_length(trim(email)) between 5 and 60),
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_entries_score_idx
  on public.leaderboard_entries (score desc, created_at desc);

create index if not exists leaderboard_entries_created_at_idx
  on public.leaderboard_entries (created_at desc);

alter table public.leaderboard_entries enable row level security;
alter table private.leaderboard_contacts enable row level security;

drop policy if exists "public_read_leaderboard" on public.leaderboard_entries;
create policy "public_read_leaderboard"
on public.leaderboard_entries
for select
to anon, authenticated
using (true);

create or replace function public.submit_leaderboard_entry(
  p_player_name text,
  p_score integer,
  p_phone text,
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  new_id uuid;
begin
  if coalesce(trim(p_player_name), '') = '' then
    raise exception 'Nombre obligatorio';
  end if;

  if p_score is null or p_score < 0 then
    raise exception 'Puntuacion invalida';
  end if;

  if coalesce(trim(p_phone), '') = '' then
    raise exception 'Telefono obligatorio';
  end if;

  if coalesce(trim(p_email), '') = '' then
    raise exception 'Email obligatorio';
  end if;

  insert into public.leaderboard_entries (player_name, score)
  values (
    left(trim(p_player_name), 18),
    p_score
  )
  returning id into new_id;

  insert into private.leaderboard_contacts (entry_id, phone, email)
  values (
    new_id,
    left(trim(p_phone), 24),
    left(trim(lower(p_email)), 60)
  );

  return new_id;
end;
$$;

revoke all on function public.submit_leaderboard_entry(text, integer, text, text) from public;
grant execute on function public.submit_leaderboard_entry(text, integer, text, text) to anon, authenticated;
