import assert from "node:assert/strict";
import { test } from "node:test";
import { checkValueStates, parseProgram } from "../../dist/index.js";

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
