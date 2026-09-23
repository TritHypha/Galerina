import { test } from "node:test";
import assert from "node:assert/strict";
import { admitBrandRel, parseBrandAudit, brandRelTargets } from "../fix-logicn-brand.mjs";

test("admitBrandRel refuses option-like and escaping stdin paths", () => {
  assert.equal(admitBrandRel("src/foo.ts"), true);
  assert.equal(admitBrandRel("--output=/tmp/pwn"), false);
  assert.equal(admitBrandRel("../secret.ts"), false);
  assert.equal(admitBrandRel("/etc/passwd"), false);
  assert.equal(admitBrandRel("C:\\Windows\\system32"), false);
  assert.equal(admitBrandRel(""), false);
});

test("parseBrandAudit refuses oversize and unshaped stdin", () => {
  assert.throws(() => parseBrandAudit("x".repeat(1_048_577)), /ERR_BRAND_AUDIT_SIZE/);
  assert.throws(() => parseBrandAudit("[]"), /ERR_BRAND_AUDIT_SHAPE/);
  const audit = parseBrandAudit(JSON.stringify({ findings: { STRAGGLER: [{ file: "../secret.ts" }, { file: "src/ok.ts" }] } }));
  assert.deepEqual(brandRelTargets(audit), ["src/ok.ts"]);
});
