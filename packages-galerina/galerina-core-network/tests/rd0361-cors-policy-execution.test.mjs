// rd0361-cors-policy-execution.test.mjs — RD-0361 (TLSTP): the cors-policy `.fungi` twin EXECUTES, and its
// deny-by-default CORS admission fold is proven EQUAL to the exact ordered spec of cors-policy.ts.
//   R0 build → WASM · R1 sign + #105-admit + instantiate · R3 exhaustive differential (256 combos).
// Moves cors-policy shadow → differential (RD-0361). Nothing authoritative: the `.ts` still decides; R4 = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "cors-policy.fungi");
const bit = (b) => (b ? 1 : 0);

// The exact deny-by-default CORS fold from cors-policy.fungi (first failure denies).
const refCors = (o, nullO, wild, creds, exact, pre, pm, ph) => {
  if (!o) return 1;                    // no Origin → not cross-origin, pass
  if (nullO) return -1;                // null Origin → DENY
  if (wild && creds) return -1;        // wildcard + credentials → DENY
  if (!exact && !wild) return -1;      // not exact and not wildcard → DENY (no reflection)
  if (pre) { if (!pm) return -1; if (!ph) return -1; } // preflight method/headers must be allowed
  return 1;
};

test("RD-0361 · cors-policy: R0 build → R1 #105-admit → R3 WASM ≡ deny-by-default CORS spec (256 combos)", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);

  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "cors-policy.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "cors-policy", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);

  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["admit", "deny", "corsVerdict"]) assert.equal(typeof X[f], "function", `${f} admitted + exported (R1)`);

  assert.equal(X.admit(), 1, "admit() = +1");
  assert.equal(X.deny(), -1, "deny() = -1 (deny-by-default)");
  for (let n = 0; n < 256; n++) {
    const b = (i) => ((n >> i) & 1) === 1;
    const [o, nullO, wild, creds, exact, pre, pm, ph] = [b(0), b(1), b(2), b(3), b(4), b(5), b(6), b(7)];
    assert.equal(
      X.corsVerdict(bit(o), bit(nullO), bit(wild), bit(creds), bit(exact), bit(pre), bit(pm), bit(ph)),
      refCors(o, nullO, wild, creds, exact, pre, pm, ph),
      `corsVerdict n=${n}`);
  }
});
