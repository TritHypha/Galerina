import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const {
  benchmarkKindFromMainBody,
  admitBoundedInt,
} = require("./galerina.js");

test("a real main-body benchmark call is selected", () => {
  assert.equal(
    benchmarkKindFromMainBody("{ runComputeMixThroughputBenchmark(20_000, 2_000, 100_000) }"),
    "compute-mix",
  );
});

test("hostile: a string literal cannot select unbounded benchmark execution", () => {
  assert.equal(
    benchmarkKindFromMainBody('{ print("runComputeMixThroughputBenchmark(999999999, 1, 1)") }'),
    null,
  );
  assert.equal(
    benchmarkKindFromMainBody("{ print('guessFourDigitCode(\"0000\", 100000000)') }"),
    null,
  );
});

test("hostile: non-finite and oversized iteration counts clamp to the admitted ceiling", () => {
  assert.equal(admitBoundedInt(Number.POSITIVE_INFINITY, 1000, 1, 5000), 1000);
  assert.equal(admitBoundedInt(Number.NaN, 1000, 1, 5000), 1000);
  assert.equal(admitBoundedInt(9_999_999, 1000, 1, 5000), 5000);
  assert.equal(admitBoundedInt(3, 1000, 1, 5000), 3);
});
