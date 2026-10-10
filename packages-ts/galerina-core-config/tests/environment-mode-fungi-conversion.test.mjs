import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  assertScalarClassifierAsset,
  proveScalarClassifier,
} from "../../../scripts/lib/scalar-classifier-fungi-proof.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_ROOT = join(PACKAGE_ROOT, "..", "..", "packages", "fungi", "products", "galerina", "rd0873-core-config");
const ASSET = "environment-mode.fungi";
const CASES = Object.freeze([
  ...["development", "test", "staging", "production"].map((value) => ({ value, expected: true })),
  ...["", "Development", " production ", "preview", "production\u0000"].map((value) => ({ value, expected: false })),
]);

describe("core-config package-owned environment mode decision", () => {
  it("requires the exact governed Fungi asset and live source table", () => {
    assertScalarClassifierAsset({
      packageRoot: PACKAGE_ROOT,
      assetRoot: PRODUCT_ROOT,
      productTree: "packages/fungi/products/galerina/rd0873-core-config",
      assetRelative: ASSET,
      referenceRelative: "src/index.ts",
      assertReference(reference) {
        assert.match(reference, /export const GALERINA_ENVIRONMENT_MODES = \[\s*"development",\s*"test",\s*"staging",\s*"production",\s*\] as const;/u);
        assert.match(reference, /export function isEnvironmentMode\(value: string\): value is EnvironmentMode \{\s*return ENVIRONMENT_MODE_SET\.has\(value\);\s*\}/u);
      },
    });
  });

  it("matches every fixed mode and hostile surplus text", async () => {
    await proveScalarClassifier({ packageRoot: PACKAGE_ROOT, assetRoot: PRODUCT_ROOT, assetRelative: ASSET, flowName: "isEnvironmentMode", parameterName: "value", cases: CASES });
  });
});
