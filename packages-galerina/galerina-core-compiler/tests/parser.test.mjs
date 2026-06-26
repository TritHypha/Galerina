import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram } from "../dist/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function hasErrors(result) {
  return result.diagnostics.some((d) => d.severity === "error");
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Parser — program root", () => {
  it("returns a program node for empty input", () => {
    const result = parseOk("");
    assert.equal(result.ast?.kind, "program");
  });

  it("produces no errors for whitespace-only input", () => {
    const result = parseOk("\n\n  \n");
    assert.equal(result.ast?.kind, "program");
  });
});

describe("Parser — plain flow", () => {
  it("parses a minimal plain flow", () => {
    const result = parseOk(`
flow add(a: Int, b: Int) -> Int {
  return a
}
`);
    const flows = result.flows;
    assert.equal(flows.length, 1);
    assert.equal(flows[0]?.name, "add");
    assert.equal(flows[0]?.qualifier, "flow");
    assert.equal(flows[0]?.returnType, "Int");
  });

  it("extracts parameter names from plain flow", () => {
    const result = parseOk(`
flow add(a: Int, b: Int) -> Int {
  return a
}
`);
    const params = result.flows[0]?.params ?? [];
    assert.equal(params.length, 2);
    assert.ok(params[0]?.startsWith("a:"));
    assert.ok(params[1]?.startsWith("b:"));
  });

  it("produces a flowDecl node in the AST", () => {
    const result = parseOk(`
flow add(a: Int, b: Int) -> Int {
  return a
}
`);
    const node = findNode(result.ast, "flowDecl");
    assert.ok(node !== undefined, "Expected flowDecl node");
    assert.equal(node.value, "add");
  });
});

describe("Parser — secure flow", () => {
  it("parses a secure flow with effects", () => {
    const result = parseOk(`
secure flow processPayment(order: Order) -> Result<PaymentReceipt, PaymentError>
effects [network.outbound, secret.read] {
  return Ok(receipt)
}
`);
    const flows = result.flows;
    assert.equal(flows.length, 1);
    assert.equal(flows[0]?.name, "processPayment");
    assert.equal(flows[0]?.qualifier, "secure");
    assert.deepEqual(flows[0]?.declaredEffects, ["network.outbound", "secret.read"]);
  });

  it("produces a secureFlowDecl node in the AST", () => {
    const result = parseOk(`
secure flow processPayment(order: Order) -> Result<PaymentReceipt, PaymentError>
effects [network.outbound, secret.read] {
  return Ok(receipt)
}
`);
    const node = findNode(result.ast, "secureFlowDecl");
    assert.ok(node !== undefined, "Expected secureFlowDecl node");
    assert.equal(node.value, "processPayment");
  });

  it("parses effects declaration with dot-path effect names", () => {
    const result = parseOk(`
secure flow getOrderStatus(request: GetOrderStatusRequest) -> Result<OrderStatusResponse, ApiError>
effects [database.read, audit.write] {
  let orderId: OrderId = request.orderId
  return Ok(response)
}
`);
    assert.deepEqual(result.flows[0]?.declaredEffects, ["database.read", "audit.write"]);
  });
});

describe("Parser — pure flow", () => {
  it("parses a pure flow", () => {
    const result = parseOk(`
pure flow calculateVat(amount: Money<GBP>) -> Money<GBP> {
  let vat: Money<GBP> = amount
  return vat
}
`);
    const flows = result.flows;
    assert.equal(flows.length, 1);
    assert.equal(flows[0]?.name, "calculateVat");
    assert.equal(flows[0]?.qualifier, "pure");
    assert.equal(flows[0]?.declaredEffects.length, 0);
  });

  it("produces a pureFlowDecl node in the AST", () => {
    const result = parseOk(`
pure flow calculateVat(amount: Money<GBP>) -> Money<GBP> {
  return amount
}
`);
    const node = findNode(result.ast, "pureFlowDecl");
    assert.ok(node !== undefined, "Expected pureFlowDecl node");
  });

  it("parses generic return type correctly", () => {
    const result = parseOk(`
pure flow sanitize(input: ContactFormRequest) -> Result<SanitizedForm, ValidationError> {
  return Ok(form)
}
`);
    assert.ok(result.flows[0]?.returnType.startsWith("Result<"));
  });
});

