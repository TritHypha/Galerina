#!/usr/bin/env node
// audit-claim-hygiene.mjs — fail-CLOSED guard on PUBLIC-DOC CLAIM HYGIENE (RD technical-claims-audit,
// 2026-07-14; the "stop re-incisions" durable fix). A public claim must carry its evidence tier: no
// unqualified superlatives, controlled security/PQ vocabulary, and every referenced doc path must resolve.
// This turns a manual claims audit into a standing gate (the find-a-defect-class → build-the-detector rule).
//
// Three rule families (each pinned by --self-test; a neutered guard is itself a fail-open):
//   A. Banned superlatives — absolute-security / "mathematical proof" / "native-class" / "unhackable" /
//      "compliant by construction". Allowed only if the line NAMES a proof/benchmark/cert artifact, or
//      carries the inline marker `claim-hygiene:allow` (a line that must quote the phrase to teach the rule).
//   B. Controlled vocabulary — Ed25519 must NOT be called "post-quantum" (ML-DSA is the PQ half); a bare
//      "PCI-DSS/HIPAA/SOC 2 compliant" needs a no-compliance-claim / evidence qualifier on the line.
//   C. Reference-must-exist — a relative markdown link to a repo `.md` that does not resolve is a finding
//      (F-015: a claim naming an artifact that isn't committed). Anchors/URLs are ignored.
//
// Usage:
//   node scripts/audit-claim-hygiene.mjs --self-test   # prove the detectors fire (run first in CI)
//   node scripts/audit-claim-hygiene.mjs               # enforce: exit 1 on any finding
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", windowsHide: true });
const ALLOW_MARKER = "claim-hygiene:allow";
const SELF = "scripts/audit-claim-hygiene.mjs";

// A line "names an artifact" if it cites a proof/benchmark/cert file, a test path, or an explicit tier
// label — enough to earn a superlative. Kept deliberately narrow so it can't be gamed by the word "proof".
const CITES_ARTIFACT = /\.(mjs|test\.mjs|fungi|json)\b|proofs\/|benchmarks?\/|\bFIPS[- ]?204\b|\bNIST\b|\[[^\]]*\]\([^)]+\.md/i;

// A. Banned superlatives (security overclaim). Each is a finding unless the line cites an artifact.
const SUPERLATIVES = [
  { name: "absolute-security", re: /\babsolute (?:zero[- ]?trust|containment|security|isolation)\b/gi },
  { name: "unhackable", re: /\b(?:unhackable|un-hackable|impossible to (?:hack|breach))\b/gi },
  { name: "mathematical-proof-claim", re: /\bmathematical(?:ly)? (?:proof|proven|unhackable|guarantee[ds]?)\b/gi },
  { name: "mathematically-incompatible", re: /\bmathematically incompatible\b/gi },
  { name: "native-class", re: /\bnative-class\b/gi },
  { name: "compliant-by-construction", re: /\bcompli(?:ant|ance) by construction\b/gi },
  { name: "proven-secure", re: /\b(?:provably|proven) secure\b/gi },
];

// B. Controlled vocabulary.
const ED25519_PQ = /Ed25519[^.\n]{0,48}post[- ]?quantum|post[- ]?quantum[^.\n]{0,48}Ed25519/gi;
// Ed25519 in a HYBRID phrase is fine ("hybrid Ed25519 + ML-DSA-65"); only flag when NOT hybrid-qualified.
const HYBRID_OK = /hybrid|\+\s*ML-DSA|ML-DSA[^.\n]{0,20}(?:is the|=)\s*(?:the\s*)?(?:PQ|post)/i;
const COMPLIANCE = /\b(?:PCI[- ]?DSS|HIPAA|SOC ?2|GDPR)\b[^.\n]{0,32}\bcompliant\b/gi;
const COMPLIANCE_QUALIFIER = /no compliance claim|evidence (?:useful|for)|not a compliance|auditor|aids? compliance|toward compliance/i;

