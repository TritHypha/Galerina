import { readFileSync } from "node:fs";
import { parseProgram, resolveSymbols, checkTypes, checkValueStates, checkEffects, effectResultsToDiagnostics, verifyGovernance, checkEvents } from "../dist/index.js";

const src = readFileSync("C:/laragon/www/LO/docs/Examples/Level-1-Basics/003-secure-flow/example.spore", "utf8");
const parsed = parseProgram(src, "test.spore");
const sr = resolveSymbols(parsed.ast);
const tr = checkTypes(parsed.ast);
const vr = checkValueStates(parsed.ast);
const ef = checkEffects(parsed.flows, parsed.ast);
const gov = verifyGovernance(parsed.ast, parsed.flows, ef, "dev");
const ev = checkEvents(parsed.ast);
const all = [...parsed.diagnostics, ...sr.diagnostics, ...tr.diagnostics, ...vr.diagnostics, ...effectResultsToDiagnostics(ef), ...gov.diagnostics, ...ev.diagnostics];
all.forEach(d => console.log(d.code, d.severity, d.message.slice(0, 80)));
