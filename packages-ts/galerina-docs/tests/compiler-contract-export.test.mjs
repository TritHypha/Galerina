import assert from "node:assert/strict";
import { test } from "node:test";

import { exportContractSchemasFromSource } from "../../galerina-core-compiler/dist/index.js";
import { generateOpenApi } from "../dist/index.js";

const SOURCE = `record ChargeRequest {
  amount: Int
}
`;

function runtimeChargeRequest(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 1 && Number.isFinite(value.amount);
}

test("compiler record export survives OpenAPI generation and matches the runtime validator", () => {
  const exported = exportContractSchemasFromSource(SOURCE, "charge.fungi");
  assert.equal(exported.ok, true);

  const doc = generateOpenApi({
    info: { title: "Charge API", version: "1.0.0" },
    contractSchemas: exported.export,
    routes: [{
      method: "POST",
      path: "/charge",
      handler: "charge",
      requestType: "ChargeRequest",
      auth: { mode: "public" },
    }],
  });

  const schema = doc.components.schemas.ChargeRequest;
  assert.equal(schema["x-galerina-contract-schema-version"], "galerina.contract-types.v1");
  assert.equal(schema["x-galerina-contract-source"], exported.export.sourceIdentity);
  assert.equal(schema["x-galerina-contract-type"], "ChargeRequest");
  assert.equal(schema.type, "object");
  assert.equal(schema.properties.amount.type, "integer");
  assert.deepEqual(schema.required, ["amount"]);

  assert.equal(runtimeChargeRequest({ amount: 100 }), true);
  assert.equal(runtimeChargeRequest({ amount: "x" }), false);
  assert.equal(runtimeChargeRequest({}), false);
  assert.equal(runtimeChargeRequest({ amount: 100, extra: true }), false);

  const integerField = schema.properties.amount.type === "integer";
  const requiredAmount = schema.required.includes("amount");
  assert.equal(integerField && requiredAmount, true);
});
