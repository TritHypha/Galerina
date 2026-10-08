import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { assertScalarClassifierAsset, proveScalarClassifier } from "../../../scripts/lib/scalar-classifier-fungi-proof.mjs";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_ROOT = join(PACKAGE_ROOT, "..", "..", "packages", "fungi", "products", "galerina", "rd0873-core-runtime");
const PRODUCT_TREE = "packages/fungi/products/galerina/rd0873-core-runtime";
const ASSET = "terminal-scope.fungi";
const CASES = Object.freeze([
  ...["succeeded", "failed", "timed_out", "cancelled"].map((value) => ({ value, expected: true })),
  ...["running", "cancelling", "", "Succeeded", "failed ", "cancelled\u0000"].map((value) => ({ value, expected: false })),
]);

describe("core-runtime package-owned terminal scope decision", () => {
  it("requires the exact governed Fungi asset and live source union", () => {
    assertScalarClassifierAsset({
      packageRoot: PACKAGE_ROOT,
      assetRoot: PRODUCT_ROOT,
      assetRelative: ASSET,
      productTree: PRODUCT_TREE,
      referenceRelative: "src/structured-await.ts",
      assertReference(reference) {
        assert.match(reference, /export type StructuredAwaitScopeStatus =\s*\| "running"\s*\| "cancelling"\s*\| StructuredAwaitTerminalOutcome;/u);
        assert.match(reference, /function isTerminalScope\(status: StructuredAwaitScopeStatus\): boolean \{\s*return status === "succeeded" \|\|\s*status === "failed" \|\|\s*status === "timed_out" \|\|\s*status === "cancelled";\s*\}/u);
      },
    });
  });

  it("matches every scope state and hostile surplus text", async () => {
    await proveScalarClassifier({ packageRoot: PACKAGE_ROOT, assetRoot: PRODUCT_ROOT, assetRelative: ASSET, flowName: "isTerminalScope", parameterName: "status", cases: CASES });
  });
});
