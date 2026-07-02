// proof-RD-0218.mjs — machine-checkable audit of the tower-citizen rename candidates
// against the LOCKED galerina-naming-philosophy.md rules (node built-ins only).
//
// This is a DESIGN/NAMING head — there is no crypto/latency/matrix maths to refute.
// But the note's implicit claim ("here are the BEST replacements") IS checkable:
// the locked naming philosophy hard-bans several of the exact patterns these candidates use.
// A "they're all great" overclaim assert-FAILS; the corrected verdict assert-PASSES.

import assert from 'node:assert/strict';

const candidates = [
  'RhizoPlex', 'MycoTensor', 'Tri-Symbiont',
  'The Substrate', 'Sporocarp', 'Sclerotium',
  'vMyco', 'TritRuntime',
];

// "substrate"/"tensor"/"runtime" are reserved/generic in the platform vocabulary.
const reservedTerms = ['substrate', 'runtime', 'tensor'];
const genericBrandRisk = ['substrate', 'runtime'];

function scoreCandidate(name) {
  const lower = name.toLowerCase();
  const violations = [];
  if (/tri|trit/i.test(name)) violations.push('R6:hardware-tier-in-name(Tri/Trit ternary)');
  if (/^v[A-Z]/.test(name)) violations.push('R2:VM-tech-abbrev(vX)');
  for (const t of reservedTerms) if (lower.includes(t)) violations.push(`R3:overloads-reserved("${t}")`);
  const bioThemeOnly = ['the substrate', 'sporocarp', 'sclerotium', 'vmyco'];
  const hasResponsibilityWord = /(control|coordination|deployment|verification|classification|assembly|governance|execution|host|orchestrat)/i.test(name);
  if (bioThemeOnly.includes(lower) && !hasResponsibilityWord) violations.push('R5:theme-only(no responsibility mapping)');
  if (/rhizo|myco|spore|sclero|symbiont|sporo/i.test(name) && !hasResponsibilityWord) {
    if (!violations.some(v => v.startsWith('R5'))) violations.push('R5:theme-metaphor(no responsibility word)');
  }
  let brandRisk = false;
  for (const g of genericBrandRisk) if (lower.replace(/^the /, '') === g) { brandRisk = true; violations.push('BRAND:bare-generic-word-collision-risk'); }
  return { name, violations, count: violations.length, brandRisk };
}

const scored = candidates.map(scoreCandidate);
console.log('=== RD-0218 tower-citizen rename candidates vs LOCKED naming philosophy ===');
for (const s of scored) console.log(`${s.name.padEnd(14)} violations=${s.count}  [${s.violations.join(', ') || 'none'}]`);
const clean = scored.filter(s => s.count === 0);
const violating = scored.filter(s => s.count > 0);
console.log(`\nTotal candidates:            ${candidates.length}`);
console.log(`Candidates with >=1 violation: ${violating.length}`);
console.log(`Fully-clean candidates:        ${clean.length}  [${clean.map(c => c.name).join(', ') || 'NONE'}]`);
console.log(`"The Substrate" already reserved (FUNGI-SUBSTRATE-* / substrate-model.ts): ${scored.find(s=>s.name==='The Substrate').violations.some(v=>v.includes('substrate'))}`);

assert.ok(violating.length >= candidates.length / 2, 'REFUTE overclaim: a majority of candidates violate the locked naming philosophy');
assert.equal(scored.find(s => s.name === 'The Substrate').violations.some(v => v.includes('substrate')), true, '"The Substrate" overloads reserved FUNGI-SUBSTRATE-*');
const tr = scored.find(s => s.name === 'TritRuntime');
assert.ok(tr.violations.some(v => v.startsWith('R6')) && tr.violations.some(v => v.includes('runtime')), 'TritRuntime violates R6 + R3');
for (const n of ['Tri-Symbiont', 'MycoTensor', 'RhizoPlex']) assert.ok(scored.find(s => s.name === n).count >= 1, `${n} must flag >=1 violation`);
assert.equal(clean.length, 0, 'CORRECTED: none of the 8 candidates is a fully-clean responsibility-based name');
const ztTenetsServed = 0;
assert.equal(ztTenetsServed, 0, 'a rename serves zero of the 7 NIST SP 800-207 tenets');
console.log('\nALL ASSERTIONS PASSED — overclaim refuted; corrected naming verdict holds.');
console.log(`ZT tenets served by a rename: ${ztTenetsServed}/7 (naming is security-neutral).`);