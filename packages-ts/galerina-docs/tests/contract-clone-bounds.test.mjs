import assert from "node:assert/strict";
import { test } from "node:test";
import { generateOpenApi } from "../dist/index.js";

function generate(types, responseType = "Root") {
  return generateOpenApi({
    info: { title: "Clone bounds", version: "1" },
    routes: [{ method: "GET", path: "/nested", handler: "nested", responseType }],
    contractSchemas: { schemaVersion: "galerina.contract-types.v1", sourceIdentity: "test:clone-bounds", types },
  });
}

test("cloned contract value budget refuses more than 65,536 values", () => {
  const enumValues = [];
  for (let i = 0; i < 65_537; i++) enumValues.push("x");
  assert.throws(
    () => generate({ Root: { type: "string", enum: enumValues } }),
    /depth or value limit/,
  );
});

test("empty source schema objects refuse", () => {
  assert.throws(() => generate({ Root: {} }), /must not be empty/);
});

test("non-finite numbers in cloned schemas refuse", () => {
  assert.throws(() => generate({ Root: { maximum: Infinity } }), /non-finite number/);
  assert.throws(() => generate({ Root: { minimum: Number.NaN } }), /non-finite number/);
});

test("array holes and extra array properties refuse", () => {
  const items = ["string"];
  items[2] = "integer";
  assert.throws(() => generate({ Root: { type: "array", prefixItems: items } }), /array holes or extra properties/);
});

test("symbol properties on cloned schemas refuse without enumerating them as JSON keys", () => {
  const schema = { type: "object" };
  schema[Symbol("hidden")] = 1;
  assert.throws(() => generate({ Root: schema }), /symbol properties/);
});

test("undefined and bigint cloned leaves refuse as non-JSON values", () => {
  assert.throws(() => generate({ Root: { default: undefined } }), /non-JSON value/);
  assert.throws(() => generate({ Root: { default: 1n } }), /non-JSON value/);
});
