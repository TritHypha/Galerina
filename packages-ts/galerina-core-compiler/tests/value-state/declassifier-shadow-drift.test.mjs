// =============================================================================
// Q2 drift test (owner-approved, 2026-08-06)
//
// The bypass this floor closes is a declassifier verb that CLEARS secret state
// somewhere but is missing from DECLASSIFIER_NAMES — exactly what
// `constantTimeEquals` was (WP94). This test DERIVES the protected set from the
// source's own clearing sites and asserts DECLASSIFIER_NAMES covers every one,
// so a future intrinsic cannot be added to one list without the shadow floor.
//
// It reads source, not a hand-maintained list — the whole point is that no
// human has to remember the two must agree.
// =============================================================================
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../../src/value-state-checker.ts"), "utf8");

/** The names DECLASSIFIER_NAMES enumerates, read from source. */
function declaredSet(src) {
  const m = /const DECLASSIFIER_NAMES:[^=]*=\s*new Set\(\[([^\]]*)\]\)/.exec(src);
  assert.ok(m, "could not locate the DECLASSIFIER_NAMES declaration");
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

/**
 * Every bare name a declassifier-recognition site compares against — the sites
 * that CLEAR secret state. Derived from the recognition predicates, not typed by
 * hand:
 *   isRedactCall / isSealCall bodies: `node.value === "<name>"`
 *   the constantTimeEquals clearing:  `node.value === "constantTimeEquals"`
 * We take every `node.value === "<lowerCamel>"` that sits inside a function whose
 * name or comment marks it a declassifier/clearing site.
 */
function clearingSet(src) {
  const names = new Set();
  // isRedactCall + isSealCall predicate bodies
  for (const fn of ["isRedactCall", "isSealCall"]) {
    const body = new RegExp(`function ${fn}\\b[\\s\\S]{0,1000}?\\n\\}`).exec(src);
    if (body) for (const m of body[0].matchAll(/node\.value === "([a-zA-Z][a-zA-Z0-9]*)"/g)) names.add(m[1]);
  }
  // the constantTimeEquals clearing site(s): a `=== "constantTimeEquals"` that RETURNS false
  // (declassifies) in derivesFromSecret. Match the literal at any such comparison.
  for (const m of src.matchAll(/node\.value === "(constantTimeEquals)"/g)) names.add(m[1]);
  return names;
}

describe("Q2 — declassifier drift floor", () => {
  it("★★★ every name-based declassifier clearing site is in DECLASSIFIER_NAMES", () => {
    const declared = declaredSet(SRC);
    const clearing = clearingSet(SRC);
    assert.ok(clearing.size >= 4, `expected >=4 clearing names (redact/seal/encrypt/constantTimeEquals), found ${[...clearing].join(",")}`);
    const missing = [...clearing].filter((n) => !declared.has(n));
    assert.deepEqual(missing, [], `these declassifiers clear secret state but are absent from the shadow floor: ${missing.join(", ")}`);
  });

  it("★★ constantTimeEquals is specifically present (the WP94 gap, closed)", () => {
    assert.ok(declaredSet(SRC).has("constantTimeEquals"),
      "constantTimeEquals clears secret state and MUST be in DECLASSIFIER_NAMES");
  });

  it("⬜ the deriver is alive — it finds the classic three plus the fourth", () => {
    const clearing = clearingSet(SRC);
    for (const n of ["redact", "seal", "encrypt", "constantTimeEquals"])
      assert.ok(clearing.has(n), `the clearing-site deriver must find '${n}' (dead deriver would pass the main test vacuously)`);
  });

  it("⬜ CONTROL: a fabricated declassifier not in the source is not falsely derived", () => {
    assert.equal(clearingSet(SRC).has("zzqLaunder"), false, "the deriver must not invent a name the source does not compare");
  });
});
