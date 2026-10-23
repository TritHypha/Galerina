// S7-R2 red tests (gcw-s7e): compiler-recognised must-close linear Lease (closure item 1414-LEASE,
// RD-1414:242-250: affine is not must-close). Zero-trust shape chosen by the author (rejected options
// recorded in the S7 notes): a `linear type` value must be closed exactly once on EVERY path, any use
// after close or after a move is refused, a second close is refused, and dropping it unclosed is refused.
// Proposed codes (to be registered in the .fungi naming registry before the round check):
//   FUNGI-LINEAR-001 LINEAR_USE_AFTER_CLOSE, FUNGI-LINEAR-002 LINEAR_NOT_CLOSED, FUNGI-LINEAR-003 LINEAR_CLOSED_TWICE.
// Synthetic data only. NON_AUTHORIZING. A closing round may rename codes but must not weaken an assertion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { red, withUnit, galerina } from "./harness.mjs";

function check(body, sig) {
  const text = "@version 1\nlinear type Lease\npure flow f(" + (sig || "lease: Lease, cap: CloseCap") + ") -> Int\ncontract {\n  intent { \"synthetic linear lease probe\" }\n}\n{\n" + body + "}\n";
  return withUnit(text, (f, dir) => galerina(["check", f, "--strict-types", "--strict-governance"], dir));
}

function refused(r, code, label) {
  assert.notEqual(r.status, 0, label + ": check must fail");
  assert.doesNotMatch(r.text, /Unexpected token "linear"/, label + ": `linear type` must parse");
  assert.match(r.text, code, label + ": " + code + "\n" + r.text.slice(-400));
}

test("S7-R2a must-close: a Lease dropped without close is refused (FUNGI-LINEAR-002)", red("S7", "LEASE dropped"), () => {
  refused(check("  return 0\n"), /FUNGI-LINEAR-002/, "dropped");
});

test("S7-R2b must-close on every path: closed on one branch only is refused (FUNGI-LINEAR-002)", red("S7", "LEASE one-branch close"), () => {
  refused(check("  if flag == 1 {\n    close(lease, cap)\n  }\n  return 0\n", "lease: Lease, cap: CloseCap, flag: Int"), /FUNGI-LINEAR-002/, "one branch");
});

test("S7-R2c a second close is refused (FUNGI-LINEAR-003)", red("S7", "LEASE double close"), () => {
  refused(check("  close(lease, cap)\n  close(lease, cap)\n  return 0\n"), /FUNGI-LINEAR-003/, "double close");
});

test("S7-R2d use after close is refused (FUNGI-LINEAR-001)", red("S7", "LEASE use after close"), () => {
  refused(check("  close(lease, cap)\n  let x: Int = readLease(lease)\n  return x\n"), /FUNGI-LINEAR-001/, "use after close");
});

test("S7-R2e a rebinding moves the Lease: the old name is dead (FUNGI-LINEAR-001)", red("S7", "LEASE use after move"), () => {
  refused(check("  let other: Lease = lease\n  close(lease, cap)\n  close(other, cap)\n  return 0\n"), /FUNGI-LINEAR-001/, "use after move");
});

test("S7-R2f control: closed exactly once on every path raises no linear diagnostic and `linear type` parses", red("S7", "LEASE control"), () => {
  const once = check("  close(lease, cap)\n  return 0\n");
  const both = check("  if flag == 1 {\n    close(lease, cap)\n    return 1\n  }\n  close(lease, cap)\n  return 0\n", "lease: Lease, cap: CloseCap, flag: Int");
  for (const [r, label] of [[once, "once"], [both, "both paths"]]) {
    assert.doesNotMatch(r.text, /Unexpected token "linear"/, label + ": `linear type` must parse");
    assert.doesNotMatch(r.text, /FUNGI-LINEAR-\d{3}/, label + ": no linear diagnostic\n" + r.text.slice(-400));
  }
});