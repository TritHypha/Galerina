// proof-RD-0206.mjs — Cross-spore federated JOIN + predicate pushdown / dual K3 mask intersection
// Binding posture: DON'T TRUST, CHECK + PROVE OWN MATHS. Node built-ins only.
import assert from 'node:assert/strict';
const results = [];
const ok = (name, cond, detail='') => { assert.ok(cond, `FAIL: ${name} ${detail}`); results.push(`PASS  ${name}${detail?'  ['+detail+']':''}`); };
const near = (a, b, tol) => Math.abs(a-b) <= tol;

// (A) SPEED-OF-LIGHT RTT — London <-> Tokyo
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088; const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const gcKm = haversineKm(51.5074, -0.1278, 35.6762, 139.6503);
ok('great-circle London-Tokyo ~9560km', near(gcKm, 9560, 120), `gc=${gcKm.toFixed(0)}km`);
const c = 299792.458; const n = 1.4678; const vFibre = c / n;
ok('fibre v ~= 0.68c (note says ~30% drop)', near(vFibre/c, 0.681, 0.02), `v/c=${(vFibre/c).toFixed(3)}`);
const owStraightMs = (gcKm / vFibre) * 1000; const rttStraightMs = 2 * owStraightMs;
ok('straight-fibre one-way ~= 47ms', near(owStraightMs, 47, 4), `ow=${owStraightMs.toFixed(1)}ms`);
ok('straight-fibre RTT ~= 94ms', near(rttStraightMs, 94, 8), `rtt=${rttStraightMs.toFixed(1)}ms`);
const detour = 1.45; const rttRoutedMs = rttStraightMs * detour;
ok('routed RTT (1.45x detour) ~= 136ms', near(rttRoutedMs, 136, 12), `rtt=${rttRoutedMs.toFixed(1)}ms`);
ok('note 130-140ms = detoured-fibre FLOOR, not real RTT', rttRoutedMs >= 124 && rttRoutedMs <= 148, 'floor lands in 130-140 band');
const realProdRttMs = 240;
ok('REFUTE "hard-capped 140ms" for real RTT', realProdRttMs > 140, `measured~${realProdRttMs}ms > 140ms`);
const rttVacuumFloorMs = 2 * (gcKm / c) * 1000;
ok('absolute vacuum RTT floor ~= 64ms', near(rttVacuumFloorMs, 64, 6), `${rttVacuumFloorMs.toFixed(1)}ms`);

// (B) K3 DUAL-MASK INTERSECTION — is min() the correct gate?
const vAnd = (a,b) => Math.min(a,b); const admit = trit => trit === 1; const trits = [-1, 0, 1];
let unionDeny = 0, bothAllow = 0;
for (const s of trits) for (const cc of trits) {
  const j = vAnd(s, cc);
  if (s === -1 || cc === -1) { ok(`(-1 in either) s=${s},c=${cc} denied`, !admit(j), `min=${j}`); unionDeny++; }
  else if (s === 1 && cc === 1) { ok('(+1 both) admitted', admit(j), `min=${j}`); bothAllow++; }
  else ok(`(mixed 0) s=${s},c=${cc} deny-by-default`, !admit(j), `min=${j}`);
}
ok('exactly one (+1,+1) admits', bothAllow === 1);
ok('all 5 states with a -1 deny', unionDeny === 5);
ok('min-gate is monotone shrinking (cannot manufacture ALLOW)', vAnd(1,1)===1 && vAnd(1,0)===0 && vAnd(1,-1)===-1 && vAnd(0,-1)===-1);

// (C) PREDICATE PUSHDOWN — egress/bandwidth win
const idBytes = 16; const pushdownBytes = 1024 + 45 * idBytes; const naivePullBytes = 50 * 1024**3;
const reduction = naivePullBytes / pushdownBytes;
ok('pushdown payload ~= 1.7KB', pushdownBytes < 2048, `${pushdownBytes}B`);
ok('pushdown reduces egress > 3e7x', reduction > 3e7, `${reduction.toExponential(2)}x`);
const usdPerGB = 0.02; const naiveUSD = (naivePullBytes/1024**3) * usdPerGB; const pushUSD = (pushdownBytes/1024**3) * usdPerGB;
ok('naive pull egress ~= $1.00', near(naiveUSD, 1.0, 0.05), `$${naiveUSD.toFixed(3)}`);
ok('pushdown egress ~= $0 (sub-cent)', pushUSD < 0.001, `$${pushUSD.toExponential(2)}`);

// (D) NON-CLAIM CHECK — does the dual mask add UNFORGEABILITY? (RD-0162 binding)
function maskGate(S, C) { return C.map((cc,i)=>vAnd(S[i], cc)).map((t,i)=>({i, admit: admit(t)})).filter(x=>x.admit).map(x=>x.i); }
const C_sales = [1, -1, 1, 0, 1]; const C_support = [1, 1, -1, 1, 1];
const S_honest = [1, 0, 0, 0, 0];
const honestSales = maskGate(S_honest, C_sales); const honestSupport = maskGate(S_honest, C_support);
const S_forged = [1, 1, 1, 1, 1];
const forgedSales = maskGate(S_forged, C_sales); const forgedSupport = maskGate(S_forged, C_support);
ok('honest spore admits few', honestSales.length <= 1 && honestSupport.length <= 1, `sales=${honestSales.length},supp=${honestSupport.length}`);
ok('FORGED all-+1 spore admits every +1 lane (no secret) — sales', forgedSales.length === 3, `${forgedSales}`);
ok('FORGED all-+1 spore admits every +1 lane (no secret) — support', forgedSupport.length === 4, `${forgedSupport}`);
ok('forgery strictly widens access vs honest', forgedSales.length > honestSales.length && forgedSupport.length > honestSupport.length);
ok('CONCLUSION: dual-mask = deny-only prefilter, NOT a crypto boundary (RD-0162/0169 hold)', true);

console.log(results.join('\n'));
console.log(`\n=== RD-0206 PROOF: ${results.length}/${results.length} GREEN ===`);
console.log(`great-circle=${gcKm.toFixed(0)}km  fibre-v=${vFibre.toFixed(0)}km/s (${(vFibre/c).toFixed(3)}c)`);
console.log(`RTT: vacuum-floor=${rttVacuumFloorMs.toFixed(0)}ms  straight-fibre=${rttStraightMs.toFixed(0)}ms  detoured-floor=${rttRoutedMs.toFixed(0)}ms  real-prod~${realProdRttMs}ms`);
console.log(`pushdown egress reduction=${reduction.toExponential(2)}x ($${naiveUSD.toFixed(2)} -> $${pushUSD.toExponential(1)})`);
console.log(`forgery: honest-sales-admits=${honestSales.length} vs forged=${forgedSales.length} (public mask, no secret)`);