import assert from "node:assert/strict";
import { test } from "node:test";
import { checkTypes, checkValueStates, parseProgram } from "../../dist/index.js";

function secretReturns(source) {
  const parsed = parseProgram(`@version 1\n${source}`, "helper-return-context.fungi");
  assert.deepEqual(parsed.diagnostics.filter(d => d.severity === "error"), []);
  return checkValueStates(parsed.ast, "production").diagnostics
    .filter(d => d.code === "FUNGI-SECRET-006");
}

test("secret-preserving helper uses its own result type inside a public flow", () => {
  assert.equal(secretReturns(`secure flow outer() -> Bool {
    fn preserve(value: SecureString) -> SecureString { return value }
    return true
  }`).length, 0);
});

test("secret-to-public helper refuses even inside a secret-preserving flow", () => {
  assert.equal(secretReturns(`secure flow outer(value: SecureString) -> SecureString {
    fn leak(payload: SecureString) -> String { return payload }
    return value
  }`).length, 1);
});

test("public helper remains accepted inside a public flow", () => {
  assert.equal(secretReturns(`secure flow outer() -> Bool {
    fn publicValue(value: String) -> String { return value }
    return true
  }`).length, 0);
});

test("outer public return context is restored after a secret-preserving helper", () => {
  assert.equal(secretReturns(`secure flow outer(value: SecureString) -> String {
    fn preserve(payload: SecureString) -> SecureString { return payload }
    return value
  }`).length, 1);
});

test("outer secret result context is restored after a public helper", () => {
  assert.equal(secretReturns(`secure flow outer(value: SecureString) -> SecureString {
    fn publicValue(text: String) -> String { return text }
    return value
  }`).length, 0);
});

// Each marked call must refuse at that exact location; unmarked calls must not
// acquire a sibling's or shadowed binding's governed-sink identity.
function assertSinkLocations(source) {
  const text = `@version 1\n${source}`;
  const parsed = parseProgram(text, "helper-alias-context.fungi");
  assert.deepEqual(parsed.diagnostics.filter(d => d.severity === "error"), []);
  const diagnostics = checkValueStates(parsed.ast, "production").diagnostics
    .filter(d => d.code === "FUNGI-VALUESTATE-003");
  assert.ok(diagnostics.every(d => d.severity === "error"));
  const expected = text.split("\n").flatMap((line, index) =>
    line.includes("// governed") ? [index + 1] : []);
  assert.deepEqual(diagnostics.map(d => d.location?.line), expected);
}

const aliasCases = [
  ["direct outer sink remains governed", `
    AuditLog.write(raw) // governed
  `],
  ["noncaptured outer alias remains governed", `
    let sink = AuditLog
    sink.write(raw) // governed
  `],
  ["direct helper sink remains governed", `
    fn helper() -> Bool {
      AuditLog.write(raw) // governed
      return true
    }
  `],
  ["helper captures outer sink alias", `
    let sink = AuditLog
    fn helper() -> Bool {
      sink.write(raw) // governed
      return true
    }
  `],
  ["helper captures a transitive outer alias", `
    let sink = AuditLog
    let relay = sink
    fn helper() -> Bool {
      relay.write(raw) // governed
      return true
    }
  `],
  ["nested helper extends a captured alias chain", `
    let sink = AuditLog
    fn helper() -> Bool {
      let relay = sink
      fn nested() -> Bool {
        let output = relay
        output.write(raw) // governed
        return true
      }
      return true
    }
  `],
  ["helper parameter shadows capture and outer alias is restored", `
    let sink = AuditLog
    fn helper(sink: String) -> Bool {
      sink.write(raw)
      let relay = sink
      relay.write(raw)
      return true
    }
    sink.write(raw) // governed
  `],
  ["helper literal binding shadows capture", `
    let sink = AuditLog
    fn helper() -> Bool {
      let sink = "local"
      sink.write(raw)
      return true
    }
    sink.write(raw) // governed
  `],
  ["helper nonmodule identifier binding shadows capture", `
    let sink = AuditLog
    fn helper(local: String) -> Bool {
      let sink = local
      let relay = sink
      relay.write(raw)
      return true
    }
    sink.write(raw) // governed
  `],
  ["typed helper alias retains module identity", `
    let sink = AuditLog
    fn helper() -> Bool {
      let relay: String = sink
      relay.write(raw) // governed
      return true
    }
  `],
  ["nested block shadow ends without losing helper capture", `
    let sink = AuditLog
    fn helper() -> Bool {
      if true {
        let sink = "local"
        sink.write(raw)
      }
      sink.write(raw) // governed
      return true
    }
  `],
  ["sibling helper shadow cannot erase capture or outer alias", `
    let sink = AuditLog
    fn first() -> Bool {
      let sink = "local"
      sink.write(raw)
      return true
    }
    fn second() -> Bool {
      sink.write(raw) // governed
      return true
    }
    sink.write(raw) // governed
  `],
  ["helper alias cannot govern a sibling or outer local", `
    let sink = "local"
    fn first() -> Bool {
      let sink = AuditLog
      sink.write(raw) // governed
      return true
    }
    fn second() -> Bool {
      sink.write(raw)
      return true
    }
    sink.write(raw)
  `],
  ["alias retains captured identity when its original name is shadowed", `
    let sink = AuditLog
    let relay = sink
    fn helper(sink: String) -> Bool {
      relay.write(raw) // governed
      sink.write(raw)
      return true
    }
  `],
  ["later local shadow cannot erase an earlier governed call", `
    let sink = AuditLog
    fn helper() -> Bool {
      sink.write(raw) // governed
      let sink = "local"
      sink.write(raw)
      return true
    }
  `],
];

