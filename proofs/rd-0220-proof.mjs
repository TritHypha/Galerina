import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const DENY = -1, INDET = 0, ALLOW = 1;               // Kleene K3 lattice
const vAnd = (...xs) => Math.min(...xs);             // K3 AND = min (downgrade-only)

// ---- (A) K3 -> HTTP status, fail-closed. The ONLY sound mapping. ----
function k3ToHttp(verdict) {
  switch (verdict) {
    case ALLOW: return { status: 200, dataFlows: true,  action: 'serve'   };
    case DENY:  return { status: 403, dataFlows: false, action: 'refuse'  };
    case INDET: return { status: 428, dataFlows: false, action: 'step-up' }; // or 401
    default: throw new Error('non-K3 verdict');
  }
}
assert.equal(k3ToHttp(ALLOW).status, 200);
assert.equal(k3ToHttp(DENY).status, 403);
assert.equal(k3ToHttp(INDET).status, 428);
assert.equal(k3ToHttp(INDET).dataFlows, false,
  'INDET must NOT serve data — step-up is a recover path, not an allow');
assert.equal(vAnd(ALLOW, INDET, ALLOW), INDET);
assert.equal(vAnd(ALLOW, DENY,  ALLOW), DENY);
assert.equal(k3ToHttp(vAnd(ALLOW, INDET, ALLOW)).dataFlows, false);

// ---- (B) Webhook: verify signature BEFORE trust. ----
const KP = crypto.generateKeyPairSync('ed25519');
function admitWebhook(payload, sig, pubkey) {
  if (sig == null) return INDET;
  const ok = crypto.verify(null, Buffer.from(payload), pubkey, Buffer.from(sig, 'hex'));
  return ok ? ALLOW : DENY;
}
const good = 'order.created:42';
const sig  = crypto.sign(null, Buffer.from(good), KP.privateKey).toString('hex');
assert.equal(k3ToHttp(admitWebhook(good, sig, KP.publicKey)).status, 200);
assert.equal(k3ToHttp(admitWebhook(good, null, KP.publicKey)).status, 428);
assert.equal(k3ToHttp(admitWebhook('evil.payload', sig, KP.publicKey)).status, 403);

// ---- (B') LANDMINE: "serve partial/UNVERIFIED data to render ghost states" ----
function serveUnverifiedOnIndet(payload, sig, pubkey) {
  const v = admitWebhook(payload, sig, pubkey);
  if (v === ALLOW) return { rendered: payload, trusted: true };
  if (v === DENY)  return null;
  return { rendered: payload, trusted: false };         // UNVERIFIED BYTES REACH CLIENT
}
const attacker = 'balance:£1,000,000';
const ghost = serveUnverifiedOnIndet(attacker, null, KP.publicKey);
assert.equal(ghost.rendered, attacker);
assert.equal(ghost.trusted, false);
const correctAdmit = (v) => (v === ALLOW);
assert.equal(correctAdmit(INDET), false,
  'INDET must render NOTHING data-bearing — skeleton is UI-only, never server bytes');
assert.equal(correctAdmit(admitWebhook(attacker, null, KP.publicKey)), false);

// ---- Summary counts (the quantitative claim) ----
const cases = [ALLOW, DENY, INDET];
const soundServes = cases.filter(v => k3ToHttp(v).dataFlows).length;   // 1 (ALLOW only)
const naiveServes = cases.filter(v => v !== DENY).length;              // 2 (ALLOW+INDET)
assert.equal(soundServes, 1);
assert.equal(naiveServes, 2);
assert.equal(naiveServes - soundServes, 1);

console.log('RD-0220 proof');
console.log('  (A) K3->HTTP sound map:  ALLOW->200 serve, DENY->403 refuse, INDET->428 step-up NO-DATA');
console.log('  (A) min-annihilator:     vAnd(+1,0,+1)=0 -> boundary dataFlows =', k3ToHttp(vAnd(ALLOW,INDET,ALLOW)).dataFlows);
console.log('  (B) webhook verify:      real->200, blind->428, forged-body->403 (trust keyed on signature)');
console.log('  (B\') LANDMINE forgery:   unverified attacker bytes rendered on INDET =', JSON.stringify(ghost));
console.log('  fail-open delta:         sound serves', soundServes, 'of 3; note lane serves', naiveServes, 'of 3; leaked verdict-classes =', naiveServes-soundServes);
console.log('ALL ASSERTIONS PASSED');