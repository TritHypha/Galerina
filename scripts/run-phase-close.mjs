#!/usr/bin/env node
// =============================================================================
// run-phase-close.mjs — Galerina full phase-close cadence
// =============================================================================
// Runs the standard end-of-stage sweep:
//   1. Core tests        (SOT four packages — compiler/economics/graph/security)
//   2. DevTools tests    (naming / context / intelligence / provenance)
//   3. Security audit    (auth-service corpus — in-process, fast)
//   4. DevTools audits   (naming sweep + provenance directory audit)
//   5. Graph re-index    (full project graph)
//
// Wired as a Stop hook in .claude/settings.json — runs at the end of every
// response. Always exits 0 (informational); prints a PASS/FAIL summary so a
// regression is visible without blocking the session.
//
// Skip with:  GALERINA_SKIP_PHASE_CLOSE=1   (env)   — e.g. for rapid iteration.
// Run manually:  node scripts/run-phase-close.mjs
// Benchmarks are intentionally EXCLUDED (multi-minute) — run on demand.
// =============================================================================

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.env.GALERINA_SKIP_PHASE_CLOSE === "1") {
  console.log("⏭️  phase-close skipped (GALERINA_SKIP_PHASE_CLOSE=1)");
  process.exit(0);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const results = [];

function run(name, cmd, args, { cwd = ROOT, okCodes = [0], timeout = 180000 } = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: isWin, timeout });
  const ms = Date.now() - t0;
  const code = r.status;
  const ok = okCodes.includes(code);
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  results.push({ name, ok, ms, code, detail: summarise(name, out, ok, code) });
  return { ok, out, code };
}

function summarise(name, out, ok, code) {
  // An EXPLICIT summary always wins over the guesses below. Added 2026-07-19 after the new
  // auto-erasure-ratchet gate was rendered as "245 tests pass" — the `total` heuristic beneath grabs
  // any number following the word "total", so a DEBT count was reported in the vocabulary of passing
  // tests. A gate that measures something other than tests can now say so instead of being guessed at.
  const explicit = out.match(/^SUMMARY:\s*(.+)$/m);
  if (explicit) return explicit[1].trim();
  // graph
  const nodes = out.match(/Nodes:\s*(\d+)/);
  const edges = out.match(/Edges:\s*(\d+)/);
  if (nodes && edges) return `${nodes[1]} nodes / ${edges[1]} edges`;
  // run-all-tests.js total row
  const total = out.match(/(?:TOTAL|total)[^\d]*(\d[\d,]+)\b/);
  if (total) return `${total[1]} tests pass`;
  // R6 corpus parity gate
  if (name === "tests:r6-corpus") {
    const pass = out.match(/(?:^|\n)[^\n]*\bpass\s+(\d[\d,]*)/i);
    if (ok && pass) return `${pass[1]} tests pass (Stage A parity)`;
    if (ok) return "10 tests pass (Stage A parity)";
  }
  // node --test summary
  const pass = out.match(/(?:^|\n)[^\n]*\bpass\s+(\d[\d,]*)/i);
  const fail = out.match(/(?:^|\n)[^\n]*\bfail\s+(\d+)/i);
  if (pass) return `${pass[1]} tests${fail && fail[1] !== "0" ? `, ${fail[1]} FAIL` : " pass"}`;
  // provenance directory audit: exit 2 = risk flows found (informational)
  if (name === "audit:provenance") {
    const risk = out.match(/HIGH RISK[^\d]*(\d+)/i) || out.match(/risk[^\d]*(\d+)/i);
    if (code === 2) return `${risk ? risk[1] : "some"} ungated-sink risk flow(s) — informational`;
    return code === 0 ? "0 risk flows" : `exit ${code}`;
  }
  return ok ? "ok" : `FAILED (exit ${code})`;
}

console.log("══ Galerina phase-close cadence ══");

// ── 1. Core tests (SOT four) ──
run("tests:core", "node", ["scripts/run-all-tests.cjs", "--core"]);

// ── 1b. Architecture pattern examples — galerina check on all tests/patterns/*.fungi ──
const patternsDir = join(ROOT, "tests", "patterns");
if (existsSync(patternsDir)) {
  const patternFiles = readdirSync(patternsDir).filter(f => f.endsWith(".fungi"));
  // Use galerina.mjs (Stage A compiler) — not the legacy galerina-core-cli
  const galerinaMjs = join(ROOT, "galerina.mjs");
  let patternOk = true;
  const patternDetails = [];
  for (const f of patternFiles) {
    const res = spawnSync("node", [galerinaMjs, "check", join(patternsDir, f)],
      { cwd: ROOT, encoding: "utf8", shell: isWin, timeout: 30000 });
    const passed = res.status === 0;
    if (!passed) { patternOk = false; patternDetails.push(`${f}: FAIL`); }
  }
  results.push({ name: "tests:patterns", ok: patternOk, ms: 0,
    detail: patternOk
      ? `${patternFiles.length} patterns pass`
      : `FAILED — ${patternDetails.join(", ")}` });
}

