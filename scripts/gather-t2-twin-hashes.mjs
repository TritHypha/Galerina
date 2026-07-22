#!/usr/bin/env node
// gather-t2-twin-hashes.mjs — RD-0361 R4 evidence-pack producer (item (d)) for the T2 Memory tranche.
//
// Mirrors gather-t1-twin-hashes.mjs exactly (the T1 sibling), for the five sentinel-memory boundary twins.
// The R4 authority flip requires an evidence pack; item (d) is "every `.wasm` in the tranche hash-pinned,
// signed, #105-admitted — list the hashes." This tool REPRODUCES each twin's R0→R1 exactly as its
// rd0361-*-execution differential test does — build to WASM (parse → checkEffects → emitGIR → renderWAT →
// assembleWAT), sign it (signWasm), admit it through the attestation-first #105 gate (admitAndInstantiate)
// — and prints byte count + sha256 + admission result per twin. Deterministic: the emitter is
// deterministic, so the sha256 is stable for a given twin source (a change to a twin or the emitter moves
// its hash — which is exactly what the flip's hash-pin must track). The signing keypair is an EPHEMERAL,
// in-memory dev keypair generated per run (generateRunnerKeypair) — it never touches any real signing key.
//
// Read-only: builds in memory, admits, never writes or flips anything. Usage: [--json].
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const COMPILER = join(ROOT, "packages-galerina", "galerina-core-compiler", "dist", "index.js");

// The RD-0361 T2 Memory tranche: [package, twin filename (no .fungi), the emitter module name the differential
// test uses (buildWATModuleFromGIR's 3rd arg — verified against each rd0361-*-execution.test.mjs)].
const T2_TWINS = [
  ["galerina-core-sentinel-memory", "memory-validator",      "memory-validator"],
  ["galerina-core-sentinel-memory", "pool-allocation-guard", "pool-allocation-guard"],
  ["galerina-core-sentinel-memory", "pool-policy",           "pool-policy"],
  ["galerina-core-sentinel-memory", "segmentation-guard",    "segmentation-guard"],
  ["galerina-core-sentinel-memory", "trit-buffer-guard",     "trit-buffer-guard"],
];

const L = await import(pathToFileURL(COMPILER).href);
const rows = [];
for (const [pkg, fname, mod] of T2_TWINS) {
  const path = join(ROOT, "packages-galerina", pkg, "src", "self-hosted", `${fname}.fungi`);
  let src = readFileSync(path, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, `${fname}.fungi`);
  const r0Errors = (prog.diagnostics ?? []).filter((d) => d.severity === "error").length;
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, mod, prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  const sha256 = L.wasmHash(asm.wasm);
  // R1 — sign + admit through the attestation-first #105 gate (requireSigned), then instantiate.
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const host = L.createHostRuntime();
  let admitted = false, admitError = null;
  try {
    await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
    admitted = true;
  } catch (e) { admitError = e instanceof Error ? e.message : String(e); }
  rows.push({ twin: fname, pkg, module: mod, r0Errors, bytes: asm.wasm.length, sha256, admitted, admitError });
}

const allClean = rows.every((r) => r.r0Errors === 0 && r.admitted);
if (JSON_OUT) {
  console.log(JSON.stringify({ tool: "gather-t2-twin-hashes", tranche: "T2", allClean, rows }, null, 2));
} else {
  console.log("RD-0361 T2 (Memory) evidence-pack item (d): each sentinel-memory twin's signed / #105-admitted WASM\n");
  for (const r of rows) {
    console.log(`  ${r.twin.padEnd(24)} R0errs=${r.r0Errors} bytes=${String(r.bytes).padStart(4)} #105-admitted=${r.admitted ? "yes" : "NO(" + r.admitError + ")"}`);
    console.log(`      sha256=${r.sha256}`);
  }
  console.log(`\n${allClean ? "✅" : "❌"} ${rows.length} T2 twins · ${rows.filter((r) => r.r0Errors === 0).length} R0-clean · ${rows.filter((r) => r.admitted).length} #105-admitted`);
}
// Set the code and let Node drain (same Windows libuv teardown caveat as the T1 gatherer).
process.exitCode = allClean ? 0 : 1;
