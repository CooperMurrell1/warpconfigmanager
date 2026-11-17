# WARP Config Manager

A single Docker container for the scheduled WARP config generator, SQLite state, and a responsive Next.js / Chakra UI dashboard. Jellyfin authenticates the dashboard. Add the service fragment to the existing Portainer jellyfin stack; this repository does not create a second stack.

## Generator behavior

The image downloads scripts/warp-register.sh from the pinned upstream commit d4616f154d654d5c159c193432159240c96614bb. The script is used as provided. The app strips inherited WARP_* variables, then supplies the saved device type and locale and optional device name/model. It captures the script info output only in memory, persists a small allowlist of account fields (IDs, account type, creation time, and expiry/TTL), and discards raw stderr so API responses, tokens, and license values are never stored or logged.

The defaults in the pinned script include Cloudflare DNS, MTU 1280, full-tunnel Allowed IPs 0.0.0.0/0 and ::/0, no listen port, no persistent keepalive, Linux device type, en_US locale, and the current UTC terms date. The settings page lets a Jellyfin administrator edit the update interval, config filename, and WARP registration identity (device type, locale, device name, and device model); all are persisted in SQLite. The identity settings apply to the next generation. The config page shows the pinned generator version and non-secret WARP account and device identifiers captured during registration.

The optional WARP+ license is read from /opt/warp-manager/data/warp_license. Leave it absent or empty for the upstream default registration. If using WARP+, create that file with root ownership and mode 0600, and never commit it.