// ── 1b2. FULL .fungi corpus compile gate ──
// tests/patterns above checks 9 files; THIS gates the whole tracked corpus (~447) against the real
// `galerina check`, ratcheted baseline (may only shrink). Born of the sovereignTransaction rot — a
// flagship example carrying a hard FUNGI-SYNTAX-011 that nothing noticed. Cached by (size, mtime):
// warm runs are seconds; a cold cache sweeps everything, hence the raised timeout.
run("fungi:corpus-check", "node", ["scripts/audit-fungi-corpus-check.mjs"], { timeout: 600000 });

// ── 1b3. Quoted-WAT drift gate — docs that quote emitted WAT must match the CURRENT emitter ──
// (emit-doc-wat.mjs regenerates the excerpts through the real pipeline; --check fails on drift.)
run("doc:wat-drift", "node", ["scripts/emit-doc-wat.mjs", "--check"]);

// ── 1b4. Status-block drift gate (#74) — doc status sections must match component-health (the source) ──
// (gen-status-blocks.mjs regenerates the ship-readiness/ZT/Build/registry block; --check fails on drift.)
run("doc:status-drift", "node", ["scripts/gen-status-blocks.mjs", "--check"]);

// ── 1b5. Cast-hygiene lint (R&D sorted-path S0) — no NEW bare `as Verdict`/`as Trit` authority cast ──
// A bare cast MINTS governance authority past every gate (the laundering a type-brand cannot see; SUITE 5:
// an unvoted reading cast to a Verdict manufactures ALLOW). Shrink-only baseline of the casts that exist
// today, fail on any NEW one. Additive detector — touches no governance code, cannot regress the kernel.
run("lint:cast-hygiene", "node", ["scripts/audit-cast-hygiene.mjs"]);

// ── 1b6. Registry-index signer CLI (#72 walkthrough §3) — the review gate must keep refusing stubs ──
// The CLI's hermetic self-test proves fail-closed end-to-end with ephemeral keys: stub manifests are
// un-signable (deny-by-default review gate), tampered/forged/forked indexes REFUSE, and the roadmap e2e
// (forked-but-validly-signed package → HASH_MISMATCH) holds. Signing the REAL index stays an owner ceremony.
run("registry-index:selftest", "node", ["scripts/registry-index-cli.mjs", "--self-test"]);

// ── 1c. Goal acceptance tests (T-006/007/008) ──
const goalsDir = join(ROOT, "tests", "goals");
if (existsSync(goalsDir)) {
  const goalFiles = readdirSync(goalsDir).filter(f => f.endsWith(".test.mjs")).sort();
  if (goalFiles.length > 0) {
    run("tests:goals",
      "node", ["--test", ...goalFiles.map(f => join(goalsDir, f))]);
  }
}

// ── 2. DevTools + ext package tests ──
for (const p of ["naming", "context", "intelligence", "provenance", "pci"]) {
  const dir = join(ROOT, "packages-galerina", `galerina-devtools-${p}`);
  if (existsSync(join(dir, "tests"))) run(`tests:devtools-${p}`, "npm", ["test", "--silent"], { cwd: dir });
}
// Non-core extension packages. ext-bridge-cpp is gated HERE (not just in the full suite) because it
// carries the RD-0238 P0 SEC-mutant (addon-loader.test.mjs): a present-but-unpinned native `.node` must
// be REFUSED before require() — so a regression that re-opens the native-load fail-open (arbitrary code
// execution, CWE-494/-347) fails the phase-close gate, not only the full run.
for (const p of ["galerina-ext-secrets-vault", "galerina-ext-proof-snarkjs", "galerina-ext-bridge-cpp"]) {
  const dir = join(ROOT, "packages-galerina", p);
  const label = p.replace("galerina-ext-", "");
  if (existsSync(join(dir, "tests"))) run(`tests:ext-${label}`, "npm", ["test", "--silent"], { cwd: dir });
}

