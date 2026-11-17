#!/bin/bash
set -Eeuo pipefail

for path in /data /control /ui-commands /config/wireguard /tmp; do
  if [ ! -d "$path" ]; then
    echo "Required mounted directory is missing: $path" >&2
    exit 1
  fi
done

python3 - <<'PY'
import os
import re
import secrets

path = "/data/session_secret"
if os.path.islink(path):
    raise SystemExit("The existing /data/session_secret is a symlink; it was left untouched")
if not os.path.exists(path):
    os.setgid(1000)
    try:
        try:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o440)
        except FileExistsError:
            fd = None
        if fd is not None:
            try:
                os.fchmod(fd, 0o440)
                os.write(fd, (secrets.token_hex(32) + "\n").encode("ascii"))
                os.fsync(fd)
            finally:
                os.close(fd)
    finally:
        os.setgid(0)

try:
    value = open(path, "r", encoding="ascii").read().strip()
except OSError as exc:
    raise SystemExit("Cannot read /data/session_secret") from exc
if not re.fullmatch(r"[a-f0-9]{64}", value):
    raise SystemExit("The existing /data/session_secret is invalid; it was left untouched")
PY

if ! runuser -u node -- test -r /data/session_secret; then
  echo "The node user cannot read /data/session_secret; fix its group permissions without replacing the key" >&2
  exit 1
fi

python3 /app/app.py &
worker_pid=$!
runuser -u node -- npm run start &
web_pid=$!

shutdown() {
  kill -TERM "$worker_pid" "$web_pid" 2>/dev/null || true
  wait "$worker_pid" 2>/dev/null || true
  wait "$web_pid" 2>/dev/null || true
}
trap shutdown TERM INT
set +e
wait -n "$worker_pid" "$web_pid"
status=$?
set -e
shutdown
exit "$status"
