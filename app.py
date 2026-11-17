import datetime as dt
from contextlib import contextmanager
import ipaddress
import json
import os
import pathlib
import re
import secrets
import signal
import sqlite3
import subprocess
import tempfile
import threading
import time
import urllib.request
import uuid

UTC = dt.timezone.utc
DATA = pathlib.Path("/data")
DB_FILE = DATA / "state.sqlite3"
CONTROL = pathlib.Path("/control/warp-config-manager")
UI_COMMAND = pathlib.Path("/ui-commands/request.json")
UI_RESULT = pathlib.Path("/ui-commands/result.json")
HOST_REQUEST = CONTROL / "manager-request.json"
HOST_RESULT = CONTROL / "manager-result.json"
CONFIG_DIR = pathlib.Path("/config/wireguard")
ARCHIVE_DIR = DATA / "saved-configs"
DEFAULT_CONFIG_FILENAME = "wg0.conf"
ACTIVE = CONFIG_DIR / DEFAULT_CONFIG_FILENAME
BACKUP = ACTIVE.with_name(ACTIVE.name + ".last-good")
GENERATOR = "/usr/local/bin/warp-register.sh"
INTERVAL_DEFAULT = 86400
GENERATOR_COMMIT = "d4616f154d654d5c159c193432159240c96614bb"
WARP_API_ENDPOINT = "https://api.cloudflareclient.com/v0a737/reg"
DEFAULT_WARP_SETTINGS = {"device_type": "Linux", "locale": "en_US", "device_name": "", "device_model": ""}
MIN_INTERVAL = 300
MAX_INTERVAL = 90 * 86400
STOP = threading.Event()
STATE_LOCK = threading.RLock()
UPDATE_LOCK = threading.Lock()
HOST_REQUEST_LOCK = threading.Lock()
STATE = {}


def now():
    return dt.datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def validate_config_filename(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,62}\.conf", value):
        raise ValueError("Filename must be a simple .conf filename without directories")
    return value


def set_active_config_filename(value):
    global ACTIVE, BACKUP
    filename = validate_config_filename(value)
    ACTIVE = CONFIG_DIR / filename
    BACKUP = ACTIVE.with_name(ACTIVE.name + ".last-good")
    return filename


def atomic_write(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, "wb") as f:
            raw = content if isinstance(content, bytes) else content.encode("utf-8")
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        dfd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(dfd)
        finally:
            os.close(dfd)
    finally:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass


def install_active_config(content, reason):
    atomic_write(ACTIVE, content, 0o600)
    parsed = parse_config(content)
    account = STATE.get("warp_account") or {}
    details = [
        "Change reason: %s" % reason,
        "Managed filename: %s" % STATE.get("config_filename", DEFAULT_CONFIG_FILENAME),
        "Config SHA-256: %s" % __import__("hashlib").sha256(content.encode("utf-8")).hexdigest(),
        "Interface address: %s" % (parsed.get("address") or "unavailable"),
        "DNS: %s" % (parsed.get("dns") or "not specified"),
        "MTU: %s" % (parsed.get("mtu") or "default"),
        "Allowed IPs: %s" % (parsed.get("allowed_ips") or "unavailable"),
        "Endpoint: %s" % (parsed.get("endpoint") or "unavailable"),
        "Persistent keepalive: %s" % (parsed.get("keepalive") or "disabled"),
        "Interface public key: %s" % (interface_public_key(content) or "unavailable"),
        "WARP account type: %s" % (account.get("account_type") or "unavailable"),
        "WARP account ID: %s" % (account.get("account_id") or "unavailable"),
        "WARP device ID: %s" % (account.get("device_id") or "unavailable"),
        "WARP account created: %s" % (account.get("created_at") or "unavailable"),
        "WARP account expires: %s" % (account.get("expires_at") or "unavailable"),
        "Sensitive values omitted: private key, registration token, and license data.",
    ]
    log_event("info", "Active config changed: %s\n%s" % (STATE.get("config_filename", DEFAULT_CONFIG_FILENAME), "\n".join(details)), "config")


