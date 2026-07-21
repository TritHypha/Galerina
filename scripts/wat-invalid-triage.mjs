#!/usr/bin/env node
/**
 * wat-invalid-triage.mjs — advisory root-cause classifier for INVALID WASM modules.
 *
 * Provenance: R&D prototype (coordination/to-main/prototypes/wat-invalid-triage.prototype.mjs,
 * 2026-07-19), vendored to scripts/ by main. Pairs with audit-wasm-validate.mjs.
 *
 * audit-wasm-validate answers "is any module malformed?" and guards against regressions (exit 1
 * on a NEW invalid). This answers "WHY, and which root class is it?" — because
 * `WebAssembly.validate()` returns only a boolean, while `new WebAssembly.Module()` carries the
 * actual reason. Turns "10 files are broken" into "4 root causes, N sites each", which is what
 * makes the fix tractable in four passes rather than ten.
 *
 * Root classes (measured distribution at time of writing: A2=7 · A1=1 · A3=1 · B=1):
 *   A2  a `(call $name …)` to a function the module never DEFINES or IMPORTS  <- dominant
 *   A3  a binding modifier folded into the local NAME -> `(local $unsafe rawPatientId i32)`
 *   B   declared result type vs the type the body actually produces
 *   A1  a Void flow emitted with a `(result …)` and nothing pushed
 *
 * Fix order: A2 → A1 → A3 → B LAST.
 * ⚠ B: NEVER satisfy the validator with an f64.convert_i32_s — that turns a contained bug into
 *   a live truncating money ratio. Fix the semantics (Decimal lowering) first.
 *
 * ASSEMBLER HAZARD (measured 2026-07-19): `assembleWAT` does NOT throw on WAT it cannot parse —
 * it returns an 8-byte EMPTY module (`\0asm` + version) which `WebAssembly.validate()` happily
 * reports as TRUE. The `<= 8` guard below catches this; currently 0 corpus files hit it (latent,
 * not live) but it must be checked, not assumed.
 *
 * EXIT: 0 always (advisory — informational output only); 1 only on a --self-test failure.
 * RUN:  node scripts/wat-invalid-triage.mjs [--self-test] [--json] [file.fungi …]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GALERINA_ROOT || join(HERE, "..");
const DIST = `file:///${join(ROOT, "packages-galerina/galerina-core-compiler/dist/index.js").replace(/\\/g, "/")}`;
const L = await import(DIST);

// ── existence-checked anchors: if the API moves, fail closed rather than silently misreport ──
for (const [name, ok] of [
  ["assembleWAT", typeof L.assembleWAT === "function"],
  ["checkTypes", typeof L.checkTypes === "function"],
  ["verifyGovernance", typeof L.verifyGovernance === "function"],
]) if (!ok) { console.error(`[wat-invalid-triage] ANCHOR GONE: ${name} — refusing to report.`); process.exit(1); }

function walk(d, acc = []) {
  let es; try { es = readdirSync(d); } catch { return acc; }
  for (const e of es) {
    const p = join(d, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc); else if (e.endsWith(".fungi")) acc.push(p);
  }
  return acc;
}

/** Strip WAT comments before text probes — a comment containing `unreachable` once fooled R&D's sweep. */
function stripComments(wat) {
  let s = wat, prev;
  do { prev = s; s = s.replace(/\(;[\s\S]*?;\)/g, " "); } while (s !== prev);
  return s.replace(/;;[^\n]*/g, " ");
}

