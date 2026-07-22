// =============================================================================
// Governance Verifier — deny-by-default tenant-isolation border (G1, R&D 0109)
//
// FUNGI-TENANT-002: a tenant-scoped data-access effect (a declared effect ending
//   `.tenant_scoped`) that is NOT paired with the caller-scope proof (the sibling
//   marker effect `tenant.scope`) is a FAIL-CLOSED compile error in every profile.
//   This is capability intersection over the manifest — it kills the common IDOR /
//   OWASP-A01 shape (a tenant-partitioned read with no caller-scope capability at all).
// FUNGI-TENANT-001: a `tenant.scope` binding declared with no tenant-scoped access to
//   bind is a dangling capability (advisory warning, never an error).
//
// SCOPE (honest): this proves the binding is DECLARED on the flow's effect surface; the
// body-level dataflow proof (every row-access threaded by the scope) is the deferred
// FUNGI-TENANT-003. Mirrors the harness in guard-decl.test.mjs.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkEffects,
  verifyGovernance,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAndVerify(source, profile = "dev") {
  const parsed = parseProgram(source, "test.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

function getDiag(result, code) {
  return result.diagnostics.find((d) => d.code === code);
}

// A secure flow whose effects block is parameterised by the caller.
function flow(effectsLine) {
  return `
secure flow readTenantData(id: String) -> Result<String, String> {
  contract {
    intent { "Read per-tenant data." }
    effects { ${effectsLine} }
  }
  return Ok(id)
}
`;
}

// ---------------------------------------------------------------------------
// 1. Unbound tenant-scoped access → FUNGI-TENANT-002 (error)
// ---------------------------------------------------------------------------

describe("FUNGI-TENANT-002: deny-by-default tenant-isolation border", () => {
  it("a tenant-scoped access with NO caller-scope binding is a fail-closed error", () => {
    const result = parseAndVerify(flow("database.read.tenant_scoped"));
    assert.ok(hasDiag(result, "FUNGI-TENANT-002"), "expected FUNGI-TENANT-002");
    const d = getDiag(result, "FUNGI-TENANT-002");
    assert.equal(d.severity, "error");
    assert.match(d.message, /tenant_scoped|caller's proven scope/);
  });

  it("FAIL-CLOSED IN EVERY PROFILE: dev / production / deterministic / check-only all deny", () => {
    for (const profile of ["dev", "production", "deterministic", "check-only"]) {
      const result = parseAndVerify(flow("database.read.tenant_scoped"), profile);
      assert.ok(hasDiag(result, "FUNGI-TENANT-002"), `expected FUNGI-TENANT-002 in profile ${profile}`);
      const d = getDiag(result, "FUNGI-TENANT-002");
      assert.equal(d.severity, "error", `expected error severity in profile ${profile}`);
    }
  });

  it("multiple tenant-scoped accesses, NO binding → FUNGI-TENANT-002 naming a resource", () => {
    const result = parseAndVerify(flow("database.read.tenant_scoped secret.read.tenant_scoped"));
    assert.ok(hasDiag(result, "FUNGI-TENANT-002"), "expected FUNGI-TENANT-002");
    const d = getDiag(result, "FUNGI-TENANT-002");
    assert.match(d.message, /tenant_scoped/);
  });
});

// ---------------------------------------------------------------------------
// 2. Bound (sibling tenant.scope) → no violation
// ---------------------------------------------------------------------------

describe("tenant.scope binding satisfies the border", () => {
  it("a tenant-scoped access bound to tenant.scope → NO FUNGI-TENANT-002 (production)", () => {
    const result = parseAndVerify(flow("database.read.tenant_scoped tenant.scope"), "production");
    assert.ok(!hasDiag(result, "FUNGI-TENANT-002"), "tenant.scope should satisfy the border");
  });

  it("MULTIPLE tenant-scoped accesses, ONE binding → clean", () => {
    const result = parseAndVerify(flow("database.read.tenant_scoped secret.read.tenant_scoped tenant.scope"));
    assert.ok(!hasDiag(result, "FUNGI-TENANT-002"), "one binding covers all tenant-scoped accesses");
  });
});

// ---------------------------------------------------------------------------
// 3. Dangling binding → advisory FUNGI-TENANT-001 (never an error)
// ---------------------------------------------------------------------------

describe("FUNGI-TENANT-001: dangling caller-scope binding (advisory)", () => {
  it("tenant.scope with no tenant-scoped access → FUNGI-TENANT-001, not an error", () => {
    const result = parseAndVerify(flow("database.read tenant.scope"));
    assert.ok(hasDiag(result, "FUNGI-TENANT-001"), "expected the dangling-binding advisory");
    const d = getDiag(result, "FUNGI-TENANT-001");
    assert.notEqual(d.severity, "error");
    assert.ok(!hasDiag(result, "FUNGI-TENANT-002"), "a dangling binding is never an isolation error");
  });
});

// ---------------------------------------------------------------------------
// 4. Inert: ordinary effects trigger neither code
// ---------------------------------------------------------------------------

describe("the border is inert for non-tenant flows", () => {
  it("ordinary effects emit neither FUNGI-TENANT-001 nor FUNGI-TENANT-002", () => {
    const result = parseAndVerify(flow("database.read audit.write"));
    assert.ok(!hasDiag(result, "FUNGI-TENANT-001"), "no dangling-binding advisory");
    assert.ok(!hasDiag(result, "FUNGI-TENANT-002"), "no isolation error");
  });
});

// ---------------------------------------------------------------------------
// 5. Anti-vacuous guard (A27) — the check is NOT inert
// ---------------------------------------------------------------------------
// Per Galerina's zero-trust rule: every conformance test must be anti-vacuous.
// "Neuter the guard → test goes RED." These tests prove that the deny-by-default
// border fires on the canonical attack shape, not just on edge cases. If the
// verifyTenantIsolation implementation were removed or bypassed, tests 1–3 above
// (section 1) would fail — this section makes the anti-vacuous property explicit.

describe("A27 anti-vacuous: verifyTenantIsolation is not inert", () => {
  it("the guard fires: unscoped vault.read.tenant_scoped → FUNGI-TENANT-002 (canonical IDOR shape)", () => {
    // The canonical attack shape: developer adds a tenant-partitioned vault read
    // but forgets the caller-scope binding. This is the IDOR / OWASP-A01 class.
    const result = parseAndVerify(flow("vault.read.tenant_scoped"));
    assert.ok(
      hasDiag(result, "FUNGI-TENANT-002"),
      "ANTI-VACUOUS FAIL: verifyTenantIsolation did not fire on the canonical IDOR shape — the guard is inert",
    );
    const d = getDiag(result, "FUNGI-TENANT-002");
    assert.equal(d.severity, "error", "the isolation guard must be an error, not a warning");
  });

  it("the guard fires for ALL 4 profiles (production path cannot bypass it)", () => {
    // A gate that fires in dev but not production is fail-open in the only profile
    // that reaches production. Every profile must deny the unscoped access.
    const profiles = ["dev", "production", "deterministic", "check-only"];
    for (const profile of profiles) {
      const result = parseAndVerify(flow("database.read.tenant_scoped"), profile);
      assert.ok(
        hasDiag(result, "FUNGI-TENANT-002"),
        `ANTI-VACUOUS FAIL: verifyTenantIsolation is NOT fail-closed in the '${profile}' profile — the guard is bypassed`,
      );
    }
  });

  it("the guard is NOT fired by a correctly-scoped flow (no false positive on the safe path)", () => {
    // The guard must be precise: a correctly-written flow (tenant-scoped access WITH
    // the binding) must pass. A false-positive here would make the feature unusable.
    const result = parseAndVerify(flow("database.read.tenant_scoped tenant.scope"), "production");
    assert.ok(
      !hasDiag(result, "FUNGI-TENANT-002"),
      "ANTI-VACUOUS FAIL: verifyTenantIsolation has a false positive — correctly-scoped flows are denied",
    );
  });
});
