#!/usr/bin/env node
// Isolated frontend test runner: runs each *.test.{js,jsx} file in its OWN
// `vitest run` process. Vitest still shares module cache + mock state across
// files in a single process (the api mock from one file leaks into another),
// so per-file isolation is required for deterministic results.
//
// Usage: node scripts/run-tests.mjs   (from frontend/)
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VITEST = process.execPath;
const VITEST_ENTRY = join(root, 'node_modules', 'vitest', 'vitest.mjs');

let files;
try {
  files = readdirSync(join(root, 'src')).flatMap((d) => {
    const dir = join(root, 'src', d);
    try {
      return readdirSync(dir)
        .filter((f) => /\.test\.(js|jsx)$/.test(f))
        .map((f) => join('src', d, f));
    } catch {
      return [];
    }
  });
} catch (e) {
  console.error('Failed to scan test files:', e);
  process.exit(1);
}

if (!files.length) {
  console.log('No frontend test files found.');
  process.exit(0);
}

let totalPass = 0, totalFail = 0, failed = [];
for (const file of files) {
  const res = spawnSync(VITEST, [VITEST_ENTRY, 'run', file, '--reporter=dot', '--environment', 'jsdom'], { cwd: root, encoding: 'utf8' });
  const out = (res.stdout || '') + (res.stderr || '');
  // Echo the child's tail so failures are visible.
  process.stdout.write(out.split('\n').slice(-6).join('\n') + '\n');
  const passMatch = out.match(/(\d+)\s+pass/);
  const failMatch = out.match(/(\d+)\s+fail/);
  const p = passMatch ? Number(passMatch[1]) : 0;
  const f = failMatch ? Number(failMatch[1]) : 0;
  totalPass += p;
  totalFail += f;
  const ok = res.status === 0 && f === 0;
  if (!ok) failed.push(file);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${file}  pass=${p} fail=${f}`);
}

console.log('==========================================');
console.log(`FRONTEND TOTAL pass=${totalPass} fail=${totalFail}`);
if (failed.length) {
  console.log('Failed files:', failed.join(', '));
  process.exit(1);
}
process.exit(0);
