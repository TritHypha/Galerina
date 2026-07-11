#!/usr/bin/env node
// hardening-show-derived.mjs — the HV3 audit surface (RD-0358 PROTOTYPE).
//
// "The developer never sees the hardening code" must NOT mean "no one can verify it" (RD-0358 §3c-1,
// HV3). This tool makes the auto-injected `hardening {}` INSPECTABLE: it parses a .fungi, and for every
// flow prints EXACTLY what the compiler derives and would inject — auditable without authorship.
//
//   node scripts/hardening-show-derived.mjs <file.fungi>
//
// (On the prototype branch this is the standalone auditor; the merge step wires the same output behind
// `galerina check --show-derived`. Auto-derivation is a checker-verified shadow — not build-wired, #143.)
import { readFileSync } from "node:fs";
import { parseProgram, deriveAuto, showDerived } from "../packages-galerina/galerina-core-compiler/dist/index.js";

const FLOW_KINDS = new Set(["flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl", "governedFlowDecl"]);

const file = process.argv[2];
if (file === undefined) {
  console.error("usage: node scripts/hardening-show-derived.mjs <file.fungi>");
  process.exit(2);
}

const src = readFileSync(file, "utf8");
const parsed = parseProgram(src, file);

/** Locate a flow's AST node by name (governedFlowDecl encodes the name as "governed:<floor>:<name>"). */
function findFlowNode(ast, name) {
  let hit;
  const walk = (n) => {
    if (hit !== undefined) return;
    if (FLOW_KINDS.has(n.kind)) {
      const v = n.value ?? "";
      const real = n.kind === "governedFlowDecl" ? v.split(":").slice(2).join(":") : v;
      if (real === name) { hit = n; return; }
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(ast);
  return hit;
}

/** The H-1 trigger: a privacy/secrets contract block, or a declared secret.* effect. */
function secretSignal(flowNode, flow) {
  const contract = (flowNode?.children ?? []).find((c) => c.kind === "contractDecl");
  const hasPrivacyOrSecrets = (contract?.children ?? []).some((c) =>
    c.kind === "secretsBlock" ||
    (c.kind === "identifier" && ((c.value ?? "").startsWith("privacy:") || (c.value ?? "").startsWith("secrets:"))));
  const hasSecretReadEffect = (flow.declaredEffects ?? []).some((e) => e === "secret.read" || e.startsWith("secret."));
  return { isSecret: hasPrivacyOrSecrets, isTainted: false, hasSecretReadEffect };
}

console.log(`--show-derived: ${file}\n`);
let hardened = 0;
for (const flow of parsed.flows ?? []) {
  const node = findFlowNode(parsed.ast, flow.name);
  const derived = deriveAuto(secretSignal(node, flow));
  if (derived.provenance === "none") {
    console.log(`flow ${flow.name}: — no hardening (not secret-shaped; HV8: only labelled values are hardened)`);
  } else {
    hardened++;
    console.log(`flow ${flow.name}:`);
    console.log(showDerived(derived).split("\n").map((l) => `  ${l}`).join("\n"));
  }
}
console.log(`\n--show-derived: ${hardened} flow(s) auto-hardened of ${(parsed.flows ?? []).length}.`);
