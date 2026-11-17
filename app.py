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
HOST_REQUEST = CONTROL / "request.json"
HOST_RESULT = CONTROL / "result.json"
CONFIG_DIR = pathlib.Path("/config/wireguard")
DEFAULT_CONFIG_FILENAME = "wg0.conf"
ACTIVE = CONFIG_DIR / DEFAULT_CONFIG_FILENAME
BACKUP = ACTIVE.with_name(ACTIVE.name + ".last-good")
GENERATOR = "/usr/local/bin/warp-register.sh"
INTERVAL_DEFAULT = 86400
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
        conn.execute("CREATE TABLE IF NOT EXISTS service_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_service_logs_id ON service_logs(id DESC)")
        conn.commit()




@contextmanager
def db_session():
    conn = db_connect()
    try:
        yield conn
    finally:
        conn.close()

def safe_state_default():
    interval = max(MIN_INTERVAL, min(MAX_INTERVAL, INTERVAL_DEFAULT))
    return {"interval_seconds": interval, "last_attempt_at": None, "last_success_at": None,
            "next_run_at": None, "status": "starting", "last_error": None,
            "ip": {"address": None, "checked_at": None, "error": "Not checked yet"},
            "last_ui_command_id": None, "config_filename": DEFAULT_CONFIG_FILENAME, "pending_apply": False, "history": [], "logs": []}


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
    fd, name = tempfile.mkstemp(prefix="warp-candidate-", suffix=".conf", dir="/tmp")
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        result = subprocess.run(["wg-quick", "strip", name], stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, timeout=10, check=False)
        if result.returncode != 0:
            raise ValueError("WireGuard parser rejected the candidate")
    finally:
        try:
            os.unlink(name)
        except FileNotFoundError:
            pass
    return details


def config_at(path):
    try:
        st = path.lstat()
        if path.is_symlink() or not path.is_file() or st.st_size > 32768 or st.st_uid != 0 or st.st_mode & 0o077:
            return None, None
        text = path.read_text(encoding="utf-8")
        return text, validate_config(text)
    except (OSError, UnicodeError, ValueError, subprocess.SubprocessError):
        return None, None


def active_config():
    return config_at(ACTIVE)


def public_details():
    try:
        if ACTIVE.is_symlink() or not ACTIVE.is_file() or ACTIVE.stat().st_size > 32768:
            return None
        return parse_config(ACTIVE.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError):
        return None


def write_public_state(state):
    public = {"status": state.get("status"), "interval_seconds": state.get("interval_seconds"),
              "last_attempt_at": state.get("last_attempt_at"), "last_success_at": state.get("last_success_at"),
              "next_run_at": state.get("next_run_at"), "last_error": state.get("last_error"), "config_filename": state.get("config_filename", DEFAULT_CONFIG_FILENAME),
              "pending_apply": state.get("pending_apply", False), "config": public_details(), "ip": state.get("ip"),
              "history": state.get("history", [])[-25:], "logs": state.get("logs", [])[-50:]}
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
        state["logs"] = [dict(r) for r in conn.execute("SELECT at,level,message FROM service_logs ORDER BY id DESC LIMIT 200").fetchall()][::-1]
    state["interval_seconds"] = max(MIN_INTERVAL, min(MAX_INTERVAL, int(state.get("interval_seconds", INTERVAL_DEFAULT))))
    try:
        state["config_filename"] = validate_config_filename(state.get("config_filename", DEFAULT_CONFIG_FILENAME))
    except ValueError:
        state["config_filename"] = DEFAULT_CONFIG_FILENAME
    return state


def log_event(level, message):
    entry = {"at": now(), "level": level, "message": message}
    with STATE_LOCK:
        STATE["logs"].append(entry)
        STATE["logs"] = STATE["logs"][-200:]
        with db_session() as conn:
            conn.execute("INSERT INTO service_logs(at,level,message) VALUES(?,?,?)", (entry["at"], level, message))
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


def gen_env():
    # Keep the upstream script's own defaults. Strip any accidental WARP_* overrides
    # inherited from the container environment so generated configs remain predictable.
    env = os.environ.copy()
    for key in tuple(env):
        if key.startswith("WARP_"):
            env.pop(key, None)
    return env


def interface_public_key(text):
    private = re.search(r"(?im)^\s*PrivateKey\s*=\s*(\S+)\s*$", text)
    if not private:
        raise RuntimeError("Candidate private key is missing")
    result = subprocess.run(["wg", "pubkey"], input=private.group(1) + "\n", text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=False)
    if result.returncode != 0 or not result.stdout.strip():
        raise RuntimeError("Could not derive candidate interface key")
    return result.stdout.strip()


