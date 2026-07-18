// =============================================================================
// audit-artifact-drift.mjs — a hand-authored value drifting from a GENERATED
// source-of-truth, mechanically caught (RD-0499, owner-directed)
// =============================================================================
// THE CLASS. Someone writes "90 diagnostic codes" in prose; the registry generator
// later says 133 live; nothing re-derives the prose, so the doc silently lies. GPT
// caught exactly this by reading registry.json instead of the doc. This tool is that
// reflex, made mechanical: a stated count must equal the generated count.
//
// SCOPE THIS PASS — FAMILY A (registry), checks A1 + A3. Surface-honest: the report
// states what it scanned AND what it did NOT (A2 severity, A4 production-blocker, and
// families B manifest / C assembly / D register are the next passes — see the to-rnd
// RD-0499 plan). A green here means "family A registry-count + baseline are clean",
// never "all artifact drift is checked".
//
//   A1  count-drift    — a doc's stated count must equal registry.json.counts.<key>
//                        (marker form <!-- registry:counts.KEY -->N, exact; or a
//                        registry-noun-anchored prose form "N live/total/dead/phantom
//                        codes"). FUNGI-DRIFT-001.
//   A3  baseline       — dead + phantom are shrink-only; an INCREASE past the frozen
//                        baseline FAILS (new drift entering the registry). FUNGI-DRIFT-002.
//
// NON-NEGOTIABLES (RD-0499): fail-closed (absent/unparseable registry → FAIL, never
// skip); shrink-only baselines; surface-honest green (names the scanned + excluded
// surface); and a self-test that proves the SURFACE, not only the logic (RD-0451) —
// a count in a dir the scanner does not glob is INVISIBLE, and the self-test pins that
// boundary so a silently-narrowed glob trips it.
//
// Usage: node scripts/audit-artifact-drift.mjs [--self-test]
//        exit 1 = drift/baseline violation · exit 2 = fail-closed (missing source)
// =============================================================================
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "build", "code-registry", "registry.json");

// Shrink-only baselines (RD-0499): freeze today's known-drift counts; block on increase.
const BASELINE = Object.freeze({ phantom: 111, dead: 8 });

// The registry-count keys A1 knows how to check (the nouns it anchors prose on).
const KNOWN_COUNT_KEYS = Object.freeze(["live", "total", "dead", "phantom", "ref", "inline", "referenced"]);

// ── pure core (self-tested, no I/O) ─────────────────────────────────────────

// A1 extraction. Two anchored forms so an unrelated number can NEVER match:
//   marker:  <!-- registry:counts.KEY -->N            (the structural-stamp form; exact)
//   prose:   N <live|total|dead|phantom> [diagnostic] codes   (registry-noun-anchored)
// Returns [{ key, claimed, form }].
export function findCountClaims(content) {
  const out = [];
  for (const m of content.matchAll(/<!--\s*registry:counts\.([a-z]+)\s*-->\s*([\d,]+)/g)) {
    out.push({ key: m[1], claimed: Number(m[2].replace(/,/g, "")), form: "marker" });
  }
  // Anchored to a registry noun + "code(s)" so "90 packages" or a version number can't match.
  for (const m of content.matchAll(/\b([\d][\d,]*)\s+(live|total|dead|phantom)\s+(?:diagnostic\s+)?codes?\b/gi)) {
    out.push({ key: m[2].toLowerCase(), claimed: Number(m[1].replace(/,/g, "")), form: "prose" });
  }
  return out;
}

// A1 drift: a claim whose key IS a known registry count but whose number differs. An unknown key is
// not A1's business (surface-honest: we do not invent a comparison we can't ground) — never a false fail.
export function countDrift(claims, counts) {
  const v = [];
  for (const c of claims) {
    if (!KNOWN_COUNT_KEYS.includes(c.key)) continue;
    if (!(c.key in counts)) continue;
    if (c.claimed !== counts[c.key]) v.push({ ...c, actual: counts[c.key] });
  }
  return v;
}

// A3 baseline: a frozen count that GREW (new drift) or went MISSING (fail-closed, not a silent skip).
export function baselineBreach(counts, baseline) {
  const v = [];
  for (const k of Object.keys(baseline)) {
    const now = counts?.[k];
    if (typeof now !== "number") { v.push({ key: k, kind: "MISSING", now, baseline: baseline[k] }); continue; }
    if (now > baseline[k]) v.push({ key: k, kind: "INCREASE", now, baseline: baseline[k] });
  }
  return v;
}

// THE SURFACE (RD-0451): which repo paths A1 scans for count claims. Pure + testable, SEPARATELY from
// the drift logic — a count in a dir this does not admit is invisible to A1, so this boundary is the
// thing that must be pinned. Registry counts are stated in the top-level docs (README/AGENTS), the
// generated status/registry reports, and docs/ — NOT in package-local notes (which state per-package
// test counts, a different source). Vendored/build-output trees are excluded.
const SCAN_ROOTS = Object.freeze(["build/status/", "build/code-registry/", "docs/"]);
const SCAN_EXCLUDE = /(^|\/)(node_modules|\.git|dist|coverage)(\/|$)/;
export function isScanSurface(relPath) {
  const p = String(relPath).replace(/\\/g, "/");
  if (SCAN_EXCLUDE.test(p)) return false;
  if (!/\.mdx?$/i.test(p)) return false;
  if (!p.includes("/")) return true;                       // repo-root markdown (README.md, AGENTS.md)
  return SCAN_ROOTS.some((r) => p.startsWith(r));
}

