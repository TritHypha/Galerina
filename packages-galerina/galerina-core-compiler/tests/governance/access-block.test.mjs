// =============================================================================
// Governance Verifier — access {} Default Deny Capability Negotiation Tests
//
// Tests for the `access { grant <capability> }` block inside contract {} (task #89).
//
// Covers:
//   - Valid access {} grants pass without warnings
//   - SPORE-ACCESS-001: grant references an unknown capability name
//   - SPORE-ACCESS-002: grant capability not declared in flow's effects {}
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

function diagsWithCode(result, code) {
  return result.diagnostics.filter((d) => d.code === code);
}

// ---------------------------------------------------------------------------
// Valid access {} blocks
// ---------------------------------------------------------------------------

describe("access {}: valid grants pass without SPORE-ACCESS warnings", () => {
  it("access { grant database.write } with matching effect — 0 SPORE-ACCESS-001 / SPORE-ACCESS-002", () => {
    const source = `
secure flow writeRecord(data: String) -> Void
contract {
  intent { "Write a record to the database." }
  effects { database.write }
  access {
    grant database.write
  }
}
{
  return
}
`;
    const result = parseAndVerify(source);
    const accessWarnings = result.diagnostics.filter(
      (d) => d.code === "SPORE-ACCESS-001" || d.code === "SPORE-ACCESS-002",
    );
    assert.equal(
      accessWarnings.length,
      0,
      `Expected 0 SPORE-ACCESS warnings for valid access block, got: ${accessWarnings.map((w) => `${w.code}: ${w.message}`).join("; ")}`,
    );
  });

  it("access { grant network.outbound } with matching effect — 0 SPORE-ACCESS-002", () => {
    const source = `
guarded flow callApi(url: String) -> String
contract {
  effects { network.outbound }
  access {
    grant network.outbound
  }
}
{
  return url
}
`;
    const result = parseAndVerify(source);
    const acc002 = diagsWithCode(result, "SPORE-ACCESS-002");
    assert.equal(
      acc002.length,
      0,
      `Expected 0 SPORE-ACCESS-002 when grant matches declared effect, got: ${acc002.map((w) => w.message).join("; ")}`,
    );
  });

  it("flow without access {} block produces no SPORE-ACCESS diagnostics", () => {
    const source = `
secure flow save(data: String) -> Void
contract {
  intent { "Save data." }
  effects { database.write }
}
{
  return
}
`;
    const result = parseAndVerify(source);
    const accessDiags = result.diagnostics.filter(
      (d) => d.code === "SPORE-ACCESS-001" || d.code === "SPORE-ACCESS-002",
    );
    assert.equal(
      accessDiags.length,
      0,
      `Expected no SPORE-ACCESS diagnostics for flow without access block`,
    );
  });
});

// ---------------------------------------------------------------------------
// SPORE-ACCESS-001: unknown capability name
// ---------------------------------------------------------------------------

describe("SPORE-ACCESS-001: grant references unknown capability name", () => {
  it("access { grant unknownCap } (no dot, not a known capability) emits SPORE-ACCESS-001 warning", () => {
    // SPORE-ACCESS-001 fires for names that are not in KNOWN_CAPABILITIES AND do not
    // contain a dot (dotted names are treated as namespaced/external capabilities).
    const source = `
secure flow badAccess(data: String) -> Void
contract {
  intent { "Flow with unknown capability in access block." }
  effects { database.write }
  access {
    grant unknownCap
  }
}
{
  return
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      hasDiag(result, "SPORE-ACCESS-001"),
      `Expected SPORE-ACCESS-001 for unknownCap, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
    const diag = diagsWithCode(result, "SPORE-ACCESS-001")[0];
    assert.equal(
      diag?.severity,
      "warning",
      "SPORE-ACCESS-001 must be a warning, not an error",
    );
    assert.ok(
      diag?.message.includes("unknownCap") || diag?.message.includes("unknown"),
      `SPORE-ACCESS-001 message must mention the unknown capability, got: ${diag?.message}`,
    );
  });

  it("known capability name (database.write) does NOT emit SPORE-ACCESS-001", () => {
    const source = `
secure flow ok(data: String) -> Void
contract {
  intent { "Known capability." }
  effects { database.write }
  access {
    grant database.write
  }
}
{
  return
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      !hasDiag(result, "SPORE-ACCESS-001"),
      `Expected no SPORE-ACCESS-001 for known capability database.write`,
    );
  });
});

// ---------------------------------------------------------------------------
// SPORE-ACCESS-002: grant without matching effect
// ---------------------------------------------------------------------------

describe("SPORE-ACCESS-002: grant capability not in flow effects {}", () => {
  it("access { grant network.outbound } but only database.write in effects — SPORE-ACCESS-002", () => {
    const source = `
secure flow mismatch(data: String) -> Void
contract {
  intent { "Grant does not match effects." }
  effects { database.write }
  access {
    grant network.outbound
  }
}
{
  return
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      hasDiag(result, "SPORE-ACCESS-002"),
      `Expected SPORE-ACCESS-002 when network.outbound granted but not in effects, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
    const diag = diagsWithCode(result, "SPORE-ACCESS-002")[0];
    assert.equal(
      diag?.severity,
      "warning",
      "SPORE-ACCESS-002 must be a warning",
    );
  });

  it("access { grant audit.write } but audit.write in effects — no SPORE-ACCESS-002", () => {
    const source = `
secure flow auditWrite(data: String) -> Void
contract {
  intent { "Audit write matches." }
  effects { audit.write }
  access {
    grant audit.write
  }
}
{
  return
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      !hasDiag(result, "SPORE-ACCESS-002"),
      `Expected no SPORE-ACCESS-002 when grant matches effects, got: ${result.diagnostics.filter((d) => d.code === "SPORE-ACCESS-002").map((d) => d.message).join("; ")}`,
    );
  });
});
