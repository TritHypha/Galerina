import assert from "node:assert/strict";
import { test } from "node:test";
import { exportContractSchemasFromSource } from "../../galerina-core-compiler/dist/index.js";
import { generateOpenApi, OpenApiGenerationError } from "../dist/index.js";

function generate(types, responseType = "Root", sourceIdentity = "test:nested") {
  return generateOpenApi({
    info: { title: "Nested contracts", version: "1" },
    routes: [{ method: "GET", path: "/nested", handler: "nested", responseType }],
    contractSchemas: { schemaVersion: "galerina.contract-types.v1", sourceIdentity, types },
  });
}

test("C17 compiler nested records and arrays emit the complete reachable schema closure", () => {
  const result = exportContractSchemasFromSource(`record Leaf { value: Int }
record Branch { leaf: Leaf }
record Root { branches: Array<Branch> }
record Unused { label: String }
`);
  assert.equal(result.ok, true);
  const before = JSON.stringify(result.export);
  const doc = generate(result.export.types, "Root", result.export.sourceIdentity);
  assert.deepEqual(Object.keys(doc.components.schemas).sort(), ["Branch", "Error", "Leaf", "Root"]);
  assert.equal(doc.components.schemas.Root.properties.branches.items.$ref, "#/components/schemas/Branch");
  assert.equal(doc.components.schemas.Branch.properties.leaf.$ref, "#/components/schemas/Leaf");
  assert.equal(doc.components.schemas.Leaf.properties.value.type, "integer");
  assert.equal(doc.components.schemas.Leaf["x-galerina-contract-source"], result.export.sourceIdentity);
  assert.equal(JSON.stringify(result.export), before);
  result.export.types.Leaf.properties.value.type = "string";
  assert.equal(doc.components.schemas.Leaf.properties.value.type, "integer");
});

test("recursive schema references terminate and preserve reference identity", () => {
  const doc = generate({ Root: { type: "object", properties: { children: { type: "array", items: { $ref: "#/types/Root" } } } } });
  assert.equal(doc.components.schemas.Root.properties.children.items.$ref, "#/components/schemas/Root");
  assert.doesNotThrow(() => JSON.stringify(doc));
});

test("missing and inherited transitive definitions refuse", () => {
  const Root = { type: "object", properties: { child: { $ref: "#/types/Missing" } } };
  for (const types of [{ Root }, Object.assign(Object.create({ Missing: { type: "string" } }), { Root })]) {
    assert.throws(() => generate(types), OpenApiGenerationError);
  }
});

test("transitive sanitized-name collisions refuse", () => {
  assert.throws(() => generate({
    Root: { properties: { a: { $ref: "#/types/A B" }, b: { $ref: "#/types/A@B" } } },
    "A B": { type: "string" }, "A@B": { type: "integer" },
  }), /collide as OpenAPI component/);
});

test("C17 __proto__ field export is preserved and OpenAPI refuses it closed", () => {
  const result = exportContractSchemasFromSource(`record Root { __proto__: String }\n`);
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.export.types.Root.properties, "__proto__"), true);
  assert.deepEqual(result.export.types.Root.required, ["__proto__"]);
  assert.throws(
    () => generate(result.export.types, "Root", result.export.sourceIdentity),
    OpenApiGenerationError,
  );
});

test("C17 __proto__ record export keeps the definition and OpenAPI refuses the reserved name", () => {
  const result = exportContractSchemasFromSource(`record __proto__ { value: Int }
record Root { nested: __proto__ }
`);
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn(result.export.types, "__proto__"), true);
  assert.equal(result.export.types.Root.properties.nested.$ref, "#/types/__proto__");
  const serialized = JSON.parse(JSON.stringify(result.export));
  assert.equal(Object.hasOwn(serialized.types, "__proto__"), true);
  assert.throws(
    () => generate(result.export.types, "Root", result.export.sourceIdentity),
    OpenApiGenerationError,
  );
});

test("shared Error and prototype-sensitive component names cannot be shadowed", () => {
  for (const name of ["Error", "__proto__", "constructor", "prototype"]) {
    assert.throws(() => generate({ [name]: { type: "string" } }, name), OpenApiGenerationError);
    assert.throws(() => generate({ Root: { properties: { child: { $ref: `#/types/${name}` } } }, [name]: { type: "string" } }), OpenApiGenerationError);
  }
});

test("transitive accessor definitions refuse without invoking getters", () => {
  let calls = 0;
  const types = { Root: { properties: { child: { $ref: "#/types/Child" } } } };
  Object.defineProperty(types, "Child", { get() { calls++; return { type: "string" }; } });
  assert.throws(() => generate(types), /data property/);
  assert.equal(calls, 0);
});

test("malformed and external source references refuse", () => {
  for (const ref of ["#/types/", "#/types/Root/field", "https://example.invalid/type", 1, null]) {
    assert.throws(() => generate({ Root: { properties: { child: { $ref: ref } } } }), OpenApiGenerationError);
  }
});

test("cyclic objects and excessive schema depth refuse with a typed error", () => {
  const cyclic = { type: "object" };
  cyclic.properties = { self: cyclic };
  assert.throws(() => generate({ Root: cyclic }), OpenApiGenerationError);
  let deep = { type: "string" };
  for (let i = 0; i < 70; i++) deep = { type: "array", items: deep };
  assert.throws(() => generate({ Root: deep }), OpenApiGenerationError);
});

test("proxy schema objects refuse without invoking traps", () => {
  let calls = 0;
  const hostile = new Proxy({}, { ownKeys() { calls++; throw new Error("trap"); } });
  assert.throws(() => generate({ Root: hostile }), OpenApiGenerationError);
  assert.equal(calls, 0);
});

test("bounded transitive schema work refuses oversized closures", () => {
  const types = {};
  for (let i = 0; i < 1025; i++) types[`T${i}`] = i === 1024 ? { type: "string" } : { properties: { next: { $ref: `#/types/T${i + 1}` } } };
  assert.throws(() => generate(types, "T0"), /schema limit/);
});
