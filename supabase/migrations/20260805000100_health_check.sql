-- A minimal database RPC used by GET /api/health/database.
-- It proves that the Express service can reach this project's PostgreSQL database.
create or replace function public.health_check()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'status', 'ok',
    'database_time', timezone('utc', now())
  );
$$;

revoke all on function public.health_check() from public;
grant execute on function public.health_check() to service_role;
