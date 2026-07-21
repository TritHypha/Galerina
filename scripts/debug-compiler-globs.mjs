import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'packages-galerina', 'galerina-core-compiler');

function expandTestGlob(baseDir, glob) {
  const slash = glob.lastIndexOf('/');
  const sub = slash >= 0 ? glob.slice(0, slash) : '.';
  const pat = slash >= 0 ? glob.slice(slash + 1) : glob;
  const subDir = path.join(baseDir, sub);
  if (!fs.existsSync(subDir)) return [];
  const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return fs.readdirSync(subDir).filter(f => re.test(f)).map(f => path.join(sub, f));
}

const globs = [
  'tests/*.test.mjs',
  'tests/bootstrap-determinism/*.test.mjs',
  'tests/governance-conformance/*.test.mjs',
  'tests/parser/*.test.mjs',
  'tests/package-resolver/*.test.mjs',
  'tests/value-state/*.test.mjs',
  'tests/type-registry/*.test.mjs',
  'tests/effect-checker/*.test.mjs',
  'tests/governance/*.test.mjs',
  'tests/stdlib/*.test.mjs',
  'tests/lexer/*.test.mjs'
];

const files = globs.flatMap(g => expandTestGlob(dir, g));
console.log('total files:', files.length);
console.log('first 5:', files.slice(0, 5));
