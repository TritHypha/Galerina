// rd0361-inbound-guard-execution.test.mjs — RD-0361 (TLSTP): the inbound-guard `.fungi` twin EXECUTES, and its
// deny-by-default inbound-admission + fail-closed rate-limit folds are proven EQUAL to the exact spec of
// inbound-guard.ts. R0 build → WASM · R1 sign + #105-admit + instantiate · R3 exhaustive differential.
// Moves inbound-guard shadow → differential (RD-0361). Nothing authoritative: the `.ts` still decides; R4 = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "inbound-guard.fungi");
const BOOLS = [false, true];
const bit = (b) => (b ? 1 : 0);

// Exact folds from inbound-guard.fungi.
const refInbound = (port, denyMatch, allowMatch, defAllow) =>
  (!port ? -1 : denyMatch ? -1 : allowMatch ? 1 : defAllow ? 1 : -1);
const refRate = (parseable, expired, below) =>
  (!parseable ? -1 : expired ? 1 : below ? 1 : -1);

test("RD-0361 · inbound-guard: R0 build → R1 #105-admit → R3 WASM ≡ inbound-admission + rate-limit spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);

  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "inbound-guard.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "inbound-guard", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);

  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["admit", "deny", "inboundVerdict", "rateLimitVerdict"]) assert.equal(typeof X[f], "function", `${f} admitted + exported (R1)`);

  assert.equal(X.admit(), 1, "admit() = +1");
  assert.equal(X.deny(), -1, "deny() = -1 (deny-by-default)");
  for (const port of BOOLS) for (const dm of BOOLS) for (const am of BOOLS) for (const da of BOOLS)
    assert.equal(X.inboundVerdict(bit(port), bit(dm), bit(am), bit(da)), refInbound(port, dm, am, da), `inboundVerdict(${port},${dm},${am},${da})`);
  for (const p of BOOLS) for (const e of BOOLS) for (const bl of BOOLS)
    assert.equal(X.rateLimitVerdict(bit(p), bit(e), bit(bl)), refRate(p, e, bl), `rateLimitVerdict(${p},${e},${bl})`);
});
