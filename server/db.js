import Database from 'better-sqlite3';

const db = new Database(process.env.DB_PATH || 'data.sqlite');

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    magister_base_url TEXT NOT NULL,
    email TEXT NOT NULL,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT NOT NULL,
    token_expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS schedule_cache (
    user_id INTEGER NOT NULL,
    cache_date TEXT NOT NULL,
    schedule_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, cache_date)
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export function upsertUser(user) {
  const stmt = db.prepare(`
    INSERT INTO users (magister_base_url, email, access_token_enc, refresh_token_enc, token_expires_at, created_at)
    VALUES (@magister_base_url, @email, @access_token_enc, @refresh_token_enc, @token_expires_at, @created_at)
  `);
  return stmt.run(user).lastInsertRowid;
}

export function updateUserTokens(id, access_token_enc, refresh_token_enc, token_expires_at) {
  db.prepare(`
    UPDATE users
    SET access_token_enc = ?, refresh_token_enc = ?, token_expires_at = ?
    WHERE id = ?
  `).run(access_token_enc, refresh_token_enc, token_expires_at, id);
}

export function getUsers() {
  return db.prepare('SELECT * FROM users').all();
}

export function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function upsertScheduleCache(userId, cacheDate, scheduleJson) {
  db.prepare(`
    INSERT INTO schedule_cache (user_id, cache_date, schedule_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, cache_date)
    DO UPDATE SET schedule_json = excluded.schedule_json, updated_at = excluded.updated_at
  `).run(userId, cacheDate, scheduleJson, Date.now());
}

export function getScheduleCache(userId, cacheDate) {
  return db.prepare('SELECT * FROM schedule_cache WHERE user_id = ? AND cache_date = ?').get(userId, cacheDate);
}

export function addNotification(userId, message) {
  db.prepare(`
    INSERT INTO notifications (user_id, message, created_at)
    VALUES (?, ?, ?)
  `).run(userId, message, Date.now());
}

export function listNotifications(userId, limit = 20) {
  return db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
}

export default db;
