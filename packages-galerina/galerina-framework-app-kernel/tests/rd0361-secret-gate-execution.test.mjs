// rd0361-secret-gate-execution.test.mjs — RD-0361 (secret-gate tranche) × RD-0389 (record-marshalling
// ABI, ARG direction): the self-hosted secret-gate `.fungi` twin EXECUTES over a REAL Array<SecretPresence>
// argument, and its fail-closed admit verdict is proven EQUAL to the shipped createSecretGate().admit().
//
// This is the twin RD-0361 could not execute before: it takes an actual `Array<SecretPresence>` (records),
// not the flattened primitive evidence the other twins use. RD-0389 supplies the missing piece — the host
// marshals the record array across the boundary (allocRecord stages each {name,status} record in the module's
// own exported linear memory; internArray builds the array of ptrs) — the ARG-direction mirror of the
// readRecordField/readArray path the P9 tokenize twin already uses to READ records back.
//
//   R0  secret-gate.fungi `galerina build`s to a real, signable WASM (buildable now — no P9, no DSS.wasm).
//   R1  that WASM is signed + admitted through the attestation-first #105 gate (requireSigned) + instantiated.
//   R3  FAIL-CLOSED DIFFERENTIAL: admitSecrets(providerPresent, Array<SecretPresence>) EQUALS the REAL
//       createSecretGate(provider).admit(names) over a {providerPresent × per-secret status × count} grid.
//
// Nothing here is authoritative: the `.ts` still decides at gate 9.5. The R4 authority flip is owner-gated (#143).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "..", "galerina-core-compiler", "dist", "index.js");
const TWIN = join(HERE, "..", "src", "self-hosted", "secret-gate.fungi");

// The REAL .ts provider seam, driven by a per-secret status. `has` is false for absent/faulted and THROWS
// for "error" (a disposed backing store) — exactly the three not-admitted cases createSecretGate.admit folds.
function makeProvider(statusByName) {
  return {
    has(name) {
      const s = statusByName.get(name);
      if (s === "error") throw new Error("backing store disposed");
      return s === "present";
    },
    use(name, fn) {
      const s = statusByName.get(name);
      return s === "present" ? fn(new Uint8Array([1, 2, 3])) : undefined;
    },
  };
}

// The REAL verdict, normalised to the twin's token vocabulary ("admit" for the .ts `null`).
function tsVerdict(createSecretGate, providerPresent, secrets) {
  const statusByName = new Map(secrets.map((s) => [s.name, s.status]));
  const gate = createSecretGate(providerPresent ? makeProvider(statusByName) : undefined);
  const v = gate.admit(secrets.map((s) => s.name));
  return v === null ? "admit" : v;
}

test("RD-0361 secret-gate × RD-0389: R0 build → R1 #105-admit → R3 WASM ≡ real createSecretGate().admit()", async () => {
  assert.ok(existsSync(COMPILER),
    "galerina-core-compiler dist not built — run the full suite (or build the compiler) before this execution-cutover gate");
  const L = await import(pathToFileURL(COMPILER).href);
  const { createSecretGate } = await import(pathToFileURL(join(HERE, "..", "dist", "index.js")).href);
  assert.equal(typeof createSecretGate, "function", "real createSecretGate must be exported for the differential");

  // ── R0 · the twin builds to a WASM that wabt-assembles ──
  let src = readFileSync(TWIN, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, "secret-gate.fungi");
  assert.equal((prog.diagnostics ?? []).filter((d) => d.severity === "error").length, 0, "twin parses clean (R0)");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "secret-gate", prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `twin WAT assembles to WASM (R0): ${JSON.stringify(asm.diagnostics)}`);

  // ── R1 · sign + admit through the attestation-first #105 gate, then instantiate (binds memory) ──
  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value); // return handles + the "present" literal resolve
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  assert.equal(typeof instance.exports.admitSecrets, "function", "admitSecrets admitted + exported (R1)");

  // The twin verdict: MARSHAL a real Array<SecretPresence> across the boundary (RD-0389, ARG direction).
  const twinVerdict = (providerPresent, secrets) => {
    const recPtrs = secrets.map((s) => host.allocRecord([host.internString(s.name), host.internString(s.status)]));
    const arrH = host.internArray(recPtrs);
    return host.readString(instance.exports.admitSecrets(providerPresent ? 1 : 0, arrH));
  };

  // ── R3 · fail-closed differential over the {providerPresent × status × count} grid ──
  const S = (name, status) => ({ name, status });
  const scenarios = [
    { desc: "no provider · nothing required → admit (the non-breaking no-op)", pp: false, secrets: [] },
    { desc: "no provider · 1 required → refuse", pp: false, secrets: [S("db", "present")] },
    { desc: "no provider · 3 required → refuse", pp: false, secrets: [S("a", "present"), S("b", "present"), S("c", "present")] },
    { desc: "provider · nothing required → admit", pp: true, secrets: [] },
    { desc: "provider · 1 present → admit", pp: true, secrets: [S("db", "present")] },
    { desc: "provider · 1 absent → refuse", pp: true, secrets: [S("db", "absent")] },
    { desc: "provider · 1 faulted → refuse", pp: true, secrets: [S("db", "faulted")] },
    { desc: "provider · 1 error (has() threw) → refuse", pp: true, secrets: [S("db", "error")] },
    { desc: "provider · 2 present → admit", pp: true, secrets: [S("a", "present"), S("b", "present")] },
    { desc: "provider · [present, absent] → refuse", pp: true, secrets: [S("a", "present"), S("b", "absent")] },
    { desc: "provider · [absent, present] → refuse (first not-present)", pp: true, secrets: [S("a", "absent"), S("b", "present")] },
    { desc: "provider · 3 present → admit", pp: true, secrets: [S("a", "present"), S("b", "present"), S("c", "present")] },
    { desc: "provider · [present, error] → refuse", pp: true, secrets: [S("a", "present"), S("b", "error")] },
    { desc: "provider · [present, faulted, present] → refuse", pp: true, secrets: [S("a", "present"), S("b", "faulted"), S("c", "present")] },
  ];

  let agree = 0, admits = 0, refuses = 0;
  for (const sc of scenarios) {
    const w = twinVerdict(sc.pp, sc.secrets);
    const t = tsVerdict(createSecretGate, sc.pp, sc.secrets);
    assert.equal(w, t, `${sc.desc}: WASM admitSecrets='${w}' must equal real admit()='${t}'`);
    // Label-verify the ACTUAL token (not just agreement) so a both-wrong token can't false-green (#64 lesson).
    assert.ok(w === "admit" || w === "secret_unavailable", `${sc.desc}: verdict is a real token, got '${w}'`);
    if (t === "admit") admits++; else refuses++;
    agree++;
  }
  assert.equal(agree, scenarios.length, "every differential case checked");
  assert.ok(admits >= 4 && refuses >= 8, `grid exercises BOTH verdicts (admit=${admits}, refuse=${refuses})`);

  // The two admit boundaries, called out explicitly on BOTH sides.
  assert.equal(twinVerdict(true, [S("db", "present")]), "admit", "WASM: every required secret present admits");
  assert.equal(tsVerdict(createSecretGate, true, [S("db", "present")]), "admit", "real .ts: every required secret present admits");
  assert.equal(twinVerdict(true, [S("db", "absent")]), "secret_unavailable", "WASM: a missing required secret refuses");
  assert.equal(tsVerdict(createSecretGate, true, [S("db", "absent")]), "secret_unavailable", "real .ts: a missing required secret refuses");
});