for (const [name, body] of aliasCases) {
  test(name, () => assertSinkLocations(`secure flow outer(tainted raw: String) -> Bool {
    ${body}
    return true
  }`));
}

// Classification controls, not assertions of assignment soundness or execution.
const cases = [
  ['String', true],
  ['Brand<String,"SecureString">', true],
  ['Brand<String,SecureString>', true],
  ['Option<Brand<String,"SecureString">>', true],
  ['Authority<SecureString>', true],
  ['SecureString', false],
  ['Brand<SecureString,"public">', false],
  ['Option<SecureString>', false],
  ['Result<String,SecureString>', false],
];

function parseReturn(type) {
  const source = `@version 1\nsecure flow outer(value: SecureString) -> Bool contract { intent { "Synthetic classification regression" } } { fn helper(payload: SecureString) -> ${type} { return payload } return true }`;
  const parsed = parseProgram(source, "secret-return-metadata.fungi");
  assert.deepEqual(parsed.diagnostics.filter(d => d.severity === "error"), [], "fixture must parse");
  return parsed.ast;
}

function secretErrors(ast) {
  return checkValueStates(ast, "production").diagnostics
    .filter(d => d.code === "FUNGI-SECRET-006" && d.severity === "error");
}

for (const [type, refuse] of cases) {
  test(`secret result confidentiality classification: ${type}`, () => {
    const ast = parseReturn(type);
    assert.deepEqual(checkTypes(ast).diagnostics.filter(d => d.severity === "error"), [], "fixture must reach confidentiality checking");
    assert.equal(secretErrors(ast).length, refuse ? 1 : 0, "metadata is not a secret type component");
  });
}

// These isolate confidentiality classification; some malformed types have an
// independent type error. A false tag must not suppress SECRET-006 anyway.
for (const type of [
  'Money<SecureString>', 'Array<String,SecureString>', 'SecureString<String>',
  'Brand<SecureString>', 'Result<SecureString,,String>',
  'Result<SecureString,"not a type">', 'UnknownBox<SecureString>',
  'Tensor<String,[SecureString]>', 'Vector<String,SecureString>',
  'Matrix<String,1,SecureString>', 'Embedding<SecureString>',
  String.raw`Brand<String,"x\" SecureString">`,
  String.raw`Brand<String,"\u{22},SecureString,\u{22}">`,
  'Option<Brand<String,"SecureString,<>,[]">>',
]) {
  test(`non-type or invalid structure cannot preserve a secret: ${type}`, () => {
    assert.equal(secretErrors(parseReturn(type)).length, 1);
  });
}

for (const type of [
  'Array<SecureString>', 'Result<Option<SecureString>,String>',
  'Map<String,Array<SecureString>>', 'Tensor<SecureString,[1,128]>',
  'Vector<SecureString,N>', 'Matrix<SecureString,Rows,Cols>',
  'Brand<SecureString,"a,b">', 'protected SecureString',
  String.raw`Brand<SecureString,"\u{22},String,\u{22}">`,
]) {
  test(`real type component survives nesting and opaque payloads: ${type}`, () => {
    assert.equal(secretErrors(parseReturn(type)).length, 0);
  });
}

function findHelper(ast) {
  if (ast.kind === "fnDecl") return ast;
  for (const child of ast.children ?? []) {
    const found = findHelper(child);
    if (found) return found;
  }
}

test("parser keeps compatibility text and children while retaining literal identity", () => {
  const ast = parseReturn(String.raw`Brand<String,"\u{22},SecureString,\u{22}">`);
  const type = findHelper(ast).children.find(c => c.kind === "typeRef");
  assert.equal(type.value, 'Brand<String,"",SecureString,"">');
  assert.equal(type.children, undefined);
  assert.equal(type.typeStructure.kind, "type");
  assert.equal(type.typeStructure.args.length, 2);
  assert.equal(type.typeStructure.args[1].kind, "payload");
  assert.equal(secretErrors(JSON.parse(JSON.stringify(ast))).length, 1);
});

test("legacy/synthetic typeRef strings do not authorize even genuine-looking types", () => {
  for (const type of ['SecureString', 'Option<SecureString>', 'Brand<String,"SecureString">']) {
    const ast = parseReturn(type);
    delete findHelper(ast).children.find(c => c.kind === "typeRef").typeStructure;
    assert.equal(secretErrors(ast).length, 1, type);
  }
});

test("missing delimiters cannot produce authorizing type evidence", () => {
  const parsed = parseProgram('@version 1\nflow f(x: SecureString) -> Option<SecureString', "incomplete.fungi");
  const type = parsed.ast.children[0].children.find(c => c.kind === "typeRef");
  assert.equal(type.typeStructure.kind, "invalid");
  assert.ok(parsed.diagnostics.some(d => d.severity === "error"));
});