/** A2 detector: `(call $X)` where $X is neither defined nor imported in the module. */
function undefinedCallees(code) {
  const defined  = new Set([...code.matchAll(/\(func\s+\$([A-Za-z0-9_$.]+)/g)].map((m) => m[1]));
  const imported = new Set([...code.matchAll(/\(import[\s\S]*?\(func\s+\$([A-Za-z0-9_$.]+)/g)].map((m) => m[1]));
  const called   = [...new Set([...code.matchAll(/\(call\s+\$([A-Za-z0-9_$.]+)/g)].map((m) => m[1]))];
  return called.filter((c) => !defined.has(c) && !imported.has(c));
}

/** A3 detector: `(local $a b i32)` or `(local.set $a b …)` — a modifier folded into the name. */
function spacedLocals(code) {
  return [...new Set(
    [...code.matchAll(/\((?:local|local\.set)\s+\$([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s/g)]
      .map((m) => `$${m[1]} ${m[2]}`)
  )];
}

async function triage(src, rel) {
  const p = L.parseProgram(src, rel, { requireVersionHeader: false });
  if (p.diagnostics.some((d) => d.severity === "error")) return { verdict: "parse-reject" };
  const fx = L.checkEffects(p.flows, p.ast);
  const gate = [
    ...L.checkTypes(p.ast).diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
    ...L.verifyGovernance(p.ast, p.flows, fx, "production", rel).diagnostics
       .filter((d) => d.severity === "error").map((d) => d.code),
  ];
  if (gate.length) return { verdict: "gate-blocked", why: [...new Set(gate)].join(",") };

  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "t", p.ast, true));
  const code = stripComments(wat);

  const asm = await L.assembleWAT(wat);
  // Gate on .valid AND .diagnostics before reading .wasm — satisfies the report-blind-consumers
  // convention. Triage intentionally proceeds on !valid (we WANT to classify invalid modules),
  // but the gate is explicit: we read the report FIRST, then decide what bytes to examine.

  // A2 pre-check path: assembleWAT returns valid:false with a diagnostic AND empty wasm.
  // The assembler already identified the undefined callees; surface them directly.
  if (!asm.valid && asm.wasm.length === 0 && asm.diagnostics.length > 0) {
    const diagMsg = asm.diagnostics.map((d) => d.message).join("; ");
    const a2Match = diagMsg.match(/function\(s\) that are neither defined nor imported:\s*([^—]+)—/);
    const undef2 = undefinedCallees(code); // also scan WAT text directly
    const classes = [];
    if (undef2.length)  classes.push({ cls: "A2", conf: "high", detail: "undefined callee(s): " + undef2.join(", ") });
    else if (a2Match)   classes.push({ cls: "A2", conf: "high", detail: "assembler pre-check: " + a2Match[1].trim() });
    else                classes.push({ cls: "A2", conf: "high", detail: "assembler pre-check A2: " + diagMsg.slice(0, 120) });
    return { verdict: "INVALID", reason: diagMsg.slice(0, 200), classes };
  }

  const u8 = (asm.valid && asm.diagnostics.length === 0)
    ? asm.wasm
    : (asm.wasm && asm.wasm.length > 8 ? asm.wasm : new Uint8Array(0));
  const len = u8?.length ?? 0;
  // ASSEMBLER HAZARD — see file header: `<=` not `<` (the 8-byte empty module validates as TRUE).
  if (len <= 8) return { verdict: "UNPARSEABLE", why: `assembler returned a ${len}-byte empty module — NOT clean` };
  if (WebAssembly.validate(u8)) return { verdict: "valid" };

  // Recover the REASON — validate() only returns a boolean; Module() gives the message.
  let reason = "";
  try { new WebAssembly.Module(u8); } catch (e) { reason = String(e.message).replace(/\s+/g, " "); }

  const undef  = undefinedCallees(code);
  const spaced = spacedLocals(code);
  const classes = [];
  if (undef.length)                              classes.push({ cls: "A2", conf: "high", detail: "undefined callee(s): " + undef.join(", ") });
  if (spaced.length)                             classes.push({ cls: "A3", conf: "high", detail: "spaced local name(s): " + spaced.join(", ") });
  if (/expected \w+, got \w+|fallthru/.test(reason)) classes.push({ cls: "B",  conf: "high", detail: "declared result vs produced type" });
  if (classes.length === 0)                      classes.push({ cls: "A1?", conf: "low",  detail: "no A2/A3/B evidence — inspect by hand" });
  return { verdict: "INVALID", reason, classes };
}

// ── self-test: 4/4 — pipeline runs, gate fires, result is classified, reason is recovered ──
if (process.argv.includes("--self-test")) {
  const good = `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a + b }`;
  const bad  = `pure flow f(revenue: Money<GBP>, cost: Money<GBP>) -> Decimal\ncontract { effects {} }\n{ let r: Decimal = revenue / cost\n  return r }`;
  const g  = await triage(good, "good.fungi");
  const b2 = await triage(bad,  "bad.fungi");
  const checks = [
    ["known-good Int flow triages as valid (proves the pipeline runs)",     g.verdict === "valid"],
    ["known-bad money-ratio triages as INVALID",                            b2.verdict === "INVALID"],
    ["known-bad is classified, not left unexplained",                       (b2.classes ?? []).length > 0],
    ["a reason string is recovered (validate() alone cannot give one)",     (b2.reason ?? "").length > 0],
  ];
  let ok = true;
  console.log(`  [good -> ${g.verdict}]  [bad -> ${b2.verdict}: ${(b2.classes ?? []).map((c) => c.cls).join("+")}]`);
  for (const [n, pass] of checks) { console.log(`  ${pass ? "PASS" : "FAIL"}  ${n}`); if (!pass) ok = false; }
  console.log(ok ? `self-test ${checks.length}/${checks.length}` : "SELF-TEST FAILED — do not trust this triage");
  process.exit(ok ? 0 : 1);
}

const args  = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const files = args.length ? args.map((a) => join(ROOT, a)) : walk(join(ROOT, "docs/examples"));
const findings = [];
const tally = /** @type {Record<string, number>} */ ({});
for (const abs of files) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  let src; try { src = readFileSync(abs, "utf8"); } catch { continue; }
  let r; try { r = await triage(src, rel); } catch (e) { r = { verdict: "threw", why: String(e?.message ?? e).slice(0, 70) }; }
  if (r.verdict !== "INVALID" && r.verdict !== "UNPARSEABLE") continue;
  findings.push([rel, r]);
  for (const c of r.classes ?? [{ cls: r.verdict }]) tally[c.cls] = (tally[c.cls] || 0) + 1;
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ tally, findings: findings.map(([f, r]) => ({ file: f, ...r })) }, null, 2));
} else {
  console.log(`wat-invalid-triage — ${findings.length} module(s) needing a fix\n`);
  for (const [f, r] of findings) {
    console.log(`  ${f}`);
    if (r.verdict === "UNPARSEABLE") { console.log(`     ⚠ ${r.why}`); continue; }
    console.log(`     reason: ${(r.reason || "").slice(0, 100)}`);
    for (const c of r.classes) console.log(`     [${c.cls}] (${c.conf}) ${c.detail}`);
  }
  console.log("\nby root cause:");
  for (const [k, v] of Object.entries(tally).sort((a, b) => /** @type {number} */(b[1]) - /** @type {number} */(a[1])))
    console.log(`  ${String(v).padStart(3)}  ${k}`);
  console.log("\nfix order: A2 (one fix clears the most) -> A1 -> A3 -> B LAST.");
  console.log("⚠ B: never satisfy the validator with an f64.convert_i32_s — that activates a truncating money ratio.");
}
// Advisory: always exit 0 (informational). audit-wasm-validate is the enforcing gate.