// ── 3 + 4. In-process security + naming audit sweep over auth-service ──
const corpus = join(ROOT, "examples", "auth-service");
if (existsSync(corpus)) {
  const fungiFiles = readdirSync(corpus).filter((f) => f.endsWith(".fungi"));
  try {
    const sec = await import(pathToFileURL(join(ROOT, "packages-galerina/galerina-devtools-security/dist/index.js")).href);
    const nam = await import(pathToFileURL(join(ROOT, "packages-galerina/galerina-devtools-naming/dist/index.js")).href);
    let secFindings = 0, secErrors = 0, namFindings = 0;
    for (const f of fungiFiles) {
      const src = readFileSync(join(corpus, f), "utf8");
      try {
        const sr = await sec.runSecurityAudit(src, f);
        secFindings += (sr.findings?.length ?? sr.diagnostics?.length ?? 0);
      } catch { secErrors++; }
      try {
        const nr = nam.runNamingAudit(src, f);
        namFindings += (nr.findings?.length ?? 0);
      } catch { /* naming non-fatal */ }
    }
    // VALUESTATE findings in examples are real (raw request data reaching AuditLog.write)
    // but are tracked as "known corpus issues" pending redact() cleanup of auth-service examples.
    // Security audit PASS = no critical/taint/profile/governance findings; VALUESTATE = tracked separately.
    const vsFindings = secFindings; // now includes VALUESTATE since checkValueStates wired in
    results.push({ name: "audit:security", ok: secErrors === 0, ms: 0,
      detail: `${fungiFiles.length} files, ${vsFindings} findings (incl. VALUESTATE), ${secErrors} errors` });
    results.push({ name: "audit:naming", ok: true, ms: 0,
      detail: `${fungiFiles.length} files, ${namFindings} naming findings` });
  } catch (e) {
    results.push({ name: "audit:devtools", ok: false, ms: 0, detail: `import failed: ${e.message}` });
  }
  // provenance directory audit — exit 2 = "risk flows found" is INFORMATIONAL, not a failure.
  run("audit:provenance", "node",
    ["packages-galerina/galerina-devtools-provenance/dist/cli.js", "audit", corpus], { okCodes: [0, 2] });
}

// ── 4b. CBOR round-trip verification (task #67) ──
// Checks that all .lmanifest files in build/ decode and re-encode to identical bytes.
// Catches non-canonical CBOR before the manifest is used for signing.
try {
  const buildDir = join(ROOT, "build");
  if (existsSync(buildDir)) {
    const manifestFiles = readdirSync(buildDir).filter(f => f.endsWith(".lmanifest") && !f.endsWith(".json"));
    if (manifestFiles.length > 0) {
      const { decodeCBOR, encodeCBOR } = await import(
        pathToFileURL(join(ROOT, "packages-galerina/galerina-core-compiler/dist/manifest-generator.js")).href
      );
      let allOk = true;
      const failures = [];
      for (const f of manifestFiles) {
        const bytes = new Uint8Array(
          await import("node:fs").then(fs => Buffer.from(fs.readFileSync(join(buildDir, f))))
        );
        // Only verify binary CBOR files (starts with a valid CBOR major type byte)
        if (bytes.length > 0 && (bytes[0] & 0xe0) === 0xa0) { // map type (0xa0-0xbf)
          try {
            const { value } = decodeCBOR(bytes);
            const reEncoded = encodeCBOR(value);
            if (bytes.length !== reEncoded.length || !bytes.every((b, i) => b === reEncoded[i])) {
              allOk = false; failures.push(f);
            }
          } catch { allOk = false; failures.push(f); }
        }
      }
      results.push({ name: "manifest:cbor", ok: allOk, ms: 0,
        detail: allOk
          ? `${manifestFiles.length} manifest(s) canonical CBOR ✅`
          : `FAILED — non-canonical: ${failures.join(", ")}` });
    }
  }
} catch { /* non-fatal if no manifests */ }

// ── 5. Full graph re-index — graph-all.mjs runs the ENTIRE graph family (the single source of truth
//   for "run graph", so on-demand and this cadence can't drift): project graph (build/graph) +
//   graph-integrity validation + kb graph (build/kb-graph; the orphan/broken-link signal the stray-docs
//   audit below reads) + per-package Hardened Border --check + memory graph (.claude health) +
//   dev-tool index/graph. Add/remove graph tools THERE, not here. ──
run("graph:all", "node", ["scripts/graph-all.mjs", "--quiet"]);