// USE vs MENTION: a superlative wrapped in quotes/backticks is being MENTIONED — quoted to rebut, define,
// or teach ("there is no 'unhackable'", `never "unhackable"`) — not ASSERTED. Claim hygiene governs the
// assertion, so a quoted mention is legitimate. Detect a delimiter immediately hugging the match.
// Real quotation only — NOT markdown `*`/`**` emphasis (bold is an assertion, not a mention).
const QUOTE = new Set(['"', "'", "`", "“", "”", "‘", "’"]);
const QUOTE_ANY = /["'`“”‘’]/;
function isMention(line, idx, matchText) {
  const end = idx + matchText.length;
  // (a) a quote hugs the match directly (`"unhackable"`, allowing markdown *emphasis* between);
  const before = line.slice(0, idx).replace(/[*_\s]+$/, "").slice(-1);
  const after = line.slice(end).replace(/^[*_\s]+/, "").slice(0, 1);
  if (QUOTE.has(before) || QUOTE.has(after)) return true;
  // (b) the match sits INSIDE a quoted span — a quote appears both before and after it on the line
  //     (a refutation/teaching table cell like `"... = **unhackable**; replaces JWT"`).
  return QUOTE_ANY.test(line.slice(0, idx)) && QUOTE_ANY.test(line.slice(end));
}
// Ed25519-near-PQ is HONEST when the line states a LIMITATION (Ed25519 is NOT post-quantum / PQ not default
// / needs the ML-DSA migration) rather than selling Ed25519 AS post-quantum. Exempt the limitation framing.
const PQ_LIMITATION_CUE = /\bnot\b|\bonly\b|\bgap\b|\brequire|\bstand-?in\b|\bresidual\b|\bmigrat|\bnot default\b|\bisn['’]t\b|≠|classical/i;

function scanText(text, relForLinks) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.includes(ALLOW_MARKER)) continue;
    const cites = CITES_ARTIFACT.test(ln);
    for (const s of SUPERLATIVES) {
      s.re.lastIndex = 0;
      let m;
      while ((m = s.re.exec(ln)) !== null) {
        if (cites || isMention(ln, m.index, m[0])) continue;
        findings.push({ line: i + 1, rule: `A:${s.name}`, text: ln.trim().slice(0, 150) });
        break;
      }
    }
    ED25519_PQ.lastIndex = 0;
    if (ED25519_PQ.test(ln) && !HYBRID_OK.test(ln) && !PQ_LIMITATION_CUE.test(ln)) findings.push({ line: i + 1, rule: "B:ed25519-called-post-quantum", text: ln.trim().slice(0, 150) });
    COMPLIANCE.lastIndex = 0;
    if (COMPLIANCE.test(ln) && !COMPLIANCE_QUALIFIER.test(ln)) findings.push({ line: i + 1, rule: "B:bare-compliance-claim", text: ln.trim().slice(0, 150) });
    // C. reference-must-exist — relative markdown links to a repo .md file.
    if (relForLinks) {
      for (const m of ln.matchAll(/\]\((?!https?:|#|mailto:)([^)#]+\.md)(?:#[^)]*)?\)/g)) {
        const target = m[1].trim();
        const abs = target.startsWith("/") ? join(ROOT, target.slice(1)) : resolve(join(ROOT, dirname(relForLinks)), target);
        if (!existsSync(abs)) findings.push({ line: i + 1, rule: "C:broken-doc-link", text: target });
      }
    }
  }
  return findings;
}

function selfTest() {
  const fires = (s) => scanText(s, null).length > 0;
  const checks = [
    ["clean scoped claim silent", !fires("The compiler is production-grade and fail-closed (92/92 tests).")],
    ["absolute Zero-Trust fires", fires("optimises for absolute Zero-Trust containment")],
    ["unhackable fires", fires("the border is unhackable")],
    ["mathematical proof fires", fires("provides mathematical proof of containment")],
    ["mathematically incompatible fires", fires("shared memory is mathematically incompatible with the model")],
    ["native-class fires", fires("independently benchmarked as native-class")],
    ["proven secure fires", fires("the gate is provably secure")],
    ["superlative WITH artifact citation is allowed", !fires("native-class per benchmarks/results/latest.json")],
    ['quoted MENTION "unhackable" does NOT fire (rebuttal/teaching)', !fires('there is no "unhackable" here — the residuals are the rebuttal')],
    ["backtick mention `unhackable` does NOT fire", !fires("never `unhackable` — the attack class is refused, not undocumented")],
    ["ASSERTED unhackable (unquoted) still fires", fires("the border is unhackable by design")],
    ["superlative inside a quoted-span refutation cell does NOT fire", !fires('| 10 | "optical credential = **unhackable**; replaces JWT" | refuted: re-derives WebAuthn |')],
    ["unquoted superlative on a line that ALSO has an unrelated quote still fires", fires('the api is "stable" and provides absolute Zero-Trust containment')],
    ["Ed25519 limitation framing does NOT fire", !fires("current signing is Ed25519-only (PQ not default) — migration tracked")],
    ["allow-marker suppresses", !fires("we never say 'absolute containment'  (claim-hygiene:allow)")],
    ["Ed25519 called post-quantum fires", fires("Ed25519 gives you post-quantum signatures")],
    ["hybrid Ed25519 + ML-DSA does NOT fire", !fires("hybrid Ed25519 + ML-DSA-65 (ML-DSA is the post-quantum half)")],
    ["bare PCI-DSS compliant fires", fires("Galerina is PCI-DSS compliant out of the box")],
    ["compliance WITH qualifier does NOT fire", !fires("emits evidence useful to a PCI-DSS auditor; no compliance claim")],
    ["broken doc link fires", scanText("see [x](docs/does-not-exist-zzz.md)", "README.md").some((f) => f.rule === "C:broken-doc-link")],
  ];
  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("  ❌ self-test FAILED — claim-hygiene detectors are neutered"); process.exit(1); }
  console.log("  claim-hygiene self-test: detectors fire on overclaims, silent on scoped/cited claims ✅");
}