def db_connect():
    conn = sqlite3.connect(DB_FILE, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=FULL")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


def init_db():
    with db_session() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS manager_state (id INTEGER PRIMARY KEY CHECK(id=1), state_json TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS update_history (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT NOT NULL, result TEXT NOT NULL, source TEXT NOT NULL, error TEXT, duration_seconds REAL NOT NULL)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_update_history_finished ON update_history(id DESC)")
        conn.execute("CREATE TABLE IF NOT EXISTS service_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'service')")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_service_logs_id ON service_logs(id DESC)")
        service_columns = {row["name"] for row in conn.execute("PRAGMA table_info(service_logs)").fetchall()}
        if "category" not in service_columns:
            conn.execute("ALTER TABLE service_logs ADD COLUMN category TEXT NOT NULL DEFAULT 'service'")
        conn.execute("CREATE TABLE IF NOT EXISTS generator_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT NOT NULL, source TEXT NOT NULL, result TEXT NOT NULL, details TEXT NOT NULL)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_generator_logs_id ON generator_logs(id DESC)")
        conn.execute("CREATE TABLE IF NOT EXISTS saved_configs (id TEXT PRIMARY KEY, filename TEXT NOT NULL, saved_at TEXT NOT NULL, expires_at TEXT NOT NULL, sha256 TEXT UNIQUE NOT NULL, address TEXT NOT NULL, endpoint TEXT NOT NULL, account_type TEXT, account_id TEXT, device_id TEXT, account_created_at TEXT, account_expires_at TEXT, interface_public_key TEXT, dns TEXT, mtu INTEGER, allowed_ips TEXT, keepalive INTEGER)")
        saved_columns = {row["name"] for row in conn.execute("PRAGMA table_info(saved_configs)").fetchall()}
        for column, kind in (("account_type", "TEXT"), ("account_id", "TEXT"), ("device_id", "TEXT"), ("account_created_at", "TEXT"), ("account_expires_at", "TEXT"), ("interface_public_key", "TEXT"), ("dns", "TEXT"), ("mtu", "INTEGER"), ("allowed_ips", "TEXT"), ("keepalive", "INTEGER")):
            if column not in saved_columns:
                conn.execute("ALTER TABLE saved_configs ADD COLUMN " + column + " " + kind)
        conn.commit()




@contextmanager
def db_session():
    conn = db_connect()
    try:
        yield conn
    finally:
        conn.close()

def validate_warp_settings(value):
    if not isinstance(value, dict):
        raise ValueError("WARP registration settings must be an object")
    settings = {}
    device_type = value.get("device_type", DEFAULT_WARP_SETTINGS["device_type"])
    locale = value.get("locale", DEFAULT_WARP_SETTINGS["locale"])
    if not isinstance(device_type, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._ -]{0,31}", device_type.strip()):
        raise ValueError("Device type must be 1 to 32 letters, numbers, spaces, dots, underscores, or hyphens")
    if not isinstance(locale, str) or not re.fullmatch(r"[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?", locale.strip()):
        raise ValueError("Locale must look like en_US or en")
    settings["device_type"] = device_type.strip()
    settings["locale"] = locale.strip()
    for key, label in (("device_name", "Device name"), ("device_model", "Device model")):
        item = value.get(key, "")
        if not isinstance(item, str) or len(item.strip()) > 64 or any(ord(char) < 32 or ord(char) == 127 for char in item):
            raise ValueError(label + " must be 64 characters or fewer and contain no control characters")
        settings[key] = item.strip()
    return settings


def safe_state_default():
    interval = max(MIN_INTERVAL, min(MAX_INTERVAL, INTERVAL_DEFAULT))
    return {"interval_seconds": interval, "last_attempt_at": None, "last_success_at": None,
            "next_run_at": None, "status": "starting", "last_error": None,
            "ip": {"address": None, "checked_at": None, "error": "Not checked yet"},
            "last_ui_command_id": None, "config_filename": DEFAULT_CONFIG_FILENAME, "pending_apply": False,
            "warp_settings": dict(DEFAULT_WARP_SETTINGS), "warp_account": None, "history": [], "logs": [],
            "generator_logs": [], "saved_configs": [], "config_retention_seconds": 30 * 86400}


def parse_config(text):
    section = None
    values = {"interface": {}, "peer": {}}
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1].strip().lower()
            if section not in values:
                raise ValueError("Unexpected configuration section")
            continue
        if "=" not in line or section is None:
            raise ValueError("Malformed configuration line")
        key, value = (x.strip() for x in line.split("=", 1))
        if not key or not value:
            raise ValueError("Empty configuration field")
        values[section][key.lower()] = value
    iface, peer = values["interface"], values["peer"]
    for section_name, section_values, required in (
        ("interface", iface, ("privatekey", "address")),
        ("peer", peer, ("publickey", "allowedips", "endpoint")),
    ):
        if not section_values:
            raise ValueError("Missing " + section_name + " section")
        for key in required:
            if not section_values.get(key):
                raise ValueError("Missing required " + section_name + " field")
    for item in iface["address"].split(","):
        ipaddress.ip_interface(item.strip())
    for item in peer["allowedips"].split(","):
        ipaddress.ip_network(item.strip(), strict=False)
    for item in iface.get("dns", "").split(","):
        if item.strip():
            ipaddress.ip_address(item.strip())
    mtu = int(iface.get("mtu", "1280"))
    if mtu < 576 or mtu > 9000:
        raise ValueError("MTU is outside the supported range")
    keepalive = int(peer.get("persistentkeepalive", "0"))
    if keepalive < 0 or keepalive > 65535:
        raise ValueError("Keepalive is outside the supported range")
    endpoint = peer["endpoint"]
    if not re.fullmatch(r"(?:\[[0-9a-fA-F:]+\]|[A-Za-z0-9._-]+):[0-9]{1,5}", endpoint):
        raise ValueError("Invalid peer endpoint")
    return {"address": iface["address"], "dns": iface.get("dns", ""), "mtu": mtu,
            "allowed_ips": peer["allowedips"], "endpoint": endpoint,
            "keepalive": keepalive or None}


def validate_config(text):
    if not isinstance(text, str) or len(text) > 32768:
        raise ValueError("Candidate config is empty or too large")
    details = parse_config(text)
    private = re.search(r"(?im)^\s*PrivateKey\s*=\s*(\S+)\s*$", text)
    if not private:
        raise ValueError("Private key field is missing")
    check = subprocess.run(["wg", "pubkey"], input=private.group(1) + "\n", text=True,
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=False)
    if check.returncode != 0 or not check.stdout.strip():
        raise ValueError("Private key is invalid")
    # wg-quick derives the interface name from the config basename and rejects
    # names longer than Linux's 15-character interface limit. Keep the random
    # component in the parent directory and give the config a valid basename.
    with tempfile.TemporaryDirectory(prefix="warp-validate-", dir="/tmp") as directory:
        name = pathlib.Path(directory) / "wg0.conf"
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        result = subprocess.run(["wg-quick", "strip", str(name)], stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, timeout=10, check=False)
        if result.returncode != 0:
            raise ValueError("WireGuard parser rejected the candidate")
    return details


def config_at(path):
    try:
        st = path.lstat()
        # Bind-mounted configs may be owned by the VPN container's PUID. Reject
        # group/world write access, but repair broader read/execute bits after the
        # contents validate so private keys are returned to owner-only mode.
        if path.is_symlink() or not path.is_file() or st.st_size > 32768 or st.st_mode & 0o022:
            return None, None
        text = path.read_text(encoding="utf-8")
        details = validate_config(text)
        if st.st_mode & 0o077:
            atomic_write(path, text, 0o600)
            os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns))
        return text, details
    except (OSError, UnicodeError, ValueError, subprocess.SubprocessError):
        return None, None


def active_config():
    return config_at(ACTIVE)


def config_unusable_reason(path):
    try:
        st = path.lstat()
    except FileNotFoundError:
        return "file is missing"
    except OSError:
        return "file metadata cannot be read"
    if path.is_symlink():
        return "file is a symlink"
    if not path.is_file():
        return "path is not a regular file"
    if st.st_size > 32768:
        return "file is larger than 32 KiB"
    if st.st_mode & 0o022:
        return "file is writable by group or other users; remove group/world write permissions"
    if st.st_mode & 0o077:
        return "file permissions need tightening, but the manager could not set mode 0600"
    try:
        text = path.read_text(encoding="utf-8")
        validate_config(text)
    except UnicodeError:
        return "file is not valid UTF-8"
    except ValueError as exc:
        return "WireGuard config validation failed: " + str(exc)
    except subprocess.SubprocessError:
        return "WireGuard validation command failed or timed out"
    except OSError:
        return "file cannot be read or WireGuard tools are unavailable"
    return "validation failed"


