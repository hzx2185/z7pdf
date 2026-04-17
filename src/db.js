const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fsSync = require("fs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(PROJECT_ROOT, "data");
const STORAGE_DIR = path.join(DATA_DIR, "storage");
const DB_PATH = path.join(DATA_DIR, "app.db");

// 确保目录存在
fsSync.mkdirSync(STORAGE_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

// 初始化表结构
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    plan TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    folder_name TEXT NOT NULL DEFAULT '',
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL DEFAULT 'pdf',
    source TEXT NOT NULL DEFAULT 'upload',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    access_mode TEXT NOT NULL DEFAULT 'public',
    password_hash TEXT NOT NULL DEFAULT '',
    access_key TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL DEFAULT '',
    max_downloads INTEGER NOT NULL DEFAULT 0,
    download_count INTEGER NOT NULL DEFAULT 0,
    destroy_after_reading INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS share_audits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS plans (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL DEFAULT 0,
    billing_interval TEXT NOT NULL DEFAULT 'monthly',
    storage_quota_mb INTEGER NOT NULL DEFAULT 512,
    max_files INTEGER NOT NULL DEFAULT 200,
    max_share_links INTEGER NOT NULL DEFAULT 5,
    allow_compression INTEGER NOT NULL DEFAULT 1,
    allow_split INTEGER NOT NULL DEFAULT 1,
    allow_security INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS redemption_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    plan_code TEXT NOT NULL,
    duration_days INTEGER NOT NULL DEFAULT 30,
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (plan_code) REFERENCES plans(code),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    payment_provider TEXT NOT NULL DEFAULT 'manual',
    external_ref TEXT NOT NULL DEFAULT '',
    amount_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_code) REFERENCES plans(code)
  );
  CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan_code TEXT NOT NULL,
    billing_interval TEXT NOT NULL DEFAULT 'monthly',
    amount_cents INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    paid_at TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_code) REFERENCES plans(code)
  );
  CREATE TABLE IF NOT EXISTS guest_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id TEXT NOT NULL,
    usage_date TEXT NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (guest_id, usage_date)
  );
  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'access',
    expires_at TEXT NOT NULL,
    consumed_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    requested_ip TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS editor_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function ensureColumn(tableName, columnName, definition) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some((column) => column.name === columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  } catch (_e) {}
}

ensureColumn("files", "folder_name", "TEXT NOT NULL DEFAULT ''");
ensureColumn("files", "folder_path", "TEXT NOT NULL DEFAULT ''");
ensureColumn("files", "deleted_at", "TEXT NOT NULL DEFAULT ''");
ensureColumn("files", "deleted_by_user_id", "INTEGER");
ensureColumn("shares", "destroy_after_reading", "INTEGER NOT NULL DEFAULT 0");

db.exec(`UPDATE files SET folder_path = folder_name WHERE folder_path = '' AND folder_name <> ''`);

