// Load every backend module to verify imports resolve and no module-level
// side effects throw. Run with: NODE_ENV=test JWT_SECRET=x node scripts/check-imports.js
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