// ── I/O: discover the scan surface on disk (walks only the admitted roots) ───
function discoverDocs() {
  const acc = [];
  for (const e of readdirSync(ROOT, { withFileTypes: true })) {
    if (e.isFile() && isScanSurface(e.name)) acc.push(e.name);
  }
  const walk = (dir) => {
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      const rel = relative(ROOT, full).replace(/\\/g, "/");
      if (SCAN_EXCLUDE.test(rel)) continue;
      if (e.isDirectory()) walk(full);
      else if (isScanSurface(rel)) acc.push(rel);
    }
  };
  for (const r of SCAN_ROOTS) { const full = join(ROOT, r); if (existsSync(full)) walk(full); }
  return [...new Set(acc)];
}

// A2 severity-completeness (RD-0499, R&D-scoped 2026-07-18): every LIVE FUNGI-* diagnostic must carry a
// severity. ERR_* runtime error codes have no severity BY DESIGN — scoped out (flagging them is a false
// positive; R&D confirmed there is NO "security family" — key on the FUNGI- prefix). Sound ONLY after
// the make*Diag severity-capture fix (03fe028e + the makeVSDiag/makeTCDiag inference): before that, A2
// would flag scanner blind spots as if they were real gaps (the wrong-surface trap R&D warned of).
export function severityIncomplete(entries) {
  return (entries ?? [])
    .filter((e) => e.namespace === "FUNGI" && e.status === "live" && (e.severities ?? []).length === 0)
    .map((e) => e.code);
}

// ── self-test — non-vacuous, and proves the SURFACE not only the logic ───────
if (process.argv.includes("--self-test")) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`); } else { fail++; console.log(`  ❌ ${m}`); } };

  // A1 extraction
  ok(findCountClaims("<!-- registry:counts.live -->133").some((c) => c.key === "live" && c.claimed === 133 && c.form === "marker"), "marker claim extracted exactly");
  ok(findCountClaims("we ship 133 live diagnostic codes today").some((c) => c.key === "live" && c.claimed === 133 && c.form === "prose"), "registry-noun prose claim extracted");
  ok(findCountClaims("683 total codes · 8 dead codes").length === 2, "multiple prose claims extracted");
  ok(findCountClaims("90 packages and a v1.33 build").length === 0, "an unrelated number (packages/version) is NOT a claim — no false positive");

  // A1 drift — the '90 catch'
  ok(countDrift([{ key: "live", claimed: 90, form: "prose" }], { live: 133 }).length === 1, "drift FIRES: doc says 90 live, registry says 133 (the exact class GPT caught)");
  ok(countDrift([{ key: "live", claimed: 133, form: "marker" }], { live: 133 }).length === 0, "a matching claim is SILENT (not always-fire)");
  ok(countDrift([{ key: "families", claimed: 5 }], { live: 133 }).length === 0, "an unknown count key is ignored — never a false fail on a number we can't ground");

  // A3 baseline — shrink-only
  ok(baselineBreach({ phantom: 111, dead: 8 }, BASELINE).length === 0, "at-baseline is silent");
  ok(baselineBreach({ phantom: 112, dead: 8 }, BASELINE).some((b) => b.key === "phantom" && b.kind === "INCREASE"), "a phantom INCREASE fires (shrink-only ratchet)");
  ok(baselineBreach({ dead: 8 }, BASELINE).some((b) => b.key === "phantom" && b.kind === "MISSING"), "a MISSING count fires (fail-closed — a can't-read is not a silent pass)");

  // A2 severity-completeness — a live FUNGI-* with no severity is a gap; ERR_* is scoped out by design.
  ok(severityIncomplete([{ code: "FUNGI-X-001", namespace: "FUNGI", status: "live", severities: [] }]).length === 1, "a live FUNGI-* with BLANK severity fires (A2)");
  ok(severityIncomplete([{ code: "FUNGI-X-001", namespace: "FUNGI", status: "live", severities: ["error"] }]).length === 0, "a live FUNGI-* WITH a severity is silent");
  ok(severityIncomplete([{ code: "ERR_X", namespace: "ERR", status: "live", severities: [] }]).length === 0, "a blank-severity ERR_* is scoped out (no severity by design — R&D-confirmed, not a false positive)");
  ok(severityIncomplete([{ code: "FUNGI-X-002", namespace: "FUNGI", status: "dead", severities: [] }]).length === 0, "a non-live FUNGI-* is not required to carry a severity");

  // ★ THE SURFACE (RD-0451) — proven separately from the logic
  ok(isScanSurface("README.md") && isScanSurface("build/status/STATUS.md") && isScanSurface("docs/a/b.md"), "surface INCLUDES the dirs that state registry counts (a drift there is visible)");
  ok(!isScanSurface("node_modules/p/README.md") && !isScanSurface("dist/x.md"), "surface EXCLUDES vendored + build-output trees");
  ok(!isScanSurface("build/code-registry/registry.json"), "a non-markdown artifact is not scanned as a doc");
  // The wrong-scan-surface fixture: a count in packages-galerina/ is OUTSIDE A1's glob, so A1 would
  // MISS it. This is a deliberate, PINNED blind spot (package notes are not a registry-count source);
  // if the surface is ever silently narrowed or this dir is meant to count, this assertion breaks first.
  ok(!isScanSurface("packages-galerina/foo/NOTES.md"), "★ wrong-scan-surface: a count in packages-galerina/ is outside A1's surface — pinned blind spot, not a silent miss");

  console.log(`\n${fail === 0 ? "✅" : "❌"} artifact-drift self-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── main — fail-closed on a missing/unparseable source, surface-honest on green ──