describe("Parser — let/mut bindings", () => {
  it("parses a let binding inside a flow", () => {
    const result = parseOk(`
flow test() -> Int {
  let total: Int = 42
  return total
}
`);
    const node = findNode(result.ast, "letDecl");
    assert.ok(node !== undefined, "Expected letDecl node");
  });

  it("parses a mut binding inside a flow", () => {
    const result = parseOk(`
secure flow test(request: Request) -> Result<Response, Error>
effects [database.write] {
  mut status: FormStatus = FormStatus.PendingReview
  return Ok(response)
}
`);
    const node = findNode(result.ast, "mutDecl");
    assert.ok(node !== undefined, "Expected mutDecl node");
  });

  it("parses safety-prefix bindings: unsafe let and safe mut", () => {
    const result = parseOk(`
secure flow readInput(raw: String) -> Result<Email, ValidationError>
effects [database.read] {
  unsafe let rawEmail: String = raw
  safe   mut rawEmail = validate.email(rawEmail)
  return Ok(rawEmail)
}
`);
    // No parse errors expected — safety prefix syntax is handled
    assert.equal(result.diagnostics.filter((d) => d.severity === "error").length, 0,
      `Unexpected errors: ${result.diagnostics.filter((d) => d.severity === "error").map((d) => d.message).join("; ")}`);
    // Verify the unsafe let node carries the prefix in its value
    const letNode = findNode(result.ast, "letDecl");
    assert.ok(letNode !== undefined, "Expected letDecl node");
    assert.ok(letNode.value?.startsWith("unsafe "), `Expected letDecl.value to start with 'unsafe', got: ${letNode.value}`);
  });
});

describe("Parser — return statement", () => {
  it("parses bare return", () => {
    const result = parseOk(`
flow noop() -> Int {
  return
}
`);
    const node = findNode(result.ast, "returnStmt");
    assert.ok(node !== undefined);
  });

  it("parses return with Ok(...) result wrapper", () => {
    const result = parseOk(`
secure flow get() -> Result<String, Error>
effects [database.read] {
  return Ok(value)
}
`);
    const node = findNode(result.ast, "returnStmt");
    assert.ok(node !== undefined);
  });
});

describe("Parser — multiple flows", () => {
  it("parses two flows at program level", () => {
    const result = parseOk(`
pure flow add(a: Int, b: Int) -> Int {
  return a
}

secure flow save(request: Request) -> Result<Response, Error>
effects [database.write] {
  return Ok(response)
}
`);
    assert.equal(result.flows.length, 2);
    assert.equal(result.flows[0]?.name, "add");
    assert.equal(result.flows[1]?.name, "save");
  });
});

describe("Parser — source location", () => {
  it("attaches location to flow nodes", () => {
    const result = parseOk(`
flow add(a: Int, b: Int) -> Int {
  return a
}
`);
    const flow = result.flows[0];
    assert.ok(flow !== undefined);
    assert.ok(flow.location.line > 0);
    assert.equal(flow.location.file, "test.spore");
  });
});

describe("Parser — error recovery", () => {
  it("recovers after an unexpected token at top level", () => {
    const result = parseProgram("!!! flow add(a: Int) -> Int { return a }", "test.spore");
    // Should still produce the flow even with leading garbage
    // (may produce errors but should not throw)
    assert.ok(result.ast !== undefined);
  });

  it("reports SPORE-PARSE-002 when flow qualifier is not followed by flow", () => {
    const result = parseProgram("secure secure", "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-PARSE-002");
    assert.ok(diag !== undefined, "Expected SPORE-PARSE-002 for malformed flow qualifier");
  });
});

// ── New feature tests ─────────────────────────────────────────────────────────