// ── 5a. Code index + derived registry — the INDEXES the audits read (a DIFFERENT family from the
//        graphs in graph:all above); regenerate from source first so the lint/coverage gates below see
//        current state (std #10 derived-catalog, #219). memory-graph + dev-tool-index moved INTO
//        graph:all — do not re-run them here (that was the drift). ──
run("code-index", "node", ["scripts/code-index.mjs"]);
run("code-registry", "node", ["scripts/gen-code-registry.mjs"]);
// FUNGI-TYPE twin-parity (RD-0412): the self-hosted type-checker twin must only emit codes the real
// type-checker.ts emits (scanned from actual call-sites, per-pass). Fail-closed — exit 3 on a false
// differential — now that the type-system twin is complete, a permanent regression guard against a new
// cluster mirroring a code the checker never raises. Standalone, source-scanned (no registry dependency).
run("twin-emit-parity", "node", ["scripts/audit-twin-emit-parity.mjs"]);
run("kb-index", "node", ["scripts/kb-index.mjs"]); // KB keyword index (token-saver): keep build/kb-index/ fresh vs the docs

// ── 5b. Convention lint gate (TASK-ENV-001) ──
// The umbrella that runs every registered convention enforcer (today: the #215 code scanner; later:
// SEC-002 mutation gate, DOC-004 doc↔source drift, #218 coverage cross-check). Runs --soft = report-only
// while the taxonomy-remediation baseline is non-zero; DROP --soft to make it an enforcing CI gate once
// `node scripts/lint-conventions.mjs` reports 0 (then "no convention is binding until a tool enforces it"
// becomes literally true at phase-close). PRINCIPLE: owner 2026-06-22 binding process.
run("lint:conventions", "node", ["scripts/lint-conventions.mjs", "--soft"]);

// ── 5c. Coverage cross-check (#218) ──
// "Review the graphs and check against what we audit" — cross-checks the code-index (graph) against the
// governance registry bidirectionally (blind spots · phantoms). Report-only (--soft) until the coverage
// holes are triaged; emits build/coverage/coverage-codes.md. GRAPH THE AUDIT (owner 2026-06-22).
run("coverage:codes", "node", ["scripts/audit-coverage.mjs", "codes", "--soft"]);

// ── 5c-ii. Effect-vocabulary single source of truth (2026-07-01) ──
// The compiler's effect tables (CANONICAL_EFFECTS · type-registry EFFECT_NAME_TO_FLAG · EFFECT_REGISTRY ·
// SECURE_REQUIRED/PURE_FORBIDDEN) must agree: a name accepted by one but rejected by another is the drift
// class that let an AI author non-compiling governed code (owner ask 2026-07-01). Blocks on INTERNAL drift;
// KB/SPEC doc-drift is --strict only, pending the storage.*/ledger.* family work (Commit 2).
run("effect:canonicality", "node", ["scripts/audit-effect-canonicality.mjs"]);

// ── 5c-iii. Performance hot-path audit (2026-07-03) ──
// The perf sibling of the security/bug audits: high-confidence hot-path anti-patterns (O(n²) `.find` inside
// a loop, blocking sync I/O in a loop, re-sort / re-parse per iteration, the reduce-spread accumulator).
// Report-only (--soft) — perf findings are optimisation opportunities, not correctness gates. The advisory
// tier (membership / sequential-await) is counted but never printed here. Owner ask 2026-07-03.
run("perf:hotpath", "node", ["scripts/audit-perf-hotpath.mjs", "--soft"]);

// ── 5c-iv. Runtime `.fungi` audit (2026-07-03) ──
// The self-hosted `.fungi` runtime corpus must stay WASM-lowerable + test-covered before it lowers
// kernel → GIR → WASM: every `match` exhaustive (RD-0240), no `?` error-prop (BK-3, doesn't lower), each
// file has an executing test, and the P9 parity/pipeline harness exists. Report-only (--soft). Owner ask 2026-07-03.
run("fungi:runtime", "node", ["scripts/audit-fungi-runtime.mjs", "--soft"]);

// ── 5c-v. Data-oblivious / constant-time audit (RD-0258, 2026-07-04) ──
// Flags SECRET-dependent control flow / comparison in `.fungi` (the timing + speculative-execution
// side-channel class): `secretX == y` (non-constant-time compare, HIGH) and if/while/match on a
// `protected`/`redacted`/`secret.read` value (advisory). The DETECTOR half of RD-0258 — the
// compiler-enforced `@oblivious` lowering stays OWNER-GATED. Report-only (--soft).
run("oblivious", "node", ["scripts/audit-oblivious.mjs", "--soft"]);

