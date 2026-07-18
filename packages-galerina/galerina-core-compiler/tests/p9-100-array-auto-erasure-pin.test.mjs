// p9-100-array-auto-erasure-pin.test.mjs — pins the VERIFIED root of task #100 (P9's blocker for the 5
// trapping self-hosted stages), so no future change "fixes" the wrong layer.
//
// The 5 stages (type-checker / effect-checker / governance-verifier / gir-emitter / runtime) TRAP at R2
// because they take `Array<Auto>` params and do `.get(i)` → `Option<Auto>` → `match { Some(it) => it.field }`.
// The 20-line isolation (R&D, 2026-07-17) blamed the get→Option→match-bind inference chain. This pin proves
// that chain is CORRECT: with a CONCRETE element type it carries the type end-to-end. The erasure is `Auto`
// itself — a DELIBERATE, corpus-safety permissive type — so the #100 fix is REAL STAGE-B GENERICS (drop
// `Array<Auto>` for concrete/generic element types in the stages), NOT touching the type-checker inference
// or the wat-emitter fail-closed trap (#163, deliberate). This test therefore stays valid AFTER #100 is
// fixed (Auto keeps erasing by design; the stages simply stop using it).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "dist", "index.js");

const L = await import(pathToFileURL(COMPILER).href);

// Return the ERROR codes (parse errors prefixed P:, type errors T:) for a flow body, or [] when clean.
function errsFor(src) {
  const prog = L.parseProgram(`@version 1\n${src}`, "p9-100-pin.fungi");
  const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (parseErrs.length) return parseErrs.map((d) => "P:" + d.code);
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error").map((d) => "T:" + d.code);
}

const REC = "record Flow { name: String }\n";
// match a.get(0) → Some(it): the binder `it` is the array's element type.
const chain = (elemType, useAs) =>
  `pure flow f(a: Array<${elemType}>) -> Int contract { effects {} } {\n` +
  `  match a.get(0) { Some(it) => { let x: ${useAs} = it\n    return 0 } None => { return 0 } _ => { return 0 } } }`;

test("★ #100 root: a CONCRETE element type flows through get→Option→match-bind (chain is NOT the bug)", () => {
  // it : Flow, so binding it to an Int must be a TYPE ERROR — the concrete element type reached the binder.
  const bad = errsFor(REC + chain("Flow", "Int"));
  assert.ok(bad.length > 0, `Array<Flow> → it:Flow bound to Int must error, got CLEAN (the chain lost the type)`);
  assert.ok(bad.every((c) => c.startsWith("T:")), `expected type errors, got ${bad.join(" ")}`);
});

test("★ #100 root: the CONCRETE element type is really Flow (binding it AS Flow is clean)", () => {
  // it : Flow bound to Flow — clean. Proves the error above is type-directed, not "errors on everything".
  const ok = errsFor(REC + chain("Flow", "Flow"));
  assert.deepEqual(ok, [], `Array<Flow> → it:Flow bound to Flow must be clean, got ${ok.join(" ")}`);
});

test("★ #100 root: Array<Auto> DELIBERATELY erases to Auto (the erasure is Auto, not the chain) — the stages' bug", () => {
  // it : Auto (permissive) — binding it to Int is CLEAN. This permissiveness is the corpus-safety design of
  // Auto; it is exactly why the 5 stages' `Array<Auto>` erases the element type and the emitter has no field
  // offset at lowering (→ the R2 `unreachable` trap). The fix is dropping Array<Auto> in the stages.
  const clean = errsFor(chain("Auto", "Int"));
  assert.deepEqual(clean, [], `Array<Auto> → it:Auto bound to Int must be clean (Auto erases by design), got ${clean.join(" ")}`);
});
