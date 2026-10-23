import assert from "node:assert/strict";
import { it } from "node:test";
import * as L from "../dist/index.js";

const STRING_SOURCE = [
  "pure flow sameString(left: String, right: String) -> Bool",
  "contract { effects {} }",
  "{",
  "  let a: Option<String> = Some(left)",
  "  let b: Option<String> = Some(right)",
  "  return a == b",
  "}",
].join("\n");

const ARRAY_STRING_SOURCE = ["get", "first", "last"].map((accessor) => {
  const access = accessor === "get" ? "items.get(0)" : `items.${accessor}()`;
  return [
    `pure flow sameVia${accessor[0].toUpperCase()}${accessor.slice(1)}(items: Array<String>, candidate: String) -> Bool`,
    "contract { effects {} }",
    "{",
    `  let selected: Option<String> = ${access}`,
    "  let expected: Option<String> = Some(candidate)",
    "  return selected == expected",
    "}",
  ].join("\n");
}).join("\n");

const STATIC_ARRAY_STRING_SOURCE = ["get", "first", "last"].map((accessor) => {
  const access = accessor === "get" ? "Array.get(items, 0)" : `Array.${accessor}(items)`;
  return [
    `pure flow sameStatic${accessor[0].toUpperCase()}${accessor.slice(1)}(items: Array<String>, candidate: String) -> Bool`,
    "contract { effects {} }",
    "{",
    `  let selected: Option<String> = ${access}`,
    "  let expected: Option<String> = Some(candidate)",
    "  return selected == expected",
    "}",
  ].join("\n");
}).join("\n");

const nestSome = (depth, leaf) => {
  let value = leaf;
  for (let index = 0; index < depth; index++) value = `Some(${value})`;
  return value;
};
const eightLevelOptionType = `${"Option<".repeat(8)}Float${">".repeat(8)}`;
const EIGHT_LEVEL_OPTION_SOURCE = [
  "pure flow eightLevelFloatZero() -> Bool",
  "contract { effects {} }",
  "{",
  `  let a: ${eightLevelOptionType} = ${nestSome(8, "0.0")}`,
  `  let b: ${eightLevelOptionType} = ${nestSome(8, "-0.0")}`,
  "  return a == b",
  "}",
].join("\n");

const SOURCE = `
pure flow same() -> Bool
contract { effects {} }
{
  let a: Option<Int> = Some(7)
  let b: Option<Int> = Some(7)
  return a == b
}

pure flow different() -> Bool
contract { effects {} }
{
  let a: Option<Int> = Some(7)
  let b: Option<Int> = Some(8)
  return a == b
}

pure flow sameFloatZero() -> Bool
contract { effects {} }
{
  let a: Option<Float> = Some(0.0)
  let b: Option<Float> = Some(-0.0)
  return a == b
}

pure flow differentFloat() -> Bool
contract { effects {} }
{
  let a: Option<Float> = Some(0.0)
  let b: Option<Float> = Some(1.0)
  return a == b
}

pure flow unequalFloat() -> Bool
contract { effects {} }
{
  let a: Option<Float> = Some(0.0)
  let b: Option<Float> = Some(1.0)
  return a != b
}

pure flow sameNone() -> Bool
contract { effects {} }
{
  let a: Option<Float> = None
  let b: Option<Float> = None
  return a == b
}

pure flow noneAndSome() -> Bool
contract { effects {} }
{
  let a: Option<Float> = None
  let b: Option<Float> = Some(1.0)
  return a == b
}

pure flow nestedFloatZero() -> Bool
contract { effects {} }
{
  let x: Option<Float> = Some(0.0)
  let y: Option<Float> = Some(-0.0)
  let a: Option<Option<Float>> = Some(x)
  let b: Option<Option<Float>> = Some(y)
  return a == b
}

pure flow deeplyNestedFloatZero() -> Bool
contract { effects {} }
{
  let x: Option<Float> = Some(0.0)
  let y: Option<Float> = Some(-0.0)
  let a: Option<Option<Option<Float>>> = Some(Some(x))
  let b: Option<Option<Option<Float>>> = Some(Some(y))
  return a == b
}
`;