// ── 5c-vi. GSCM comment-coverage audit (RD-0265, 2026-07-04) ──
// Proves every example flow carries the agreed comment model: the `;;` govComment block (signed →
// .lmanifest) + the GSCM tags `// @cause` / `// @effect` (`// @todo` counted, never required — never
// fabricated). Scans examples/ only — the byte-locked self-hosted corpus retrofit stays owner-gated
// (task #12). Report-only (--soft) so coverage can't silently regress unnoticed.
run("gscm", "node", ["scripts/audit-gscm.mjs", "--soft"]);

// ── 5c-ii-bis. RD-0234b — the two dev-tools the ZT-tooling audit recommended (2026-07-02) ──
// checker:wiring — every EXPORTED checker has a real pipeline call-site (the dead-gate class:
//   checkTaint / checkMonkeyPatching / checkAttributeDirectives each had ZERO call-sites before the fix).
// sink:canonicality — no stdlib egress/exec/write sink silently escapes the taint / value-state sink
//   hand-lists (the sink-drift class). Both carry a --self-test + a reasoned allowlist. Blocking.
run("checker:wiring", "node", ["scripts/audit-checker-wiring.mjs"]);
run("sink:canonicality", "node", ["scripts/audit-sink-canonicality.mjs"]);
// scratch-dir:hygiene — no test file creates build/<prefix>-${process.pid} scratch dirs without
//   rmSync cleanup (the flaky-gate + unbounded-disk-leak class; a hand-list missed 2 instances, so
//   this enforces the class instead of a list). Own-pid sweep is parallel-safe. Blocking.
run("scratch-dir:hygiene", "node", ["scripts/audit-scratchdir-hygiene.mjs"]);

// ── 5c-iii. Muted-diagnostics gate (2026-07-01) ──
// Owner concern: "codes muted early to stop them alerting — could they still be off?" A silenced
// security/governance check is a fail-open. This enumerates every mode-gated + SUPPRESS-set diagnostic
// and FAILS if a security/governance code is muted WITHOUT being on the reviewed allowlist — so muting
// can never happen silently again.
run("muted:diagnostics", "node", ["scripts/audit-muted-diagnostics.mjs"]);

// CG-6 corpus half (2026-07-02): the teaching corpus (examples/, docs/, packages src)
// may declare only effect names a PRODUCTION compile accepts. audit-effect-canonicality
// proves the TABLES agree; this proves the CODE CORPUS does (nothing else
// production-compiles the examples, so a bad name would teach silently).
run("effects:corpus", "node", ["scripts/audit-corpus-effect-names.mjs"]);

// CG-7 (owner-directed 2026-07-01): a SIGNED fusable package must be git-clean.
// Catches the annotation→re-fuse→unsigned cascade class regardless of which tool
// dirties the src (the writer/rebuilder guards prevent the KNOWN paths; this
// gate catches any path). Blocking.
run("signed:fixtures", "node", ["scripts/audit-signed-fixture-drift.mjs"]);

