// registry-rotation-policy-execution.test.mjs - the self-hosted rotation-policy `.fungi` twin EXECUTES
// (parse -> check -> GIR -> WAT -> WASM -> sign -> #105 admit -> instantiate) and every pure verdict is
// proven EQUAL to the shipped TypeScript verdict functions over a boundary grid.
//
// Nothing here is authoritative: registry-rotation-policy.ts still decides. The twin is NOT build-wired
// (execution switch #143).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "registry-rotation-policy.fungi");

test("registry-rotation-policy twin: build, admit, and match the TypeScript verdicts", async () => {
  assert.ok(existsSync(COMPILER),
    "galerina-core-compiler dist not built - build the compiler before this execution gate");
  const L = await import(pathToFileURL(COMPILER).href);
  const K = await import(pathToFileURL(join(HERE, "..", "dist", "index.js")).href);

  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "registry-rotation-policy.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "registry-rotation-policy", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin assembles: ${JSON.stringify(asm.diagnostics)}`);

  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  const x = instance.exports;
  for (const name of ["rotationLifetimeVerdict", "rotationOverlapVerdict", "rotationSerialVerdict",
    "rotationRoleVerdict", "rotationAlgorithmVerdict", "rotationKeyVerdict", "rotationWindowVerdict"]) {
    assert.equal(typeof x[name], "function", `${name} admitted + exported`);
  }
  const str = (h) => host.readString(h);
  const b = (v) => (v ? 1 : 0);
  const DAY = 86_400_000;
  let cases = 0;
  const same = (label, wasm, ts) => {
    assert.equal(wasm, ts, `${label}: WASM '${wasm}' must equal TS '${ts}'`);
    assert.ok(wasm === "ok" || wasm.startsWith("ERR_REGISTRY_ROTATION_"), `${label}: real token, got '${wasm}'`);
    cases += 1;
  };

  // Lifetime (values beyond 2^31 ms: the twin takes Float because Int is 32-bit).
  for (const max of [DAY, 30 * DAY, 90 * DAY]) {
    for (const life of [-1, 0, 1, max - 1, max, max + 1, 91 * DAY]) {
      same(`lifetime ${life}/${max}`, str(x.rotationLifetimeVerdict(life, max)), K.rotationLifetimeVerdict(life, max));
    }
  }
  // Overlap.
  for (const min of [0, 7 * DAY]) {
    for (const ov of [-DAY, -1, 0, 1, min - 1, min, min + 1, 30 * DAY]) {
      for (const early of [false, true]) {
        same(`overlap ${ov}/${min}/${early}`, str(x.rotationOverlapVerdict(ov, min, b(early))), K.rotationOverlapVerdict(ov, min, early));
      }
    }
  }
  // Serial.
  for (const [s, p] of [[1, 0], [2, 2], [3, 4], [5, 4], [0, 0], [100, 99], [99, 100]]) {
    same(`serial ${s}/${p}`, str(x.rotationSerialVerdict(s, p)), K.rotationSerialVerdict(s, p));
  }
  // Role.
  for (const [n, o] of [[0, 0], [0, 1], [1, 0], [2, 0], [2, 1], [2, 2]]) {
    same(`role ${n}/${o}`, str(x.rotationRoleVerdict(n, o)), K.rotationRoleVerdict(n, o));
  }
  // Algorithm.
  for (const ok of [true, false]) same(`algorithm ${ok}`, str(x.rotationAlgorithmVerdict(b(ok))), K.rotationAlgorithmVerdict(ok));
  // Key: full 2^6 grid.
  for (let m = 0; m < 64; m += 1) {
    const f = [0, 1, 2, 3, 4, 5].map((i) => Boolean(m & (1 << i)));
    same(`key ${m.toString(2)}`, str(x.rotationKeyVerdict(...f.map(b))), K.rotationKeyVerdict(...f));
  }
  // Window: full 2^4 grid.
  for (let m = 0; m < 16; m += 1) {
    const f = [0, 1, 2, 3].map((i) => Boolean(m & (1 << i)));
    same(`window ${m.toString(2)}`, str(x.rotationWindowVerdict(...f.map(b))), K.rotationWindowVerdict(...f));
  }
  assert.ok(cases >= 140, `differential grid size (${cases})`);

  // Only the exact "ok" is success, on both sides; spot-check the named codes.
  assert.equal(str(x.rotationOverlapVerdict(-1, 0, 0)), K.ERR_REGISTRY_ROTATION_GAP);
  assert.equal(str(x.rotationLifetimeVerdict(91 * DAY, 90 * DAY)), K.ERR_REGISTRY_ROTATION_LIFETIME);
  assert.equal(str(x.rotationSerialVerdict(2, 2)), K.ERR_REGISTRY_ROTATION_SERIAL);
});