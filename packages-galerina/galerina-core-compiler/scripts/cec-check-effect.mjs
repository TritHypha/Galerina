import { readFileSync } from "node:fs";
import { parseProgram, checkEffects, effectResultsToDiagnostics } from "../dist/index.js";

const src = readFileSync("C:/laragon/www/LO/docs/Examples/Level-9-Enterprise/462-policy-purpose/example.spore", "utf8");
const p = parseProgram(src, "test.spore");
const ef = checkEffects(p.flows, p.ast);
const diags = effectResultsToDiagnostics(ef);
console.log("Effect diagnostics:");
if (diags.length === 0) console.log("  (none)");
diags.forEach(d => console.log(`  ${d.code} ${d.severity}: ${d.message.slice(0,80)}`));
