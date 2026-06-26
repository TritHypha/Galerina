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

// Test: 060-invalid-email-assignment (wrapped in flow)
const src060 = `
type Email = Brand<String, EmailTag>

pure flow example(rawEmail: String) -> Void {
  let email: protected Email = rawEmail
}
`;
console.log("060 wrapped:");
run(src060).forEach(d => console.log(`  ${d.code} ${d.severity}: ${d.message.slice(0,80)}`));

// Test: 073-money-cross-currency (wrapped in flow)
const src073 = `
pure flow example(gbp: Money<GBP>, usd: Money<USD>) -> Void {
  let total = gbp + usd
}
`;
console.log("\n073 wrapped:");
run(src073).forEach(d => console.log(`  ${d.code} ${d.severity}: ${d.message.slice(0,80)}`));

// Test: 084-unknown-type (wrapped in flow)
const src084 = `
pure flow example() -> Void {
  let value: MadeUpType = 42
}
`;
console.log("\n084 wrapped:");
run(src084).forEach(d => console.log(`  ${d.code} ${d.severity}: ${d.message.slice(0,80)}`));

// Test: 065-option-invalid-arity (wrapped in flow)
const src065 = `
pure flow example() -> Void {
  let user: Option<User, Error>
}
`;
console.log("\n065 wrapped:");
run(src065).forEach(d => console.log(`  ${d.code} ${d.severity}: ${d.message.slice(0,80)}`));
