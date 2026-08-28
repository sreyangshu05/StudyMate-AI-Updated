// Load every backend module to verify imports resolve and no module-level
// side effects throw. Run with: NODE_ENV=test JWT_SECRET=x node scripts/check-imports.js
//
// This script is self-contained: it forces a test-like environment so the
// config module takes its test branch (test JWT secret, roomy rate limits, no
// hard JWT_SECRET requirement). Without this the script spuriously fails with
// "Cannot access 'config' before initialization" — an ES-module TDZ race that
// only manifests when config's non-test branch throws mid-link. Setting env
// before any import makes the check deterministic.

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'check-imports-only-secret';

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const modules = fs.readdirSync(path.join(root, 'src'), { recursive: true })
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join('src', f))
  .concat(['index.js']);

let failures = 0;
for (const rel of modules) {
  const abs = path.join(root, rel);
  try {
    const before = Date.now();
    await import(pathToFileURL(abs).href);
    console.log(`OK   ${rel} (${Date.now() - before}ms)`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL ${rel}: ${err.message}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} module(s) failed to load`);
  process.exit(1);
}
console.log(`\nAll ${modules.length} backend modules loaded successfully`);