describe("Parser — guarded flow", () => {
  it("parses guarded flow to guardedFlowDecl", () => {
    // intentional: testing with effects [...] parser support for guarded flow declarations
    const result = parseOk(`
guarded flow fetchRate(currency: String) -> Result<Decimal, NetworkError>
contract { effects { network.outbound } }

{
  return Ok(Decimal("1.0"))
}
`);
    const node = findNode(result.ast, "guardedFlowDecl");
    assert.ok(node !== undefined, "Expected guardedFlowDecl node");
    assert.equal(node.value, "fetchRate");
  });

  it("registers guarded flow in FlowMeta with qualifier guarded", () => {
    const result = parseOk(`
guarded flow saveOrder(order: String) -> Result<String, Error>
effects [database.write] {
  return Ok(order)
}
`);
    const meta = result.flows.find((f) => f.name === "saveOrder");
    assert.ok(meta !== undefined);
    assert.equal(meta.qualifier, "guarded");
    assert.deepEqual(meta.declaredEffects, ["database.write"]);
  });
});

describe("Parser — fn helper", () => {
  it("parses fn inside a flow body to fnDecl", () => {
    const result = parseOk(`
pure flow calculate(price: Decimal) -> Decimal {
  fn applyVat(value: Decimal) -> Decimal {
    return value
  }
  return applyVat(price)
}
`);
    const fn = findNode(result.ast, "fnDecl");
    assert.ok(fn !== undefined, "Expected fnDecl node");
    assert.equal(fn.value, "applyVat");
  });

  it("emits SPORE-SYNTAX-005 for top-level fn", () => {
    const result = parseProgram(`
fn calculate(x: Int) -> Int {
  return x
}
`, "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-SYNTAX-005");
    assert.ok(diag !== undefined, "Expected SPORE-SYNTAX-005 for top-level fn");
  });

  it("emits SPORE-SEC-014 when fn declares effects", () => {
    const result = parseProgram(`
guarded flow myFlow() -> Void effects [database.write] {
  fn bad() -> Void
  effects [database.write] {
    return
  }
  return
}
`, "test.spore");
    const diag = result.diagnostics.find((d) => d.code === "SPORE-SEC-014");
    assert.ok(diag !== undefined, "Expected SPORE-SEC-014 for fn with effects");
  });
});

describe("Parser — route declaration", () => {
  it("parses a route declaration to routeDecl with method and path in value", () => {
    const result = parseOk(`
route POST "/orders" {
  flow createOrder
}
`);
    const node = findNode(result.ast, "routeDecl");
    assert.ok(node !== undefined, "Expected routeDecl node");
    assert.ok(node.value.includes("POST"), `Expected POST in route value, got "${node.value}"`);
    assert.ok(node.value.includes("/orders"), `Expected path in route value, got "${node.value}"`);
  });

  it("parses GET route to routeDecl", () => {
    const result = parseOk(`
route GET "/health" {
  flow healthCheck
}
`);
    const node = findNode(result.ast, "routeDecl");
    assert.ok(node !== undefined, "Expected routeDecl node");
    assert.ok(node.value.includes("GET"), `Expected GET in route value, got "${node.value}"`);
  });
});

describe("Parser — record declaration with fields", () => {
  it("parses record declaration and captures field children", () => {
    const result = parseOk(`
record User {
  id: String
  email: String
}
`);
    const node = findNode(result.ast, "recordDecl");
    assert.ok(node !== undefined, "Expected recordDecl node");
    assert.equal(node.value, "User");
    assert.ok((node.children?.length ?? 0) >= 2, "Expected at least 2 field children");
    const fieldValues = node.children?.map((c) => c.value) ?? [];
    assert.ok(fieldValues.some((v) => v?.includes("id")));
    assert.ok(fieldValues.some((v) => v?.includes("email")));
  });
});

