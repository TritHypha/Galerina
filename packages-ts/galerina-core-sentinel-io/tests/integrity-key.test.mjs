// integrity-key.test.mjs — zero-trust default, owner may revisit: a keyed IntegrityMonitor refuses an
// empty or all-zero HMAC key.
//
// Supplying `hmacKey` switches the hardened border's gate to keyed HMAC-SHA256, but any Uint8Array was
// accepted — including `new Uint8Array(0)` and an all-zero buffer, keys an attacker can reproduce, so a
// tampered block could be re-MAC'd to pass. The constructor now refuses them with LSIO-KEY-001 (new,
// package-local, same family convention as LSIO-MAP-00x). Plain-SHA mode (no key) is unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { IntegrityMonitor, SecurityTrap } from "../dist/index.js";

const refused = (hmacKey) =>
  assert.throws(() => new IntegrityMonitor({ hmacKey }), (e) => e instanceof SecurityTrap && e.code === "LSIO-KEY-001");

test("an empty HMAC key is refused", () => refused(new Uint8Array(0)));
test("an all-zero 32-byte HMAC key is refused", () => refused(new Uint8Array(32)));
test("an all-zero key of any other length is refused", () => { refused(new Uint8Array(1)); refused(new Uint8Array(64)); });
test("a non-Uint8Array HMAC key is refused", () => { refused("secret"); refused([1, 2, 3]); });

test("control: a non-zero key and the unkeyed SHA-256 mode are still admitted", () => {
  assert.equal(new IntegrityMonitor({ hmacKey: new TextEncoder().encode("super-secret-key") }).keyed, true);
  assert.equal(new IntegrityMonitor().keyed, false);
  assert.equal(new IntegrityMonitor({}).keyed, false);
});
