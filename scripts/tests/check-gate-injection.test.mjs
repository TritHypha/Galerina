import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCaller, runClassifySelfTest } from "../check-gate-injection.mjs";

test("self-test table classifies offender/guarded/test/skip/none", () => {
  const result = runClassifySelfTest();
  assert.equal(result.ok, true, JSON.stringify(result.failures));
});

test("hostile: comment or unrelated identifier does not inject the revocation gate", () => {
  assert.equal(classifyCaller("src/host.ts", "fusePackage(pkg); const revocationCheck = true;"), "offender");
  assert.equal(classifyCaller("src/host.ts", "/* revocationCheck */\nfusePackage(pkg)"), "offender");
  assert.equal(classifyCaller("src/host.ts", "fusePackage(pkg) // revocationCheck"), "offender");
  assert.equal(classifyCaller("src/host.ts", "fusePackage(pkg, { revocationCheck })"), "guarded");
});