To update the upstream pin, review the [pinned script](https://github.com/lanrat/wireguard-warp-generator/blob/d4616f154d654d5c159c193432159240c96614bb/scripts/warp-register.sh) and [pinned script README](https://github.com/lanrat/wireguard-warp-generator/blob/d4616f154d654d5c159c193432159240c96614bb/scripts/README.md), inspect changes at a new full commit SHA, update WARP_GENERATOR_COMMIT in the Dockerfile, and rebuild. Do not track a moving branch.

## Existing VPN stack

Portainer inspection found a jellyfin stack with qbittorrentvpn using the custom WireGuard client and /opt/wireguard mounted at /config/wireguard. Prowlarr, Radarr, Sonarr, and FlareSolverr share the VPN container's network namespace. Jellyfin is on jellyfin_default; Nginx Proxy Manager uses nginx-proxy-manager_default.

The manager joins the existing jellyfin default network for Jellyfin authentication and the existing NPM network for reverse proxy access. It does not join the VPN namespace. A narrowly scoped host helper activates a validated config and checks the public IP from inside qbittorrentvpn. The manager container has no Docker socket.

After a successful config refresh, the helper checks each Compose-managed container's source project config and selects services with `network_mode: service:qbittorrentvpn`. It maps Portainer's `/data` paths through the Portainer container's host mount when needed, then force-recreates each matching Compose service after restarting qbittorrentvpn. This refreshes Docker's resolved container ID when dependents were created against an older VPN container. Matching stopped services are started as part of the recreation. Unrelated containers are left alone.

The default managed file is /config/wireguard/wg0.conf. The filename can be changed in the UI and is saved in SQLite. A new filename can only be selected if that existing file already contains a usable WireGuard config. Changing this setting does not rename or copy files and does not change the VPN container's config path. Before selecting another name, make sure the VPN container is configured to load it. After selection, future generated files are installed at that filename.

**Routing warning:** the upstream default Allowed IPs send all IPv4 and IPv6 traffic in the qbittorrentvpn network namespace through WARP. This changes the exit IP and routing for qBittorrent, Prowlarr, Radarr, Sonarr, and FlareSolverr. It may also affect region access, inbound connections, and firewall behavior. Jellyfin and Seerr stay on their current routes. This behavior has not been verified on the deployed host.

Portainer showed LAN_NETWORK=192.168.1.0/24,172.20.0.0/16, while jellyfin_default was 172.19.0.0/16. Check this existing subnet mismatch and keep the actual LAN subnet in the VPN container's LAN settings.

## One-time host setup

The host setup script creates only missing manager directories and installs or safely updates root-owned helper files. It checks paths first and stops if it finds conflicting manager paths. It does not overwrite or delete unrelated host files. It does not create or change ownership or permissions on `/opt/wireguard`; that directory must already exist for the current VPN stack.

From a checkout of this repository on the Docker host, run:

~~~sh
sudo sh ./host-setup.sh
~~~

This creates persistent app directories, installs the root-run `warp-vpn-manager.path` systemd unit, and enables it. Host setup requires Docker Compose and Python 3 so the helper can read the rendered service config. The helper accepts only config activation and tunnel-probe requests for qbittorrentvpn. Its activation path can restart qbittorrentvpn and the namespace-bound services described above; it cannot update or recreate the Compose stack. The Docker socket is never mounted into the app container.

The manager unit uses versioned `warp-vpn-manager` filenames and a separate control request, so installing it does not overwrite an older `warp-vpn-probe` helper. An older probe unit may remain installed but idle.

The container creates /opt/warp-manager/data/session_secret only if it is missing. It never replaces an existing key. The same persistent data directory holds SQLite state and the optional WARP+ license file. Keep this directory root-owned and mode 0755. The setup script expects host group ID 1000 for the image's node process.

If a manager data/control directory already exists with unexpected permissions, setup stops and leaves it unchanged. `/opt/wireguard` ownership and permissions are left as configured by the VPN stack.

## Add one service to the existing Portainer stack

The Compose fragment has no runtime environment variables and uses long bind mounts with create_host_path disabled, so Docker will not silently create missing host paths. The container drops every capability and adds back only `SETUID`, `SETGID`, and `DAC_OVERRIDE`. `DAC_OVERRIDE` is required because existing VPN config directories are commonly owned by the VPN container's PUID; without it, container UID 0 can read the bind mount but cannot atomically replace `wg0.conf` after all capabilities are dropped. The root filesystem remains read-only, the app has no Docker socket, and its writable mounts remain explicitly scoped.

A GitHub Actions workflow builds and pushes ghcr.io/coopermurrell1/warpconfigmanager:latest after changes land on main. If the repository/package is private, configure Portainer's GHCR registry credentials with a GitHub token that has read:packages. Keep that token in Portainer only.

1. Wait for the image workflow to publish successfully.
2. In Portainer, edit the existing Stacks → jellyfin stack.
3. Add the service from compose.fragment.yaml under the existing services map. Merge the nginx-proxy-manager external network into the existing top-level networks map.
4. Update the existing jellyfin stack. This adds one container to that stack.
5. In Nginx Proxy Manager, add a Proxy Host pointing to warp-config-manager port 3000, assign a trusted HTTPS certificate, enable forced SSL, and restrict access as preferred. The service publishes no host port.

The host setup script and the stack service are separate one-time steps. After both are done, the container initializes SQLite, creates its session key if absent, and validates the existing config. At startup it compares the most recent successful generation time (or the config file modification time when no generation timestamp is saved) with the configured update interval. It reuses a usable config while that interval has not elapsed and generates a replacement when it has. The config page also shows the interface public key derived from the private key.

## Applying an update

The updater installs a validated config atomically with mode 0600 and saves the previous usable file as *.last-good. It then asks the host helper to restart qbittorrentvpn, restart or start every matching namespace-bound dependent, and verify that the expected WireGuard public key is loaded. The update history records each attempt and a safe error summary.

Generation or validation failures leave the active config and running tunnel untouched. If activation fails and a previous usable config exists, the manager restores it and asks the helper to reactivate it. When no previous config exists, the validated candidate is left installed for recovery rather than deleted. The helper does not restart Jellyfin, Seerr, databases, reverse proxies, or any container outside the qBittorrentVPN network namespace.

## Sign-in and state

Sign in with a Jellyfin account. The first successful sign-in registers a dashboard account; later sign-ins continue to verify the password with Jellyfin. Passwords and Jellyfin access tokens are never stored by this app. Dashboard roles, disabled status, profile images, and active sessions live in `/data/accounts/accounts.sqlite3`. Role changes take effect locally: Viewer accounts can open only Home, Read only accounts can view the dashboard without changing settings, and Administrators can manage accounts and make changes. Logout clears the local session without calling Jellyfin. CSRF and same-origin checks protect state-changing requests. HTTPS is required because the session cookie is Secure.

SQLite stores the interval, selected config filename, WARP registration identity, non-secret account metadata, update status, history, and recent logs. The API and logs never contain WireGuard private or preshared keys, the WARP+ license value, Jellyfin tokens, or full config contents.

## Backup and recovery

Stop the manager before copying SQLite so WAL state is included. Back up securely:

- /opt/wireguard/wg0.conf (or the selected filename) and its .last-good copy
- /opt/warp-manager/data/state.sqlite3
- /opt/warp-manager/data/accounts/accounts.sqlite3
- /opt/warp-manager/data/session_secret
- /opt/warp-manager/data/warp_license if present

To recover, restore those files and permissions, then start the existing jellyfin stack. A usable config is reused. If the session key or account database is not restored, users will need to sign in again; dashboard account roles and local profile images are stored in the account database.

## Troubleshooting

- If Portainer cannot pull the image, check GHCR read:packages registry credentials.
- If the manager exits during startup, check the required host directories exist and match the documented ownership and permissions.
- If an update reports a permission error, confirm `/config/wireguard` is mounted read-write and that the deployed service includes `DAC_OVERRIDE` under `cap_add`. Pull the newest image and recreate the container after changing Compose.
- If Jellyfin login fails, confirm the manager and Jellyfin share jellyfin_default and Jellyfin is reachable at http://jellyfin:8096.
- If NPM cannot reach the dashboard, confirm both containers use nginx-proxy-manager_default and the proxy target is warp-config-manager:3000.
- If the public IP is unavailable, check `systemctl status warp-vpn-manager.path warp-vpn-manager.service`, confirm the Docker CLI can inspect and exec into qbittorrentvpn, and verify curl or wget is present in that container.
- If activation fails, inspect `journalctl -u warp-vpn-manager.service`, confirm qbittorrentvpn has a Compose project label, and confirm dependent services use `network_mode: service:qbittorrentvpn` in Compose.
- The tunnel and public-IP behavior has not been verified in this environment.

