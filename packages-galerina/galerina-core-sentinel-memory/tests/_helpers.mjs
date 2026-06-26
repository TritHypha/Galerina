// _helpers.mjs — shared test utilities.
import assert from "node:assert/strict";

/** Run `fn`, assert it throws, and return the thrown error for further checks. */
export function caught(fn) {
  let error;
  assert.throws(fn, (e) => {
    error = e;
    return true;
  });
  return error;
}
