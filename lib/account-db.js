import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const DB_PATH = process.env.WARP_ACCOUNT_DB || (process.env.NODE_ENV === "production"
  ? "/data/accounts/accounts.sqlite3"
  : join(process.cwd(), ".local-data", "accounts.sqlite3"));
let database;

function db() {
  if (database) return database;
  if (DB_PATH !== ":memory:") mkdirSync(join(DB_PATH, ".."), { recursive: true });
  database = new DatabaseSync(DB_PATH);
  database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=15000; PRAGMA foreign_keys=ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      jellyfin_user_id TEXT NOT NULL UNIQUE,
      jellyfin_username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL,
      last_activity_at TEXT,
      avatar BLOB,
      avatar_type TEXT,
      avatar_updated_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS app_sessions (
      session_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(deleted_at, name COLLATE NOCASE);
  `);
  const userColumns = new Set(database.prepare("PRAGMA table_info(app_users)").all().map(column => column.name));
  if (!userColumns.has("role")) {
    database.exec("ALTER TABLE app_users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'");
    database.exec("UPDATE app_users SET role = CASE WHEN is_admin = 1 THEN 'admin' ELSE 'viewer' END");
  }
  return database;
}

function now() { return new Date().toISOString(); }

function publicUser(row) {
  if (!row) return null;
  return {
    Id: row.id,
    Name: row.name,
    Role: row.role,
    IsAdministrator: row.role === "admin",
    IsDisabled: row.is_disabled === 1,
    DateCreated: row.created_at,
    LastLoginDate: row.last_login_at,
    LastActivityDate: row.last_activity_at,
    PrimaryImageTag: row.avatar_updated_at,
  };
}

export function listAppUsers() {
  return db().prepare("SELECT * FROM app_users WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").all().map(publicUser);
}

export function getAppUser(userId) {
  return db().prepare("SELECT * FROM app_users WHERE id = ? AND deleted_at IS NULL").get(userId) || null;
}

export function registerJellyfinSignIn({ jellyfinUserId, jellyfinUsername, isAdministrator }) {
  const conn = db();
  const timestamp = now();
  const existing = conn.prepare("SELECT * FROM app_users WHERE jellyfin_user_id = ?").get(jellyfinUserId);
  if (existing) {
    if (existing.deleted_at || existing.is_disabled) return { error: "This account does not have access to the dashboard" };
    conn.prepare("UPDATE app_users SET jellyfin_username = ?, last_login_at = ? WHERE id = ?")
      .run(jellyfinUsername, timestamp, existing.id);
    return { user: publicUser(getAppUser(existing.id)) };
  }

  const collision = conn.prepare("SELECT id FROM app_users WHERE jellyfin_username = ? COLLATE NOCASE").get(jellyfinUsername);
  if (collision) return { error: "This Jellyfin account name is already linked to another dashboard account" };
  const id = randomUUID();
  conn.prepare(`INSERT INTO app_users
    (id, jellyfin_user_id, jellyfin_username, name, role, is_admin, is_disabled, created_at, last_login_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`)
    .run(id, jellyfinUserId, jellyfinUsername, jellyfinUsername, isAdministrator ? "admin" : "viewer", isAdministrator ? 1 : 0, timestamp, timestamp);
  return { user: publicUser(getAppUser(id)), created: true };
}

export function updateAppUser(userId, { name, role, isDisabled }) {
  const conn = db();
  const current = conn.prepare("SELECT role, is_disabled FROM app_users WHERE id = ? AND deleted_at IS NULL").get(userId);
  if (!current) return { error: "Account not found" };
  if (current.role === "admin" && !current.is_disabled && (role !== "admin" || isDisabled)) {
    const admins = conn.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role = 'admin' AND is_disabled = 0 AND deleted_at IS NULL").get().count;
    if (admins <= 1) return { error: "At least one enabled administrator account must remain" };
  }
  const result = conn.prepare(`UPDATE app_users SET name = ?, role = ?, is_admin = ?, is_disabled = ?
    WHERE id = ? AND deleted_at IS NULL`).run(name, role, role === "admin" ? 1 : 0, isDisabled ? 1 : 0, userId);
  if (!result.changes) return { error: "Account not found" };
  if (isDisabled) conn.prepare("DELETE FROM app_sessions WHERE user_id = ?").run(userId);
  return { user: publicUser(getAppUser(userId)) };
}

export function removeAppUser(userId) {
  const conn = db();
  const current = conn.prepare("SELECT role, is_disabled FROM app_users WHERE id = ? AND deleted_at IS NULL").get(userId);
  if (!current) return { error: "Account not found" };
  if (current.role === "admin" && !current.is_disabled) {
    const admins = conn.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role = 'admin' AND is_disabled = 0 AND deleted_at IS NULL").get().count;
    if (admins <= 1) return { error: "At least one enabled administrator account must remain" };
  }
  const timestamp = now();
  conn.prepare("UPDATE app_users SET is_disabled = 1, deleted_at = ? WHERE id = ? AND deleted_at IS NULL").run(timestamp, userId);
  conn.prepare("DELETE FROM app_sessions WHERE user_id = ?").run(userId);
  return { ok: true };
}

export function storeAvatar(userId, bytes, contentType) {
  const timestamp = now();
  const result = db().prepare(`UPDATE app_users SET avatar = ?, avatar_type = ?, avatar_updated_at = ?
    WHERE id = ? AND deleted_at IS NULL`).run(bytes, contentType, timestamp, userId);
  return result.changes > 0;
}

export function clearAvatar(userId) {
  const result = db().prepare(`UPDATE app_users SET avatar = NULL, avatar_type = NULL, avatar_updated_at = NULL
    WHERE id = ? AND deleted_at IS NULL`).run(userId);
  return result.changes > 0;
}

export function getAvatar(userId) {
  return db().prepare(`SELECT avatar, avatar_type FROM app_users
    WHERE id = ? AND deleted_at IS NULL AND avatar IS NOT NULL`).get(userId) || null;
}

export function createStoredSession(sessionHash, userId, maxAgeSeconds) {
  const timestamp = now();
  const user = db().prepare("SELECT * FROM app_users WHERE id = ? AND deleted_at IS NULL AND is_disabled = 0").get(userId);
  if (!user) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  db().prepare("DELETE FROM app_sessions WHERE expires_at <= ?").run(Math.floor(Date.now() / 1000));
  db().prepare("INSERT INTO app_sessions (session_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sessionHash, userId, expiresAt, timestamp);
  return { userId, expiresAt };
}

export function readStoredSession(sessionHash) {
  const timestamp = now();
  const current = Math.floor(Date.now() / 1000);
  const row = db().prepare(`SELECT s.expires_at, u.id, u.name, u.role, u.is_disabled, u.deleted_at
    FROM app_sessions s JOIN app_users u ON u.id = s.user_id
    WHERE s.session_hash = ? AND s.expires_at > ?`).get(sessionHash, current);
  if (!row || row.is_disabled || row.deleted_at) return null;
  db().prepare(`UPDATE app_users SET last_activity_at = ?
    WHERE id = ? AND (last_activity_at IS NULL OR last_activity_at < ?)`).run(timestamp, row.id, new Date(Date.now() - 60_000).toISOString());
  return { userId: row.id, username: row.name, role: row.role, isAdmin: row.role === "admin", exp: row.expires_at, sessionHash };
}

export function deleteStoredSession(sessionHash) {
  db().prepare("DELETE FROM app_sessions WHERE session_hash = ?").run(sessionHash);
}
