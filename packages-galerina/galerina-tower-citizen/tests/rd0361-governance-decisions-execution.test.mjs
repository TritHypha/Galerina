// rd0361-governance-decisions-execution.test.mjs — RD-0361 (governance core): the governance-decisions
// `.fungi` twin EXECUTES; its K3 quorum + TTL-lease folds are proven EQUAL to spec (balanced-trit verdicts).
//   R0 build → WASM · R1 sign + #105-admit · R3 exhaustive Int-fold differential (label-safe: verdicts are trits).
// Moves governance-decisions shadow → differential; extends twin coverage from the app-kernel to tower-citizen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "governance-decisions.fungi");
const B = [false, true];
const bit = (b) => (b ? 1 : 0);
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);

const refQuorum = (approvals, m, malformed) => (malformed ? 0 : approvals >= m ? 1 : -1);
const refLease = (wf, nf, now, notAfter) => (!wf ? 0 : !nf ? 0 : now < notAfter ? 1 : -1);

test("RD-0361 tower-citizen · governance-decisions: R0 build → R1 #105-admit → R3 WASM ≡ K3 quorum + lease spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "governance-decisions.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "governance-decisions", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["quorumVerdict", "leaseVerdict"]) assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  for (const ap of range(0, 5)) for (const m of range(0, 5)) for (const mal of B) {
    const w = X.quorumVerdict(ap, m, bit(mal));
    assert.equal(w, refQuorum(ap, m, mal), `quorumVerdict(${ap},${m},${mal})`);
    assert.ok(w === -1 || w === 0 || w === 1, "verdict is a K3 trit");
  }
  for (const wf of B) for (const nf of B) for (const now of range(0, 3)) for (const na of range(0, 3)) {
    const w = X.leaseVerdict(bit(wf), bit(nf), now, na);
    assert.equal(w, refLease(wf, nf, now, na), `leaseVerdict(${wf},${nf},${now},${na})`);
    assert.ok(w === -1 || w === 0 || w === 1, "verdict is a K3 trit");
  }
});