def public_details():
    try:
        if ACTIVE.is_symlink() or not ACTIVE.is_file() or ACTIVE.stat().st_size > 32768:
            return None
        text = ACTIVE.read_text(encoding="utf-8")
        details = parse_config(text)
        try:
            details["interface_public_key"] = interface_public_key(text)
        except (OSError, RuntimeError, subprocess.SubprocessError):
            details["interface_public_key"] = None
        return details
    except (OSError, UnicodeError, ValueError):
        return None


def write_public_state(state):
    public = {"status": state.get("status"), "interval_seconds": state.get("interval_seconds"),
              "last_attempt_at": state.get("last_attempt_at"), "last_success_at": state.get("last_success_at"),
              "next_run_at": state.get("next_run_at"), "last_error": state.get("last_error"), "config_filename": state.get("config_filename", DEFAULT_CONFIG_FILENAME),
              "pending_apply": state.get("pending_apply", False), "config": public_details(), "ip": state.get("ip"),
              "generator_stage": state.get("generator_stage"),
              "warp_settings": state.get("warp_settings", dict(DEFAULT_WARP_SETTINGS)), "warp_account": state.get("warp_account"),
              "warp_service": {"provider": "Cloudflare WARP", "generator": "wireguard-warp-generator", "generator_commit": GENERATOR_COMMIT,
                               "registration_endpoint": WARP_API_ENDPOINT},
              "history": state.get("history", [])[-25:], "logs": state.get("logs", [])[-50:],
              "generator_logs": state.get("generator_logs", [])[-100:], "saved_configs": state.get("saved_configs", [])[-20:],
              "config_retention_seconds": state.get("config_retention_seconds", 30 * 86400)}
    atomic_write(DATA / "public-state.json", json.dumps(public, separators=(",", ":")), 0o644)


def save_state(state):
    encoded = json.dumps(state, separators=(",", ":"))
    with db_session() as conn:
        conn.execute("INSERT INTO manager_state(id,state_json) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json", (encoded,))
        conn.commit()
    write_public_state(state)


def load_state():
    state = safe_state_default()
    with db_session() as conn:
        row = conn.execute("SELECT state_json FROM manager_state WHERE id=1").fetchone()
        if row:
            try:
                state.update(json.loads(row["state_json"]))
            except (ValueError, TypeError):
                pass
        state["history"] = [dict(r) for r in conn.execute("SELECT started_at,finished_at,result,source,error,duration_seconds FROM update_history ORDER BY id DESC LIMIT 100").fetchall()][::-1]
        state["logs"] = [dict(r) for r in conn.execute("SELECT id,at,level,message,category FROM service_logs ORDER BY id DESC LIMIT 200").fetchall()][::-1]
        state["generator_logs"] = [dict(r) for r in conn.execute("SELECT started_at,finished_at,source,result,details FROM generator_logs ORDER BY id DESC LIMIT 100").fetchall()][::-1]
        state["saved_configs"] = [dict(r) for r in conn.execute("SELECT id,filename,saved_at,expires_at,account_type,account_id,device_id,account_created_at,account_expires_at,interface_public_key,address,endpoint,dns,mtu,allowed_ips,keepalive FROM saved_configs ORDER BY saved_at DESC LIMIT 20").fetchall()]
    state["interval_seconds"] = max(MIN_INTERVAL, min(MAX_INTERVAL, int(state.get("interval_seconds", INTERVAL_DEFAULT))))
    try:
        state["config_retention_seconds"] = max(3600, min(365 * 86400, int(state.get("config_retention_seconds", 30 * 86400))))
    except (ValueError, TypeError):
        state["config_retention_seconds"] = 30 * 86400
    try:
        state["warp_settings"] = validate_warp_settings(state.get("warp_settings", DEFAULT_WARP_SETTINGS))
    except ValueError:
        state["warp_settings"] = dict(DEFAULT_WARP_SETTINGS)
    if not isinstance(state.get("warp_account"), dict):
        state["warp_account"] = None
    try:
        state["config_filename"] = validate_config_filename(state.get("config_filename", DEFAULT_CONFIG_FILENAME))
    except ValueError:
        state["config_filename"] = DEFAULT_CONFIG_FILENAME
    return state


def log_event(level, message, category="service"):
    if category not in ("service", "config", "generator"):
        category = "service"
    entry = {"at": now(), "level": level, "message": message, "category": category}
    with STATE_LOCK:
        STATE["logs"].append(entry)
        STATE["logs"] = STATE["logs"][-200:]
        with db_session() as conn:
            cursor = conn.execute("INSERT INTO service_logs(at,level,message,category) VALUES(?,?,?,?)", (entry["at"], level, message, category))
            entry["id"] = cursor.lastrowid
            conn.execute("DELETE FROM service_logs WHERE id NOT IN (SELECT id FROM service_logs ORDER BY id DESC LIMIT 200)")
            conn.commit()
        save_state(STATE)
    print(json.dumps(entry, separators=(",", ":")), flush=True)


def record_history(entry):
    with STATE_LOCK:
        STATE["history"].append(entry)
        STATE["history"] = STATE["history"][-100:]
        with db_session() as conn:
            conn.execute("INSERT INTO update_history(started_at,finished_at,result,source,error,duration_seconds) VALUES(?,?,?,?,?,?)",
                         (entry["started_at"], entry["finished_at"], entry["result"], entry["source"], entry.get("error"), entry["duration_seconds"]))
            conn.execute("DELETE FROM update_history WHERE id NOT IN (SELECT id FROM update_history ORDER BY id DESC LIMIT 100)")
            conn.commit()
        save_state(STATE)


def gen_env(settings):
    # Use only the persisted registration identity and prevent container env vars
    # from silently changing the configured generator behavior.
    env = os.environ.copy()
    for key in tuple(env):
        if key.startswith("WARP_"):
            env.pop(key, None)
    env["WARP_DEVICE_TYPE"] = settings["device_type"]
    env["WARP_LOCALE"] = settings["locale"]
    return env


