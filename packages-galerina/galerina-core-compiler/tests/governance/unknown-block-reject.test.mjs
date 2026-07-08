// =============================================================================
// A23/M4 — unknown governance blocks are REJECTED, never silently drained
// (2026-07-08, PROMPT-syntax-update §8; audit M4: ~20 drain sites).
//
// The old parser drained any unrecognized `{ … }` block inside governance
// contexts via skipBalancedBraces — so a FUTURE or MISTYPED directive was
// invisible to every verifier while the file still built and signed. The rule
// now: inside contract / secrets / authority / policy / guard / access / gate /
// emergency / contract-set / import, an unknown BLOCK ⇒ FUNGI-SYNTAX-011 ERROR
// (the block is still skipped afterwards, purely for recovery).
//
// This is also the version-skew gate: a v2-only block fed to a v1 parser must
// FAIL CLOSED, not vanish (ties to BK-4/A4 versioning).
//
// Anti-vacuous (A27): valid governance forms must stay silent.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram } from "../../dist/index.js";

const diagsOf = (source, code) =>
  parseProgram(source, "test.fungi").diagnostics.filter((d) => d.code === code);

describe("FUNGI-SYNTAX-011 — unknown block inside governance contexts", () => {
  it("fires as ERROR on an unknown block inside contract {}", () => {
    const diags = diagsOf(`
      pure flow pay() -> Void {
        contract {
          quantum_shield {
            level 9000
          }
        }
      }
    `, "FUNGI-SYNTAX-011");
    assert.equal(diags.length, 1, "unknown contract block must be rejected");
    assert.equal(diags[0].severity, "error");
    assert.match(diags[0].message, /quantum_shield/);
  });

  it("fires on a MISTYPED known block (the typo trap: 'rules' vs 'rule')", () => {
    const diags = diagsOf(`
      pure flow pay() -> Void {
        contract {
          rule {
            deny protected CardNumber to response
          }
        }
      }
    `, "FUNGI-SYNTAX-011");
    assert.equal(diags.length, 1, "a mistyped governance sub-block must not silently vanish");
  });

  it("fires inside contract secrets {} (governance-critical)", () => {
    // secrets {} is a contract sub-declaration (parser.ts parseContractDecl → parseSecretsBlock)
    const diags = diagsOf(`
      pure flow pay() -> Void {
        contract {
          secrets {
            exfiltrate {
              to "evil.example"
            }
          }
        }
      }
    `, "FUNGI-SYNTAX-011");
    assert.ok(diags.length >= 1, "unknown secrets block must be rejected");
    assert.equal(diags[0].severity, "error");
    assert.match(diags[0].message, /exfiltrate/);
  });

  it("fires inside authority {}", () => {
    const diags = diagsOf(`
      authority Payments {
        backdoor {
          allow everything
        }
      }
    `, "FUNGI-SYNTAX-011");
    assert.ok(diags.length >= 1, "unknown authority block must be rejected");
  });

  it("is SILENT on a valid contract with known sub-blocks (anti-vacuous)", () => {
    const diags = diagsOf(`
      pure flow pay() -> Void {
        contract {
          rules {
            deny protected CardNumber to response
          }
          audit {
            sink Vault.SOX
          }
        }
      }
    `, "FUNGI-SYNTAX-011");
    assert.equal(diags.length, 0, "known contract sub-blocks must not be rejected");
  });

  it("is SILENT on the shipped secrets credential form (anti-vacuous)", () => {
    const parsed = parseProgram(`
      pure flow pay() -> Void {
        contract {
          secrets {
            credential settlement_signing_key { provider "hashicorp_vault"  path "secret/data/settlement/key" }
          }
        }
      }
    `, "test.fungi");
    const diags = parsed.diagnostics.filter((d) => d.code === "FUNGI-SYNTAX-011");
    assert.equal(diags.length, 0, "the documented credential form must not be rejected");
    // guard against a vacuous pass: the secrets block must actually have parsed
    const flat = JSON.stringify(parsed.ast);
    assert.match(flat, /"kind":"secretsBlock"/, "fixture must really reach parseSecretsBlock");
  });
});

describe("FUNGI-SYNTAX-013 — inert top-level governance {} is rejected (GNG-03 doctrine)", () => {
  it("fires as ERROR on a top-level governance {} block (zero consumers — enforces nothing)", () => {
    const diags = diagsOf(`
      governance ProdRules {
        deny everything on friday
      }
    `, "FUNGI-SYNTAX-013");
    assert.equal(diags.length, 1);
    assert.equal(diags[0].severity, "error");
  });

  it("api {} keeps the historical behaviour for now (tracked follow-up, 2 shipped examples)", () => {
    const diags = diagsOf(`
      api OrdersApi {
        POST "/orders" {
          request CreateOrderRequest
          response CreateOrderResponse
        }
      }
    `, "FUNGI-SYNTAX-013");
    assert.equal(diags.length, 0);
  });
});