if (process.argv.includes("--self-test")) { selfTest(); process.exit(0); }

// Enforce over PUBLIC docs: README, SECURITY, and docs/**.md (the reader-facing claim surface).
const files = git("ls-files").split("\n").map((s) => s.trim()).filter(Boolean)
  .filter((f) => f === "README.md" || f === "SECURITY.md" || /^docs\/.*\.md$/.test(f))
  .filter((f) => f !== SELF);

let findingCount = 0, fileCount = 0;
const report = [];
for (const rel of files) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const findings = scanText(readFileSync(abs, "utf8"), rel);
  if (findings.length) {
    fileCount++; findingCount += findings.length;
    for (const f of findings) report.push(`  ${rel}:${f.line}  [${f.rule}]  ${f.text}`);
  }
}

if (findingCount) {
  console.error(`\n  ❌ claim-hygiene: ${findingCount} finding(s) across ${fileCount} public doc(s):\n`);
  console.error(report.join("\n"));
  console.error(`\n  Fix: scope the claim to its evidence tier (drop the superlative or cite a named proof/`);
  console.error(`  benchmark/cert artifact); use controlled PQ vocabulary (ML-DSA is the post-quantum half,`);
  console.error(`  not Ed25519); qualify any compliance wording; repair the broken doc link.`);
  console.error(`  A line that must quote a phrase to teach the rule can carry the marker "${ALLOW_MARKER}".`);
  process.exit(1);
}
console.log(`  ✅ claim-hygiene: ${files.length} public doc(s) clean — no unqualified superlatives, controlled PQ vocabulary, all doc links resolve.`);
