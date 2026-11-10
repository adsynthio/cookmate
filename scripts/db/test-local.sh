#!/usr/bin/env bash
# Apply all migrations to a throwaway local Postgres (with a Supabase shim) and run the pgTAP tests.
# Needs: Postgres 15+ server binaries, pgvector and pgTAP. No Docker required.
#   scripts/db/test-local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PGTEST_PORT:-54329}"
SOCK="$WORK"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$WORK" 2>/dev/null || { useradd -r postgres && chown -R postgres "$WORK"; }
  RUN_AS=(runuser -u postgres --)
fi

"${RUN_AS[@]}" "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$SOCK" -p "$PORT" -U postgres -d postgres)

"${PSQL[@]}" -f "$ROOT/supabase/tests/shim/supabase_shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migrate  $(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done

failed=0
for t in "$ROOT"/supabase/tests/database/*.sql; do
  out="$("${PSQL[@]}" -t -A -f "$t" 2>&1)" || failed=1
  echo "$out" | { grep -E '^(ok|not ok)' || true; } | sed "s|^|$(basename "$t"): |"
  if echo "$out" | grep -qE '^not ok|Looks like|ERROR' || ! echo "$out" | grep -qE '^ok'; then
    failed=1
    echo "$out" | { grep -vE '^ok' || true; } | sed 's/^/    /'
  fi
done

if [ "$failed" = "0" ]; then echo "All database tests passed."; else echo "Database tests FAILED."; fi
exit "$failed"
