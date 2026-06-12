/**
 * Runs every *.test.ts file in src/ under tsx.
 *
 * Each test file is expected to:
 *   - print its own per-file summary to stdout
 *   - `process.exit(1)` on failure
 *
 * If we add a real test framework later (Vitest is the front-runner once
 * `react-native-purchases` types stabilize for it), swap this for that.
 *
 * Plain JS (.mjs) so we don't need @types/node in tsconfig.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

function findTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...findTestFiles(full));
    } else if (entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = findTestFiles(SRC);
console.log(`Found ${files.length} test files:`);
for (const f of files) console.log(`  - ${relative(ROOT, f)}`);

let failed = 0;
for (const file of files) {
  const result = spawnSync('tsx', [file], {
    stdio: 'inherit',
    cwd: ROOT,
    shell: true,
  });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed}/${files.length} test files FAILED`);
  process.exit(1);
}
console.log(`\nAll ${files.length} test files passed`);
