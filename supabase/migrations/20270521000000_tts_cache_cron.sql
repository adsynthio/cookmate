-- Security review finding 6: the tts-cache job no longer needs the service-role key in GitHub. Like notify, it is
-- called by pg_cron through pg_net with a random shared secret kept in Vault, and the function checks that secret
-- inside the database (tts_secret_ok, service role only). Runs daily at 21:17 UTC (02:47 IST), 40 clips a run.
-- To record more by hand from the SQL editor:  select private.invoke_tts_cache(100);

create or replace function public.tts_secret_ok(p_secret text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  if p_secret is null or length(p_secret) < 32 or to_regclass('vault.decrypted_secrets') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = ''tts_secret''' into v;
  return v is not null and v = p_secret;
end $$;
revoke all on function public.tts_secret_ok(text) from public, anon, authenticated;
grant execute on function public.tts_secret_ok(text) to service_role;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or to_regclass('vault.secrets') is null then
    raise notice 'pg_cron, pg_net or Vault not available; skipping the tts-cache schedule (local test database)';
    return;
  end if;

  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  if not exists (select 1 from vault.secrets where name = 'tts_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'tts_secret',
                                'Shared secret pg_cron sends to the tts-cache Edge Function');
  end if;

  execute $f$
    create or replace function private.invoke_tts_cache(p_limit integer default 40) returns bigint
    language plpgsql security definer set search_path = '' as $b$
    declare
      v_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
      v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'tts_secret');
    begin
      if v_url is null or v_secret is null then
        return null;
      end if;
      return net.http_post(
        url := rtrim(v_url, '/') || '/functions/v1/tts-cache',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-tts-secret', v_secret),
        body := jsonb_build_object('limit', least(greatest(coalesce(p_limit, 40), 1), 100)),
        timeout_milliseconds := 150000);
    end $b$;
  $f$;
  revoke all on function private.invoke_tts_cache(integer) from public;

  if exists (select 1 from cron.job where jobname = 'tts-cache') then
    perform cron.unschedule('tts-cache');
  end if;
  perform cron.schedule('tts-cache', '17 21 * * *', 'select private.invoke_tts_cache(40)');
end $$;