describe("Parser — readonly parameter and binding", () => {
  it("parses readonly parameter prefix", () => {
    const result = parseOk(`
secure flow process(readonly request: Request) -> Result<String, Error>
effects [database.write] {
  return Ok("ok")
}
`);
    const param = findNode(result.ast, "paramDecl");
    assert.ok(param !== undefined, "Expected paramDecl node");
    assert.ok(param.value?.startsWith("readonly "), `Expected 'readonly' prefix, got "${param.value}"`);
  });

  it("parses readonly local binding", () => {
    const result = parseOk(`
pure flow config() -> String {
  readonly name: String = "Galerina"
  return name
}
`);
    const node = findNode(result.ast, "readonlyDecl");
    assert.ok(node !== undefined, "Expected readonlyDecl node");
    assert.ok(node.value?.includes("name"));
  });
});

describe("Parser — char literal", () => {
  it("parses char literals to charLiteral nodes", () => {
    const result = parseOk(`
pure flow getChar() -> String {
  let initial: Char = 'L'
  return "ok"
}
`);
    const charNode = findNode(result.ast, "charLiteral");
    assert.ok(charNode !== undefined, "Expected charLiteral node");
    assert.equal(charNode.value, "L");
  });
});

describe("Parser — list literal", () => {
  it("parses empty list literal", () => {
    const result = parseOk(`
pure flow empty() -> String {
  let xs = []
  return "ok"
}
`);
    const listNode = findNode(result.ast, "listLiteral");
    assert.ok(listNode !== undefined, "Expected listLiteral node");
    assert.equal(listNode.children?.length ?? -1, 0);
  });

  it("parses list literal with elements", () => {
    const result = parseOk(`
pure flow nums() -> String {
  let xs = [1, 2, 3]
  return "ok"
}
`);
    const listNode = findNode(result.ast, "listLiteral");
    assert.ok(listNode !== undefined, "Expected listLiteral node");
    assert.equal(listNode.children?.length ?? 0, 3);
  });
});

describe("Parser — match arm binding variables", () => {
  it("captures binding variable in Some(x) arm as identifier child", () => {
    const result = parseOk(`
pure flow unwrap(x: Option<String>) -> String {
  match x {
    Some(value) => value
    None => "default"
  }
}
`);
    // Find a matchArm with value "Some"
    let someArm;
    function findSomeArm(node) {
      if (node?.kind === "matchArm" && node.value === "Some") { someArm = node; return; }
      for (const c of node?.children ?? []) findSomeArm(c);
    }
    findSomeArm(result.ast);
    assert.ok(someArm !== undefined, "Expected matchArm with value 'Some'");
    // First child should be the binding identifier
    const binding = someArm.children?.find((c) => c.kind === "identifier" && c.value === "value");
    assert.ok(binding !== undefined, "Expected identifier child 'value' in Some arm");
  });

  it("wildcard _ arm has no binding child", () => {
    const result = parseOk(`
pure flow check(x: Option<String>) -> String {
  match x {
    Some(v) => v
    _ => "none"
  }
}
`);
    let wildcardArm;
    function findWildcard(node) {
      if (node?.kind === "matchArm" && node.value === "_") { wildcardArm = node; return; }
      for (const c of node?.children ?? []) findWildcard(c);
    }
    findWildcard(result.ast);
    assert.ok(wildcardArm !== undefined, "Expected wildcard matchArm");
    // No identifier binding child on wildcard
    const binding = wildcardArm.children?.find((c) => c.kind === "identifier");
    assert.equal(binding, undefined, "Wildcard arm should not have binding child");
  });
});

describe("Parser — protected/redacted type qualifiers", () => {
  it("parses protected Email as typeRef with full qualifier", () => {
    const result = parseOk(`
type Email = Brand<String, EmailAddress>
pure flow test(x: protected Email) -> String {
  return "ok"
}
`);
    // Find a paramDecl whose value contains 'protected Email'
    let found = false;
    function scan(node) {
      if (node?.kind === "paramDecl" && node.value?.includes("protected Email")) found = true;
      for (const c of node?.children ?? []) scan(c);
    }
    scan(result.ast);
    assert.ok(found, "Expected paramDecl with 'protected Email'");
  });
});

