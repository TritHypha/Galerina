// K3-UNKNOWN-NOT-ZERO U2 red tests (Galerina Verdict source). Phillip 2026-10-25 13:15 GMT: trit 0 is never
// UNKNOWN / Indeterminate. UNKNOWN gets its own typed sentinel with a fail-closed default; NEUTRAL (0) stays a
// computed trit. Written FIRST (red on base a26c07044); the fix lands in the next commit on this branch.
// Zero-trust choices pinned here (rejected options recorded in the unit plan K3U2-redtest-plan):
//  - UNKNOWN is INFECTIOUS (weak Kleene): any UNKNOWN operand of vAnd / vOr / vNot yields UNKNOWN, so an
//    undecided clause can never be ignored by an OR (rejected: strong Kleene vOr(UNKNOWN, ALLOW) = ALLOW).
//  - NEUTRAL (0) collapses to deny at the boundary with NO 3VL diagnostic; UNKNOWN collapses to deny WITH
//    FUNGI-GOV-3VL-001 (the existing code; no new code minted).
//  - The TS sentinel is a frozen non-number object, never coercible to a trit; forged copies are refused.
//  - The native .fungi sentinel is a named flow k3Unknown() returning an Int outside {-1,0,1} and below DENY,
//    so any ordering misuse (> 0, >= 1, max-fold) still reads it as not-allow (rejected: +106, which a
//    `> 0` consumer would authorize).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..", "..", "..");
const TC = join(REPO, "packages-ts", "galerina-tower-citizen");
const G = await import(pathToFileURL(join(TC, "dist", "index.js")).href);
const COMPILER = join(REPO, "packages-ts", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(TC, "src", "self-hosted", "governance-decisions.fungi");
const U = G.K3_UNKNOWN;
const DENY = -1, NEUTRAL = 0, ALLOW = 1;
const TRITS = [DENY, NEUTRAL, ALLOW];
const JUNK = [Number.NaN, 2, -2, 0.5, "1", "0", null, undefined, {}, [], true, false];

function sentinelPresent() {
  assert.notEqual(U, undefined, "K3_UNKNOWN sentinel is exported");
  assert.notEqual(typeof U, "number", "K3_UNKNOWN is not a number");
  assert.ok(Object.isFrozen(U), "K3_UNKNOWN is frozen");
}
function isUnknown(v) { return v === U; }
function refusesOrDenies(fn) {
  try { return fn() !== true; } catch { return true; }
}

test("K3U-R1 empty allOf / anyOf are K3_UNKNOWN, never 0", () => {
  sentinelPresent();
  assert.ok(isUnknown(G.allOf([])), "allOf([]) is UNKNOWN");
  assert.ok(isUnknown(G.anyOf([])), "anyOf([]) is UNKNOWN");
  assert.notEqual(G.allOf([]), 0); assert.notEqual(G.anyOf([]), 0);
  assert.ok(U !== 0 && U != 0, "sentinel is neither === nor == 0");
  assert.equal(G.allOf([ALLOW]), ALLOW); assert.equal(G.anyOf([DENY]), DENY);
  assert.equal(G.allOf([NEUTRAL]), NEUTRAL, "a computed 0 stays NEUTRAL");
});

test("K3U-R2 consensus split and empty are UNKNOWN; unanimous 0 is NEUTRAL", () => {
  sentinelPresent();
  assert.ok(isUnknown(G.consensusTritN([ALLOW, DENY])), "split tie is UNKNOWN");
  assert.ok(isUnknown(G.consensusTritN([])), "empty is UNKNOWN");
  assert.ok(isUnknown(G.consensusTritN([ALLOW, DENY, NEUTRAL])), "split with a neutral is UNKNOWN");
  assert.equal(G.consensusTritN([NEUTRAL, NEUTRAL]), NEUTRAL, "unanimous neutral is NEUTRAL");
  assert.equal(G.consensusTritN([ALLOW, ALLOW, DENY]), ALLOW);
  assert.equal(G.consensusTritN([DENY, DENY, ALLOW]), DENY);
  assert.ok(isUnknown(G.consensusTritN([ALLOW, U])), "an UNKNOWN vote is infectious");
  assert.throws(() => G.consensusTritN([2]), "non-trit vote is a hard refusal");
});

test("K3U-R3 vAnd / vOr / vNot over {-1,0,+1,UNKNOWN}: K3 on trits, UNKNOWN infectious, never ALLOW", () => {
  sentinelPresent();
  const AND = { "-1,-1": -1, "-1,0": -1, "-1,1": -1, "0,-1": -1, "0,0": 0, "0,1": 0, "1,-1": -1, "1,0": 0, "1,1": 1 };
  const OR = { "-1,-1": -1, "-1,0": 0, "-1,1": 1, "0,-1": 0, "0,0": 0, "0,1": 1, "1,-1": 1, "1,0": 1, "1,1": 1 };
  for (const a of TRITS) for (const b of TRITS) {
    assert.equal(G.vAnd(a, b), AND[a + "," + b], "vAnd " + a + "," + b);
    assert.equal(G.vOr(a, b), OR[a + "," + b], "vOr " + a + "," + b);
  }
  for (const x of [...TRITS, U]) {
    assert.ok(isUnknown(G.vAnd(U, x)) && isUnknown(G.vAnd(x, U)), "vAnd UNKNOWN with " + String(x));
    assert.ok(isUnknown(G.vOr(U, x)) && isUnknown(G.vOr(x, U)), "vOr UNKNOWN with " + String(x));
  }
  assert.ok(isUnknown(G.vNot(U)), "vNot UNKNOWN is UNKNOWN");
  assert.equal(G.vNot(NEUTRAL), NEUTRAL); assert.equal(G.vNot(ALLOW), DENY); assert.equal(G.vNot(DENY), ALLOW);
  assert.ok(isUnknown(G.allOf([ALLOW, U])) && isUnknown(G.anyOf([ALLOW, U])), "folds keep UNKNOWN");
  for (const j of JUNK) {
    assert.throws(() => G.vAnd(j, ALLOW), "vAnd junk " + String(j));
    assert.throws(() => G.vOr(ALLOW, j), "vOr junk " + String(j));
    assert.throws(() => G.vNot(j), "vNot junk " + String(j));
  }
});

test("K3U-R4 boundary: UNKNOWN denies with FUNGI-GOV-3VL-001; NEUTRAL denies with no 3VL diagnostic", () => {
  sentinelPresent();
  const seen = [];
  const du = G.decideAtBoundary(U, (d) => seen.push(d.code));
  assert.equal(du.decision, "deny"); assert.equal(du.authorized, false);
  assert.equal(du.diagnostic.kind, "PRESENT"); assert.equal(du.diagnostic.code, "FUNGI-GOV-3VL-001");
  assert.deepEqual(seen, ["FUNGI-GOV-3VL-001"]);
  const seen0 = [];
  const dn = G.decideAtBoundary(NEUTRAL, (d) => seen0.push(d.code));
  assert.equal(dn.decision, "deny"); assert.equal(dn.authorized, false);
  assert.equal(dn.diagnostic.kind, "NONE", "0 is not UNKNOWN, so no 3VL diagnostic"); assert.deepEqual(seen0, []);
  assert.equal(G.decideAtBoundary(ALLOW).decision, "allow");
  assert.equal(G.decideAtBoundary(DENY).diagnostic.kind, "NONE");
  assert.equal(G.collapse(U), "deny"); assert.equal(G.collapse(NEUTRAL), "deny");
});

test("K3U-R5 authorize is true ONLY for ALLOW; UNKNOWN, NEUTRAL, DENY and junk are false or refused", () => {
  sentinelPresent();
  assert.equal(G.authorize(ALLOW), true);
  for (const v of [U, NEUTRAL, DENY, ...JUNK]) assert.ok(refusesOrDenies(() => G.authorize(v)), "authorize " + String(v));
  for (const v of [U, NEUTRAL, DENY, ...JUNK]) assert.ok(refusesOrDenies(() => G.decideAtBoundary(v).authorized), "boundary " + String(v));
});

test("K3U-R6 confidence-vector garbage and ambiguity are UNKNOWN, not 0", () => {
  sentinelPresent();
  const bad = [
    { pDeny: Number.NaN, pUnknown: 0, pAllow: 1 }, { pDeny: -0.1, pUnknown: 0.1, pAllow: 1 },
    { pDeny: 0, pUnknown: 0, pAllow: 1.5 }, { pDeny: 0.2, pUnknown: 0.2, pAllow: 0.2 },
    { pDeny: 0.4, pUnknown: 0.2, pAllow: 0.4 }, { pDeny: 0.1, pUnknown: 0.8, pAllow: 0.1 },
  ];
  for (const p of bad) assert.ok(isUnknown(G.collapseConfidence(p)), "collapseConfidence " + JSON.stringify(p));
  assert.equal(G.collapseConfidence({ pDeny: 0.1, pUnknown: 0.1, pAllow: 0.8 }), ALLOW);
  assert.equal(G.collapseConfidence({ pDeny: 0.8, pUnknown: 0.1, pAllow: 0.1 }), DENY);
});

test("K3U-R7 native governance-decisions.fungi: malformed quorum / lease return k3Unknown(), never 0", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist built");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "governance-decisions.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const asm = await L.assembleWAT(L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "governance-decisions", prog.ast, true)));
  assert.ok(asm.valid, "twin WAT assembles");
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host: L.createHostRuntime() });
  const X = instance.exports;
  assert.equal(typeof X.k3Unknown, "function", "native k3Unknown() sentinel flow exported");
  const UN = X.k3Unknown();
  assert.ok(!TRITS.includes(UN) && UN < DENY, "native UNKNOWN is outside {-1,0,1} and below DENY: " + UN);
  for (const ap of [0, 1, 3, 5]) for (const m of [0, 1, 3]) assert.equal(X.quorumVerdict(ap, m, 1), UN, "malformed quorum " + ap + "/" + m);
  for (const now of [0, 2]) for (const na of [0, 2]) {
    assert.equal(X.leaseVerdict(0, 1, now, na), UN, "malformed lease");
    assert.equal(X.leaseVerdict(1, 0, now, na), UN, "non-finite clock");
    assert.equal(X.leaseVerdict(1, 1, now, na), now < na ? ALLOW : DENY, "clean lease");
  }
  assert.equal(X.quorumVerdict(3, 3, 0), ALLOW); assert.equal(X.quorumVerdict(2, 3, 0), DENY);
  assert.ok(!/return 0\b/.test(src), "governance-decisions.fungi never returns 0 for an undecided case");
});

