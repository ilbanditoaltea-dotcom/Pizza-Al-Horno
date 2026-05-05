create or replace function public.admin_leaderboard_contacts(p_filter text default 'top')
returns table (
  player_name text,
  phone text,
  email text,
  score integer,
  created_label text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if p_filter = 'day' then
    return query
    select
      e.player_name,
      c.phone,
      c.email,
      e.score,
      to_char(e.created_at at time zone 'Europe/Madrid', 'DD Mon') as created_label,
      e.created_at
    from public.leaderboard_entries e
    join private.leaderboard_contacts c on c.entry_id = e.id
    where (e.created_at at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date
    order by e.score desc, e.created_at desc
    limit 100;
  elseif p_filter = 'week' then
    return query
    select
      e.player_name,
      c.phone,
      c.email,
      e.score,
      to_char(e.created_at at time zone 'Europe/Madrid', 'DD Mon') as created_label,
      e.created_at
    from public.leaderboard_entries e
    join private.leaderboard_contacts c on c.entry_id = e.id
    where date_trunc('week', e.created_at at time zone 'Europe/Madrid')
      = date_trunc('week', now() at time zone 'Europe/Madrid')
    order by e.score desc, e.created_at desc
    limit 100;
  elseif p_filter = 'month' then
    return query
    select
      e.player_name,
      c.phone,
      c.email,
      e.score,
      to_char(e.created_at at time zone 'Europe/Madrid', 'DD Mon') as created_label,
      e.created_at
    from public.leaderboard_entries e
    join private.leaderboard_contacts c on c.entry_id = e.id
    where date_trunc('month', e.created_at at time zone 'Europe/Madrid')
      = date_trunc('month', now() at time zone 'Europe/Madrid')
    order by e.score desc, e.created_at desc
    limit 100;
  else
    return query
    select
      e.player_name,
      c.phone,
      c.email,
      e.score,
      to_char(e.created_at at time zone 'Europe/Madrid', 'DD Mon') as created_label,
      e.created_at
    from public.leaderboard_entries e
    join private.leaderboard_contacts c on c.entry_id = e.id
    order by e.score desc, e.created_at desc
    limit 100;
  end if;
end;
$$;

revoke all on function public.admin_leaderboard_contacts(text) from public;
grant execute on function public.admin_leaderboard_contacts(text) to service_role;
