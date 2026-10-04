// runtime-context-timeout.test.mjs — a declared runtime timeout must be a real, positive bound.
//
// validateRuntimeContext only checked `timeoutMs <= 0`. NaN fails every comparison and Infinity is
// "positive", so createRuntimeContext() admitted a context whose timeout can never fire — a
// fail-open budget. The rule now matches the structured-await plan admission (positive safe integer)
// and reuses the existing Galerina_RUNTIME_TIMEOUT_INVALID code.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRuntimeContext, validateRuntimeContext } from "../dist/index.js";

const base = { mode: "compiled", projectRoot: "/srv/app", environment: "test" };
const timeoutInvalid = (timeoutMs) =>
  validateRuntimeContext({ ...base, timeoutMs }).some(
    (d) => d.code === "Galerina_RUNTIME_TIMEOUT_INVALID" && d.severity === "error",
  );

describe("validateRuntimeContext — timeoutMs is a positive safe integer when declared", () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1, 1.5, 2 ** 53]) {
    it(`refuses timeoutMs=${String(bad)}`, () => {
      assert.equal(timeoutInvalid(bad), true);
      assert.throws(() => createRuntimeContext({ ...base, timeoutMs: bad }));
    });
  }

  for (const good of [1, 2_000, Number.MAX_SAFE_INTEGER]) {
    it(`admits timeoutMs=${String(good)}`, () => {
      assert.equal(timeoutInvalid(good), false);
      assert.equal(createRuntimeContext({ ...base, timeoutMs: good }).timeoutMs, good);
    });
  }

  it("an omitted timeout stays valid (the bound is optional)", () => {
    assert.deepEqual(validateRuntimeContext(base), []);
  });
});
