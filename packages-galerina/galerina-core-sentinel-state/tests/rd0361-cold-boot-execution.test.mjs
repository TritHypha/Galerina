// rd0361-cold-boot-execution.test.mjs — RD-0361 (sentinel-state): the cold-boot `.fungi` twin EXECUTES;
// its restore fold is proven EQUAL to ColdBootOrchestrator.restore()'s spec (the only governed decision —
// serializer/writer/scrub are host floor).
//   R0 build → WASM · R1 sign + #105-admit · R3 exhaustive Int-fold differential (label-safe: trit verdict).
// Moves cold-boot shadow → differential. R4 authority = #143.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "cold-boot.fungi");
const B = [false, true];
const bit = (b) => (b ? 1 : 0);

// LSS-NOSNAP-001 (absent) / LSS-INTEGRITY-001 (tampered) both fold to DENY; the code split is host-side.
const refRestore = (present, integrity) => (!present ? -1 : !integrity ? -1 : 1);

test("RD-0361 sentinel-state · cold-boot: R0 build → R1 #105-admit → R3 WASM ≡ restore spec", async () => {
  assert.ok(existsSync(COMPILER), "core-compiler dist not built — run the full suite first");
  const L = await import(pathToFileURL(COMPILER).href);
  let src = readFileSync(TWIN, "utf8"); if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "cold-boot.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "cold-boot", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles (R0): ${JSON.stringify(asm.diagnostics)}`);
  const host = L.createHostRuntime();
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
  const X = instance.exports;
  assert.equal(typeof X.restoreVerdict, "function", "restoreVerdict admitted (R1)");

  for (const present of B) for (const integrity of B) {
    const w = X.restoreVerdict(bit(present), bit(integrity));
    assert.equal(w, refRestore(present, integrity), `restoreVerdict(${present},${integrity})`);
    assert.ok(w === 1 || w === -1, "verdict is a trit ALLOW/DENY");
  }
});
