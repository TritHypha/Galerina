#!/usr/bin/env node
// gather-t1-twin-hashes.mjs — RD-0361 R4 evidence-pack producer, item (d).
//
// The R4 authority flip (make a `.fungi`/WASM twin the real decider) requires an evidence pack; item (d)
// is "every `.wasm` in the tranche hash-pinned, signed, #105-admitted — list the hashes" (the R4 unlock
// protocol, HANDOVER-v1-finish-line-cutover). This tool REPRODUCES each T1 sentinel twin's R0->R1 exactly
// as the differential tests do — build the twin to WASM (parse -> checkEffects -> emitGIR -> renderWAT ->
// assembleWAT), sign it (signWasm), admit it through the attestation-first #105 gate (admitAndInstantiate)
// — and prints the byte count + sha256 + admission result per twin. Deterministic: the emitter is
// deterministic, so the sha256 is stable for a given twin source (a change to a twin or the emitter moves
// its hash — which is exactly what the flip's hash-pin must track).
//
// Read-only: builds in memory, admits, never writes or flips anything. Usage: [--json].
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const COMPILER = join(ROOT, "packages-galerina", "galerina-core-compiler", "dist", "index.js");

// The RD-0361 T1 tranche: [package, twin filename (no .fungi), the emitter module name the differential test uses].
const T1_TWINS = [
  ["galerina-core-sentinel-time",   "synchronization-gate", "sync-gate"],
  ["galerina-core-sentinel-power",  "power-governor",       "power-governor"],
  ["galerina-core-sentinel-state",  "cold-boot",            "cold-boot"],
  ["galerina-core-sentinel-egress", "audit-egress",         "audit-egress"],
];

const L = await import(pathToFileURL(COMPILER).href);
const rows = [];
for (const [pkg, fname, mod] of T1_TWINS) {
  const path = join(ROOT, "packages-galerina", pkg, "src", "self-hosted", `${fname}.fungi`);
  let src = readFileSync(path, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, `${fname}.fungi`);
  const r0Errors = (prog.diagnostics ?? []).filter((d) => d.severity === "error").length;
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, mod, prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  // #141 fail-closed (signing path): a wabt-rejected module comes back as the minimal-encoder STUB with
  // valid:true PLUS a "NOT a faithful compile" diagnostic (#163). Hashing / signing / admitting that stub
  // would pin an unfaithful artifact into the ledger. Gate on valid && diagnostics.length===0 before
  // touching asm.wasm — reading the VALUE without the REPORT is fail-open by construction.
  const asmFaithful = asm.valid && asm.diagnostics.length === 0;
  const sha256 = asmFaithful ? L.wasmHash(asm.wasm) : null;
  // R1 — sign + admit through the attestation-first #105 gate (requireSigned), then instantiate.
  const kp = L.generateRunnerKeypair();
  let admitted = false, admitError = null;
  if (asmFaithful) {
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const host = L.createHostRuntime();
    try {
      await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
      admitted = true;
    } catch (e) { admitError = e instanceof Error ? e.message : String(e); }
  } else {
    admitError = "unfaithful assembly (stub): " + asm.diagnostics.map((d) => d.message).join("; ");
  }
  rows.push({ twin: fname, pkg, module: mod, r0Errors, bytes: asm.wasm.length, sha256, asmFaithful, admitted, admitError });
}

const allClean = rows.every((r) => r.r0Errors === 0 && r.asmFaithful && r.admitted);
if (JSON_OUT) {
  console.log(JSON.stringify({ tool: "gather-t1-twin-hashes", tranche: "T1", allClean, rows }, null, 2));
} else {
  console.log("RD-0361 T1 evidence-pack item (d): each sentinel twin's signed / #105-admitted WASM\n");
  for (const r of rows) {
    console.log(`  ${r.twin.padEnd(22)} R0errs=${r.r0Errors} bytes=${String(r.bytes).padStart(4)} #105-admitted=${r.admitted ? "yes" : "NO(" + r.admitError + ")"}`);
    console.log(`      sha256=${r.sha256}`);
  }
  console.log(`\n${allClean ? "✅" : "❌"} ${rows.length} T1 twins · ${rows.filter((r) => r.r0Errors === 0).length} R0-clean · ${rows.filter((r) => r.admitted).length} #105-admitted`);
}
// Set the code and let Node drain — force-exiting via process.exit() while the in-memory WASM instances are
// still closing trips a libuv teardown assertion on Windows (the output above is already complete + correct).
process.exitCode = allClean ? 0 : 1;
