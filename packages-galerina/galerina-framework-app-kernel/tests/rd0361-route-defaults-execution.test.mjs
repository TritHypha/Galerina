// rd0361-route-defaults-execution.test.mjs — RD-0361 (Packages/kernel): the route-defaults `.fungi` twin
// EXECUTES; the secure-by-default ceilings + relaxation-detection folds are proven EQUAL to
// route-defaults.ts's spec (#195 posture-aware ceilings).
//   R0 build → WASM · R1 sign + #105-admit · R3 differential. String ARGS marshal at the module's own
//   literal handles (task #68) — REQUIRED here because `match` on strings compares interned HANDLES;
//   content outside the module's literal table exercises the default arm, exactly as an in-module
//   unknown string would. isBodySizeRelaxation exercises the flow-to-flow call path in WASM.
// Moves route-defaults shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "route-defaults.fungi");
const B = [false, true];
const bit = (b) => (b ? 1 : 0);

const refMaxBody = (postureOn) => (postureOn ? 65536 : 262144);
const refMaxConcurrent = (postureOn) => (postureOn ? 5 : 10);
const refBodyRelax = (userMax, postureOn) => userMax > refMaxBody(postureOn);
const refFieldRelax = (setting) => setting !== "deny";
const refAuthRelax = (mode) => mode === "public";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const refIdemDefault = (method) => MUTATING.has(method);
const refIdemRelax = (method, enabled) => refIdemDefault(method) && !enabled;

test("RD-0361 Packages · route-defaults: R0 build → R1 #105-admit → R3 differential ≡ secure-default spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "route-defaults.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "route-defaults", prog.ast, true));
  // #64/#68: per-module intern table → decode + marshal-at-literal-handle.
  const internTable = new Map(L.getInternedStrings().map((e) => [e.handle, e.value]));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const marshal = (s) => { for (const [h, v] of internTable) { if (v === s) return h; } return host.internString(s); };
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  for (const f of ["secureMaxBodyBytes", "secureMaxConcurrent", "isBodySizeRelaxation", "isFieldPolicyRelaxation", "isAuthRelaxation", "idempotentByDefault", "isIdempotencyRelaxation"])
    assert.equal(typeof X[f], "function", `${f} admitted (R1)`);

  for (const p of B) {
    assert.equal(X.secureMaxBodyBytes(bit(p)), refMaxBody(p), `secureMaxBodyBytes(${p})`);
    assert.equal(X.secureMaxConcurrent(bit(p)), refMaxConcurrent(p), `secureMaxConcurrent(${p})`);
  }
  // boundary-dense around both ceilings; exercises the internal flow-to-flow call in WASM.
  for (const p of B) for (const n of [-1, 0, 1, 65535, 65536, 65537, 262143, 262144, 262145]) {
    assert.equal(X.isBodySizeRelaxation(n, bit(p)), bit(refBodyRelax(n, p)), `isBodySizeRelaxation(${n},${p})`);
  }
  for (const s of ["deny", "allow", "warn", ""]) {
    assert.equal(X.isFieldPolicyRelaxation(marshal(s)), bit(refFieldRelax(s)), `isFieldPolicyRelaxation(${JSON.stringify(s)})`);
  }
  for (const m of ["public", "required", ""]) {
    assert.equal(X.isAuthRelaxation(marshal(m)), bit(refAuthRelax(m)), `isAuthRelaxation(${JSON.stringify(m)})`);
  }
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "GET", "HEAD", "OPTIONS"]) {
    assert.equal(X.idempotentByDefault(marshal(m)), bit(refIdemDefault(m)), `idempotentByDefault(${m})`);
    for (const en of B) {
      assert.equal(X.isIdempotencyRelaxation(marshal(m), bit(en)), bit(refIdemRelax(m, en)), `isIdempotencyRelaxation(${m},${en})`);
    }
  }
});
