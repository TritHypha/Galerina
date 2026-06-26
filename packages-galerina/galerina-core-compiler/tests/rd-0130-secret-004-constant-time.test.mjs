// =============================================================================
// RD-0130 #3 — SPORE-SECRET-004 constant-time lint: a secret-dependent branch is a
// timing side-channel (CWE-208). The arm taken — and thus the flow's observable
// execution time — depends on secret material, which an attacker measuring latency
// can exploit (classic case: early-return on the first mismatching byte).
//
// Hooked in handleIfStmt on the if-CONDITION via the existing derivesFromSecret
// predicate, so the sanctioned declassifiers (Crypto.constantTimeEquals, redact)
// are already exempt — the canonical constant-time comparison is NOT flagged.
//
// Advisory WARNING (not mode-gated to error): unlike secret EGRESS (SECRET-002),
// secret BRANCHING is sometimes benign (provably balanced arms), so this surfaces
// the pattern for review rather than blocking the build.
// =============================================================================
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkValueStates } from "../dist/index.js";

const wrap = (body) => `secure flow f(req: Request) -> Int
contract { effects { ai.inference  network.outbound } secrets { credential k { provider "vault" } } }
{
${body}
  return 0
}`;
const chk = (src) => checkValueStates(parseProgram(src, "test.spore").ast);
const has = (r, code) => r.diagnostics.some((d) => d.code === code);
const codes = (r) => r.diagnostics.map((d) => d.code).join(", ");

describe("SPORE-SECRET-004 — secret-dependent branch (timing side-channel)", () => {
  it("branching directly on a secret value → SPORE-SECRET-004 warning", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  if kk { let a = 1 } else { let b = 2 }'));
    assert.ok(has(r, "SPORE-SECRET-004"), codes(r));
    const d = r.diagnostics.find((x) => x.code === "SPORE-SECRET-004");
    assert.equal(d.severity, "warning");
  });

  it("branching on a secret-DERIVED comparison → SPORE-SECRET-004 (derivesFromSecret recurses binaryExpr)", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  if kk.len() > 5 { let a = 1 } else { let b = 2 }'));
    assert.ok(has(r, "SPORE-SECRET-004"), codes(r));
  });

  it("the sanctioned constant-time comparison is NOT flagged (constantTimeEquals declassifies)", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  if Crypto.constantTimeEquals(kk, kk) { let a = 1 } else { let b = 2 }'));
    assert.ok(!has(r, "SPORE-SECRET-004"), `false positive on constantTimeEquals: ${codes(r)}`);
  });

  it("redact() before branching declassifies → NOT flagged", () => {
    const r = chk(wrap('  let kk = secret.get("api")\n  if redact(kk) { let a = 1 } else { let b = 2 }'));
    assert.ok(!has(r, "SPORE-SECRET-004"), `false positive on redact: ${codes(r)}`);
  });

  it("branching on a NON-secret value is clean (no false positive)", () => {
    const r = chk(wrap('  let n = 5\n  if n > 3 { let a = 1 } else { let b = 2 }'));
    assert.ok(!has(r, "SPORE-SECRET-004"), `false positive on public value: ${codes(r)}`);
  });
});
