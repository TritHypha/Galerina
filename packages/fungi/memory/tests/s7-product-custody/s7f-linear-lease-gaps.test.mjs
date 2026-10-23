// S7 round e (gcw-s7g), test-only: pins the 6 compiler mutants that survived the gcw-s7rc3 round check at
// 1b00d3963 (LM3 any ident as CloseCap, LM6 unanalysable loop/match passed, LM8 close without cap,
// LM9 return after close, LM10 arity guard widened, PM1 alias/body accepted). The s7f adversarial probes
// were run by hand; these make them binding. Zero-trust: a close that cannot prove a CloseCap-typed
// capability does not discharge; a construct the pass cannot analyse that touches a live Lease is refused.
// Synthetic data only. NON_AUTHORIZING. A closing round may rename codes but must not weaken an assertion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { red, withUnit, galerina } from "./harness.mjs";

const SIG = "lease: Lease, cap: CloseCap, flag: Int";

function check(body) {
  const text = "@version 1\nlinear type Lease\npure flow f(" + SIG + ") -> Int\ncontract {\n  intent { \"synthetic linear lease gap probe\" }\n}\n{\n" + body + "}\n";
  return withUnit(text, (f, dir) => galerina(["check", f, "--strict-types", "--strict-governance"], dir));
}

function raw(text) {
  return withUnit(text, (f, dir) => galerina(["check", f], dir));
}

function refused(r, code, label) {
  assert.notEqual(r.status, 0, label + ": check must fail");
  assert.doesNotMatch(r.text, /Unexpected token "linear"/, label + ": `linear type` must parse");
  assert.match(r.text, code, label + ": " + code + "\n" + r.text.slice(-400));
}

test("S7-R2g close without a capability argument does not discharge (LM8, FUNGI-LINEAR-002)", red("S7", "LEASE close no cap"), () => {
  refused(check("  close(lease)\n  return 0\n"), /FUNGI-LINEAR-002/, "close no cap");
});

test("S7-R2h an Int argument is not a CloseCap: close does not discharge (LM3, FUNGI-LINEAR-002)", red("S7", "LEASE Int as cap"), () => {
  refused(check("  close(lease, flag)\n  return 0\n"), /FUNGI-LINEAR-002/, "Int as cap");
});

test("S7-R2i close with an extra argument does not discharge (LM10, FUNGI-LINEAR-002)", red("S7", "LEASE close arity"), () => {
  refused(check("  close(lease, cap, flag)\n  return 0\n"), /FUNGI-LINEAR-002/, "extra arg");
});

test("S7-R2j a while loop touching a live Lease is refused as unanalysable (LM6, FUNGI-LINEAR-002)", red("S7", "LEASE loop"), () => {
  refused(check("  while flag == 1 {\n    close(lease, cap)\n  }\n  return 0\n"), /FUNGI-LINEAR-002/, "while");
});

test("S7-R2k a match touching a live Lease is refused as unanalysable (LM6, FUNGI-LINEAR-002)", red("S7", "LEASE match"), () => {
  refused(check("  match flag {\n    1 => { close(lease, cap) }\n    _ => { close(lease, cap) }\n  }\n  return 0\n"), /FUNGI-LINEAR-002/, "match");
});

test("S7-R2l returning a Lease after close is use after close (LM9, FUNGI-LINEAR-001)", red("S7", "LEASE return after close"), () => {
  const text = "@version 1\nlinear type Lease\npure flow f(lease: Lease, cap: CloseCap) -> Lease\ncontract {\n  intent { \"synthetic linear lease gap probe\" }\n}\n{\n  close(lease, cap)\n  return lease\n}\n";
  refused(withUnit(text, (f, dir) => galerina(["check", f, "--strict-types", "--strict-governance"], dir)), /FUNGI-LINEAR-001/, "return after close");
});

test("S7-R2m an alias or bodied linear type is refused (PM1, FUNGI-LINEAR-004)", red("S7", "LEASE alias/body"), () => {
  refused(raw("@version 1\nlinear type Lease = Int\n"), /FUNGI-LINEAR-004/, "alias");
  refused(raw("@version 1\nlinear type Lease { }\n"), /FUNGI-LINEAR-004/, "body");
});

test("S7-R2n control: `linear` stays an ordinary identifier outside `linear type`", red("S7", "LEASE ident control"), () => {
  const r = raw("@version 1\nflow g(linear: Int) -> Int {\n  return linear\n}\n");
  assert.doesNotMatch(r.text, /Unexpected token "linear"/, "ident: must parse\n" + r.text.slice(-400));
  assert.doesNotMatch(r.text, /FUNGI-LINEAR-\d{3}/, "ident: no linear diagnostic\n" + r.text.slice(-400));
});