#!/usr/bin/env node
// Runs each test file in its OWN process so the config module (a singleton) and
// per-test databases/uploads never bleed across suites. Aggregates and reports
// a final tally, with a non-zero exit code if anything fails.
//
// Usage: npm test   (backed by this runner)

import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Choose a test runner: prefer `bun test` (works in sandboxes where `node` is a
// bun wrapper that lacks `node --test` support), else `node --test` (real Node
// in CI). Report the chosen backend clearly.
function pickRunner() {
  const bunProbe = spawnSync('bun', ['--version'], { encoding: 'utf8' });
  if (bunProbe.status === 0) {
    return { cmd: 'bun', args: ['test'], label: 'bun test' };
  }
  return { cmd: 'node', args: ['--test', '--test-concurrency=1'], label: 'node --test' };
}

const testDir = path.resolve(__dirname, '../test');
const files = readdirSync(testDir).filter((f) => f.endsWith('.test.js')).sort();

const runner = pickRunner();

const env = { ...process.env, NODE_ENV: 'test', JWT_SECRET: process.env.JWT_SECRET || 'test-only-secret-not-for-production' };

let totalPass = 0;
let totalFail = 0;
let totalErrors = 0;
const failures = [];

for (const f of files) {
  const target = path.join(testDir, f);
  const res = spawnSync(runner.cmd, [...runner.args, target], { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8' });
  const combined = (res.stdout || '') + (res.stderr || '');
  const out = combined.replace(/\x1b\[[0-9;]*m/g, '');
  const p = (out.match(/^\(pass\)/gm) || []).length;
  const fa = (out.match(/^\(fail\)/gm) || []).length;
  totalPass += p;
  totalFail += fa;
  const errLine = (out.match(/\n *\d+ error/g) || []).length;
  totalErrors += errLine;
  const status = fa === 0 && res.status === 0 ? 'PASS' : 'FAIL';
  console.log(`${status.padEnd(4)} ${f.padEnd(28)} pass=${p} fail=${fa}`);
  if (status === 'FAIL') failures.push(f);
}

console.log(`[runner] binary: ${runner.label}`);
console.log('='.repeat(50));
console.log(`TOTAL pass=${totalPass} fail=${totalFail} errors=${totalErrors}`);

if (failures.length) {
  console.log('Failing suites:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(totalErrors > 0 ? 1 : 0);