def parse_warp_account_info(stderr):
    fields = {"Account ID": "account_id", "Device ID": "device_id", "Account Type": "account_type",
              "Created": "created_at", "Expires": "expires_at"}
    account = {}
    for line in stderr.splitlines():
        match = re.match(r"^\s*(Account ID|Device ID|Account Type|Created|Expires):\s*(.*?)\s*$", line)
        if not match:
            continue
        value = re.sub(r"[\x00-\x1f\x7f]", "", match.group(2))[:128].strip()
        account[fields[match.group(1)]] = None if not value or value == "-" else value
    if not any(account.get(key) for key in ("account_id", "device_id", "account_type")):
        return None
    account["collected_at"] = now()
    return account


def interface_public_key(text):
    private = re.search(r"(?im)^\s*PrivateKey\s*=\s*(\S+)\s*$", text)
    if not private:
        raise RuntimeError("Candidate private key is missing")
    result = subprocess.run(["wg", "pubkey"], input=private.group(1) + "\n", text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=False)
    if result.returncode != 0 or not result.stdout.strip():
        raise RuntimeError("Could not derive candidate interface key")
    return result.stdout.strip()


def generate_candidate(settings):
    cmd = [GENERATOR, "--verbose", "--info"]
    if settings.get("device_name"):
        cmd += ["--name", settings["device_name"]]
    if settings.get("device_model"):
        cmd += ["--model", settings["device_model"]]
    try:
        license_key = pathlib.Path("/data/warp_license").read_text(encoding="utf-8").strip()
    except OSError:
        license_key = ""
    if license_key:
        cmd += ["--license", license_key]
    try:
        result = subprocess.run(cmd, env=gen_env(settings), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, timeout=180, check=False)
    except subprocess.TimeoutExpired:
        raise RuntimeError("Generator timed out after 180 seconds")
    except OSError:
        raise RuntimeError("Generator could not be started")
    if result.returncode != 0:
        STATE.setdefault("_generator_details", []).extend(now() + " — " + line for line in sanitized_generator_lines(result.stderr))
        raise RuntimeError("Generator failed (exit code %d); stderr suppressed to protect secrets" % result.returncode)
    if not result.stdout.strip():
        raise RuntimeError("Generator returned an empty config")
    STATE.setdefault("_generator_details", []).extend(now() + " — " + line for line in sanitized_generator_lines(result.stderr))
    return result.stdout, parse_warp_account_info(result.stderr)


def sanitized_generator_lines(stderr):
    # Upstream verbose output includes API payloads, tokens and license data; store only known-safe progress.
    allowed = ("Checking dependencies", "Generating WireGuard keypair", "Registering with Cloudflare WARP",
               "Applying license key", "License key applied successfully", "Generating WireGuard configuration",
               "Configuration generated", "=== Account Info ===")
    safe = []
    for raw in stderr.splitlines():
        line = raw.strip()
        matched = next((tag for tag in allowed if tag.lower() in line.lower()), None)
        if matched:
            safe.append(matched)
        elif line.startswith("[VERBOSE] Generated public key:"):
            safe.append("[VERBOSE] Interface public key derived (value hidden)")
    return safe


def add_generator_log(started_at, source, result, details, finished_at=None):
    """Persist a sanitized run entry continuously so it survives failures and restarts."""
    finished_at = finished_at or now()
    encoded = json.dumps(details[-160:])
    with db_session() as conn:
        row = conn.execute("SELECT id FROM generator_logs WHERE started_at=? ORDER BY id DESC LIMIT 1", (started_at,)).fetchone()
        if row:
            conn.execute("UPDATE generator_logs SET finished_at=?,source=?,result=?,details=? WHERE id=?",
                         (finished_at, source, result, encoded, row["id"]))
        else:
            conn.execute("INSERT INTO generator_logs(started_at,finished_at,source,result,details) VALUES(?,?,?,?,?)",
                         (started_at, finished_at, source, result, encoded))
        conn.execute("DELETE FROM generator_logs WHERE id NOT IN (SELECT id FROM generator_logs ORDER BY id DESC LIMIT 100)")
        conn.commit()
        rows = conn.execute("SELECT started_at,finished_at,source,result,details FROM generator_logs ORDER BY id DESC LIMIT 100").fetchall()
    STATE["generator_logs"] = [dict(row) for row in rows][::-1]
    write_public_state(STATE)


def archive_config(text, filename=None, account_info=None):
    try:
        details = parse_config(text)
        try: public_key = interface_public_key(text)
        except (OSError, RuntimeError, subprocess.SubprocessError): public_key = None
        import hashlib
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        ARCHIVE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(ARCHIVE_DIR, 0o700)
        saved = now()
        expires = (dt.datetime.now(UTC) + dt.timedelta(seconds=STATE.get("config_retention_seconds", 30 * 86400))).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        with db_session() as conn:
            account = account_info or STATE.get("warp_account") or {}
            existing = conn.execute("SELECT id FROM saved_configs WHERE sha256=?", (digest,)).fetchone()
            if existing:
                conn.execute("UPDATE saved_configs SET account_type=COALESCE(account_type,?),account_id=COALESCE(account_id,?),device_id=COALESCE(device_id,?),account_created_at=COALESCE(account_created_at,?),account_expires_at=COALESCE(account_expires_at,?),interface_public_key=COALESCE(interface_public_key,?),dns=COALESCE(dns,?),mtu=COALESCE(mtu,?),allowed_ips=COALESCE(allowed_ips,?),keepalive=COALESCE(keepalive,?) WHERE id=?",
                             (account.get("account_type"), account.get("account_id"), account.get("device_id"), account.get("created_at"), account.get("expires_at"), public_key, details["dns"], details["mtu"], details["allowed_ips"], details["keepalive"], existing["id"]))
                conn.commit()
                STATE["saved_configs"] = [dict(row) for row in conn.execute("SELECT id,filename,saved_at,expires_at,account_type,account_id,device_id,account_created_at,account_expires_at,interface_public_key,address,endpoint,dns,mtu,allowed_ips,keepalive FROM saved_configs ORDER BY saved_at DESC LIMIT 20").fetchall()]
                write_public_state(STATE)
                return
            config_id = secrets.token_hex(16)
            atomic_write(ARCHIVE_DIR / (config_id + ".conf"), text, 0o600)
            conn.execute("INSERT INTO saved_configs(id,filename,saved_at,expires_at,sha256,address,endpoint,account_type,account_id,device_id,account_created_at,account_expires_at,interface_public_key,dns,mtu,allowed_ips,keepalive) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                         (config_id, filename or STATE.get("config_filename", DEFAULT_CONFIG_FILENAME), saved, expires, digest, details["address"], details["endpoint"],
                          account.get("account_type"), account.get("account_id"), account.get("device_id"), account.get("created_at"), account.get("expires_at"), public_key, details["dns"], details["mtu"], details["allowed_ips"], details["keepalive"]))
            conn.commit()
        prune_archives()
    except Exception as exc:
        log_event("warning", "Could not save config archive (%s)" % type(exc).__name__)


