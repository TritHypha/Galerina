// proof-RD-0205.mjs — REDACT: null-omission ("" / 0, never null) + envelope meta.redacted_keys
// Node built-ins only. Checks the SELF-CONTRADICTION the head walks into:
//   (C1) note claims "yield ABSOLUTELY NOTHING / zero metadata leakage" -> drop asterisks, use ""/0 (never null).
//   (C2) but frontend must tell redacted-vs-empty -> ADD meta.redacted_keys:["email","phone"].
//   We prove C1 and C2 are mutually exclusive: the meta list re-introduces the metadata leak
//   (which fields EXIST and were WITHHELD) that C1 set out to remove; and "" is ambiguous.
import assert from 'node:assert/strict';

const PII_FIELDS = ['email', 'phone', 'ssn'];
const target = {
  id: '1234', total: 52050,
  present: { email: true, phone: true, ssn: false },   // ssn genuinely absent
  consent: { email: false, phone: false, ssn: false }, // email/phone withheld by consent
};

function envelopeWithMeta(row) {                 // Design A: note's FINAL design
  const data = { id: row.id, total: row.total }; const redacted_keys = [];
  for (const f of PII_FIELDS) {
    if (!row.present[f]) continue;
    if (row.consent[f] === false) { data[f] = ''; redacted_keys.push(f); }
    else data[f] = `real-${f}`;
  }
  return { meta: { status: 200, redacted_keys }, data };
}
function envelopeNoMeta(row) {                    // Design B: "yield absolutely nothing", NO meta list
  const data = { id: row.id, total: row.total };
  for (const f of PII_FIELDS) {
    if (!row.present[f]) continue;
    if (row.consent[f] === false) continue;      // masked == omitted, no signal
    data[f] = `real-${f}`;
  }
  return { data };
}
function distinguishableStates(env, hasMeta) {
  const out = {};
  for (const f of PII_FIELDS) {
    const inData = env.data && Object.prototype.hasOwnProperty.call(env.data, f);
    const inMeta = hasMeta && env.meta.redacted_keys.includes(f);
    let observed;
    if (inData && env.data[f] !== '') observed = 'disclosed';
    else if (inMeta) observed = 'withheld-flagged';
    else if (inData && env.data[f] === '') observed = 'empty-in-data';
    else observed = 'not-present';
    out[f] = observed;
  }
  return out;
}
function withheldIsIdentifiable(row, builder, hasMeta, f) {
  return distinguishableStates(builder(row), hasMeta)[f] === 'withheld-flagged';
}
// CLAIM 1: meta list leaks field existence + withhold decision
const leaksWithMeta    = withheldIsIdentifiable(target, envelopeWithMeta, true,  'email');
const leaksWithoutMeta = withheldIsIdentifiable(target, envelopeNoMeta,   false, 'email');
assert.equal(leaksWithMeta, true,    'REFUTED-OVERCLAIM: meta.redacted_keys DOES leak (existence+withhold identifiable).');
assert.equal(leaksWithoutMeta, false,'CORRECTED: dropping field w/ NO meta does not identify a withheld field.');
// CLAIM 2: attacker information gain strictly higher WITH meta
function bitsLeaked(row, builder, hasMeta) {
  const obs = distinguishableStates(builder(row), hasMeta); let pinned = 0;
  for (const f of PII_FIELDS) if (obs[f] === 'disclosed' || obs[f] === 'withheld-flagged') pinned++;
  return pinned * Math.log2(3);
}
const bitsWithMeta = bitsLeaked(target, envelopeWithMeta, true);
const bitsWithoutMeta = bitsLeaked(target, envelopeNoMeta, false);
assert.ok(bitsWithMeta > bitsWithoutMeta, 'CONFIRMED COST: meta.redacted_keys strictly increases attacker info gain.');
assert.equal(Number(bitsWithMeta.toFixed(6)), Number((2*Math.log2(3)).toFixed(6)), 'meta leaks exactly 2 pinned fields.');
assert.equal(bitsWithoutMeta, 0, 'no-meta design leaks 0 pinned fields.');
// CLAIM 3: "" redacted vs genuinely-empty is ambiguous (separable only via leaking meta)
function envForceEmptyDisclosed(){ return { meta:{status:200,redacted_keys:[]}, data:{ id:'9', total:0, email:'' } }; }
const redactedEnv = envelopeWithMeta(target); const emptyEnv = envForceEmptyDisclosed();
assert.equal(redactedEnv.data.email, emptyEnv.data.email, 'AMBIGUITY: redacted "" and empty "" byte-identical in data.');
const sepByDataOnly = (redactedEnv.data.email !== emptyEnv.data.email);
const sepByMeta = (redactedEnv.meta.redacted_keys.includes('email') !== emptyEnv.meta.redacted_keys.includes('email'));
assert.equal(sepByDataOnly, false, 'data block CANNOT separate redacted vs empty.');
assert.equal(sepByMeta, true, 'only the leaking meta list separates them -> C1 and C2 mutually exclusive.');
// CLAIM 4 (credit sound part): consent-gate keeps cleartext PII out of the data block
for (const f of PII_FIELDS) if (target.present[f] && target.consent[f] === false)
  assert.notEqual(redactedEnv.data[f], `real-${f}`, `data-min OK: ${f} carries no cleartext PII.`);
// CLAIM 5: redacted-0 == genuine-0 Int collision
const intField = (g, r) => r ? 0 : g;
assert.equal(intField(0,false), intField(999999,true), 'COLLISION: redacted 0 == genuine 0 balance in data block.');
console.log('ALL GREEN — RD-0205 checks:');
console.log('  C1 leak(meta present-withheld identifiable)     WITH meta =', leaksWithMeta, '| NO meta =', leaksWithoutMeta);
console.log('  C2 attacker bits recovered                      WITH meta =', bitsWithMeta.toFixed(4),
            'bits | NO meta =', bitsWithoutMeta.toFixed(4), 'bits  (delta =', (bitsWithMeta-bitsWithoutMeta).toFixed(4), 'bits)');
console.log('  C3 "" redacted vs genuinely-empty separable by data-only? ', sepByDataOnly, '| by meta?', sepByMeta);
console.log('  C4 consent-gate keeps cleartext PII out of data block:      true (sound data-minimization at source)');
console.log('  C5 redacted-0 == genuine-0 Int collision:                   true');
console.log('VERDICT: meta.redacted_keys RE-INTRODUCES the metadata leak it set out to remove; "" is ambiguous -> MIXED.');