test("K3U-R8 the sentinel cannot be forged or coerced", () => {
  sentinelPresent();
  let n; try { n = Number(U); } catch { n = Number.NaN; }
  assert.ok(!TRITS.includes(n), "Number(K3_UNKNOWN) is not a trit");
  const forged = [JSON.parse(JSON.stringify({ v: U })).v, { ...U }, Object.freeze({ ...U }), String(U)];
  for (const f of forged) {
    assert.throws(() => G.asVerdict(f), "asVerdict refuses forged " + JSON.stringify(f));
    assert.throws(() => G.vAnd(f, ALLOW), "vAnd refuses forged");
    assert.ok(refusesOrDenies(() => G.authorize(f)), "authorize refuses forged");
    assert.notEqual(G.allOf([ALLOW]), f);
  }
  assert.throws(() => G.asVerdict(U), "asVerdict mints trits only; the sentinel is not minted from a number");
  assert.equal(G.asVerdict(0), NEUTRAL, "asVerdict(0) is NEUTRAL, never UNKNOWN");
});

test("K3U-R9 no new diagnostic code: UNKNOWN reuses FUNGI-GOV-3VL-001 and the native twin checks clean", () => {
  sentinelPresent();
  assert.equal(G.GOV_3VL_DIAGNOSTIC, "FUNGI-GOV-3VL-001");
  const tsSrc = readFileSync(join(TC, "src", "three-valued-governance.ts"), "utf8");
  const codes = new Set(tsSrc.match(/FUNGI-GOV-[A-Z0-9-]+/g) ?? []);
  assert.deepEqual([...codes], ["FUNGI-GOV-3VL-001"], "only the existing 3VL code is referenced");
  assert.ok(!/INDETERMINATE:\s*0/.test(tsSrc), "Verdict no longer maps INDETERMINATE to 0");
  const r = spawnSync(process.execPath, [join(REPO, "galerina.mjs"), "check", TWIN], { encoding: "utf8", cwd: REPO });
  assert.equal(r.status, 0, "galerina check governance-decisions.fungi: " + (r.stdout || "") + (r.stderr || ""));
});