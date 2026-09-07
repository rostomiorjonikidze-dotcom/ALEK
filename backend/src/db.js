
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function createDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      photo_url TEXT NOT NULL DEFAULT '',
      points INTEGER NOT NULL DEFAULT 0,
      energy INTEGER NOT NULL DEFAULT 1000,
      max_energy INTEGER NOT NULL DEFAULT 1000,
      tap_power INTEGER NOT NULL DEFAULT 1,
      recharge INTEGER NOT NULL DEFAULT 3,
      total_taps INTEGER NOT NULL DEFAULT 0,
      referrals INTEGER NOT NULL DEFAULT 0,
      inviter_id TEXT,
      squad_id INTEGER,
      last_daily INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS squads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      owner_id TEXT NOT NULL,
      power INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS boss (
      id INTEGER PRIMARY KEY CHECK(id=1),
      hp INTEGER NOT NULL,
      max_hp INTEGER NOT NULL,
      season INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS boss_damage (
      telegram_id TEXT PRIMARY KEY,
      damage INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      payload TEXT NOT NULL UNIQUE,
      stars INTEGER NOT NULL,
      telegram_payment_charge_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      paid_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS wallets (
      telegram_id TEXT PRIMARY KEY,
      ton_address TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tap_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      taps INTEGER NOT NULL,
      earned INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const now = Date.now();
  db.prepare(`INSERT OR IGNORE INTO boss(id,hp,max_hp,season,updated_at) VALUES(1,1000000,1000000,1,?)`).run(now);
  return db;
}
