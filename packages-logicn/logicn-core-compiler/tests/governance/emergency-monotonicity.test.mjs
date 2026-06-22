// =============================================================================
// Governance Verifier — emergency {} transition monotonicity (LLN-MONO-001/002)
//
// Roadmap "Tri-Pipe fault-tolerance hardenings" — pin LLN-MONO-001 at the parser.
//
// THE GAP (fixed): parseEmergencyBlock() recognised only deny/quarantine/emergency/
// halt; ANY other action token (incl. `allow`/`grant`) fell through to a silent
// "consume and skip", so no `allow:` action node was ever created and the verifier's
// LLN-MONO-001 EMERGENCY_EXPANDS_CAPABILITY check could never fire — a fail-SILENT
// permission widening in the Binary governance core. The parser now SURFACES
// `allow`/`grant` as an `allow:` node so the existing verifier error fires.
//
// V_DPM is monotonically decreasing: an emergency handler may only CLEAR (deny)
// capabilities, never grant new ones.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkEffects,
  verifyGovernance,
} from "../../dist/index.js";

function parseAndVerify(source, profile = "dev") {
  const parsed = parseProgram(source, "test.lln");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, profile);
}

function hasDiag(result, code, name) {
  return result.diagnostics.some(
    (d) => d.code === code && (name === undefined || d.name === name),
  );
}

describe("emergency {} monotonicity: LLN-MONO-001 (the parser must surface `allow`)", () => {
  it("REJECTS `allow X` in an emergency transition — LLN-MONO-001 EMERGENCY_EXPANDS_CAPABILITY (error)", () => {
    const source = `
policy {
  emergency {
    on invariant_failure {
      allow network.outbound
    }
  }
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      hasDiag(result, "LLN-MONO-001", "EMERGENCY_EXPANDS_CAPABILITY"),
      `Expected LLN-MONO-001 for an emergency \`allow\`, got: ${result.diagnostics.map((d) => `${d.code}/${d.name}`).join(", ")}`,
    );
    const diag = result.diagnostics.find((d) => d.code === "LLN-MONO-001");
    assert.equal(diag.severity, "error", "LLN-MONO-001 must be a hard error");
    assert.ok(
      diag.message.includes("network.outbound"),
      `Message must name the widened capability, got: ${diag.message}`,
    );
  });

  it("REJECTS `grant X` in an emergency transition — same monotonicity violation", () => {
    const source = `
policy {
  emergency {
    on capability_denied {
      grant database.write
    }
  }
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      hasDiag(result, "LLN-MONO-001", "EMERGENCY_EXPANDS_CAPABILITY"),
      `Expected LLN-MONO-001 for an emergency \`grant\`, got: ${result.diagnostics.map((d) => `${d.code}/${d.name}`).join(", ")}`,
    );
  });

  it("surfaces a dot-path allow target precisely (allow ai.inference → ai.inference named)", () => {
    const source = `
policy {
  emergency {
    on any_failure {
      allow ai.inference
    }
  }
}
`;
    const result = parseAndVerify(source);
    const diag = result.diagnostics.find((d) => d.code === "LLN-MONO-001");
    assert.ok(diag !== undefined, "LLN-MONO-001 must fire");
    assert.ok(
      diag.message.includes("ai.inference"),
      `Dot-path capability must be reported intact, got: ${diag.message}`,
    );
  });

  it("ACCEPTS deny/quarantine/emergency/halt transitions — NO LLN-MONO-001 (monotone-decreasing is legal)", () => {
    const source = `
policy {
  emergency {
    on invariant_failure {
      deny network.outbound
      deny ai.inference
      quarantine
    }
    on any_failure {
      deny network.outbound
      halt
    }
  }
}
`;
    const result = parseAndVerify(source);
    assert.ok(
      !hasDiag(result, "LLN-MONO-001"),
      `deny/quarantine/halt must not trip monotonicity, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("the `allow:` node is materialised on the emergencyTransitionDecl (not swallowed at parse)", () => {
    const source = `
policy {
  emergency {
    on invariant_failure {
      allow network.outbound
    }
  }
}
`;
    const { ast } = parseProgram(source, "test.lln");
    const policy = (ast.children ?? []).find((c) => c.kind === "policyDecl");
    assert.ok(policy !== undefined, "policyDecl must exist");
    const emergency = (policy.children ?? []).find(
      (c) => c.kind === "identifier" && c.value === "emergency:block",
    );
    assert.ok(emergency !== undefined, "emergency:block child must exist");
    const transition = (emergency.children ?? []).find((c) => c.kind === "emergencyTransitionDecl");
    assert.ok(transition !== undefined, "emergencyTransitionDecl must exist");
    const actionValues = (transition.children ?? []).map((c) => c.value);
    assert.ok(
      actionValues.includes("allow:network.outbound"),
      `Parser must surface allow:network.outbound, got: ${actionValues.join(", ")}`,
    );
  });
});
