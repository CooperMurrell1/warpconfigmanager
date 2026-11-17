#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this setup script with sudo from the repository checkout." >&2
  exit 1
fi

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

fail() {
  echo "Setup stopped: $*" >&2
  exit 1
}

ensure_directory() {
  path="$1"
  mode="$2"
  owner="$3"
  group="$4"
  if [ -e "$path" ] || [ -L "$path" ]; then
    [ ! -L "$path" ] || fail "$path is a symlink; it was left untouched"
    [ -d "$path" ] || fail "$path exists and is not a directory; it was left untouched"
    actual=$(stat -c '%u:%g:%a' "$path")
    expected="$owner:$group:$mode"
    [ "$actual" = "$expected" ] || fail "$path already exists with owner/mode $actual; expected $expected. It was left untouched."
  else
    install -d -o "$owner" -g "$group" -m "$mode" "$path"
    echo "Created $path"
  fi
}

install_new_or_identical() {
  source="$1"
  target="$2"
  mode="$3"
  [ -f "$source" ] || fail "Repository file is missing: $source"
  if [ -e "$target" ] || [ -L "$target" ]; then
    [ ! -L "$target" ] || fail "$target is a symlink; it was left untouched"
    [ -f "$target" ] || fail "$target exists and is not a regular file; it was left untouched"
    cmp -s "$source" "$target" || fail "$target already exists with different contents; it was left untouched"
    echo "Keeping identical file $target"
  else
    install -o root -g root -m "$mode" "$source" "$target"
    echo "Installed $target"
  fi
}

[ ! -L /opt/wireguard ] || fail "/opt/wireguard is a symlink; it was left untouched"
[ -d /opt/wireguard ] || fail "/opt/wireguard does not exist; this setup will not create or modify the VPN config directory"
[ "$(stat -c '%u' /opt/wireguard)" = 0 ] || fail "/opt/wireguard must be root-owned so the manager can atomically install configs; it was left untouched"
wireguard_mode=$(stat -c '%a' /opt/wireguard)
case "$wireguard_mode" in
  700|750|755|770) ;;
  *) fail "/opt/wireguard needs owner write and execute permissions; it was left untouched" ;;
esac

command -v docker >/dev/null 2>&1 || fail "Docker CLI is required"
command -v systemctl >/dev/null 2>&1 || fail "systemd is required"
docker inspect qbittorrentvpn >/dev/null 2>&1 || fail "Existing qbittorrentvpn container was not found"
getent group 1000 >/dev/null 2>&1 || fail "Group ID 1000 is required by the node process"

ensure_directory /opt/warp-manager 755 0 0
ensure_directory /opt/warp-manager/data 755 0 0
ensure_directory /opt/warp-manager/control 700 0 0
ensure_directory /opt/warp-manager/control/warp-config-manager 700 0 0
ensure_directory /opt/warp-manager/ui-commands 2770 0 1000
ensure_directory /opt/warp-manager/ui-commands/warp-config-manager 2770 0 1000

check_existing_file() {
  path="$1"
  expected="$2"
  if [ -e "$path" ] || [ -L "$path" ]; then
    [ ! -L "$path" ] || fail "$path is a symlink; it was left untouched"
    [ -f "$path" ] || fail "$path is not a regular file; it was left untouched"
    actual=$(stat -c '%u:%g:%a' "$path")
    [ "$actual" = "$expected" ] || fail "$path already exists with owner/mode $actual; expected $expected. It was left untouched."
  fi
}

check_existing_file /opt/warp-manager/data/session_secret 0:1000:440
check_existing_file /opt/warp-manager/data/state.sqlite3 0:0:600
check_existing_file /opt/warp-manager/data/warp_license 0:0:600

[ -d /usr/local/sbin ] || fail "/usr/local/sbin does not exist; it was not created"
[ -d /etc/systemd/system ] || fail "/etc/systemd/system does not exist; it was not created"
[ -d /etc/systemd/system/multi-user.target.wants ] || fail "multi-user.target.wants does not exist; this setup will not create it"
if systemctl is-enabled --quiet warp-vpn-reloader.path 2>/dev/null || systemctl is-active --quiet warp-vpn-reloader.path 2>/dev/null || systemctl is-active --quiet warp-vpn-reloader.service 2>/dev/null; then
  fail "A legacy restart helper is enabled or active. It was left untouched; review it before proceeding."
fi

install_new_or_identical "$SOURCE_DIR/systemd/warp-vpn-probe" /usr/local/sbin/warp-vpn-manager 0755
install_new_or_identical "$SOURCE_DIR/systemd/warp-vpn-probe.service" /etc/systemd/system/warp-vpn-manager.service 0644
install_new_or_identical "$SOURCE_DIR/systemd/warp-vpn-probe.path" /etc/systemd/system/warp-vpn-manager.path 0644

WANTS=/etc/systemd/system/multi-user.target.wants/warp-vpn-manager.path
if [ -L "$WANTS" ]; then
  [ "$(readlink -f "$WANTS")" = /etc/systemd/system/warp-vpn-manager.path ] || fail "$WANTS points elsewhere; it was left untouched"
elif [ -e "$WANTS" ]; then
  fail "$WANTS already exists and is not our symlink; it was left untouched"
fi

systemctl daemon-reload
systemctl enable --now warp-vpn-manager.path
echo "Host VPN manager setup complete. Existing files were not overwritten or deleted."

