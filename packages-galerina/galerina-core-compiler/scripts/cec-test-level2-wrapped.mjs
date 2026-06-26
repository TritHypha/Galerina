import { parseProgram, resolveSymbols, checkTypes, checkValueStates, checkEffects, effectResultsToDiagnostics, verifyGovernance, checkEvents } from "../dist/index.js";

function run(src) {
  const parsed = parseProgram(src, "test.spore");
  const sr = resolveSymbols(parsed.ast);
  const tr = checkTypes(parsed.ast);
  const vr = checkValueStates(parsed.ast);
  const ef = checkEffects(parsed.flows, parsed.ast);
  const gov = verifyGovernance(parsed.ast, parsed.flows, ef, "dev");
  const ev = checkEvents(parsed.ast);
  return [...parsed.diagnostics, ...sr.diagnostics, ...tr.diagnostics, ...vr.diagnostics, ...effectResultsToDiagnostics(ef), ...gov.diagnostics, ...ev.diagnostics];
}

const tests = [
  { name: "060-invalid-email-assignment", expected: "SPORE-TYPE-002",
    src: `type Email = Brand<String, EmailTag>
pure flow example(rawEmail: String) -> Void {
  let email: protected Email = rawEmail
}` },
  { name: "062-invalid-redacted-email", expected: "SPORE-TYPE-002",
    src: `type Email = Brand<String, EmailTag>
pure flow example(email: protected Email) -> Void {
  let auditEmail: redacted Email = email
}` },
  { name: "065-option-invalid-arity", expected: "SPORE-TYPE-009",
    src: `pure flow example() -> Void {
  let user: Option<User, Error> = None
}` },
  { name: "068-result-invalid-arity", expected: "SPORE-TYPE-009",
    src: `pure flow example() -> Void {
  let result: Result<User> = Ok(None)
}` },
  { name: "070-auto-invalid", expected: "SPORE-TYPE-002",
    src: `pure flow example() -> Void {
  let count: Auto
}` },
  { name: "073-money-cross-currency-invalid", expected: "SPORE-TYPE-004",
    src: `pure flow example(gbp: Money<GBP>, usd: Money<USD>) -> Void {
  let total = gbp + usd
}` },
  { name: "076-money-times-money-invalid", expected: "SPORE-TYPE-004",
    src: `pure flow example(price: Money<GBP>, vat: Money<GBP>) -> Void {
  let result = price * vat
}` },
  { name: "078-money-ratio-cross-currency-invalid", expected: "SPORE-TYPE-004",
    src: `pure flow example(revenue: Money<GBP>, usdRevenue: Money<USD>) -> Void {
  let ratio = revenue / usdRevenue
}` },
  { name: "081-tensor-invalid-arity", expected: "SPORE-TYPE-009",
    src: `pure flow example() -> Void {
  let embedding: Tensor<Float32> = None
}` },
  { name: "083-readonly-view-invalid", expected: "SPORE-TYPE-009",
    src: `pure flow example() -> Void {
  let users: ReadOnlyView<User, Config> = None
}` },
  { name: "084-unknown-type", expected: "SPORE-TYPE-001",
    src: `pure flow example() -> Void {
  let value: MadeUpType = 42
}` },
  { name: "085-type-mismatch", expected: "SPORE-TYPE-002",
    src: `pure flow example() -> Void {
  let count: Int = "42"
}` },
  { name: "086-protected-not-redacted", expected: "SPORE-TYPE-002",
    src: `type Email = Brand<String, EmailTag>
pure flow example(email: protected Email) -> Void {
  let auditEmail: redacted Email = email
}` },
  { name: "087-protected-email-audit (expectNone)", expected: "none",
    src: `type Email = Brand<String, EmailTag>
guarded flow example(email: protected Email) -> Void
  with effects [audit.write]
{
  let auditEmail: redacted Email = redact(email)
  AuditLog.write({ email: auditEmail })
}` },
];

for (const t of tests) {
  const diags = run(t.src);
  const found = t.expected === "none"
    ? diags.filter(d => d.severity === "error").length === 0
    : diags.some(d => d.code === t.expected);
  console.log(`${found ? "PASS" : "FAIL"} ${t.name} (expected ${t.expected})`);
  if (!found) {
    diags.forEach(d => console.log(`  ${d.code} ${d.severity}: ${d.message.slice(0, 70)}`));
  }
}
