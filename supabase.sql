-- ============================================================
-- Facuedu.uy AYUDA Navegadore: inicio de sesión desde el teléfono (QR)
-- Ejecutar una vez en Supabase: SQL Editor -> New query -> Run.
-- ============================================================

-- Tabla de pedidos de inicio. Sin políticas RLS: ni anon ni authenticated pueden leerla directo.
create table if not exists public.login_requests (
  code        text primary key,
  status      text not null default 'pending' check (status in ('pending', 'approved')),
  user_id     uuid,
  token_hash  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '3 minutes')
);

alter table public.login_requests enable row level security;
revoke all on public.login_requests from anon, authenticated;

-- La computadora crea el pedido con un código que empieza con "SDFANL-".
create or replace function public.create_login_request(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code !~ '^SDFANL-[A-Z0-9]{6,40}$' then
    raise exception 'codigo_invalido';
  end if;
  delete from public.login_requests where expires_at < now();
  insert into public.login_requests (code) values (p_code);
end;
$$;

-- La computadora pregunta si ya fue aprobado. Devuelve pending, approved o expired.
create or replace function public.get_login_status(p_code text)
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select status from public.login_requests where code = p_code and expires_at > now()),
    'expired'
  );
$$;

-- Cuando está aprobado, la computadora retira el token UNA sola vez (el pedido se borra).
create or replace function public.consume_login(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  delete from public.login_requests
   where code = p_code and status = 'approved' and expires_at > now()
  returning token_hash into v_hash;
  return v_hash;
end;
$$;

revoke all on function public.create_login_request(text) from public;
revoke all on function public.get_login_status(text) from public;
revoke all on function public.consume_login(text) from public;
grant execute on function public.create_login_request(text) to anon, authenticated;
grant execute on function public.get_login_status(text) to anon, authenticated;
grant execute on function public.consume_login(text) to anon, authenticated;

-- La aprobación la hace la función Edge "aprobar-login" con la clave de servicio (no desde el navegador).
