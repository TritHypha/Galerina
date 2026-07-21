import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compilerDir = path.join(__dirname, '..', 'packages-galerina', 'galerina-core-compiler');

const subdirs = ['bootstrap-determinism','governance-conformance','parser','package-resolver',
  'value-state','type-registry','effect-checker','governance','stdlib','lexer'];

let totalTests = 0, totalFail = 0;

for (const sub of subdirs) {
  const subDir = path.join(compilerDir, 'tests', sub);
  if (!fs.existsSync(subDir)) { console.log(`${sub}: no dir`); continue; }
  const files = fs.readdirSync(subDir).filter(f => f.endsWith('.test.mjs')).map(f => path.join('tests', sub, f));
  if (files.length === 0) { console.log(`${sub}: no files`); continue; }
  const r = spawnSync('node', ['--test', ...files], { cwd: compilerDir, encoding: 'utf8', timeout: 120_000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const tMatch = out.match(/ℹ tests (\d+)/);
  const fMatch = out.match(/ℹ fail (\d+)/);
  const t = tMatch ? parseInt(tMatch[1]) : 0;
  const f = fMatch ? parseInt(fMatch[1]) : 0;
  totalTests += t; totalFail += f;
  console.log(`${sub}: ${t} tests, ${f} fail`);
  if (f > 0) {
    const failLines = out.split('\n').filter(l => l.includes('✖') || l.includes('AssertionError')).slice(0, 5);
    console.log('  FAILURES:', failLines.join('\n  '));
  }
}

console.log(`\nTOTAL subdirs: ${totalTests} tests, ${totalFail} fail`);
process.exit(totalFail > 0 ? 1 : 0);