// 创建索引以优化查询性能
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_files_user_folder ON files(user_id, folder_path, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_files_user_deleted ON files(user_id, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
  CREATE INDEX IF NOT EXISTS idx_shares_user_enabled ON shares(user_id, enabled);
  CREATE INDEX IF NOT EXISTS idx_editor_presets_user ON editor_presets(user_id, updated_at);
`);

// 导出 Stmt 对象
const stmts = {
  insertSetting: db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `),
  getSetting: db.prepare(`SELECT value FROM settings WHERE key = ?`),
  deleteSetting: db.prepare(`DELETE FROM settings WHERE key = ?`),
  listSettings: db.prepare(`SELECT key, value FROM settings ORDER BY key`),
  findUserByEmail: db.prepare(`
    SELECT id, email, password_hash, role, plan, created_at FROM users WHERE email = ?
  `),
  findUserById: db.prepare(`
    SELECT id, email, role, plan, created_at FROM users WHERE id = ?
  `),
  updateUserPassword: db.prepare(`
    UPDATE users SET password_hash = ? WHERE id = ?
  `),
  updateUserEmail: db.prepare(`
    UPDATE users SET email = ? WHERE id = ?
  `),
  deleteAllUserSessions: db.prepare(`
    DELETE FROM sessions WHERE user_id = ?
  `),
  deleteAllUserSessionsExceptCurrent: db.prepare(`
    DELETE FROM sessions WHERE user_id = ? AND token != ?
  `),
  createUser: db.prepare(`
    INSERT INTO users (email, password_hash, role, plan, created_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  createSession: db.prepare(`
    INSERT INTO sessions (user_id, token, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `),
  getSession: db.prepare(`
    SELECT
      sessions.id,
      sessions.user_id,
      sessions.token,
      sessions.expires_at,
      users.email,
      users.role,
      users.plan,
      users.created_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE token = ?`),
  deleteExpiredSessions: db.prepare(`DELETE FROM sessions WHERE expires_at < ?`),
  insertFile: db.prepare(`
    INSERT INTO files (
      user_id, original_name, folder_name, folder_path, stored_name, mime_type, size_bytes, page_count, kind, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  listFilesByUser: db.prepare(`
    SELECT id, original_name, folder_name, folder_path, stored_name, mime_type, size_bytes, page_count, kind, source, created_at, deleted_at
    FROM files
    WHERE user_id = ? AND deleted_at = ''
    ORDER BY created_at DESC, id DESC
  `),
  listFilesByUserAndFolder: db.prepare(`
    SELECT id, original_name, folder_name, folder_path, stored_name, mime_type, size_bytes, page_count, kind, source, created_at, deleted_at
    FROM files
    WHERE user_id = ? AND deleted_at = '' AND folder_path = ?
    ORDER BY created_at DESC, id DESC
  `),
  listFilesByUserInPath: db.prepare(`
    SELECT id, original_name, folder_name, folder_path, stored_name, mime_type, size_bytes, page_count, kind, source, created_at, deleted_at
    FROM files
    WHERE user_id = ? AND deleted_at = '' AND (
      folder_path = ?
      OR folder_path LIKE ? ESCAPE '\\'
    )
    ORDER BY created_at DESC, id DESC
  `),
  listDeletedFilesByUser: db.prepare(`
    SELECT id, original_name, folder_name, folder_path, stored_name, mime_type, size_bytes, page_count, kind, source, created_at, deleted_at
    FROM files
    WHERE user_id = ? AND deleted_at <> ''
    ORDER BY deleted_at DESC, id DESC
  `),
  getFileForUser: db.prepare(`
    SELECT id, user_id, original_name, folder_name, folder_path, stored_name, mime_type, size_bytes, page_count, kind, source, created_at, deleted_at, deleted_by_user_id
    FROM files
    WHERE id = ? AND user_id = ? AND deleted_at = ''
  `),
  getAnyFileForUser: db.prepare(`
    SELECT id, user_id, original_name, folder_name, folder_path, stored_name, mime_type, size_bytes, page_count, kind, source, created_at, deleted_at, deleted_by_user_id
    FROM files
    WHERE id = ? AND user_id = ?
  `),
  getFileById: db.prepare(`
    SELECT id, user_id, original_name, folder_name, folder_path, stored_name, mime_type, size_bytes, page_count, kind, source, created_at, deleted_at
    FROM files
    WHERE id = ?
  `),
  updateFileMetadata: db.prepare(`
    UPDATE files
    SET original_name = ?, folder_name = ?, folder_path = ?
    WHERE id = ? AND user_id = ?
  `),
  updateWorkspaceFileContent: db.prepare(`
    UPDATE files
    SET original_name = ?, folder_name = ?, folder_path = ?, stored_name = ?, mime_type = ?, size_bytes = ?, page_count = ?, kind = ?, source = ?
    WHERE id = ? AND user_id = ?
  `),
  deleteFileForUser: db.prepare(`
    DELETE FROM files
    WHERE id = ? AND user_id = ?
  `),
  trashFileForUser: db.prepare(`
    UPDATE files
    SET deleted_at = ?, deleted_by_user_id = ?
    WHERE id = ? AND user_id = ? AND deleted_at = ''
  `),
  restoreFileForUser: db.prepare(`
    UPDATE files
    SET deleted_at = '', deleted_by_user_id = NULL
    WHERE id = ? AND user_id = ? AND deleted_at <> ''
  `),
  listFoldersByUser: db.prepare(`
    SELECT DISTINCT folder_path
    FROM files
    WHERE user_id = ? AND deleted_at = '' AND folder_path <> ''
    ORDER BY folder_path COLLATE NOCASE ASC
  `),
  listUsers: db.prepare(`
    SELECT id, email, role, plan, created_at
    FROM users
    ORDER BY created_at DESC, id DESC
  `),
  updateUserAdmin: db.prepare(`
    UPDATE users
    SET role = ?, plan = ?
    WHERE id = ?
  `),
  storageByUser: db.prepare(`
    SELECT COALESCE(SUM(size_bytes), 0) AS total
    FROM files
    WHERE user_id = ? AND deleted_at = ''
  `),
  fileCountByUser: db.prepare(`
    SELECT COUNT(*) AS total
    FROM files
    WHERE user_id = ? AND deleted_at = ''
  `),
  activeShareCountByUser: db.prepare(`
    SELECT COUNT(*) AS total
    FROM shares
    WHERE user_id = ? AND enabled = 1
  `),
  listSharesByUser: db.prepare(`
    SELECT
      shares.id,
      shares.file_id,
      shares.token,
      shares.access_mode,
      shares.expires_at,
      shares.max_downloads,
      shares.destroy_after_reading,
      shares.download_count,
      shares.enabled,
      shares.created_at,
      files.original_name
    FROM shares
    JOIN files ON files.id = shares.file_id
    WHERE shares.user_id = ?
    ORDER BY shares.created_at DESC, shares.id DESC
  `),
  getShareForUser: db.prepare(`
    SELECT id, user_id, file_id, token, access_mode, password_hash, access_key, expires_at, max_downloads, destroy_after_reading, download_count, enabled, created_at, updated_at
    FROM shares
    WHERE id = ? AND user_id = ?
  `),
  getShareByToken: db.prepare(`
    SELECT id, user_id, file_id, token, access_mode, password_hash, access_key, expires_at, max_downloads, destroy_after_reading, download_count, enabled, created_at, updated_at
    FROM shares
    WHERE token = ?
  `),
  createShare: db.prepare(`
    INSERT INTO shares (
      user_id, file_id, token, access_mode, password_hash, access_key, expires_at, max_downloads, destroy_after_reading, download_count, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
  `),
  updateShare: db.prepare(`
    UPDATE shares
    SET access_mode = ?, password_hash = ?, access_key = ?, expires_at = ?, max_downloads = ?, destroy_after_reading = ?, enabled = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `),
  incrementShareDownload: db.prepare(`
    UPDATE shares
    SET download_count = download_count + 1, updated_at = ?
    WHERE id = ?
  `),
  disableShare: db.prepare(`
    UPDATE shares
    SET enabled = 0, updated_at = ?
    WHERE id = ? AND user_id = ?
  `),
  logShareAudit: db.prepare(`
    INSERT INTO share_audits (share_id, action, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?)
  `),
  listShareAudits: db.prepare(`
    SELECT id, action, ip_address, user_agent, created_at
    FROM share_audits
    WHERE share_id = ?
    ORDER BY created_at DESC
  `),
  listPlans: db.prepare(`
    SELECT code, name, description, price_cents, billing_interval, storage_quota_mb, max_files, max_share_links, allow_compression, allow_split, allow_security, active, sort_order, created_at, updated_at
    FROM plans
    ORDER BY sort_order ASC, price_cents ASC, code ASC
  `),
  getPlan: db.prepare(`
    SELECT code, name, description, price_cents, billing_interval, storage_quota_mb, max_files, max_share_links, allow_compression, allow_split, allow_security, active, sort_order, created_at, updated_at
    FROM plans
    WHERE code = ?
  `),
  upsertPlan: db.prepare(`
    INSERT INTO plans (
      code, name, description, price_cents, billing_interval, storage_quota_mb, max_files, max_share_links, allow_compression, allow_split, allow_security, active, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      price_cents = excluded.price_cents,
      billing_interval = excluded.billing_interval,
      storage_quota_mb = excluded.storage_quota_mb,
      max_files = excluded.max_files,
      max_share_links = excluded.max_share_links,
      allow_compression = excluded.allow_compression,
      allow_split = excluded.allow_split,
      allow_security = excluded.allow_security,
      active = excluded.active,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `),
  getActiveSubscriptionForUser: db.prepare(`
    SELECT id, user_id, plan_code, status, period_start, period_end, payment_provider, external_ref, amount_cents, created_at, updated_at
    FROM subscriptions
    WHERE user_id = ? AND status = 'active' AND datetime(period_end) >= datetime('now')
    ORDER BY datetime(period_end) DESC, id DESC
    LIMIT 1
  `),
  listSubscriptions: db.prepare(`
    SELECT id, user_id, plan_code, status, period_start, period_end, payment_provider, external_ref, amount_cents, created_at, updated_at
    FROM subscriptions
    ORDER BY datetime(updated_at) DESC, id DESC
  `),
  listSubscriptionsByUser: db.prepare(`
    SELECT id, user_id, plan_code, status, period_start, period_end, payment_provider, external_ref, amount_cents, created_at, updated_at
    FROM subscriptions
    WHERE user_id = ?
    ORDER BY datetime(updated_at) DESC, id DESC
  `),
  createSubscription: db.prepare(`
    INSERT INTO subscriptions (
      user_id, plan_code, status, period_start, period_end, payment_provider, external_ref, amount_cents, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateSubscriptionPeriod: db.prepare(`
    UPDATE subscriptions SET period_end = ?, updated_at = ? WHERE id = ?
  `),
  updateSubscriptionPlan: db.prepare(`
    UPDATE subscriptions SET plan_code = ?, updated_at = ? WHERE id = ?
  `),
  expireSubscriptionsForUser: db.prepare(`
    UPDATE subscriptions
    SET status = 'expired', updated_at = ?
    WHERE user_id = ? AND status = 'active'
  `),
  updateSubscriptionStatus: db.prepare(`
    UPDATE subscriptions
    SET status = ?, period_end = ?, updated_at = ?
    WHERE id = ?
  `),
  createRedemptionCode: db.prepare(`
    INSERT INTO redemption_codes (code, plan_code, duration_days, max_uses, created_by, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  listRedemptionCodes: db.prepare(`
    SELECT id, code, plan_code, duration_days, max_uses, used_count, expires_at, created_at
    FROM redemption_codes
    ORDER BY created_at DESC
  `),
  getRedemptionCode: db.prepare(`
    SELECT id, code, plan_code, duration_days, max_uses, used_count, expires_at, created_at
    FROM redemption_codes
    WHERE code = ?
  `),
  useRedemptionCode: db.prepare(`
    UPDATE redemption_codes SET used_count = used_count + 1 WHERE id = ?
  `),
  getGuestUsage: db.prepare(`
    SELECT guest_id, usage_date, use_count, created_at, updated_at
    FROM guest_usage
    WHERE guest_id = ? AND usage_date = ?
  `),
  incrementGuestUsage: db.prepare(`
    INSERT INTO guest_usage (guest_id, usage_date, use_count, created_at, updated_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(guest_id, usage_date)
    DO UPDATE SET use_count = guest_usage.use_count + 1, updated_at = excluded.updated_at
  `),
  getLatestVerificationForEmail: db.prepare(`
    SELECT id, email, code_hash, purpose, expires_at, consumed_at, created_at, requested_ip
    FROM email_verifications
    WHERE email = ? AND purpose = ?
    ORDER BY id DESC
    LIMIT 1
  `),
  getLatestActiveVerificationForEmail: db.prepare(`
    SELECT id, email, code_hash, purpose, expires_at, consumed_at, created_at, requested_ip
    FROM email_verifications
    WHERE email = ? AND purpose = ? AND consumed_at = ''
    ORDER BY id DESC
    LIMIT 1
  `),
  createEmailVerification: db.prepare(`
    INSERT INTO email_verifications (email, code_hash, purpose, expires_at, consumed_at, created_at, requested_ip)
    VALUES (?, ?, ?, ?, '', ?, ?)
  `),
  listEditorPresetsByUser: db.prepare(`
    SELECT id, user_id, name, config_json, created_at, updated_at
    FROM editor_presets
    WHERE user_id = ?
    ORDER BY updated_at DESC, id DESC
  `),
  upsertEditorPreset: db.prepare(`
    INSERT INTO editor_presets (user_id, name, config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, name) DO UPDATE SET
      config_json = excluded.config_json,
      updated_at = excluded.updated_at
  `),
  deleteEditorPresetForUser: db.prepare(`
    DELETE FROM editor_presets
    WHERE user_id = ? AND name = ?
  `),
  consumeVerification: db.prepare(`
    UPDATE email_verifications
    SET consumed_at = ?
    WHERE id = ?
  `),
  consumeAllOpenVerifications: db.prepare(`
    UPDATE email_verifications
    SET consumed_at = ?
    WHERE email = ? AND purpose = ? AND consumed_at = ''
  `),
  stats: {
    users: db.prepare(`SELECT COUNT(*) AS total FROM users`),
    files: db.prepare(`SELECT COUNT(*) AS total FROM files WHERE deleted_at = ''`),
    storage: db.prepare(`SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE deleted_at = ''`),
    shares: db.prepare(`SELECT COUNT(*) AS total FROM shares WHERE enabled = 1`),
    activeMemberships: db.prepare(`
      SELECT COUNT(*) AS total
      FROM subscriptions
      WHERE status = 'active' AND datetime(period_end) >= datetime('now')
    `)
  }
};

module.exports = {
  db,
  stmts,
  DATA_DIR,
  STORAGE_DIR,
  DB_PATH
};
