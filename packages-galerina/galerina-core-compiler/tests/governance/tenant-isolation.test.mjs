// =============================================================================
// Governance Verifier — deny-by-default tenant-isolation border (G1, R&D 0109)
//
// SPORE-TENANT-002: a tenant-scoped data-access effect (a declared effect ending
//   `.tenant_scoped`) that is NOT paired with the caller-scope proof (the sibling
//   marker effect `tenant.scope`) is a FAIL-CLOSED compile error in every profile.
//   This is capability intersection over the manifest — it kills the common IDOR /
//   OWASP-A01 shape (a tenant-partitioned read with no caller-scope capability at all).
// SPORE-TENANT-001: a `tenant.scope` binding declared with no tenant-scoped access to
//   bind is a dangling capability (advisory warning, never an error).
//
// SCOPE (honest): this proves the binding is DECLARED on the flow's effect surface; the
// body-level dataflow proof (every row-access threaded by the scope) is the deferred
// SPORE-TENANT-003. Mirrors the harness in guard-decl.test.mjs.
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
  const parsed = parseProgram(source, "test.spore");
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
// 1. Unbound tenant-scoped access → SPORE-TENANT-002 (error)
// ---------------------------------------------------------------------------

describe("SPORE-TENANT-002: deny-by-default tenant-isolation border", () => {
  it("a tenant-scoped access with NO caller-scope binding is a fail-closed error", () => {
    const result = parseAndVerify(flow("database.read.tenant_scoped"));
    assert.ok(hasDiag(result, "SPORE-TENANT-002"), "expected SPORE-TENANT-002");
    const d = getDiag(result, "SPORE-TENANT-002");
    assert.equal(d.severity, "error");
    assert.match(d.message, /tenant_scoped|caller's proven scope/);
  });

  it("FAIL-CLOSED IN EVERY PROFILE: dev / production / deterministic / check-only all deny", () => {
    for (const profile of ["dev", "production", "deterministic", "check-only"]) {
      const result = parseAndVerify(flow("database.read.tenant_scoped"), profile);
      assert.ok(hasDiag(result, "SPORE-TENANT-002"), `expected SPORE-TENANT-002 in profile ${profile}`);
      const d = getDiag(result, "SPORE-TENANT-002");
      assert.equal(d.severity, "error", `expected error severity in profile ${profile}`);
    }
  });

  it("multiple tenant-scoped accesses, NO binding → SPORE-TENANT-002 naming a resource", () => {
    const result = parseAndVerify(flow("database.read.tenant_scoped secret.read.tenant_scoped"));
    assert.ok(hasDiag(result, "SPORE-TENANT-002"), "expected SPORE-TENANT-002");
    const d = getDiag(result, "SPORE-TENANT-002");
    assert.match(d.message, /tenant_scoped/);
  });
});

// ---------------------------------------------------------------------------
// 2. Bound (sibling tenant.scope) → no violation
// ---------------------------------------------------------------------------

describe("tenant.scope binding satisfies the border", () => {
  it("a tenant-scoped access bound to tenant.scope → NO SPORE-TENANT-002 (production)", () => {
    const result = parseAndVerify(flow("database.read.tenant_scoped tenant.scope"), "production");
    assert.ok(!hasDiag(result, "SPORE-TENANT-002"), "tenant.scope should satisfy the border");
  });

  it("MULTIPLE tenant-scoped accesses, ONE binding → clean", () => {
    const result = parseAndVerify(flow("database.read.tenant_scoped secret.read.tenant_scoped tenant.scope"));
    assert.ok(!hasDiag(result, "SPORE-TENANT-002"), "one binding covers all tenant-scoped accesses");
  });
});

// ---------------------------------------------------------------------------
// 3. Dangling binding → advisory SPORE-TENANT-001 (never an error)
// ---------------------------------------------------------------------------

describe("SPORE-TENANT-001: dangling caller-scope binding (advisory)", () => {
  it("tenant.scope with no tenant-scoped access → SPORE-TENANT-001, not an error", () => {
    const result = parseAndVerify(flow("database.read tenant.scope"));
    assert.ok(hasDiag(result, "SPORE-TENANT-001"), "expected the dangling-binding advisory");
    const d = getDiag(result, "SPORE-TENANT-001");
    assert.notEqual(d.severity, "error");
    assert.ok(!hasDiag(result, "SPORE-TENANT-002"), "a dangling binding is never an isolation error");
  });
});

// ---------------------------------------------------------------------------
// 4. Inert: ordinary effects trigger neither code
// ---------------------------------------------------------------------------

describe("the border is inert for non-tenant flows", () => {
  it("ordinary effects emit neither SPORE-TENANT-001 nor SPORE-TENANT-002", () => {
    const result = parseAndVerify(flow("database.read audit.write"));
    assert.ok(!hasDiag(result, "SPORE-TENANT-001"), "no dangling-binding advisory");
    assert.ok(!hasDiag(result, "SPORE-TENANT-002"), "no isolation error");
  });
});
