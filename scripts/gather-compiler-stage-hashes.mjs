#!/usr/bin/env node
// gather-compiler-stage-hashes.mjs — RD-0528 Phase I-1 evidence producer (item d) for the COMPILER
// self-hosting track. The 7 self-hosted compiler stages are R3 byte-parity (wat-p9-*-parity, 422/422)
// but are NOT in the kernel sentinel ledger (rd0361-authoritative-twins.json) — RD-0528 gives them
// their OWN authority track. Mirrors gather-t1/gather-t2-twin-hashes.mjs exactly.
//
// For each stage this REPRODUCES the byte-parity build the wat-p9-*-parity test proves ≡ the .ts:
//   parse → checkEffects → emitGIR → renderWAT(buildWATModuleFromGIR(gir, undefined, <stage>, ast, true))
//   → assembleWAT → wasmHash → signWasm(ephemeral dev key) → admitAndInstantiate (#105, requireSigned).
// Prints byte count + sha256 + admission per stage. Deterministic: a change to a stage or the emitter
// moves its hash — exactly what a flip's hash-pin must track. NEVER touches a real signing key; the
// keypair is an ephemeral in-memory dev key per run. Read-only: builds in memory, admits, writes and
// flips nothing. Usage: [--json].
//
// PROPOSAL producer ONLY. No compiler stage becomes authoritative until its evidence pack clears the
// owner's condition-form nod (RD-0528 I-4); the .ts stays the decider of record, and its differential
// shadow must stay green (I-3), until then.
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JSON_OUT = process.argv.includes("--json");
const COMPILER = join(ROOT, "packages-galerina", "galerina-core-compiler", "dist", "index.js");

// The 7 R3-byte-parity self-hosted compiler stages (RD-0528 §1). The stage basename is the
// buildWATModuleFromGIR module name the wat-p9-*-parity test uses (verified: lexer → "lexer"). All
// live in galerina-core-compiler/src/self-hosted/.
const STAGES = ["lexer", "parser", "gir-emitter", "runtime", "type-checker", "effect-checker", "governance-verifier"];

const L = await import(pathToFileURL(COMPILER).href);
const rows = [];
for (const stage of STAGES) {
  const path = join(ROOT, "packages-galerina", "galerina-core-compiler", "src", "self-hosted", `${stage}.fungi`);
  let src = readFileSync(path, "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, `${stage}.fungi`);
  const r0Errors = (prog.diagnostics ?? []).filter((d) => d.severity === "error").length;
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, stage, prog.ast, /*exportAllPure*/ true));
  const asm = await L.assembleWAT(wat);
  const asmClean = asm.valid && asm.diagnostics.length === 0;
  const sha256 = L.wasmHash(asm.wasm);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const host = L.createHostRuntime();
  let admitted = false, admitError = null;
  try {
    await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host });
    admitted = true;
  } catch (e) { admitError = e instanceof Error ? e.message : String(e); }
  rows.push({ stage, r0Errors, asmClean, bytes: asm.wasm.length, sha256, admitted, admitError });
}

const allClean = rows.every((r) => r.r0Errors === 0 && r.asmClean && r.admitted);
if (JSON_OUT) {
  console.log(JSON.stringify({ tool: "gather-compiler-stage-hashes", track: "RD-0528 compiler self-hosting (PROPOSAL — not flipped)", allClean, rows }, null, 2));
} else {
  console.log("RD-0528 I-1 — compiler self-hosting authority track, evidence item (d): each stage's signed / #105-admitted WASM\n");
  for (const r of rows) {
    console.log(`  ${r.stage.padEnd(22)} R0errs=${r.r0Errors} asm=${r.asmClean ? "ok" : "BAD"} bytes=${String(r.bytes).padStart(6)} #105-admitted=${r.admitted ? "yes" : "NO(" + r.admitError + ")"}`);
    console.log(`      sha256=${r.sha256}`);
  }
  console.log(`\n${allClean ? "✅" : "❌"} ${rows.length} compiler stages · ${rows.filter((r) => r.r0Errors === 0 && r.asmClean).length} build-clean · ${rows.filter((r) => r.admitted).length} #105-admitted`);
  console.log("PROPOSAL only — no stage is authoritative until its evidence pack clears the owner nod (RD-0528 I-4).");
}
process.exitCode = allClean ? 0 : 1;