if (!existsSync(REGISTRY)) {
  console.error("❌ artifact-drift: build/code-registry/registry.json is ABSENT — cannot check counts. This is a FAIL, not a skip (a check that can no-op must say so). Run: node scripts/gen-code-registry.mjs");
  process.exit(2);
}
let reg;
try { reg = JSON.parse(readFileSync(REGISTRY, "utf8")); }
catch (e) { console.error(`❌ artifact-drift: registry.json is UNPARSEABLE (${e.message}) — fail-closed.`); process.exit(2); }
if (!reg.counts || typeof reg.counts !== "object") {
  console.error("❌ artifact-drift: registry.json has no .counts object — fail-closed (cannot ground any count claim).");
  process.exit(2);
}
// Unify the count view: registry.json keeps `total` at the TOP level and the rest under `.counts`.
// A "683 total codes" claim must be gradeable, so fold `total` in (else it silently skips — the exact
// no-op-that-looks-like-success failure RD-0499 warns against).
const counts = { ...reg.counts };
if (typeof reg.total === "number") counts.total = reg.total;

const docs = discoverDocs();
let claims = [];
for (const rel of docs) {
  try { claims = claims.concat(findCountClaims(readFileSync(join(ROOT, rel), "utf8")).map((c) => ({ ...c, file: rel }))); }
  catch { /* a doc that vanished mid-walk — skip that file, the registry check still runs */ }
}
const gradeable = claims.filter((c) => KNOWN_COUNT_KEYS.includes(c.key));
const drift = countDrift(claims, counts);
const breach = baselineBreach(counts, BASELINE);
const sevGaps = severityIncomplete(reg.entries);

console.log("artifact-drift · FAMILY A (registry) — checks A1 count-drift + A2 severity-completeness + A3 baseline.");
console.log("  NOT checked this pass (surface-honest): A4 production-blocker CONVERSE (needs a registry `production_blocker` attribute; its emitter half is lint-conventions `production-blockers`, satisfied) · families B manifest / C assembly / D register (next — see to-rnd RD-0499 plan).");
console.log(`  A1 surface: ${docs.length} markdown doc(s) scanned [root *.md + build/status/** + build/code-registry/** + docs/**, minus node_modules/.git/dist/coverage]; ${gradeable.length} registry-count claim(s) gradeable.`);
for (const d of drift) console.log(`  ⚠ FUNGI-DRIFT-001 ${d.file}: states "${d.claimed} ${d.key}" but registry.counts.${d.key} = ${d.actual} (${d.form} form)`);
if (drift.length === 0) console.log(`  ✅ A1: every gradeable count claim matches registry.counts (live=${counts.live} · total=${counts.total} · dead=${counts.dead} · phantom=${counts.phantom}).`);
for (const b of breach) console.log(`  ⚠ FUNGI-DRIFT-002 counts.${b.key} = ${b.now} ${b.kind === "INCREASE" ? `> frozen baseline ${b.baseline} (shrink-only — a new drift entered the registry)` : "is MISSING from registry.counts"}`);
if (breach.length === 0) console.log(`  ✅ A3: dead=${counts.dead}≤${BASELINE.dead} · phantom=${counts.phantom}≤${BASELINE.phantom} (shrink-only baseline holds).`);
for (const c of sevGaps) console.log(`  ⚠ FUNGI-DRIFT-003 ${c}: a LIVE FUNGI-* diagnostic with NO captured severity (A2 severity-completeness).`);
if (sevGaps.length === 0) console.log(`  ✅ A2: every live FUNGI-* diagnostic carries a severity (${(reg.entries ?? []).filter((e) => e.namespace === "FUNGI" && e.status === "live").length} FUNGI-* live; ERR_* scoped out by design).`);

const violations = drift.length + breach.length + sevGaps.length;
console.log(violations === 0
  ? `✅ artifact-drift family A: 0 violation(s) across ${docs.length} doc(s) + the registry (counts, severities, baseline).`
  : `❌ artifact-drift family A: ${violations} violation(s) — a count drifted, a live FUNGI-* lacks a severity, or a shrink-only baseline grew.`);
process.exit(violations === 0 ? 0 : 1);
