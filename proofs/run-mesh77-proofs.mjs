// run-mesh77-proofs.mjs — re-runnable keep-green suite for RD-0200..0225 (77-mesh-r-d).
// Usage:  node run-mesh77-proofs.mjs
// Each rd-02xx-proof.mjs is a self-contained node-built-ins-only maths check that ASSERTS the
// real value of a claim (and asserts-false the overclaim). Exit 0 = all GREEN.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const dir = path.dirname(url.fileURLToPath(import.meta.url));
const proofs = fs.readdirSync(dir).filter(f => /^rd-02\d\d-proof\.mjs$/.test(f)).sort();
let pass = 0, fail = 0;
for (const f of proofs) {
  try { execFileSync(process.execPath, [path.join(dir, f)], { stdio: 'ignore' }); pass++; console.log('GREEN ', f); }
  catch { fail++; console.log('RED   ', f); }
}
console.log(`\n${pass}/${proofs.length} GREEN, ${fail} RED`);
process.exit(fail === 0 ? 0 : 1);