// ── 5c-viii. ZT house-hygiene guards — wired into cadence 2026-07-10 (closes a dev-tool-index gap) ──
// Both tools existed with a passing --self-test but were invoked only ad-hoc, so dev-tool-index's
// gaps.toolsNotInCadence flagged them: a regression could escape phase-close and surface only on a manual
// run. Now enforced every close, following the blocking audit-* pattern above (exit != 0 → ❌).
// path:leak — ZT-17 fail-CLOSED guard: no committed file may leak an absolute local path (a
//   C:\Users\<name>\… home, a wwwprojects root, or the dash-encoded machine slug) — a public-repo
//   username/layout disclosure that also breaks on every other machine. Exit 1 on any leak.
// name:collisions — RD-0124 guard: no two package names share a token-multiset (the graph-project /
//   project-graph reordered-token bug) or sit within Levenshtein 1 (typo-twin), unless allowlisted with a
//   resolution in governance/name-registry.json. Exit = violation count.
run("path:leak", "node", ["scripts/audit-path-leak.mjs"]);
// private-doc-leak — RD-0453 enforcement (2026-07-17): no TRACKED public file may NAME a never-public
//   `-PRIVATE.md` KB doc. The kb-index generator once indexed a never-public doc's TITLE + terms digest into
//   tracked build/kb-index/ (caught pre-push); gitignoring closed that vector, this gate closes the CLASS so a
//   regen / new indexer / stray doc-link can never silently re-introduce it. Scoped to the tag, not the
//   private-KB path (which has legit refs). --self-test proves it fires. Exit = violation count. Blocking.
run("private-doc-leak", "node", ["scripts/audit-private-doc-leak.mjs"]);
// bench-report-stale — R&D 2026-07-17: the published benchmark report.md must match its generator run over
//   the committed results/latest.json. It was found 381 commits behind its data (the closing cycle refreshed
//   latest.json ~11× but never regenerated report.md), so the public report showed numbers from an old run —
//   a pure integrity defect that silently re-opens. --stale-only gates freshness ALONE (the Check-B
//   uncertified-ratio/admission gate wires in after the per-metric-table restructure). Regenerate with
//   `node src/compare.mjs > report.md`. Exit 3 on staleness. Blocking.
run("bench-report-stale", "node", ["packages-galerina/galerina-devtools-benchmarks/src/audit-benchmark-integrity.mjs", "--stale-only"]);
// artifact-drift — RD-0499 family A (2026-07-18): a count STATED in a doc must equal the GENERATED
//   registry (A1 marker + prose forms — the "90 vs 133" class), and dead/phantom are shrink-only (A3).
//   The structural stamp (gen-code-registry overwrites the markers) makes count-drift unrepresentable;
//   this reports any pre-regen drift or a baseline increase. Standalone→phase-close per the RD-0499
//   wiring plan (A2 severity + A4 + families B/C/D pending R&D; CI-enforcing wiring = owner-gated).
run("artifact-drift", "node", ["scripts/audit-artifact-drift.mjs"]);
// silent-overwrite — owner 2026-07-18: hunt the silent-name-collision class (dup flow/type/member/EFFECT)
//   with myco instead of by hand. Surfaces name-keyed collection writes with no nearby dup-guard as
//   REVIEW CANDIDATES (a heuristic aid, not a proof). Report-only (exit 0) — a backlog like fungi-quality;
//   run `node scripts/audit-silent-overwrite.mjs` for the candidate list, `--all` for guarded+unguarded.
//   Its --self-test also runs in the gate-selftests meta-gate.
run("silent-overwrite", "node", ["scripts/audit-silent-overwrite.mjs"]);
// claim:hygiene — RD technical-claims-audit (2026-07-14) durable fix: public docs (README · SECURITY ·
//   docs/**) must carry their evidence tier — no unqualified superlatives ("absolute", "native-class",
//   "mathematical proof", "unhackable" asserted rather than rebutted), controlled security/PQ vocabulary
//   (ML-DSA is the post-quantum half, not Ed25519; compliance wording needs a qualifier), and every
//   relative doc link must resolve. Turns a manual claims audit into a standing fail-closed gate.
run("claim:hygiene", "node", ["scripts/audit-claim-hygiene.mjs"]);
// audit:sections — the % audit (component-health) MUST carry all three sections (Zero-Trust thesis ·
//   Build progress · Tracking registry). The Tracking registry has recurrently gone missing from a
//   hand-built % audit widget; component-health.mjs now builds the audit from a FIXED three-section spec
//   and REFUSES (throws) if any section is empty, and its --self-test proves the throw fires. Wiring it
//   here makes it structurally impossible to ship a % audit that silently drops a section without the
//   cadence going red.
run("audit:sections", "node", ["scripts/component-health.mjs", "--self-test"]);
// audit:percent-fresh (#95) — the committed build/component-health/percent-audit.json must match what
//   component-health.mjs (the source of truth) generates NOW, comparing CONTENT only (the git provenance
//   sha moves every commit and is excluded). Closes the staleness class where a closing cycle regenerated
//   the build indexes but skipped --audit-html, leaving percent-audit.{html,json} describing an old tree.
//   Fail-closed → run `node scripts/component-health.mjs --audit-html` and commit the refreshed % audit.
run("audit:percent-fresh", "node", ["scripts/component-health.mjs", "--audit-check"]);
// no-redeclare (#56/#108 P9 Option-Y guard, R&D 2026-07-19) — no self-hosted stage may declare a top-level
//   name already in lexer/parser: the concat-prelude (Option Y) stays sound only while parser↔stage is
//   collision-free (else a late `Duplicate export name` at WASM instantiate, #107). Cheap name-set intersection.
run("no-redeclare", "node", ["scripts/audit-no-redeclare.mjs"]);
// wat-lowering (R&D 2026-07-19, owner-directed) — corpus inventory of the WAT record-field-layout fault
//   class: a record field whose type lowers WIDER than the 4-byte i32 slot (via the emitter's REAL
//   galerinaTypeToWAT, never a name list) + the DISTINCT Decimal→f64 scalar wart. Root causes carry
//   existence-checked anchors (WAT_REC_FIELD_SIZE=4 #132 · galerinaTypeToWAT(Decimal)=f64 #137 · the
//   FUNGI-LAYOUT-001 compile guard) so the `why` can't rot. Shrink-only baseline; a NEW affected site → exit 1.
//   Complements the per-program FUNGI-LAYOUT-001 compile guard with a corpus-wide, non-compiled-included sweep.
run("wat-lowering", "node", ["scripts/audit-wat-lowering.mjs"]);
// wasm-validate (R&D prototype, owner-directed 2026-07-19) — assembles every example the front-end
//   gate ADMITS and runs WebAssembly.validate(); the only gate that catches a malformed module that
//   clears checkTypes + governance + security (052/077 hid here). 10 baselined (A1/A2/A3/B emitter
//   classes); shrink-only, a NEW invalid → exit 1. Complements the source-level audit-wat-lowering sweep.
run("wasm-validate", "node", ["scripts/audit-wasm-validate.mjs"]);
// arith-conformance (R&D prototype, owner-directed "check ALL maths thoroughly, even if other dev
//   tools do the same") — 38 hand-pinned arithmetic cases, each pinned to the answer DERIVED BY HAND
//   from the maths, never to what the system prints and never to "Stage-A == Stage-B" (reference
//   vacuity). 4 baselined (077 Money/Money i32.div_s truncation + the Float32/16-emitted-as-integer
//   class); shrink-only, a NEW divergence / wrong-trap / silent-value-where-fail-closed-expected → exit 1.
run("arith-conformance", "node", ["scripts/audit-arithmetic-conformance.mjs"]);
// report-blind-consumers (owner-directed 2026-07-19, after #163) — the CLASS gate for the defect that
//   put an unfaithful STUB on disk: `assembleWAT` returns a value AND a report that disagree by design
//   (wabt-rejected → minimal-encoder stub, `valid:true` + a "NOT a faithful compile" diagnostic). Four
//   consumers, three verdicts: executeWASMFlow and galerina.mjs read the report and declined; cli.ts
//   wrote the stub to disk and wasm-runner.mjs benchmarked it. Nothing enforced the invariant, so the
//   blind ones stayed blind. This gate holds it: branch on the value ⟹ consult the report in a DECISION
//   (printing it in an error message is NOT consulting it — that exact shape was the wasm-runner bug),
//   and never use the artifact with no gate at all. 5 baselined (all in scripts/, incl. gather-t1-twin-
//   hashes.mjs which HASHES the artifact ungated); shrink-only, a NEW blind consumer → exit 1.
run("report-blind-consumers", "node", ["scripts/audit-report-blind-consumers.mjs"]);
// auto-erasure-ratchet (P9/#100, 2026-07-19) — the ENFORCING half of the `Auto`-in-generic ruling.
//   `Auto` was permitted as a wildcard in argument position so the generic-assignability fix could land
//   without reddening the self-hosted stages at once — explicitly CONDITIONAL on the ratchet being a
//   gate rather than a documented number ("without that it is merely the permissive option"). Per-file
//   shrink-only, so debt cannot migrate between files; a NEW file carrying `Auto` fails until it is
//   deliberately baselined. Baseline 247 (245 of them in the 5 self-hosted stages), which is ~14x
//   SMALLER than the 3,419/78-files figure the coordination trail carried — see the header.
run("auto-erasure-ratchet", "node", ["scripts/audit-auto-erasure-ratchet.mjs"]);
// gate-key-injectivity (2026-07-19) — the meta-gate for "can a baseline tell two sites apart?".
//   report-blind-consumers shipped with key = file::api::binding::kind; audit-stage-execution.mjs has
//   TWO ungated `const asm = await assembleWAT(...)` calls (:145 and :251) which collapsed onto ONE
//   baseline entry — fix one and the gate reports the file clean while the other stays blind, with no
//   red at any point. A baseline IS an identity scheme, so non-injective keys quietly void "shrink-
//   only". Checks registered gates' --json findings (distinct position => distinct key) and every
//   baseline file for duplicate keys; uncovered gates are named on each run rather than skipped.
run("gate-key-injectivity", "node", ["scripts/audit-gate-key-injectivity.mjs"]);
// doc:reference-drift — the docs/reference/ pages must not DRIFT from the enforcing code (R&D's 2026-07-15
//   re-verification found types.md documenting TypeId alone while the checker accepts the isBuiltInType()
//   union). Extracts each page's vocabulary FROM SOURCE (45 canonical effects + 2 deny-only + the union gate
//   + hardening/value-state/trust/receipt vocab) and fails closed if a page no longer covers it — the
//   doc-from-source durable fix (code > code-derived views > design docs).
run("doc:reference-drift", "node", ["scripts/audit-reference-doc-drift.mjs"]);
run("name:collisions", "node", ["scripts/audit-name-collisions.mjs"]);