def prune_archives():
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(ARCHIVE_DIR, 0o700)
    with db_session() as conn:
        expired = conn.execute("SELECT id FROM saved_configs WHERE expires_at<=?", (now(),)).fetchall()
        excess = conn.execute("SELECT id FROM saved_configs ORDER BY saved_at DESC LIMIT -1 OFFSET 20").fetchall()
        ids = {r["id"] for r in expired + excess}
        for config_id in ids:
            try: (ARCHIVE_DIR / (config_id + ".conf")).unlink()
            except FileNotFoundError: pass
        if ids: conn.executemany("DELETE FROM saved_configs WHERE id=?", [(item,) for item in ids])
        incomplete = conn.execute("SELECT id FROM saved_configs WHERE dns IS NULL OR mtu IS NULL OR allowed_ips IS NULL OR interface_public_key IS NULL").fetchall()
        for row in incomplete:
            try:
                text = (ARCHIVE_DIR / (row["id"] + ".conf")).read_text(encoding="utf-8")
                details = parse_config(text)
                public_key = interface_public_key(text)
                conn.execute("UPDATE saved_configs SET dns=?,mtu=?,allowed_ips=?,keepalive=?,interface_public_key=? WHERE id=?",
                             (details["dns"], details["mtu"], details["allowed_ips"], details["keepalive"], public_key, row["id"]))
            except (OSError, UnicodeError, ValueError, RuntimeError, subprocess.SubprocessError):
                pass
        conn.commit()
        STATE["saved_configs"] = [dict(r) for r in conn.execute("SELECT id,filename,saved_at,expires_at,account_type,account_id,device_id,account_created_at,account_expires_at,interface_public_key,address,endpoint,dns,mtu,allowed_ips,keepalive FROM saved_configs ORDER BY saved_at DESC LIMIT 20").fetchall()]
    write_public_state(STATE)


def restore_saved_config(config_id):
    previous = None
    installed = False
    try:
        with STATE_LOCK:
            STATE["status"] = "running"
            STATE["generator_stage"] = "Activating saved config"
            STATE["last_error"] = None
            save_state(STATE)
        log_event("info", "Saved config activation started: " + config_id, "config")
        with db_session() as conn:
            row = conn.execute("SELECT filename,account_type,account_id,device_id,account_created_at,account_expires_at FROM saved_configs WHERE id=?", (config_id,)).fetchone()
        if not row: raise RuntimeError("Saved config was not found")
        candidate = (ARCHIVE_DIR / (config_id + ".conf")).read_text(encoding="utf-8")
        validate_config(candidate)
        previous, _ = active_config()
        if previous: atomic_write(BACKUP, previous, 0o600)
        installed = True
        install_active_config(candidate, "saved config activation")
        with STATE_LOCK:
            STATE["generator_stage"] = "Waiting for VPN containers to activate the selected config"
            save_state(STATE)
        result = host_request("activate-config", interface_public_key(candidate))
        if result.get("config_loaded") is not True: raise RuntimeError("Host manager could not confirm that the saved config is active")
        with STATE_LOCK:
            STATE["pending_apply"] = False
            STATE["status"] = "success"
            STATE.pop("generator_stage", None)
            STATE["last_error"] = None
            STATE["last_success_at"] = now()
            STATE["next_run_at"] = (dt.datetime.now(UTC) + dt.timedelta(seconds=STATE["interval_seconds"])).replace(microsecond=0).isoformat().replace("+00:00", "Z")
            STATE["ip"] = {"address": result.get("ip"), "checked_at": now(), "error": None}
            account = {"account_type": row["account_type"], "account_id": row["account_id"], "device_id": row["device_id"],
                       "created_at": row["account_created_at"], "expires_at": row["account_expires_at"]}
            STATE["warp_account"] = account if any(account.values()) else None
            save_state(STATE)
        log_event("info", "Restored and activated saved config %s" % row["filename"], "config")
    except Exception as exc:
        rollback_reactivated = False
        if installed and previous:
            with STATE_LOCK:
                STATE["generator_stage"] = "Activation failed; restoring the previous config"
                save_state(STATE)
            log_event("warning", "Saved config activation did not complete; restoring the prior config", "config")
            try:
                install_active_config(previous, "rollback after saved-config activation failure")
                log_event("warning", "Restored the previous active config after saved-config activation failed", "config")
                rollback_reactivated = host_request("activate-config", interface_public_key(previous)).get("config_loaded") is True
            except Exception: pass
        with STATE_LOCK:
            STATE["pending_apply"] = (not rollback_reactivated) if installed else STATE.get("pending_apply", False)
            STATE["status"] = "failed"
            STATE.pop("generator_stage", None)
            STATE["last_error"] = str(exc)[:300]
            STATE["ip"] = {"address": None, "checked_at": now(), "error": str(exc)[:250]}
            save_state(STATE)
        log_event("error", "Saved config activation failed: %s" % str(exc)[:250], "config")
    finally:
        UPDATE_LOCK.release()


