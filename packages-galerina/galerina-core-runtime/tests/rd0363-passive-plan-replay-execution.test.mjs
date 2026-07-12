// rd0363-passive-plan-replay-execution.test.mjs — RD-0363: the passive-plan replay-admission twin EXECUTES.
//
// The governed replay-admission decision (RD-0363 §2) is authored in `.fungi` (no `.ts` decision logic). This
// keep-green gate proves it end-to-end: R0 build → R1 sign + #105-admit → execute → the WASM verdict EQUALS the
// RD-0363 §2 deny-by-default spec fold. It is a NEW governed surface (replay does not exist in `.ts`), so the
// reference is the spec itself, not a `.ts` twin. Compiler imported relatively (built earlier in suite order).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "passive-plan-replay-admission.fungi");

// RD-0363 §2 spec: deny-by-default AND — ALLOW (+1) iff every check holds, else DENY (-1).
const specReplay = (s) =>
  (s.signedOk && s.hashMatch && s.capabilityCurrent && s.fresh && s.targetBound && s.stepContained && s.qualifierCoherent) ? 1 : -1;

test("RD-0363 · passive-plan replay-admission: R0 build → R1 #105-admit → verdict ≡ §2 spec", async () => {
  assert.ok(existsSync(COMPILER), "galerina-core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);

  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "passive-plan-replay-admission.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin checks clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const asm = await L.assembleWAT(L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "plan-admit", prog.ast, true)));
  assert.ok(asm.valid && asm.diagnostics.length === 0, `assembles to WASM (R0): ${JSON.stringify(asm.diagnostics)}`);

  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  const f = instance.exports.planReplayVerdict;
  assert.equal(typeof f, "function", "planReplayVerdict admitted + exported (R1)");

  const B = (b) => (b ? 1 : 0);
  const keys = ["signedOk", "hashMatch", "capabilityCurrent", "fresh", "targetBound", "stepContained", "qualifierCoherent"];
  const allTrue = Object.fromEntries(keys.map((k) => [k, true]));
  const cases = [allTrue, ...keys.map((k) => ({ ...allTrue, [k]: false }))]; // all-pass + each single deny-by-default failure
  let agree = 0;
  for (const c of cases) {
    const w = f(B(c.signedOk), B(c.hashMatch), B(c.capabilityCurrent), B(c.fresh), B(c.targetBound), B(c.stepContained), B(c.qualifierCoherent));
    assert.equal(w, specReplay(c), `planReplayVerdict(${JSON.stringify(c)}) must equal §2 spec`);
    agree++;
  }
  assert.equal(agree, cases.length, "every deny-by-default case checked");

  // The load-bearing rule (PV2): possessing a plan is NOT authority — an approved-then-revoked capability DENIES.
  assert.equal(f(1, 1, 1, 1, 1, 1, 1), 1, "all checks pass → ALLOW");
  assert.equal(f(1, 1, 0, 1, 1, 1, 1), -1, "capability no longer current → DENY (an old plan cannot escalate)");
});
