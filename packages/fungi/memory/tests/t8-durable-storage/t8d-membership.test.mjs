// T8-R4 (RD-1415-T8, Q11 TUF-style membership signed by Phillip). Synthetic data only. NON_AUTHORIZING.
// admitMembership(currentVersion, newVersion, validSigs, threshold, signerState, expired)
// signerState: 0 UNKNOWN_NEEDS_PHILLIP_SIGNATURE 1 OWNER_SIGNED_VERIFIED else Unlisted. expired: 0 FRESH 1 EXPIRED.
// packed: 100 ADMITTED, 22 ROLLBACK_OR_GAP_REFUSED (new != current+1), 23 THRESHOLD_REFUSED (threshold < 1
// or validSigs < threshold), 24 FREEZE_REFUSED (expired), 25 SIGNER_UNKNOWN_REFUSED, 11 Unlisted/negative.
// shippedMembershipSigner() returns 0: the shipped root is UNKNOWN until Phillip signs it (zero trust:
// rejected a Grok-signed root and trust-on-first-use).
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, withUnit, invoke } from "./harness.mjs";

const UNITS = ["c-boundary", "adapter-profile", "durable-store"];

function grid(flow, fn) {
  return withUnit(flatten(UNITS), (file) => fn((args) => {
    const r = invoke(file, flow, args);
    assert.equal(r.status, 0, flow + "(" + args.join(",") + ") status " + r.text);
    assert.equal(r.present, true, flow + "(" + args.join(",") + ") value absent " + r.text);
    return r.value;
  }));
}
test("T8-R4 M1: a fully valid, owner-signed, next-version, fresh root is admitted", () => {
  grid("admitMembership", (call) => {
    assert.equal(call([3, 4, 2, 2, 1, 0]), 100);
    assert.equal(call([0, 1, 3, 2, 1, 0]), 100);
  });
});

test("T8-R4 M2: rollback, replay, version gap, freeze, short threshold and unknown signer each refuse", () => {
  grid("admitMembership", (call) => {
    for (const [a, want] of [
      [[4, 3, 2, 2, 1, 0], 22], [[4, 4, 2, 2, 1, 0], 22], [[4, 6, 2, 2, 1, 0], 22],
      [[3, 4, 2, 2, 1, 1], 24],
      [[3, 4, 1, 2, 1, 0], 23], [[3, 4, 0, 0, 1, 0], 23],
      [[3, 4, 2, 2, 0, 0], 25],
    ]) {
      assert.equal(call(a), want, "admitMembership(" + a.join(",") + ")");
    }
  });
});

test("T8-R4 M3: negatives and unlisted values refuse 11, never 100", () => {
  grid("admitMembership", (call) => {
    for (const a of [
      [-1, 0, 2, 2, 1, 0], [3, 4, -1, 2, 1, 0], [3, 4, 2, -2, 1, 0],
      [3, 4, 2, 2, 2, 0], [3, 4, 2, 2, -1, 0], [3, 4, 2, 2, 1, 2], [3, 4, 2, 2, 1, -1],
    ]) {
      assert.equal(call(a), 11, "admitMembership(" + a.join(",") + ")");
    }
  });
});

test("T8-R4 M4: the shipped membership signer is UNKNOWN and so refuses", () => {
  grid("shippedMembershipSigner", (call) => {
    assert.equal(call([]), 0);
  });
  grid("admitMembership", (call) => {
    assert.equal(call([0, 1, 1, 1, 0, 0]), 25);
  });
});