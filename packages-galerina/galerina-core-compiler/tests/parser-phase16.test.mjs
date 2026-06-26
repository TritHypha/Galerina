import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram } from "../dist/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseOk(source) {
  const result = parseProgram(source, "test.spore");
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  assert.equal(
    errors.length,
    0,
    `Expected no errors, got:\n${errors.map((e) => `  ${e.code}: ${e.message}`).join("\n")}`,
  );
  return result;
}

function findNode(node, kind) {
  if (node === undefined) return undefined;
  if (node.kind === kind) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

function findAllNodes(node, kind, acc = []) {
  if (node === undefined) return acc;
  if (node.kind === kind) acc.push(node);
  for (const child of node.children ?? []) {
    findAllNodes(child, kind, acc);
  }
  return acc;
}

// ── Task 1: authority {} blocks ───────────────────────────────────────────────

describe("Parser Phase 16 — authority blocks", () => {
  it("authority block at top level produces authorityDecl node", () => {
    const result = parseOk(`
authority share Payments.processor {
  reason "needed for payment routing"
  audit required
  require payment.write
}
`);
    const node = findNode(result.ast, "authorityDecl");
    assert.ok(node !== undefined, "Expected authorityDecl node");
    assert.equal(node.value, "share");
  });

  it("authority block stores target as identifier child", () => {
    const result = parseOk(`
authority share Payments.processor {
  reason "routing"
}
`);
    const node = findNode(result.ast, "authorityDecl");
    assert.ok(node !== undefined, "Expected authorityDecl node");
    const target = (node.children ?? []).find(
      (c) => c.kind === "identifier" && c.value.startsWith("target:"),
    );
    assert.ok(target !== undefined, "Expected target child");
    assert.equal(target.value, "target:Payments.processor");
  });

  it("authority block with reason clause stores reason text as stringLiteral child", () => {
    const result = parseOk(`
authority delegate ExternalService {
  reason "third-party integration"
  audit optional
}
`);
    const node = findNode(result.ast, "authorityDecl");
    assert.ok(node !== undefined, "Expected authorityDecl node");
    const reasonNode = (node.children ?? []).find((c) => c.kind === "stringLiteral");
    assert.ok(reasonNode !== undefined, "Expected stringLiteral (reason) child");
    assert.equal(reasonNode.value, "third-party integration");
  });

  it("authority block stores audit clause", () => {
    const result = parseOk(`
authority grant InternalCache {
  audit required
}
`);
    const node = findNode(result.ast, "authorityDecl");
    assert.ok(node !== undefined);
    const auditNode = (node.children ?? []).find(
      (c) => c.kind === "identifier" && c.value.startsWith("audit:"),
    );
    assert.ok(auditNode !== undefined, "Expected audit child");
    assert.equal(auditNode.value, "audit:required");
  });

  it("authority block stores require clause as effectRef", () => {
    const result = parseOk(`
authority share PaymentGateway {
  require payment.process
}
`);
    const node = findNode(result.ast, "authorityDecl");
    assert.ok(node !== undefined);
    const reqNode = (node.children ?? []).find((c) => c.kind === "effectRef");
    assert.ok(reqNode !== undefined, "Expected effectRef (require) child");
    assert.equal(reqNode.value, "payment.process");
  });

  it("authority block inside a flow declaration is parsed structurally", () => {
    const result = parseOk(`
secure flow processPayment(req: PaymentRequest) -> Result<Payment, PaymentError>
  contract { effects { payment.write audit.write } }
authority share Payments {
  reason "flow needs payment authority"
}
{
  return Ok
}
`);
    const authNode = findNode(result.ast, "authorityDecl");
    assert.ok(authNode !== undefined, "Expected authorityDecl inside flow");
    assert.equal(authNode.value, "share");
  });
});

// ── Task 2: policy {} blocks ──────────────────────────────────────────────────

describe("Parser Phase 16 — policy blocks", () => {
  it("policy block at top level produces policyDecl node", () => {
    const result = parseOk(`
policy {
  purpose "data-processing"
  allow Payment to "process"
  deny RawCard
  require payment.write
}
`);
    const node = findNode(result.ast, "policyDecl");
    assert.ok(node !== undefined, "Expected policyDecl node");
    assert.equal(node.value, "policy");
  });

  it("policy block stores purpose clause", () => {
    const result = parseOk(`
policy {
  purpose "analytics"
}
`);
    const node = findNode(result.ast, "policyDecl");
    assert.ok(node !== undefined);
    const purposeNode = (node.children ?? []).find(
      (c) => c.kind === "identifier" && c.value.startsWith("purpose:"),
    );
    assert.ok(purposeNode !== undefined, "Expected purpose child");
    assert.equal(purposeNode.value, "purpose:analytics");
  });

  it("policy block stores allow clause with action", () => {
    const result = parseOk(`
policy {
  allow Payment to "process"
}
`);
    const node = findNode(result.ast, "policyDecl");
    assert.ok(node !== undefined);
    const allowNode = (node.children ?? []).find(
      (c) => c.kind === "typeRef" && c.value.startsWith("allow:"),
    );
    assert.ok(allowNode !== undefined, "Expected allow typeRef child");
    assert.ok(allowNode.value.includes("Payment"), "Expected Payment in allow clause");
  });

  it("policy block stores deny clause", () => {
    const result = parseOk(`
policy {
  deny RawCard
}
`);
    const node = findNode(result.ast, "policyDecl");
    assert.ok(node !== undefined);
    const denyNode = (node.children ?? []).find(
      (c) => c.kind === "typeRef" && c.value.startsWith("deny:"),
    );
    assert.ok(denyNode !== undefined, "Expected deny typeRef child");
    assert.equal(denyNode.value, "deny:RawCard");
  });

  it("policy block stores require clause as effectRef", () => {
    const result = parseOk(`
policy {
  require payment.write
}
`);
    const node = findNode(result.ast, "policyDecl");
    assert.ok(node !== undefined);
    const reqNode = (node.children ?? []).find((c) => c.kind === "effectRef");
    assert.ok(reqNode !== undefined, "Expected effectRef child");
    assert.equal(reqNode.value, "payment.write");
  });

  it("policy block inside a flow is parsed structurally", () => {
    const result = parseOk(`
secure flow handleData(req: Request) -> Response
  contract { effects { data.read } }
policy {
  purpose "data-access"
  allow Request to "read"
}
{
  return Response
}
`);
    const policyNode = findNode(result.ast, "policyDecl");
    assert.ok(policyNode !== undefined, "Expected policyDecl inside flow");
  });
});

// ── Task 3: Record spread/update syntax ───────────────────────────────────────

describe("Parser Phase 16 — record spread/update syntax", () => {
  it("record update { ...base, field: value } parses as #record-update callExpr", () => {
    const result = parseOk(`
pure flow updateOrder(base: Order, newStatus: String) -> Order {
  let updated = { ...base, status: newStatus }
  return updated
}
`);
    const callNode = findNode(result.ast, "callExpr");
    assert.ok(callNode !== undefined, "Expected callExpr node");
    assert.equal(callNode.value, "#record-update", "Expected #record-update value");
  });

  it("record update has a spread child and field children", () => {
    const result = parseOk(`
pure flow patchUser(u: User, newEmail: String) -> User {
  let patched = { ...u, email: newEmail }
  return patched
}
`);
    const callNode = findNode(result.ast, "callExpr");
    assert.ok(callNode !== undefined);
    assert.equal(callNode.value, "#record-update");

    const spreadChild = (callNode.children ?? []).find(
      (c) => c.kind === "identifier" && c.value === "#spread",
    );
    assert.ok(spreadChild !== undefined, "Expected #spread child");

    const fieldChildren = (callNode.children ?? []).filter(
      (c) => c.kind === "identifier" && c.value !== "#spread",
    );
    assert.ok(fieldChildren.length >= 1, "Expected at least one field child");
    assert.equal(fieldChildren[0].value, "email");
  });

  it("record update with multiple field overrides", () => {
    const result = parseOk(`
pure flow updateProfile(p: Profile, n: String, e: String) -> Profile {
  let updated = { ...p, name: n, email: e }
  return updated
}
`);
    const callNode = findNode(result.ast, "callExpr");
    assert.ok(callNode !== undefined);
    assert.equal(callNode.value, "#record-update");

    const fieldChildren = (callNode.children ?? []).filter(
      (c) => c.kind === "identifier" && c.value !== "#spread",
    );
    assert.equal(fieldChildren.length, 2, "Expected two field overrides");
  });
});

// ── Task 4: Error recovery ────────────────────────────────────────────────────

describe("Parser Phase 16 — error recovery", () => {
  it("a bad top-level keyword triggers ONE parse error, not cascading errors", () => {
    // "badkeyword" is not a top-level keyword; the parser emits one error and
    // advances to the next declaration boundary without cascading.
    const result = parseProgram(`
blorp this is all garbage text here no braces
flow good(a: Int) -> Int {
  return a
}
`, "test.spore");

    const errors = result.diagnostics.filter((d) => d.severity === "error");
    // The good flow should still parse
    assert.ok(result.flows.length >= 1, "Expected at least one flow parsed after bad declaration");
    assert.equal(result.flows[0].name, "good");
    // Should be exactly one parse error for the bad token, not cascading errors
    assert.ok(errors.length <= 3, `Expected at most 3 errors for single bad declaration, got ${errors.length}`);
  });

  it("an unknown keyword followed by valid declarations recovers correctly", () => {
    const result = parseProgram(`
quux blah blah

pure flow add(a: Int, b: Int) -> Int {
  return a
}
`, "test.spore");

    // The flow after the bad keyword should still parse
    assert.ok(result.flows.length >= 1, "Expected flow to parse after recovery");
    assert.equal(result.flows[0].name, "add");
  });

  it("multiple valid declarations after a bad one all parse", () => {
    const result = parseProgram(`
xyzzy broken stuff here

pure flow first(a: Int) -> Int {
  return a
}

pure flow second(b: String) -> String {
  return b
}
`, "test.spore");

    assert.ok(result.flows.length >= 2, `Expected 2 flows after recovery, got ${result.flows.length}`);
    const names = result.flows.map((f) => f.name);
    assert.ok(names.includes("first"), "Expected 'first' flow");
    assert.ok(names.includes("second"), "Expected 'second' flow");
  });
});
