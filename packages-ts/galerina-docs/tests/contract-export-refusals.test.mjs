// End-to-end refusal fixtures for Option / Result / Decimal contract fields (Grok 2026-10-06;
// zero-trust defaults, owner may revisit). Test only: no src change.
//
// Docs TODO HOLD "Option/Result and Decimal schema semantics" needs the compiler contract export
// owner's admitted mapping and refusal fixtures. This file supplies the refusal half: the
// compiler refuses these field types (FUNGI-CONTRACT-SCHEMA-003, no export), and the docs
// generator then refuses to document the route rather than emit a placeholder schema. The
// mapping half stays open (Codex H5). Evidence that refusal is the frozen v1 contract:
// RD-1287 (Decimal refused) and RD-1289 (fractions refused, not mapped to Decimal).

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { exportContractSchemasFromSource } from "../../galerina-core-compiler/dist/index.js";
import { generateOpenApi, OpenApiGenerationError } from "../dist/index.js";

const REFUSED_FIELDS = Object.freeze([
  ["Option<Int>", "option.fungi"],
  ["Result<Int, String>", "result.fungi"],
  ["Decimal", "decimal.fungi"],
  ["Array<Decimal>", "array-decimal.fungi"],
  ["Option<Decimal>", "option-decimal.fungi"],
]);

function routeInput(contractSchemas) {
  return {
    info: { title: "Refusal API", version: "1.0.0" },
    ...(contractSchemas !== undefined ? { contractSchemas } : {}),
    routes: [{
      method: "POST",
      path: "/wrap",
      handler: "wrap",
      requestType: "Wrap",
      auth: { mode: "public" },
    }],
  };
}

describe("Option / Result / Decimal contract fields are refused end to end", () => {
  for (const [fieldType, sourceName] of REFUSED_FIELDS) {
    it(`compiler refuses ${fieldType} with FUNGI-CONTRACT-SCHEMA-003 and no export`, () => {
      const result = exportContractSchemasFromSource(`record Wrap {\n  value: ${fieldType}\n}\n`, sourceName);
      assert.equal(result.ok, false);
      assert.equal("export" in result, false);
      assert.ok(result.diagnostics.length > 0);
      assert.ok(result.diagnostics.some((d) => d.code === "FUNGI-CONTRACT-SCHEMA-003"));
    });
  }

  it("docs refuses the route when no contract export exists (no placeholder schema)", () => {
    assert.throws(() => generateOpenApi(routeInput(undefined)), OpenApiGenerationError);
  });

  it("docs refuses when the refused record is absent from an otherwise valid export", () => {
    const sibling = exportContractSchemasFromSource(`record Other {\n  amount: Int\n}\n`, "other.fungi");
    assert.equal(sibling.ok, true);
    assert.equal(Object.prototype.hasOwnProperty.call(sibling.export.types, "Wrap"), false);
    assert.throws(() => generateOpenApi(routeInput(sibling.export)), OpenApiGenerationError);
  });

  it("a record mixing an admitted field with a refused one is refused as a whole", () => {
    const mixed = exportContractSchemasFromSource(
      `record Wrap {\n  amount: Int\n  price: Decimal\n}\n`,
      "mixed.fungi",
    );
    assert.equal(mixed.ok, false);
    assert.equal("export" in mixed, false);
    assert.ok(mixed.diagnostics.some((d) => d.code === "FUNGI-CONTRACT-SCHEMA-003"));
  });

  it("the admitted Int control still exports and documents (the refusals above are not a broken harness)", () => {
    const ok = exportContractSchemasFromSource(`record Wrap {\n  value: Int\n}\n`, "control.fungi");
    assert.equal(ok.ok, true);
    const doc = generateOpenApi(routeInput(ok.export));
    assert.equal(doc.components.schemas.Wrap.properties.value.type, "integer");
  });
});
