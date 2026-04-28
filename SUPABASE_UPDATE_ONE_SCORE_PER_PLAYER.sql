-- Hace que cada persona tenga una sola fila de ranking.
-- Identificamos a la persona por telefono o email.
-- Si vuelve a jugar:
-- - si hace mejor puntuacion, se actualiza
-- - si hace peor, se conserva la mejor

alter table private.leaderboard_contacts
add column if not exists phone_normalized text,
add column if not exists email_normalized text;

update private.leaderboard_contacts
set
  phone_normalized = regexp_replace(phone, '[^0-9+]+', '', 'g'),
  email_normalized = lower(trim(email));

create unique index if not exists leaderboard_contacts_phone_normalized_uniq
on private.leaderboard_contacts (phone_normalized)
where phone_normalized is not null and phone_normalized <> '';

create unique index if not exists leaderboard_contacts_email_normalized_uniq
on private.leaderboard_contacts (email_normalized)
where email_normalized is not null and email_normalized <> '';

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
  v_name text;
  v_phone text;
  v_email text;
  v_phone_normalized text;
  v_email_normalized text;
  existing_entry_id uuid;
  result_entry_id uuid;
begin
  v_name := left(trim(coalesce(p_player_name, '')), 18);
  v_phone := left(trim(coalesce(p_phone, '')), 24);
  v_email := left(trim(lower(coalesce(p_email, ''))), 60);
  v_phone_normalized := regexp_replace(v_phone, '[^0-9+]+', '', 'g');
  v_email_normalized := lower(trim(v_email));

  if v_name = '' then
    raise exception 'Nombre obligatorio';
  end if;

  if p_score is null or p_score < 0 then
    raise exception 'Puntuacion invalida';
  end if;

  if v_phone = '' then
    raise exception 'Telefono obligatorio';
  end if;

  if v_email = '' then
    raise exception 'Email obligatorio';
  end if;

  select c.entry_id
  into existing_entry_id
  from private.leaderboard_contacts c
  where c.phone_normalized = v_phone_normalized
     or c.email_normalized = v_email_normalized
  limit 1;

  if existing_entry_id is null then
    insert into public.leaderboard_entries (player_name, score)
    values (v_name, p_score)
    returning id into result_entry_id;

    insert into private.leaderboard_contacts (
      entry_id,
      phone,
      email,
      phone_normalized,
      email_normalized
    )
    values (
      result_entry_id,
      v_phone,
      v_email,
      v_phone_normalized,
      v_email_normalized
    );
  else
    update public.leaderboard_entries
    set
      player_name = v_name,
      score = greatest(score, p_score),
      created_at = case
        when p_score > score then now()
        else created_at
      end
    where id = existing_entry_id
    returning id into result_entry_id;

    update private.leaderboard_contacts
    set
      phone = v_phone,
      email = v_email,
      phone_normalized = v_phone_normalized,
      email_normalized = v_email_normalized
    where entry_id = existing_entry_id;
  end if;

  return result_entry_id;
end;
$$;
