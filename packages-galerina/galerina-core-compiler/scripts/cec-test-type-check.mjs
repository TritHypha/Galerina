import { parseProgram, checkTypes } from "../dist/index.js";

function run(src) {
  const p = parseProgram(src, "test.spore");
  const t = checkTypes(p.ast);
  return t.diagnostics;
}

// 060: raw String to protected Email
const src060 = `type Email = Brand<String, EmailTag>
pure flow example(rawEmail: String) -> Void {
  let email: protected Email = rawEmail
}`;
console.log("060 (raw String -> protected Email):");
run(src060).forEach(d => console.log(`  ${d.code}: ${d.message.slice(0, 80)}`));

// 062: protected Email to redacted Email (direct, no redact())
const src062 = `type Email = Brand<String, EmailTag>
pure flow example(email: protected Email) -> Void {
  let auditEmail: redacted Email = email
}`;
console.log("\n062 (protected Email -> redacted Email, no redact()):");
run(src062).forEach(d => console.log(`  ${d.code}: ${d.message.slice(0, 80)}`));

// 086: same as 062
console.log("\n086 (same as 062):");
run(src062).forEach(d => console.log(`  ${d.code}: ${d.message.slice(0, 80)}`));

// 087: protected -> redact() -> redacted (CORRECT pattern, expect no errors)
const src087 = `type Email = Brand<String, EmailTag>
guarded flow example(email: protected Email) -> Void
  with effects [audit.write]
{
  let auditEmail: redacted Email = redact(email)
  AuditLog.write({ email: auditEmail })
}`;
console.log("\n087 (protected -> redact() -> redacted, expect no errors):");
run(src087).forEach(d => console.log(`  ${d.code}: ${d.message.slice(0, 80)}`));
if (run(src087).filter(d => d.severity === "error").length === 0) {
  console.log("  (no error diagnostics)");
}
