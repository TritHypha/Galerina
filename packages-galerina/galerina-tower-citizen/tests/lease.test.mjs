// packages-galerina/galerina-tower-citizen/tests/lease.test.mjs — FAIL-CLOSED TTL capability lease (G6).
//
// Proves: ALLOW strictly within the window (now < notAfter); DENY exactly AT and after notAfter
// (half-open window, hard expiry); malformed/absent lease → INDETERMINATE collapse → deny-by-default
// carrying + sinking SPORE-GOV-3VL-001; purity/determinism (same (lease, now) → same decision, no
// clock read); and the soundness invariant that no non-ALLOW path authorizes.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkLease,
  isLeaseValid,
  leaseVerdict,
  Verdict,
  GOV_3VL_DIAGNOSTIC,
} from "../dist/index.js";

const { ALLOW, INDETERMINATE, DENY } = Verdict;
const lease = (over = {}) => ({ capability: "net.fetch", notAfter: 100, issuedTo: "plugin-a", ...over });

test("within window → ALLOW + authorized, no diagnostic", () => {
  const d = checkLease(lease(), 99);
  assert.equal(d.verdict, ALLOW);
  assert.equal(d.decision, "allow");
  assert.equal(d.authorized, true);
  assert.equal(d.reason, null);
  assert.equal(d.diagnostic, null);
  assert.equal(d.lease.capability, "net.fetch");
  assert.equal(isLeaseValid(lease(), 99), true);
});

test("AT notAfter → DENY (half-open window, hard expiry)", () => {
  const d = checkLease(lease(), 100);
  assert.equal(d.verdict, DENY);
  assert.equal(d.decision, "deny");
  assert.equal(d.authorized, false);
  assert.equal(d.reason, "expired");
  assert.equal(d.diagnostic, null, "expiry is an ordinary DENY, not SPORE-GOV-3VL-001");
  assert.equal(isLeaseValid(lease(), 100), false);
});

test("after notAfter → DENY", () => {
  const d = checkLease(lease(), 1_000_000);
  assert.equal(d.verdict, DENY);
  assert.equal(d.authorized, false);
  assert.equal(d.reason, "expired");
});

test("malformed / absent lease → INDETERMINATE collapse → deny-by-default, audited", () => {
  let sunk = null;
  const onDiag = (x) => { sunk = x; };
  const d = checkLease(null, 5, onDiag);
  assert.equal(d.verdict, INDETERMINATE);
  assert.equal(d.decision, "deny");
  assert.equal(d.authorized, false);
  assert.equal(d.reason, "malformed");
  assert.equal(d.lease, null);
  assert.ok(d.diagnostic && d.diagnostic.code === GOV_3VL_DIAGNOSTIC, "carries SPORE-GOV-3VL-001");
  assert.ok(sunk && sunk.code === GOV_3VL_DIAGNOSTIC, "forwarded to onDiagnostic sink");

  // each malformed shape independently denies
  assert.equal(checkLease(undefined, 5).authorized, false);
  assert.equal(checkLease({ capability: "x", issuedTo: "p" }, 5).reason, "malformed"); // no notAfter
  assert.equal(checkLease({ capability: "x", notAfter: 100 }, 5).reason, "malformed"); // no issuedTo
  assert.equal(checkLease({ capability: "x", notAfter: NaN, issuedTo: "p" }, 5).reason, "malformed");
  assert.equal(checkLease({ capability: "x", notAfter: Number.POSITIVE_INFINITY, issuedTo: "p" }, 5).reason, "malformed");
});

test("non-finite now → INDETERMINATE → deny (fail-closed on bad clock input)", () => {
  assert.equal(leaseVerdict(lease(), NaN), INDETERMINATE);
  assert.equal(checkLease(lease(), Number.POSITIVE_INFINITY).authorized, false);
  assert.equal(checkLease(lease(), Number.NEGATIVE_INFINITY).reason, "malformed");
});

test("pure + deterministic — same (lease, now) yields the same decision", () => {
  const a = checkLease(lease(), 42);
  const b = checkLease(lease(), 42);
  assert.deepEqual({ v: a.verdict, r: a.reason }, { v: b.verdict, r: b.reason });
});

test("leaseVerdict boundary truth: 99→ALLOW, 100→DENY, 101→DENY", () => {
  assert.equal(leaseVerdict(lease(), 99), ALLOW);
  assert.equal(leaseVerdict(lease(), 100), DENY);
  assert.equal(leaseVerdict(lease(), 101), DENY);
});