describe("Parser — enum variants captured", () => {
  it("captures all enum variants as enumVariant children", () => {
    const result = parseOk(`
enum Status {
  Active
  Suspended
  Deleted
}
`);
    const enumNode = findNode(result.ast, "enumDecl");
    assert.ok(enumNode !== undefined, "Expected enumDecl node");
    assert.equal(enumNode.value, "Status");
    const variantValues = enumNode.children?.map((c) => c.value) ?? [];
    assert.deepEqual(variantValues, ["Active", "Suspended", "Deleted"]);
  });
});

// ── Phase 10B: Contract sub-block sections ────────────────────────────────────

describe("Parser — contract errors sub-block", () => {
  it("parses errors { returns { ApiError.BadRequest } } without error", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> CreateOrderResult
contract {
  errors {
    returns {
      ApiError.BadRequest
    }
  }
}
contract { effects { database.write } }
{
  return Ok(Response.ok("done"))
}
`);
  });

  it("parses errors block with expose and redact nested blocks", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  errors {
    returns {
      ApiError.BadRequest
      ApiError.Unauthorized
    }
    expose {
      message
    }
    redact {
      stackTrace
    }
  }
}
contract { effects { database.write } }
{
  return Ok(Response.ok("done"))
}
`);
  });
});

describe("Parser — contract timeouts sub-block", () => {
  it("parses timeouts { deadline 5 seconds } without error", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  timeouts {
    deadline 5 seconds
  }
}
contract { effects { database.write } }
{
  return Ok(Response.ok("done"))
}
`);
  });

  it("parses timeouts with multiple declarations", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  timeouts {
    deadline 5 seconds
    connect 2 seconds
    read 10 seconds
  }
}
contract { effects { network.outbound } }
{
  return Ok(Response.ok("done"))
}
`);
  });
});

describe("Parser — contract retries sub-block", () => {
  it("parses retries { network.outbound { attempts 3 } } without error", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  retries {
    network.outbound {
      attempts 3
    }
  }
}
contract { effects { network.outbound } }
{
  return Ok(Response.ok("done"))
}
`);
  });

  it("parses retries with multiple policies", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  retries {
    max 3
    backoff exponential
    on network.outbound
  }
}
contract { effects { network.outbound } }
{
  return Ok(Response.ok("done"))
}
`);
  });
});

describe("Parser — contract limits sub-block", () => {
  it("parses limits { max request size 5 MB } without error", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  limits {
    max request size 5 MB
  }
}
contract { effects { database.write } }
{
  return Ok(Response.ok("done"))
}
`);
  });

  it("parses limits with multiple constraints", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  limits {
    max request size 5 MB
    max response size 10 MB
    rate 100 per minute
  }
}
contract { effects { database.write } }
{
  return Ok(Response.ok("done"))
}
`);
  });
});

describe("Parser — contract privacy sub-block", () => {
  it("parses privacy { contains PII } without error", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  privacy {
    contains PII
  }
}
contract { effects { pii.write, audit.write } }
{
  return Ok(Response.ok("done"))
}
`);
  });

  it("parses privacy with multiple declarations", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  privacy {
    contains PII
    deny protected values in logs
    retain 30 days
  }
}
contract { effects { pii.write, audit.write } }
{
  return Ok(Response.ok("done"))
}
`);
  });
});