def generate_candidate():
    cmd = [GENERATOR]
    try:
        license_key = pathlib.Path("/data/warp_license").read_text(encoding="utf-8").strip()
    except OSError:
        license_key = ""
    if license_key:
        cmd += ["--license", license_key]
    try:
        result = subprocess.run(cmd, env=gen_env(), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                text=True, timeout=180, check=False)
    except subprocess.TimeoutExpired:
        raise RuntimeError("Generator timed out after 180 seconds")
    except OSError:
        raise RuntimeError("Generator could not be started")
    if result.returncode != 0:
        raise RuntimeError("Generator failed (exit code %d); stderr suppressed to protect secrets" % result.returncode)
    if not result.stdout.strip():
        raise RuntimeError("Generator returned an empty config")
    return result.stdout


def host_request(action, expected_public_key=None):
    if action != "probe-tunnel-ip":
        raise RuntimeError("Unsupported host action")
    with HOST_REQUEST_LOCK:
        request_id = uuid.uuid4().hex
        if not CONTROL.is_dir():
            raise RuntimeError("Host tunnel probe is not installed")
        request = {"id": request_id, "action": action, "requested_at": now()}
        if expected_public_key:
            request["expected_public_key"] = expected_public_key
        atomic_write(HOST_REQUEST, json.dumps(request), 0o600)
        deadline = time.monotonic() + 300
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
        raise RuntimeError("Timed out waiting for the host VPN helper")


def run_update(source, lock_acquired=False):
    if not lock_acquired and not UPDATE_LOCK.acquire(blocking=False):
        return False
    started = now()
    start_mono = time.monotonic()
    previous, _ = active_config()
    previous_pending = STATE.get("pending_apply", False)
    installed = False
    with STATE_LOCK:
        STATE["status"] = "running"
        STATE["last_attempt_at"] = started
        STATE["last_error"] = None
        save_state(STATE)
    log_event("info", "%s update started" % source)
    try:
        candidate = generate_candidate()
        validate_config(candidate)
        if previous is not None:
            atomic_write(BACKUP, previous, 0o600)
        atomic_write(ACTIVE, candidate, 0o600)
        installed = True
        completed = now()
        with STATE_LOCK:
            STATE["status"] = "success"
            STATE["last_success_at"] = completed
            STATE["last_error"] = None
            STATE["pending_apply"] = True
            STATE["next_run_at"] = (dt.datetime.now(UTC) + dt.timedelta(seconds=STATE["interval_seconds"])).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        record_history({"started_at": started, "finished_at": completed, "result": "success", "source": source, "error": None, "duration_seconds": round(time.monotonic() - start_mono, 1)})
        log_event("warning", "New config installed atomically; automatic VPN activation is disabled and the config is pending manual activation")
        return True
    except Exception as exc:
        error = str(exc) if isinstance(exc, RuntimeError) else "Candidate validation or installation failed (%s)" % type(exc).__name__
        try:
            if installed:
                if previous is None:
                    try:
                        ACTIVE.unlink()
                    except FileNotFoundError:
                        pass
                else:
                    atomic_write(ACTIVE, previous, 0o600)
        except Exception:
            error += "; rollback needs attention"
        completed = now()
        with STATE_LOCK:
            STATE["status"] = "failed"
            STATE["last_error"] = error
            STATE["pending_apply"] = previous_pending
            STATE["next_run_at"] = (dt.datetime.now(UTC) + dt.timedelta(seconds=STATE["interval_seconds"])).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        record_history({"started_at": started, "finished_at": completed, "result": "failed", "source": source,
                        "error": error, "duration_seconds": round(time.monotonic() - start_mono, 1)})
        log_event("error", error)
        return False
    finally:
        UPDATE_LOCK.release()

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
                        log_event("info", "Managed config filename changed to %s" % filename)
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
    else:
        result = {"id": request_id, "ok": False, "message": "Unsupported action"}
    atomic_write(UI_RESULT, json.dumps(result), 0o640)


def scheduler_loop():
    while not STOP.is_set():
        process_ui_command()
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
            run_update("scheduled")
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
                STATE["ip"] = {"address": ip, "checked_at": now(), "error": None}
                if expected_key:
                    STATE["pending_apply"] = result.get("config_loaded") is not True
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
    set_active_config_filename(STATE["config_filename"])
    with STATE_LOCK:
        save_state(STATE)
    active, _ = active_config()
    if active:
        log_event("info", "Usable active WireGuard config found; startup generation skipped")
    else:
        log_event("warning", "No usable active config found; startup generation queued")
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


