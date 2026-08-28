#!/usr/bin/env node
// Seeds a demo user for local development. Deliberately does NOT fabricate
// documents, quizzes, or attempts — we never pass fake data off as real. It
// only creates a throwaway demo account you can sign in with.
//
// Usage: npm run seed   (or: node scripts/seed.js)
// Env:   SEED_EMAIL, SEED_PASSWORD (optional); defaults below.
import { register } from '../src/services/authService.js';
import { initDatabase } from '../src/services/database.js';

const seedEmail = (process.env.SEED_EMAIL || 'demo@studymate.local').toLowerCase();
const seedPassword = process.env.SEED_PASSWORD || 'DemoPass123';

async function main() {
  await initDatabase();
  // Register is idempotent from the user's perspective: an existing email
  // returns 409, which we treat as "already seeded".
  try {
    const { user } = await register({ name: 'Demo User', email: seedEmail, password: seedPassword });
    console.log(`[seed] created demo account: ${user.email}`);
  } catch (err) {
    if (err && err.code === 'CONFLICT') {
      console.log(`[seed] demo account already exists: ${seedEmail} (nothing to do)`);
    } else {
      throw err;
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err.message);
  process.exit(1);
});
