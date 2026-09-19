#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrictJsonBytes } from "./lib/assurance-fabric/strict-json.mjs";
import { validateBoundedClosureReceipt } from "./lib/bounded-closure-receipt.mjs";

const REQUIRED_GATES = ["project-corpus", "differential", "strict-fungi", "physical-slide-vok"];
const REQUIRED_EXCLUSIONS = [
  { name: "full-tooling", authority: "task-5-plan" },
  { name: "graph-all", authority: "task-5-plan" },
  { name: "normal-phase-close", authority: "task-5-plan" },
];

function parseArgs(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--root" || index + 1 >= argv.length) throw new Error("--root requires one path");
    root = resolve(argv[++index]);
  }
  return root;
}

const root = parseArgs(process.argv.slice(2));
const reports = join(root, "docs", "reports");
const baselinePath = join(root, "governance", "conversion-slice-close-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
if (baseline === null
    || typeof baseline !== "object"
    || Array.isArray(baseline)
    || Object.keys(baseline).sort().join(",") !== "legacyReports,schemaVersion"
    || baseline.schemaVersion !== 1
    || !Array.isArray(baseline.legacyReports)) {
  throw new Error("invalid conversion slice-close baseline");
}
const legacyReports = baseline.legacyReports;
if (legacyReports.some((name) => typeof name !== "string"
    || name !== basename(name)
    || !/fungi-conversion-\d{4}-\d{2}-\d{2}\.md$/u.test(name))
    || new Set(legacyReports).size !== legacyReports.length
    || [...legacyReports].sort().some((name, index) => name !== legacyReports[index])) {
  throw new Error("conversion slice-close baseline must be unique, sorted canonical report names");
}
const files = readdirSync(reports)
  .filter((name) => /fungi-conversion-\d{4}-\d{2}-\d{2}\.md$/u.test(name))
  .sort();
const violations = [];

for (const name of legacyReports) {
  if (!files.includes(name)) violations.push(`${name}: legacy baseline entry is missing`);
}

for (const name of files) {
  if (legacyReports.includes(name)) continue;
  const text = readFileSync(join(reports, name), "utf8");
  const receipt = text.match(/^## Slice-close receipt\s*$([\s\S]*?)(?=^## |$(?![\s\S]))/mu)?.[1] ?? "";
  const skill = [...receipt.matchAll(/^Skill disposition: (.+)$/gmu)].map((match) => match[1]);
  const threadability = [...receipt.matchAll(/^Threadability: (.+)$/gmu)].map((match) => match[1]);
  const classification = [...receipt.matchAll(/^Source classification: (.+)$/gmu)].map((match) => match[1]);
  const closure = [...receipt.matchAll(/^Bounded closure: (.+)$/gmu)].map((match) => match[1]);
  const conversionReceipts = [...receipt.matchAll(/^Conversion receipt: (\{.+\})$/gmu)].map((match) => match[1]);
  const sliceNumber = Number(/^slice-(\d+)-/u.exec(name)?.[1] ?? 0);
  if (skill.length !== 1
      || !(/^(?:SKILL_UPDATE [0-9a-f]{40}|NO_SKILL_UPDATE: .+)$/u.test(skill[0] ?? ""))) {
    violations.push(`${name}: invalid skill disposition`);
  }
  if (threadability.length !== 1
      || !/^(?:PARALLEL_PURE|ASYNC_HAPPY_PATH|ISOLATED_SERVICE|SERIAL_HARD_PATH|UNKNOWN|N\/A)$/u.test(threadability[0] ?? "")) {
    violations.push(`${name}: invalid threadability`);
  }
  if (classification.length !== 1
      || !/^(?:CANDIDATE|BLOCKED|NO_RUNTIME_BEHAVIOR|SUPERSEDED_BY_EXISTING_FUNGI|BOOTSTRAP_FLOOR)$/u.test(classification[0] ?? "")) {
    violations.push(`${name}: invalid source classification`);
  }
  if (closure.length !== 1 || closure[0] !== "COMPLETE") {
    violations.push(`${name}: bounded closure is not complete`);
  }
  if (conversionReceipts.length !== 1) {
    violations.push(`${name}: missing exact conversion receipt v2`);
  } else {
    try {
      const candidate = parseStrictJsonBytes(Buffer.from(conversionReceipts[0], "utf8"), {
        label: `${name} conversion receipt`,
        maxBytes: 262_144,
      });
      const result = validateBoundedClosureReceipt(candidate, {
        requiredGates: REQUIRED_GATES,
        requiredExclusions: REQUIRED_EXCLUSIONS,
        expectedProduct: candidate?.product,
        expectedScope: candidate?.scope,
        expectedSource: candidate?.source,
        expectedTarget: candidate?.target,
        expectedGovernance: candidate?.governance,
        expectedProjectCorpusReceiptDigest: candidate?.projectCorpusReceiptDigest,
      });
      if (result.kind !== "accepted") violations.push(`${name}: ${result.code}`);
    } catch {
      violations.push(`${name}: invalid conversion receipt JSON`);
    }
  }
  if (sliceNumber >= 323) {
    const authoring = [...receipt.matchAll(/^Authoring skill disposition: (.+)$/gmu)].map((match) => match[1]);
    const scopes = [...text.matchAll(/^Scope: `packages-ts\/[a-z0-9-]+\/((?:src|scripts|tests|bench)\/[a-z0-9./-]+)#[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*`\.$/gmu)];
    const buildPoints = [...text.matchAll(/^Evidence: source build point `[0-9a-f]{40}`;$/gmu)];
    const sourceDigests = [...text.matchAll(/^source SHA-256 `[0-9A-F]{64}`;/gmu)];
    if (authoring.length !== 1
        || !/^(?:SKILL_UPDATE [0-9a-f]{40}|NO_SKILL_UPDATE: .+)$/u.test(authoring[0] ?? "")) {
      violations.push(`${name}: invalid authoring skill disposition`);
    }
    if (scopes.length !== 1
        || scopes[0][1].split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
      violations.push(`${name}: missing exact conversion scope`);
    }
    if (buildPoints.length !== 1) violations.push(`${name}: missing exact source build point`);
    if (sourceDigests.length !== 1) violations.push(`${name}: missing exact source digest`);
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(`REFUSED: ${violation}`);
  process.exit(1);
}
console.log(`conversion-slice-close: ${files.length - legacyReports.length}/${files.length - legacyReports.length} governed receipts valid; ${legacyReports.length} frozen legacy reports`);
