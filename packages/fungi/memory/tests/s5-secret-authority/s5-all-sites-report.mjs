// Turns evidence/s5-all-sites-mutants/results.json into report.md (synthetic data only).
import { readFileSync, writeFileSync } from "node:fs";
const dir = process.argv[2];
const { baseline, results } = JSON.parse(readFileSync(`${dir}/results.json`, "utf8"));
const surv = results.filter((r) => r.verdict === "SURVIVED");
const fam = {};
for (const r of results) { fam[r.family] ??= { red: 0, survived: 0, what: r.what }; fam[r.family][r.verdict === "RED" ? "red" : "survived"] += 1; }
const L = [];
L.push("# OPEN-S5-3: S5 secret-authority mutants at every site", "");
L.push("Base: Galerina main e367eb654 (clean clone, WSL node v24.20.0, app-kernel dist built with tsc --noCheck).");
L.push("Runner: `packages/fungi/memory/tests/s5-secret-authority/s5-all-sites-mutants.mjs`. Each site is mutated alone in the built dist JS, the killing set runs file by file until the first red file, then the dist file is restored and its sha256 re-checked.", "");
L.push(`Baseline over the killing set: pass=${baseline.pass} fail=${baseline.fail}.`, "");
L.push(`Result: ${results.length} site mutants, ${results.length - surv.length} RED, ${surv.length} SURVIVED.`, "");
L.push("| Family | What | RED | SURVIVED |", "|---|---|---|---|");
for (const [k, v] of Object.entries(fam)) L.push(`| ${k} | ${v.what} | ${v.red} | ${v.survived} |`);
L.push("", "| Mutant | src line | Verdict | Killer file | First failing test |", "|---|---|---|---|---|");
for (const r of results) L.push(`| ${r.id} | ${r.file.replace("/dist/", "/src/").replace(/\.js$/, ".ts")}:${r.srcLine} | ${r.verdict} | ${(r.killerFile ?? "-").split("/").pop()} | ${(r.killers[0] ?? "-").replace(/\|/g, "/")} |`);
L.push("");
L.push(surv.length ? "Survivors are open work: each needs a killing test before OPEN-S5-3 can close." : "Every site is killed, so the first-of-N gap from the 2026-10-23 merge check is closed.");
writeFileSync(`${dir}/report.md`, `${L.join("\n")}\n`);
console.log(`report rows=${results.length} survived=${surv.length}`);