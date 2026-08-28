#!/usr/bin/env node
// Applies the versioned schema migrations and prints the resulting version.
// Usage: npm run migrate   (or: node scripts/migrate.js)
import { initDatabase } from '../src/services/database.js';

async function main() {
  await initDatabase();
  const { getDatabase } = await import('../src/services/database.js');
  const db = getDatabase();
  const row = await db.get('PRAGMA user_version');
  console.log(`[migrate] schema is at version v${row.user_version}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
