# Lanzar Pizza al Horno con Supabase + Vercel

Esta guia esta pensada para tu juego actual, intentando hacerlo lo mas facil posible.

## Que vamos a montar

1. `Supabase` guardara:
   - nombre visible en ranking
   - puntuacion
   - telefono privado
   - email privado
2. `Vercel` servira el frontend del juego.
3. La vista `admin` se protegera con una contrasena privada.

## Estructura recomendada

- Tabla publica:
  `public.leaderboard_entries`
  Aqui ira solo lo que puede ser publico.

- Tabla privada:
  `private.leaderboard_contacts`
  Aqui iran telefono y email.

- Funcion SQL publica:
  `public.submit_leaderboard_entry(...)`
  El juego llamara a esta funcion para guardar una puntuacion sin exponer datos privados en el ranking.

- Funciones en Vercel:
  - `/api/admin-login`
  - `/api/admin-contacts`
  Estas usaran la `service role key` de Supabase solo en servidor.

---

## Paso 1. Crear el proyecto en Supabase

1. Entra en [Supabase Dashboard](https://supabase.com/dashboard).
2. Crea un proyecto nuevo.
3. Espera a que termine.
4. Guarda estos datos:
   - `Project URL`
   - `anon public key`
   - `service_role key`

La `service_role key` no se pone nunca en el navegador. Solo en Vercel.

---

## Paso 2. Abrir el editor SQL y pegar esto

En Supabase:

1. Ve a `SQL Editor`
2. Crea una query nueva
3. Pega esto completo
4. Ejecuta

```sql
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
```

## Que hace este SQL

- El ranking publico sale de `public.leaderboard_entries`
- Telefono y email quedan aparte en `private.leaderboard_contacts`
- El navegador solo podra:
  - leer el ranking publico
  - insertar una puntuacion mediante la funcion
- El navegador no podra leer contactos privados

---

## Paso 3. Probar en Supabase que el ranking publico funciona

En `Table Editor` deberias ver:

- `leaderboard_entries`
- `leaderboard_contacts`

Y en `Database > Functions` deberia aparecer:

- `submit_leaderboard_entry`

---

## Paso 4. Preparar Vercel

Fuentes oficiales:

- Vercel environment variables:
  [https://vercel.com/docs/environment-variables](https://vercel.com/docs/environment-variables)
- Supabase JS install:
  [https://supabase.com/docs/reference/javascript/installing](https://supabase.com/docs/reference/javascript/installing)
- Supabase RLS:
  [https://supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security)

### Variables de entorno que vas a crear en Vercel

En tu proyecto de Vercel, crea estas variables:

```txt
SUPABASE_URL=tu_project_url
SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
ADMIN_PASSWORD=pon_aqui_una_contrasena_larga_y_privada
```

Importante:

- `SUPABASE_SERVICE_ROLE_KEY` solo se usa en funciones del servidor.
- `ADMIN_PASSWORD` sera la contrasena del panel privado.

Segun la doc oficial de Vercel, cuando cambias variables de entorno necesitas redeploy para que apliquen.

---

## Paso 5. Subir el frontend a Vercel

La forma mas facil para mantenerlo luego:

1. Sube este proyecto a un repo de GitHub
2. Entra en [Vercel Dashboard](https://vercel.com/dashboard)
3. `Add New -> Project`
4. Importa el repo
5. En `Settings -> Environment Variables` mete las 4 variables de arriba
6. Haz deploy

Si no quieres GitHub, tambien puedes subirlo con Vercel CLI, pero GitHub te dejara mas facil actualizar.

---

## Paso 6. Cambios de codigo que faltan para el modo real

### En el navegador del juego

Cambiar el guardado local actual por:

```js
await supabase.rpc("submit_leaderboard_entry", {
  p_player_name: name,
  p_score: score,
  p_phone: phone,
  p_email: email,
});
```

Y para cargar ranking publico:

```js
const { data, error } = await supabase
  .from("leaderboard_entries")
  .select("id, player_name, score, created_at")
  .order("score", { ascending: false })
  .order("created_at", { ascending: false })
  .limit(50);
```

---

## Paso 7. Proteger el panel admin de verdad

No uses `?admin=1` en produccion como proteccion real.

La forma mas facil y segura para tu caso:

1. Crear una pagina `admin.html`
2. Añadir una funcion Vercel `/api/admin-login`
3. Esa funcion compara la contrasena con `ADMIN_PASSWORD`
4. Si es correcta, crea una cookie `HttpOnly`
5. Otra funcion `/api/admin-contacts` devuelve los contactos privados solo si la cookie es valida

### Por que asi

Porque:

- el ranking publico puede ir desde navegador con la `anon key`
- los contactos privados deben salir solo desde servidor
- ahi usaremos `SUPABASE_SERVICE_ROLE_KEY`

### Ejemplo de consulta que hara la funcion del admin

```sql
select
  e.player_name,
  e.score,
  e.created_at,
  c.phone,
  c.email
from public.leaderboard_entries e
join private.leaderboard_contacts c
  on c.entry_id = e.id
order by e.score desc, e.created_at desc
limit 100;
```

Para `Mes`, `Sem` y `Dia`, en la funcion del servidor filtraremos por `created_at`.

---

## Paso 8. Como sacar Top / Mes / Sem / Dia

### Top general

```sql
select e.player_name, e.score, e.created_at, c.phone, c.email
from public.leaderboard_entries e
join private.leaderboard_contacts c on c.entry_id = e.id
order by e.score desc, e.created_at desc
limit 100;
```

### Ranking mensual

```sql
select e.player_name, e.score, e.created_at, c.phone, c.email
from public.leaderboard_entries e
join private.leaderboard_contacts c on c.entry_id = e.id
where date_trunc('month', e.created_at at time zone 'Europe/Madrid')
      = date_trunc('month', now() at time zone 'Europe/Madrid')
order by e.score desc, e.created_at desc
limit 100;
```

### Ranking semanal

```sql
select e.player_name, e.score, e.created_at, c.phone, c.email
from public.leaderboard_entries e
join private.leaderboard_contacts c on c.entry_id = e.id
where date_trunc('week', e.created_at at time zone 'Europe/Madrid')
      = date_trunc('week', now() at time zone 'Europe/Madrid')
order by e.score desc, e.created_at desc
limit 100;
```

### Ranking diario

```sql
select e.player_name, e.score, e.created_at, c.phone, c.email
from public.leaderboard_entries e
join private.leaderboard_contacts c on c.entry_id = e.id
where (e.created_at at time zone 'Europe/Madrid')::date
      = (now() at time zone 'Europe/Madrid')::date
order by e.score desc, e.created_at desc
limit 100;
```

---

## Paso 9. Orden recomendado para no liarte

Hazlo asi:

1. Crear proyecto en Supabase
2. Pegar el SQL
3. Confirmar que las tablas y la funcion existen
4. Crear proyecto en Vercel
5. Configurar variables de entorno
6. Sustituir en el juego el ranking local por llamadas a Supabase
7. Crear la proteccion real del admin con funciones Vercel
8. Deploy
9. Probar desde dos moviles distintos
10. Probar que el panel admin ve contactos reales

---

## Paso 10. Lo mas importante para no romper la privacidad

- Nunca metas la `service_role key` en `game.js`
- Nunca dejes contactos privados en la tabla publica
- Nunca uses `?admin=1` como seguridad real
- La vista admin final debe pedir contrasena y leer datos desde una funcion del servidor

---

## Recomendacion final

La forma mas facil para ti es:

- `Supabase` para datos
- `Vercel` para frontend + funciones admin
- mantener el ranking publico por navegador
- mantener contactos privados solo por servidor

Con eso tienes una arquitectura simple, barata y bastante buena para este proyecto.