def host_request(action, expected_public_key=None):
    if action not in ("probe-tunnel-ip", "activate-config"):
        raise RuntimeError("Unsupported host action")
    with HOST_REQUEST_LOCK:
        request_id = uuid.uuid4().hex
        if not CONTROL.is_dir():
            raise RuntimeError("Host VPN manager is not installed")
        request = {"id": request_id, "action": action, "requested_at": now()}
        if expected_public_key:
            request["expected_public_key"] = expected_public_key
        atomic_write(HOST_REQUEST, json.dumps(request), 0o600)
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline and not STOP.is_set():
            try:
                result = json.loads(HOST_RESULT.read_text(encoding="utf-8"))
                if result.get("id") == request_id:
                    if result.get("ok"):
                        return result
                    raise RuntimeError(result.get("message", "Host helper failed"))
            except (OSError, ValueError):
                pass
            time.sleep(1)
        raise RuntimeError("Timed out after 240 seconds waiting for the host VPN helper")


def run_update(source, lock_acquired=False):
    if not lock_acquired and not UPDATE_LOCK.acquire(blocking=False):
        return False
    try:
        return _run_update_locked(source)
    finally:
        if UPDATE_LOCK.locked():
            UPDATE_LOCK.release()


def _run_update_locked(source):
    started = now()
    start_mono = time.monotonic()
    previous, _ = active_config()
    STATE["_generator_details"] = []
    previous_pending = STATE.get("pending_apply", False)
    installed = False
    activation_attempted = False
    with STATE_LOCK:
        STATE["status"] = "running"
        STATE["last_attempt_at"] = started
        STATE["last_error"] = None
        save_state(STATE)
    log_event("info", "%s update started" % source, "generator")
    def add_run_detail(message):
        timestamp = now()
        STATE.setdefault("_generator_details", []).append(timestamp + " — " + message)
        STATE["generator_stage"] = message
        with STATE_LOCK: save_state(STATE)
    try:
        add_run_detail("Generation started at " + started)
        add_run_detail("Running pinned WARP generator with verbose diagnostics")
        candidate, account = generate_candidate(dict(STATE.get("warp_settings", DEFAULT_WARP_SETTINGS)))
        add_run_detail("Generator returned configuration output")
        if account:
            for label, key in (("WARP account type", "account_type"), ("WARP account ID", "account_id"),
                               ("WARP device ID", "device_id"), ("WARP account created", "created_at"),
                               ("WARP account expiry", "expires_at")):
                if account.get(key): add_run_detail(label + ": " + str(account[key])[:128])
        validate_config(candidate)
        add_run_detail("WireGuard configuration validation passed")
        candidate_key = interface_public_key(candidate)
        add_run_detail("WireGuard interface public key: " + candidate_key)
        add_run_detail("Derived expected tunnel public key (value hidden)")
        if previous is not None:
            archive_config(previous)
            atomic_write(BACKUP, previous, 0o600)
        add_run_detail("Installed candidate config with owner-only permissions")
        installed = True
        install_active_config(candidate, "generated update")
        activation_attempted = True
        add_run_detail("Requested VPN container activation; waiting for host manager")
        activation = host_request("activate-config", candidate_key)
        if activation.get("config_loaded") is not True:
            raise RuntimeError("Host manager did not confirm the selected config is active: " + str(activation.get("message", "verification unavailable")))
        add_run_detail("Host manager confirmed the expected config is active")
        completed = now()
        with STATE_LOCK:
            STATE["status"] = "success"
            STATE["last_success_at"] = completed
            STATE["last_error"] = None
            STATE["pending_apply"] = False
            STATE["warp_account"] = account
            try:
                ipaddress.ip_address(activation.get("ip") or "")
                STATE["ip"] = {"address": activation["ip"], "checked_at": completed, "error": None}
            except ValueError:
                STATE["ip"] = {"address": None, "checked_at": completed,
                               "error": activation.get("message", "Tunnel IP probe unavailable")}
            STATE["next_run_at"] = (dt.datetime.now(UTC) + dt.timedelta(seconds=STATE["interval_seconds"])).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        record_history({"started_at": started, "finished_at": completed, "result": "success", "source": source, "error": None, "duration_seconds": round(time.monotonic() - start_mono, 1)})
        archive_config(candidate, account_info=account)
        add_run_detail("Generation completed successfully")
        add_generator_log(started, source, "success", STATE.get("_generator_details", []), completed)
        log_event("info", "New config installed and activated; restarted %d VPN-scoped container(s)" % int(activation.get("restarted_count", 1)), "config")
        return True
    except Exception as exc:
        if isinstance(exc, (RuntimeError, ValueError)) and str(exc):
            error = str(exc)
        else:
            error = "Candidate validation or installation failed (%s)" % type(exc).__name__
        rollback_reactivated = False
        try:
            if installed:
                if previous is None:
                    if activation_attempted:
                        error += "; validated config left installed because no previous config exists"
                    else:
                        try:
                            ACTIVE.unlink()
                        except FileNotFoundError:
                            pass
                else:
                    install_active_config(previous, "rollback after generated update failure")
                    if activation_attempted:
                        rollback = host_request("activate-config", interface_public_key(previous))
                        rollback_reactivated = rollback.get("config_loaded") is True
        except Exception:
            error += "; previous config was restored but VPN reactivation needs attention"
        completed = now()
        with STATE_LOCK:
            STATE["status"] = "failed"
            STATE["last_error"] = error
            STATE["pending_apply"] = False if rollback_reactivated else (True if installed and previous is None else previous_pending)
            STATE["next_run_at"] = (dt.datetime.now(UTC) + dt.timedelta(seconds=STATE["interval_seconds"])).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        record_history({"started_at": started, "finished_at": completed, "result": "failed", "source": source,
                        "error": error, "duration_seconds": round(time.monotonic() - start_mono, 1)})
        log_event("error", error, "generator")
        add_run_detail("Generation failed: " + error[:300])
        add_generator_log(started, source, "failed", STATE.get("_generator_details", []), completed)
        return False
    finally:
        STATE.pop("_generator_details", None)
        STATE.pop("generator_stage", None)
        with STATE_LOCK: save_state(STATE)