it("Option equality across Int, String and Float agrees in interpreter and admitted Wasm", async () => {
  const program = L.parseProgram(SOURCE + "\n" + STRING_SOURCE + "\n" + ARRAY_STRING_SOURCE + "\n" + STATIC_ARRAY_STRING_SOURCE + "\n" + EIGHT_LEVEL_OPTION_SOURCE, "option-equality-parity.fungi");
  const parseErrors = (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error");
  assert.deepEqual(parseErrors, []);
  const typeErrors = L.checkTypes(program.ast).diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  assert.deepEqual(typeErrors, []);

  const effects = L.checkEffects(program.flows, program.ast);
  const { gir } = L.emitGIR(program.ast, program.flows, effects);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "option-equality-parity", program.ast, true));
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));

  const host = L.createHostRuntime();
  for (const entry of L.getInternedStrings()) host.seedString(entry.handle, entry.value);
  host.seedString(1000, "same");
  host.seedString(1001, "same");
  const sameStrings = host.internArray([1000]);
  const keypair = L.generateRunnerKeypair();
  const attestation = L.signWasm(assembled.wasm, keypair.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: assembled.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem: keypair.publicKeyPem },
    host,
  });

  for (const [name, expected] of [["same", true], ["different", false]]) {
    const interpreted = await L.executeFlow(name, new Map(), program.ast, program.flows);
    const interpretedBool = interpreted?.value?.value;
    const wasmBool = instance.exports[name]();
    assert.equal(interpretedBool, expected, `${name} must use structural Option value equality in the interpreter`);
    assert.equal(wasmBool, expected ? 1 : 0, `${name} must use structural Option value equality in Wasm`);
  }
  const interpretedZero = await L.executeFlow("sameFloatZero", new Map(), program.ast, program.flows);
  assert.equal(interpretedZero?.value?.value, true);
  assert.equal(instance.exports.sameFloatZero(), 1, "Option<Float> equality follows Float value equality, not payload-handle identity");
  for (const [name, expected] of [["differentFloat", false], ["unequalFloat", true], ["sameNone", true], ["noneAndSome", false]]) {
    const interpreted = await L.executeFlow(name, new Map(), program.ast, program.flows);
    assert.equal(interpreted?.value?.value, expected, `${name} interpreter result`);
    assert.equal(instance.exports[name](), expected ? 1 : 0, `${name} Wasm result`);
  }
  const nested = await L.executeFlow("nestedFloatZero", new Map(), program.ast, program.flows);
  assert.equal(nested?.value?.value, true);
  assert.equal(instance.exports.nestedFloatZero(), 1,
    "nested Option<Float> equality must recursively compare its Float value");
  const deeplyNested = await L.executeFlow("deeplyNestedFloatZero", new Map(), program.ast, program.flows);
  assert.equal(deeplyNested?.value?.value, true);
  assert.equal(instance.exports.deeplyNestedFloatZero(), 1,
    "three-level nested Option<Float> equality must compare the leaf Float value, not nested handles");
  const eightLevel = await L.executeFlow("eightLevelFloatZero", new Map(), program.ast, program.flows);
  assert.equal(eightLevel?.value?.value, true);
  assert.equal(instance.exports.eightLevelFloatZero(), 1,
    "equality must remain value-based at the compiler's maximum admitted generic nesting depth");

  const sameStringArgs = new Map([
    ["left", { __tag: "string", value: "same" }],
    ["right", { __tag: "string", value: "same" }],
  ]);
  const interpretedStrings = await L.executeFlow("sameString", sameStringArgs, program.ast, program.flows);
  assert.equal(interpretedStrings?.value?.value, true);
  assert.equal(instance.exports.sameString(1000, 1001), 1, "equal String payloads must compare by value, not handle");
  for (const name of ["sameViaGet", "sameViaFirst", "sameViaLast"]) {
    const args = new Map([
      ["items", { __tag: "list", items: [{ __tag: "string", value: "same" }] }],
      ["candidate", { __tag: "string", value: "same" }],
    ]);
    const interpreted = await L.executeFlow(name, args, program.ast, program.flows);
    assert.equal(interpreted?.value?.value, true, `${name} interpreter result`);
    assert.equal(instance.exports[name](sameStrings, 1001), 1,
      `${name} must snapshot the array String value before constructing the Option`);
  }
  for (const name of ["sameStaticGet", "sameStaticFirst", "sameStaticLast"]) {
    assert.equal(instance.exports[name](sameStrings, 1001), 1,
      `${name} must use the same String-value Option semantics as the instance forms`);
  }
});
