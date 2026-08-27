// SQLite database bootstrap: creates data dir, opens DB with WAL + foreign keys,
// runs versioned migrations, and exposes a singleton accessor.

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import config from '../config.js';
import { migrate } from '../db/migrations.js';

let db = null;
let initPromise = null;

export async function initDatabase() {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!fs.existsSync(config.dataDir)) {
      fs.mkdirSync(config.dataDir, { recursive: true });
    }
    if (!fs.existsSync(config.uploadsDir)) {
      fs.mkdirSync(config.uploadsDir, { recursive: true });
    }

    db = await open({
      filename: config.dbPath,
      driver: sqlite3.Database,
    });

    // Durability + performance: WAL journaling and sensible busy handling.
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA foreign_keys = ON;');
    await db.exec('PRAGMA busy_timeout = 5000;');

    // Apply versioned migrations (idempotent).
    const result = await migrate(db);
    if (result.appliedFrom !== result.appliedTo) {
      console.log(`[database] migrated schema v${result.appliedFrom} -> v${result.appliedTo}`);
    }

    return db;
  })();

  return initPromise;
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export default { initDatabase, getDatabase };