def process_ui_command():
    try:
        if UI_COMMAND.is_symlink() or not UI_COMMAND.is_file() or UI_COMMAND.stat().st_size > 4096:
            return
        command = json.loads(UI_COMMAND.read_text(encoding="utf-8"))
        if not isinstance(command, dict):
            return
    except (OSError, ValueError):
        return
    request_id = str(command.get("id", ""))
    if not re.fullmatch(r"[a-f0-9]{32}", request_id):
        return
    with STATE_LOCK:
        if request_id == STATE.get("last_ui_command_id"):
            return
        STATE["last_ui_command_id"] = request_id
        save_state(STATE)
    action = command.get("action")
    if action == "update":
        if UPDATE_LOCK.acquire(blocking=False):
            thread = threading.Thread(target=run_update, args=("manual", True), daemon=True)
            try:
                thread.start()
                result = {"id": request_id, "ok": True, "message": "Update queued"}
            except RuntimeError:
                UPDATE_LOCK.release()
                result = {"id": request_id, "ok": False, "message": "Could not start the update worker"}
        else:
            result = {"id": request_id, "ok": False, "message": "An update is already running"}
    elif action == "config-filename":
        if not UPDATE_LOCK.acquire(blocking=False):
            result = {"id": request_id, "ok": False, "message": "Cannot change the filename while an update is running"}
        else:
            try:
                filename = validate_config_filename(command.get("config_filename"))
                if filename == STATE.get("config_filename", DEFAULT_CONFIG_FILENAME):
                    result = {"id": request_id, "ok": True, "message": "Filename unchanged"}
                else:
                    candidate_path = CONFIG_DIR / filename
                    existing, _ = config_at(candidate_path)
                    if existing is None:
                        result = {"id": request_id, "ok": False, "message": "That file does not contain a usable WireGuard config"}
                    else:
                        with STATE_LOCK:
                            STATE["config_filename"] = filename
                            STATE["pending_apply"] = True
                            set_active_config_filename(filename)
                            save_state(STATE)
                        log_event("info", "Managed config filename changed to %s" % filename, "config")
                        result = {"id": request_id, "ok": True, "message": "Filename saved"}
            except ValueError as exc:
                result = {"id": request_id, "ok": False, "message": str(exc)}
            finally:
                UPDATE_LOCK.release()
    elif action == "interval":
        try:
            seconds = int(command.get("interval_seconds"))
            if seconds < MIN_INTERVAL or seconds > MAX_INTERVAL:
                raise ValueError
        except (ValueError, TypeError):
            result = {"id": request_id, "ok": False, "message": "Interval must be between 300 and 7,776,000 seconds"}
        else:
            with STATE_LOCK:
                STATE["interval_seconds"] = seconds
                STATE["next_run_at"] = (dt.datetime.now(UTC) + dt.timedelta(seconds=seconds)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
                save_state(STATE)
            log_event("info", "Schedule interval changed to %d seconds" % seconds)
            result = {"id": request_id, "ok": True, "message": "Interval saved"}
    elif action == "config-retention":
        try:
            seconds = int(command.get("retention_seconds"))
            if seconds < 3600 or seconds > 365 * 86400: raise ValueError
        except (ValueError, TypeError):
            result = {"id": request_id, "ok": False, "message": "Retention must be between 1 hour and 365 days"}
        else:
            STATE["config_retention_seconds"] = seconds
            with db_session() as conn:
                for row in conn.execute("SELECT id,saved_at FROM saved_configs").fetchall():
                    saved_at = dt.datetime.fromisoformat(row["saved_at"].replace("Z", "+00:00"))
                    expires_at = (saved_at + dt.timedelta(seconds=seconds)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
                    conn.execute("UPDATE saved_configs SET expires_at=? WHERE id=?", (expires_at, row["id"]))
                conn.commit()
            prune_archives()
            result = {"id": request_id, "ok": True, "message": "Saved config retention updated"}
    elif action == "delete-saved-config":
        config_id = command.get("archive_id", "")
        if not re.fullmatch(r"[a-f0-9]{32}", config_id):
            result = {"id": request_id, "ok": False, "message": "Invalid saved config"}
        else:
            with db_session() as conn:
                conn.execute("DELETE FROM saved_configs WHERE id=?", (config_id,)); conn.commit()
            try: (ARCHIVE_DIR / (config_id + ".conf")).unlink()
            except FileNotFoundError: pass
            prune_archives()
            result = {"id": request_id, "ok": True, "message": "Saved config deleted"}
    elif action == "restore-saved-config":
        config_id = command.get("archive_id", "")
        if not re.fullmatch(r"[a-f0-9]{32}", config_id):
            result = {"id": request_id, "ok": False, "message": "Invalid saved config"}
        elif UPDATE_LOCK.acquire(blocking=False):
            try:
                threading.Thread(target=restore_saved_config, args=(config_id,), daemon=True).start()
                result = {"id": request_id, "ok": True, "pending": True, "message": "Saved config activation queued"}
            except RuntimeError:
                UPDATE_LOCK.release()
                result = {"id": request_id, "ok": False, "message": "Could not start config activation"}
        else:
            result = {"id": request_id, "ok": False, "message": "A generator or activation is already running"}
    elif action == "warp-settings":
        try:
            settings = validate_warp_settings(command.get("warp_settings"))
        except ValueError as exc:
            result = {"id": request_id, "ok": False, "message": str(exc)}
        else:
            with STATE_LOCK:
                STATE["warp_settings"] = settings
                save_state(STATE)
            log_event("info", "WARP registration identity settings saved")
            result = {"id": request_id, "ok": True, "message": "WARP registration settings saved; they apply to the next config generation"}
    elif action == "private-key":
        try:
            if ACTIVE.is_symlink() or not ACTIVE.is_file() or ACTIVE.stat().st_size > 32768:
                raise ValueError("No usable active config is installed")
            config_text = ACTIVE.read_text(encoding="utf-8")
            private = re.search(r"(?im)^\s*PrivateKey\s*=\s*(\S+)\s*$", config_text)
            if not private:
                raise ValueError("Private key is not present in the active config")
            result = {"id": request_id, "ok": True, "private_key": private.group(1)}
        except (OSError, UnicodeError, ValueError) as exc:
            result = {"id": request_id, "ok": False, "message": str(exc) or "Could not read the private key"}
    elif action == "download-saved-config":
        config_id = command.get("archive_id", "")
        try:
            if not re.fullmatch(r"[a-f0-9]{32}", config_id):
                raise ValueError("Invalid saved config")
            with db_session() as conn:
                row = conn.execute("SELECT filename FROM saved_configs WHERE id=?", (config_id,)).fetchone()
            if not row:
                raise ValueError("Saved config was not found")
            path = ARCHIVE_DIR / (config_id + ".conf")
            if path.is_symlink() or not path.is_file() or path.stat().st_size > 32768:
                raise ValueError("Saved config is unavailable")
            content = path.read_text(encoding="utf-8")
            validate_config(content)
            safe_name = row["filename"] if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,62}\.conf", row["filename"]) else "saved-config.conf"
            result = {"id": request_id, "ok": True, "config_content": content, "filename": safe_name}
        except (OSError, UnicodeError, ValueError, subprocess.SubprocessError) as exc:
            result = {"id": request_id, "ok": False, "message": str(exc) or "Could not read saved config"}
    else:
        result = {"id": request_id, "ok": False, "message": "Unsupported action"}
    atomic_write(UI_RESULT, json.dumps(result), 0o640)
    if action == "private-key":
        def expire_private_key_result(expected_id):
            STOP.wait(15)
            try:
                current = json.loads(UI_RESULT.read_text(encoding="utf-8"))
                if current.get("id") == expected_id:
                    UI_RESULT.unlink()
            except (OSError, ValueError):
                pass
        threading.Thread(target=expire_private_key_result, args=(request_id,), daemon=True).start()


def scheduler_loop():
    last_archive_sweep = 0
    while not STOP.is_set():
        process_ui_command()
        if time.monotonic() - last_archive_sweep >= 60:
            try: prune_archives()
            except Exception: pass
            last_archive_sweep = time.monotonic()
        with STATE_LOCK:
            due = STATE.get("next_run_at")
            interval = STATE["interval_seconds"]
            if not due:
                base = STATE.get("last_success_at")
                try:
                    due_time = dt.datetime.fromisoformat(base.replace("Z", "+00:00")) + dt.timedelta(seconds=interval) if base else dt.datetime.now(UTC) + dt.timedelta(seconds=interval)
                except ValueError:
                    due_time = dt.datetime.now(UTC) + dt.timedelta(seconds=interval)
                due = due_time.replace(microsecond=0).isoformat().replace("+00:00", "Z")
                STATE["next_run_at"] = due
                save_state(STATE)
        try:
            due_dt = dt.datetime.fromisoformat(due.replace("Z", "+00:00"))
        except ValueError:
            due_dt = dt.datetime.now(UTC) + dt.timedelta(seconds=5)
        if due_dt.timestamp() <= time.time():
            if UPDATE_LOCK.acquire(blocking=False):
                try:
                    threading.Thread(target=run_update, args=("scheduled", True), daemon=True).start()
                except RuntimeError:
                    UPDATE_LOCK.release()
        STOP.wait(1)


def probe_loop():
    while not STOP.is_set():
        try:
            active, _ = active_config()
            expected_key = interface_public_key(active) if active else None
            result = host_request("probe-tunnel-ip", expected_key)
            ip = result.get("ip")
            ipaddress.ip_address(ip or "")
            with STATE_LOCK:
                not_loaded = bool(expected_key) and result.get("config_loaded") is not True
                STATE["ip"] = {"address": ip, "checked_at": now(), "error": (result.get("message") or "Selected config is not active in the VPN tunnel") if not_loaded else None}
                if expected_key:
                    STATE["pending_apply"] = not_loaded
                save_state(STATE)
        except Exception as exc:
            with STATE_LOCK:
                STATE["ip"] = {"address": None, "checked_at": now(), "error": str(exc) if isinstance(exc, RuntimeError) else "Tunnel IP check failed (%s)" % type(exc).__name__}
                save_state(STATE)
        STOP.wait(300)


def main():
    os.umask(0o077)
    init_db()
    global STATE
    STATE = load_state()
    if STATE.get("status") == "running":
        STATE["status"] = "failed"
        STATE["last_error"] = "The previous generator process stopped before it completed. A new attempt will follow the configured schedule."
        log_event("warning", "Recovered an interrupted generator run from the previous process")
    set_active_config_filename(STATE["config_filename"])
    with STATE_LOCK:
        save_state(STATE)
    active, _ = active_config()
    if active:
        archive_config(active)
    if active:
        last_generated = None
        last_success = STATE.get("last_success_at")
        if isinstance(last_success, str):
            try:
                last_generated = dt.datetime.fromisoformat(last_success.replace("Z", "+00:00"))
                if last_generated.tzinfo is None:
                    last_generated = last_generated.replace(tzinfo=UTC)
                last_generated = last_generated.astimezone(UTC)
            except ValueError:
                last_generated = None
        try:
            config_modified = dt.datetime.fromtimestamp(ACTIVE.stat().st_mtime, UTC)
            if last_generated is None or config_modified > last_generated:
                last_generated = config_modified
        except OSError:
            pass
        if last_generated is None:
            log_event("warning", "Could not determine when the active config was last generated; startup generation queued")
            threading.Thread(target=run_update, args=("startup",), daemon=True).start()
        else:
            interval = int(STATE.get("interval_seconds", INTERVAL_DEFAULT))
            next_due = (last_generated + dt.timedelta(seconds=interval)).replace(microsecond=0)
            with STATE_LOCK:
                STATE["next_run_at"] = next_due.isoformat().replace("+00:00", "Z")
                save_state(STATE)
            if next_due.timestamp() > time.time():
                remaining = int(next_due.timestamp() - time.time())
                log_event("info", "Active config is within its %d-second update interval; startup generation skipped (%d seconds remain)" % (interval, remaining))
            else:
                log_event("info", "Active config is outside its %d-second update interval; startup generation queued" % interval)
                threading.Thread(target=run_update, args=("startup",), daemon=True).start()
    else:
        reason = config_unusable_reason(ACTIVE)
        log_event("warning", "No usable active config (%s); startup generation queued" % reason)
        threading.Thread(target=run_update, args=("startup",), daemon=True).start()
    threading.Thread(target=scheduler_loop, daemon=True).start()
    threading.Thread(target=probe_loop, daemon=True).start()
    def shutdown(_signum, _frame):
        STOP.set()
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    while not STOP.wait(1):
        pass

if __name__ == "__main__":
    main()