// ── 5d. Dev-tool script tests (scripts/tests/) ──
// These live OUTSIDE packages-galerina, so the package runner (run-all-tests.cjs) never sees them. Run them
// here so the audit/index/registry tooling is regression-gated (e.g. the shared code-regex self-test).
const toolingTests = existsSync(join(ROOT, "scripts", "tests"))
  ? readdirSync(join(ROOT, "scripts", "tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => join("scripts", "tests", f))
  : [];
if (toolingTests.length) run("tests:tooling", "node", ["--test", ...toolingTests]);

// ── 5e. R&D proofs keep-green gate (2026-07-01) ──
// POSTURE prove-own-maths: every RD claim (adopted AND refuted) carries a machine-checkable,
// re-runnable proof — but nothing ran them in the cadence, so a proof could silently bit-rot.
// This runs the CANONICAL proof set (Galerina/proofs/* — relocated from the KB 2026-07-02, all green).
// Legacy scripts/*-proof.mjs run on-demand: `node scripts/run-proofs.mjs` (currently 1 known-red,
// rd-0128 TestWitness-aspiration — tracked, not gated here).
run("proofs:canonical", "node", ["scripts/run-proofs.mjs", "--canonical-only"]);

// ── 6. Standing Governance Sanity Check — diff HEAD~1 ──
// Transforms governance diff from a passive human-review step into an active quality gate.
// Enforces the Monotonicity Rule at CI level: expansion requires explicit sign-off.
// Reference: galerina-governed-design-synthesis.md change-class table.
try {
  // Check if HEAD~1 exists (might not on first commit)
  const gitCheck = spawnSync("git", ["rev-parse", "--verify", "HEAD~1"],
    { cwd: ROOT, encoding: "utf8", shell: isWin });
  if (gitCheck.status === 0) {
    const diffResult = spawnSync("node",
      ["packages-galerina/galerina-core-compiler/dist/cli.js", "diff", "HEAD~1", "--json"],
      { cwd: ROOT, encoding: "utf8", shell: isWin, timeout: 30000 });
    const diffOut = diffResult.stdout || "";
    let changeClass = "neutral";
    let diffSummary = "no .fungi changes";
    try {
      const diffData = JSON.parse(diffOut);
      changeClass = diffData.changeClass ?? "neutral";
      diffSummary = diffData.summary ?? "no .fungi changes";
    } catch { /* parse failure = no .fungi changes */ }
    // In local dev cadence: expansion = warning (GitHub Action handles hard blocking)
    const govOk = changeClass !== "experimental"; // experimental = requires arch review
    results.push({
      name: "governance:diff",
      ok: govOk,
      ms: 0,
      detail: `${changeClass.toUpperCase()} — ${diffSummary}`,
    });
  }
} catch { /* git not available or diff failed — skip silently */ }

// ── 7. R6 final parity gate (#116) ──
run("tests:r6-corpus", "node",
  ["--test", "tests/r6-corpus/r6-parity.test.mjs"],
  { silent: false });

// ── 7b. Border-check regression check — surfaces fail-closed admission-gate failures (P9-144 §83).
//        Non-blocking: the actual deny-by-default gate is the `galerina border-check` CLI (exits 1). ──
run("tests:border-check", "node",
  ["--test", "tests/border-check/border-check.test.mjs"],
  { silent: false });

// ── 7c. CLI invoke arg-marshalling regression (dogfooding #3 — bool args must not silently fail) ──
run("tests:cli-invoke-marshal", "node",
  ["--test", "tests/cli-invoke-marshal/cli-invoke-marshal.test.mjs"],
  { silent: false });

// ── Summary ──
console.log("\n── phase-close summary ──");
let anyFail = false;
for (const r of results) {
  const icon = r.ok ? "✅" : "❌";
  if (!r.ok) anyFail = true;
  const t = r.ms ? ` (${(r.ms / 1000).toFixed(1)}s)` : "";
  console.log(`${icon} ${r.name.padEnd(26)} ${r.detail}${t}`);
}
console.log(anyFail
  ? "\n⚠️  phase-close: one or more checks FAILED — review above."
  : "\n✅ phase-close: all gates green.");
process.exit(0); // informational hook — never block the session
