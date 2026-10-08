import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeypairForOutput } from "../dist/keygen-policy.js";

test("keygen TTY refusal happens before allocating a secret key", () => {
  let generated = 0;
  let refused = 0;
  assert.throws(() => generateKeypairForOutput(
    true,
    false,
    () => { generated += 1; return { secretKey: Uint8Array.of(1, 2, 3) }; },
    () => { refused += 1; throw new Error("REFUSED: secret key output to TTY"); },
  ), /REFUSED/);
  assert.equal(refused, 1);
  assert.equal(generated, 0, "refusal must precede keypair generation");
});

test("keygen policy permits explicit force and non-TTY output", () => {
  const pair = { secretKey: Uint8Array.of(1, 2, 3) };
  assert.equal(generateKeypairForOutput(true, true, () => pair, () => { throw new Error("unexpected refusal"); }), pair);
  assert.equal(generateKeypairForOutput(false, false, () => pair, () => { throw new Error("unexpected refusal"); }), pair);
});
