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
import sqlite3
import stat

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

accounts_dir = "/data/accounts"
if os.path.islink(accounts_dir):
    raise SystemExit("The existing /data/accounts directory is a symlink; it was left untouched")
if not os.path.exists(accounts_dir):
    os.mkdir(accounts_dir, 0o700)
    os.chown(accounts_dir, 1000, 1000)
else:
    directory_info = os.stat(accounts_dir)
    if not stat.S_ISDIR(directory_info.st_mode) or (directory_info.st_uid, directory_info.st_gid, stat.S_IMODE(directory_info.st_mode)) != (1000, 1000, 0o700):
        raise SystemExit("/data/accounts must be a directory owned by 1000:1000 with mode 0700; it was left untouched")

accounts_db = accounts_dir + "/accounts.sqlite3"
if os.path.islink(accounts_db):
    raise SystemExit("The existing accounts database is a symlink; it was left untouched")
if not os.path.exists(accounts_db):
    connection = sqlite3.connect(accounts_db)
    connection.close()
    os.chown(accounts_db, 1000, 1000)
    os.chmod(accounts_db, 0o600)
else:
    info = os.stat(accounts_db)
    if not stat.S_ISREG(info.st_mode) or (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (1000, 1000, 0o600):
        raise SystemExit("The accounts database must be a regular file owned by 1000:1000 with mode 0600; it was left untouched")
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
