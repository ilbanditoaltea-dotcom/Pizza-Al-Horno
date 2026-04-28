-- Limpia duplicados antiguos y deja una sola fila por persona.
-- Mantiene la mejor puntuacion de cada telefono/email.
-- Si hay empate, mantiene la mas reciente.

with ranked as (
  select
    c.entry_id,
    c.phone_normalized,
    c.email_normalized,
    e.score,
    e.created_at,
    row_number() over (
      partition by coalesce(nullif(c.phone_normalized, ''), nullif(c.email_normalized, ''))
      order by e.score desc, e.created_at desc, e.id desc
    ) as rn
  from private.leaderboard_contacts c
  join public.leaderboard_entries e
    on e.id = c.entry_id
  where coalesce(nullif(c.phone_normalized, ''), nullif(c.email_normalized, '')) is not null
)
delete from public.leaderboard_entries e
using ranked r
where e.id = r.entry_id
  and r.rn > 1;
