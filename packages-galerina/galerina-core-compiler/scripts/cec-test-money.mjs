import { parseProgram, checkTypes } from "../dist/index.js";

const src = `pure flow ex(gbp: Money<GBP>, usd: Money<USD>) -> Void {
  let total = gbp + usd
}`;

const p = parseProgram(src, "test.spore");
const t = checkTypes(p.ast);
console.log("Money cross-currency test:");
if (t.diagnostics.length === 0) {
  console.log("  No diagnostics — cross-currency was NOT detected");
} else {
  t.diagnostics.forEach(d => console.log(`  ${d.code}: ${d.message.slice(0, 80)}`));
}