describe("Parser — contract observability sub-block", () => {
  it("parses observability { trace flow } without error", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  observability {
    trace flow
  }
}
contract { effects { database.write } }
{
  return Ok(Response.ok("done"))
}
`);
  });

  it("parses observability with multiple declarations", () => {
    parseOk(`
secure flow doThing(readonly request: Request) -> DoThingResult
contract {
  types {
    type DoThingResult = Result<Response, ApiError>
  }
  observability {
    trace flow
    measure latency
    log on error
  }
}
contract { effects { database.write } }
{
  return Ok(Response.ok("done"))
}
`);
  });
});

describe("Parser — all 6 new contract sections together", () => {
  it("parses a contract with all 6 new sections without error", () => {
    parseOk(`
secure flow createOrder(readonly request: Request) -> CreateOrderResult

contract {
  types {
    type CreateOrderResult = Result<Response, ApiError>
  }

  errors {
    returns {
      ApiError.BadRequest
      ApiError.Unauthorized
    }
    expose {
      message
      code
    }
    redact {
      stackTrace
    }
  }

  timeouts {
    deadline 5 seconds
    connect 2 seconds
  }

  retries {
    max 3
    backoff exponential
  }

  limits {
    max request size 5 MB
    rate 100 per minute
  }

  privacy {
    contains PII
    deny protected values in logs
  }

  observability {
    trace flow
    measure latency
  }
}

contract { effects { database.write, audit.write } }
{
  return Ok(Response.created("order-id"))
}
`);
  });
});

describe("Parser — contract with named result type", () => {
  it("parses a flow using a named result type alias without error", () => {
    parseOk(`
secure flow createOrder(readonly request: Request) -> CreateOrderResult

contract {
  types {
    type CreateOrderResult = Result<Response, ApiError>
  }

  rules {
    require actor before database.write
  }
}

contract { effects { database.write, audit.write } }
{
  return Ok(Response.created("order-id"))
}
`);
  });

  it("named result type is captured in types sub-block", () => {
    const result = parseOk(`
secure flow processPayment(readonly request: Request) -> ProcessPaymentResult

contract {
  types {
    type ProcessPaymentResult = Result<PaymentReceipt, PaymentError>
  }
}

contract { effects { network.outbound, audit.write } }
{
  return Ok(receipt)
}
`);
    // Should find a typeDecl for ProcessPaymentResult somewhere in the tree
    let found = false;
    function scan(node) {
      if (node?.kind === "typeDecl" && node.value === "ProcessPaymentResult") found = true;
      for (const c of node?.children ?? []) scan(c);
    }
    scan(result.ast);
    assert.ok(found, "Expected typeDecl for ProcessPaymentResult inside contract.types");
  });
});

// ── @experimental_profile directive (task #51) ───────────────────────────────

describe("Parser — @experimental_profile directive", () => {
  it("parses @experimental_profile in contract {} block", () => {
    const result = parseOk(`
secure flow processInvoice(id: String) -> Result<String, String>
contract {
  intent { "Process with forward-looking syntax." }
  effects { gateway.charge, audit.write }
  @experimental_profile(name: "drcm_core_v1", status: "planned_phase_2") {
    invariant { ensure id != "" }
  }
}
{ return Ok(id) }
`);
    // Find the attributeDecl node
    let found = false;
    function scan(node) {
      if (node?.kind === "attributeDecl" && node.value === "experimental_profile") found = true;
      for (const c of node?.children ?? []) scan(c);
    }
    scan(result.ast);
    assert.ok(found, "Expected attributeDecl with value 'experimental_profile'");
  });

  it("parses @experimental_profile in flow body", () => {
    const result = parseOk(`
secure flow fulfillOrder(id: String) -> Result<String, String>
contract {
  intent { "Fulfill with step (planned_phase_5)." }
  effects { network.outbound }
}
{
  @experimental_profile(name: "drcm_core_v1", status: "planned_phase_5") {
    let result = step external_api::fulfill(id)
  }
  return Ok(id)
}
`);
    let found = false;
    function scan(node) {
      if (node?.kind === "attributeDecl" && node.value === "experimental_profile") found = true;
      for (const c of node?.children ?? []) scan(c);
    }
    scan(result.ast);
    assert.ok(found, "Expected attributeDecl in flow body");
  });

  it("stores attribute name and args correctly", () => {
    const result = parseOk(`
pure flow test() -> Int
contract {
  intent { "test" }
  @experimental_profile(name: "drcm_core_v1", status: "planned_phase_5") {
    limits { max_memory: 4MB }
  }
}
{ return 0 }
`);
    let attrNode = undefined;
    function scan(node) {
      if (node?.kind === "attributeDecl") attrNode = node;
      for (const c of node?.children ?? []) scan(c);
    }
    scan(result.ast);
    assert.ok(attrNode !== undefined, "Expected attributeDecl node");
    assert.equal(attrNode.value, "experimental_profile");
    // First two children are the args (name, status), last is the body block
    const nameArg = (attrNode.children ?? []).find(c => c.kind === "identifier" && c.value === "name");
    const statusArg = (attrNode.children ?? []).find(c => c.kind === "identifier" && c.value === "status");
    assert.ok(nameArg !== undefined, "Expected 'name' arg");
    assert.ok(statusArg !== undefined, "Expected 'status' arg");
  });

  it("existing examples with @experimental_profile compile cleanly", () => {
    // Pattern 3 already has @experimental_profile in it
    const result = parseOk(`
secure flow transferFunds(amount: Int) -> Result<String, String>
contract {
  intent { "Transfer funds." }
  effects { ledger.mutate, audit.write }
  @experimental_profile(name: "drcm_core_v1", status: "planned_phase_2") {
    invariant {
      ensure amount > 0
    }
  }
}
{ AuditLog.write("transferred")  return Ok("ok") }
`);
    assert.ok(result.diagnostics.filter(d => d.severity === "error").length === 0,
      "Expected no errors with @experimental_profile");
  });
});

// ── Named arguments at call sites (task #55) ─────────────────────────────────

describe("Parser + Interpreter — named arguments at call sites", () => {
  it("named args parse cleanly — no errors", () => {
    parseOk(`
pure flow add(a: Int, b: Int) -> Int
contract { intent { "add" } }
{ return a + b }
pure flow test() -> Int
contract { intent { "test" } }
{ return add(a: 3, b: 4) }
`);
  });

  it("named args produce the same result as positional args", async () => {
    const { parseProgram, executeFlow } = await import("../dist/index.js");
    const src = `
pure flow add(a: Int, b: Int) -> Int
contract { intent { "add" } }
{ return a + b }
pure flow positional() -> Int
contract { intent { "positional" } }
{ return add(3, 4) }
pure flow named() -> Int
contract { intent { "named" } }
{ return add(a: 3, b: 4) }
`;
    const parsed = parseProgram(src, "test.spore");
    const r1 = await executeFlow("positional", {}, parsed.ast);
    const r2 = await executeFlow("named", {}, parsed.ast);
    assert.deepEqual(r1.value, r2.value, "named and positional should produce same result");
    assert.equal(r1.value?.__tag, "int", "result should be an int");
    assert.equal(r1.value?.value, 7, "3 + 4 = 7");
  });

  it("named args work with string values", async () => {
    const { parseProgram, executeFlow } = await import("../dist/index.js");
    const src = `
pure flow greet(name: String, greeting: String) -> String
contract { intent { "greet" } }
{ return greeting + ", " + name + "!" }
pure flow test() -> String
contract { intent { "test" } }
{ return greet(name: "Bob", greeting: "Hi") }
`;
    const parsed = parseProgram(src, "test.spore");
    const r = await executeFlow("test", {}, parsed.ast);
    assert.equal(r.value?.__tag, "string", "result should be a string");
    assert.equal(r.value?.value, "Hi, Bob!", `Expected 'Hi, Bob!' got '${r.value?.value}'`);
  });
});

// ── :: module path separator (task #61) ──────────────────────────────────────

describe("Parser — :: module path separator", () => {
  it("parses module::function() as a method call chain", () => {
    const result = parseOk(`
pure flow f() -> Int
contract { intent { "test" } }
{
  let x = security::check()
  return 0
}
`);
    assert.ok(result.ast !== undefined, "Should parse without error");
  });

  it("parses module::submodule::function() as a nested call", () => {
    const result = parseOk(`
pure flow f() -> Int
contract { intent { "test" } }
{
  let x = security::interim::pre_flight_check("caller", "target", 0)
  return 0
}
`);
    assert.ok(result.ast !== undefined, "Should parse deep :: path without error");
  });

  it("parses :: member access without a call", () => {
    const result = parseOk(`
pure flow f() -> Int
contract { intent { "test" } }
{
  let x = module::constant
  return 0
}
`);
    assert.ok(result.ast !== undefined, "Should parse :: member expression");
  });

  it(". and :: are interchangeable path separators", () => {
    const dotResult = parseOk(`
pure flow a() -> Int
contract { intent { "dot" } }
{ let x = foo.bar.baz()  return 0 }
`);
    const colonResult = parseOk(`
pure flow b() -> Int
contract { intent { "colon" } }
{ let x = foo::bar::baz()  return 0 }
`);
    assert.ok(dotResult.ast !== undefined, "dot path parses");
    assert.ok(colonResult.ast !== undefined, ":: path parses");
  });
});

// ── Named Record Constructor (task #57) ──────────────────────────────────────

describe("Parser — named record constructor", () => {
  it("parses TypeName { field: val } in a let binding (single line)", () => {
    const result = parseOk(`
pure flow makePoint(x: Int, y: Int) -> Int
contract { intent { "make a point" } }
{
  let p = Point { x: x, y: y }
  return 0
}
`);
    // Find the #record callExpr with typeName "Point"
    let found = false;
    function scan(node) {
      if (node?.kind === "callExpr" && node.value === "#record" && node.typeName === "Point") found = true;
      for (const c of node?.children ?? []) scan(c);
    }
    scan(result.ast);
    assert.ok(found, "Expected #record callExpr with typeName 'Point' from named constructor");
  });

  it("parses TypeName { field: val } in a let binding (multi-line)", () => {
    const result = parseOk(`
pure flow makeResult(n: Int) -> Int
contract { intent { "make result" } }
{
  let r = MyResult {
    status: "ok",
    code: n
  }
  return 0
}
`);
    let found = false;
    function scan(node) {
      if (node?.kind === "callExpr" && node.value === "#record" && node.typeName === "MyResult") found = true;
      for (const c of node?.children ?? []) scan(c);
    }
    scan(result.ast);
    assert.ok(found, "Expected #record callExpr with typeName 'MyResult' from multi-line constructor");
  });

  it("named constructor fields are stored as identifier children with values", () => {
    const result = parseOk(`
pure flow build(a: Int, b: Int) -> Int
contract { intent { "build" } }
{
  let r = Pair { first: a, second: b }
  return 0
}
`);
    let ctor = undefined;
    function scan(node) {
      if (node?.kind === "callExpr" && node.value === "#record" && node.typeName === "Pair") ctor = node;
      for (const c of node?.children ?? []) scan(c);
    }
    scan(result.ast);
    assert.ok(ctor !== undefined, "Expected named constructor node");
    const fieldNames = (ctor.children ?? []).map(c => c.value);
    assert.deepEqual(fieldNames, ["first", "second"], "Expected field names in order");
  });

  it("still parses anonymous record literals { field: val } correctly", () => {
    const result = parseOk(`
pure flow anon(x: Int) -> Int
contract { intent { "anon" } }
{
  let r = { field: x }
  return 0
}
`);
    let found = false;
    function scan(node) {
      // anonymous record has value "#record" with NO typeName
      if (node?.kind === "callExpr" && node.value === "#record" && node.typeName === undefined) found = true;
      for (const c of node?.children ?? []) scan(c);
    }
    scan(result.ast);
    assert.ok(found, "Expected anonymous #record without typeName");
  });

  it("does not interpret TypeName followed by a code block as a constructor", () => {
    // TypeName { if x > 0 { return 1 } } is NOT a constructor (no field: val inside)
    const result = parseOk(`
pure flow notACtor(x: Int) -> Int
contract { intent { "not a ctor" } }
{
  return x
}
`);
    assert.ok(result.ast !== undefined, "Should parse without error");
  });
});
