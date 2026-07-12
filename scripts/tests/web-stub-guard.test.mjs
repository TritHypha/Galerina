// =============================================================================
// audit-web-stub-guard.mjs — RD-0100 web-* fail-closed contract enforcer tests.
//
// Locks the deny-by-default galerina-web-* posture BEFORE code exists: a stub is inert (passes),
// but an implemented web-* package must ship its FUNGI-WEB-* fail-closed acceptance tests in the
// same change (else the prose "deny-by-default" fails OPEN the moment impl lands).
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyPackage, scan } from "../audit-web-stub-guard.mjs";

describe("web-stub-guard: classifyPackage (pure detector)", () => {
  it("a STUB (no impl) is inert → no violation", () => {
    const r = classifyPackage("galerina-web-render", { exists: true, hasImpl: false, hasAcceptanceTest: false });
    assert.equal(r.violation, false);
    assert.equal(r.status, "STUB");
  });

  it("an IMPL without fail-closed acceptance tests → VIOLATION (born fail-open)", () => {
    const r = classifyPackage("galerina-web-render", { exists: true, hasImpl: true, hasAcceptanceTest: false });
    assert.equal(r.violation, true);
    assert.equal(r.status, "IMPL_NO_TESTS");
  });

  it("an IMPL WITH fail-closed acceptance tests → no violation (born fail-closed)", () => {
    const r = classifyPackage("galerina-web-render", { exists: true, hasImpl: true, hasAcceptanceTest: true });
    assert.equal(r.violation, false);
    assert.equal(r.status, "IMPL_GUARDED");
  });

  it("a contract package MISSING on disk → VIOLATION (drift)", () => {
    const r = classifyPackage("galerina-web-ghost", { exists: false, hasImpl: false, hasAcceptanceTest: false });
    assert.equal(r.violation, true);
    assert.equal(r.status, "MISSING");
  });
});

describe("web-stub-guard: live scan (current repo state)", () => {
  const results = scan();

  it("governs all 6 web-* packages and they are all implemented + born fail-closed (IMPL_GUARDED)", () => {
    // Posture tripwire (snapshot of current repo state). When these were inert stubs this asserted
    // STUB×6; the scaffold families were then implemented (owner-ordered, task #19) and each shipped its
    // FUNGI-WEB-* fail-closed acceptance test in the SAME change — exactly the RD-0100 rule the guard
    // enforces — so the guarded posture is now IMPL_GUARDED×6 with zero violations (asserted below).
    // Any future posture change (a new inert stub, or an impl that lost its acceptance test) trips this
    // on purpose, forcing an explicit review + baseline update.
    const guarded = results.filter((r) => r.status === "IMPL_GUARDED").map((r) => r.pkg);
    for (const p of ["galerina-web", "galerina-web-render", "galerina-web-state", "galerina-web-router", "galerina-web-events", "galerina-web-components"]) {
      assert.ok(guarded.includes(p), `${p} should be implemented + fail-closed guarded (IMPL_GUARDED)`);
    }
  });

  it("has zero violations today (zero-baseline — enforceable in CI)", () => {
    assert.equal(results.filter((r) => r.violation).length, 0);
  });
});
