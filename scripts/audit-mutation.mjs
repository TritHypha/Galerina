#!/usr/bin/env node
// audit-mutation.mjs — TASK-SEC-002 (#219 standard "mutation / red-team test per gate", Stryker-style).
//
// For each registered FAIL-CLOSED gate: RE-INTRODUCE the hole (a known source mutation), run that gate's
// adversarial test, and assert the test now FAILS (mutant KILLED). A SURVIVING mutant = the test does NOT
// actually guard the hole = a gap. This is precisely the gate that would have caught the B5a fail-open
// (`if (!result)` admitting any truthy verifier return) before it shipped.
//
// SAFETY — we mutate fail-closed SECURITY source in place, so the discipline is strict:
//   1. every target file MUST be git-clean before we touch it (else abort — never mutate a dirty file);
//   2. the mutation is ALWAYS reverted with `git checkout -- <file>` in a finally;
//   3. after the whole run we assert every target file is git-clean again (loud error otherwise);
//   4. a final clean rebuild restores any build artifact (dist/) to match the clean source.
//
// Flags:  --soft  report-only (exit 0).   --json  machine-readable.   --config <path>  load a JSON mutant
// catalog (used by the hermetic fixture self-test).   --root <dir>  git root / path base (default cwd).
//
// Prints `VIOLATIONS: N` (surviving mutants) for the lint-conventions umbrella. Run from repo root.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const soft = argv.includes("--soft");
const asJson = argv.includes("--json");
const rootArg = argv[argv.indexOf("--root") + 1];
const ROOT = argv.includes("--root") ? rootArg : process.cwd();
// Guard like --root above: indexOf returns -1 when --config is absent, so a bare argv[0]
// (e.g. "--soft") must NOT be read as a config path (was an ENOENT crash on `--soft` alone).
const configArg = argv.includes("--config") ? argv[argv.indexOf("--config") + 1] : undefined;

const exe = (c) => (process.platform === "win32" && c === "npm" ? "npm.cmd" : c);

// ── built-in catalog: the B5a registry-index fail-closed gates (the review-confirmed fail-opens) ──────
const K = "packages-galerina/galerina-framework-app-kernel";
// Build with the tower-citizen-vendored compiler, NOT `npm run build`. The kernel's build script is a
// bare `tsc`, which is not on PATH (no local typescript) — so `npm run build` ALWAYS exits 1 and every
// kernel mutant was being vacuously "killed by build" without its test ever running. The explicit path
// actually compiles, so a valid mutant builds and the KILL must come from the adversarial TEST.
const KERNEL_BUILD = ["node", "../galerina-tower-citizen/node_modules/typescript/lib/tsc.js", "-p", "tsconfig.json"];
const KERNEL_TEST = ["node", "--test", "tests/registry-index.test.mjs"];
const BUILTIN = [
  {
    id: "b5a-truthy-verifier",
    file: `${K}/src/registry-index.ts`,
    find: "  if (result !== true) {",
    replace: "  if (!result) {",
    cwd: K, build: KERNEL_BUILD, test: KERNEL_TEST,
    desc: "B5a signature-verify admits any TRUTHY (non-true) verifier return — the exact fail-open the review caught",
  },
  {
    id: "b5a-replay-floor",
    file: `${K}/src/registry-index.ts`,
    find: "  if (minIssuedAt !== undefined && !(index.issuedAt > minIssuedAt)) {",
    replace: "  if (minIssuedAt !== undefined && !(index.issuedAt >= minIssuedAt)) {",
    cwd: K, build: KERNEL_BUILD, test: KERNEL_TEST,
    desc: "B5a issuedAt freshness floor accepts EQUAL (replay) — strict-newer weakened to newer-or-equal",
  },
  {
    id: "b5a-duplicate-admit",
    file: `${K}/src/registry-index.ts`,
    find: "  if (matches.length > 1) {",
    replace: "  if (matches.length > 2) {",
    cwd: K, build: KERNEL_BUILD, test: KERNEL_TEST,
    desc: "B5a a single duplicate (name,version) pair is admitted — entry ORDER silently decides facts",
  },
];

// ── cert-gate (TLSTP S1) fail-closed gates — the K3 channel/cert verdict ──────────────
// core-network has no local tsc; build with the tower-citizen-vendored compiler (the
// documented build-without-npm-install path). Every mutant below is valid TS (a Verdict
// enum swap), so the build SUCCEEDS and the KILL must come from the adversarial test —
// that is the point: prove the test, not the type-checker, guards the fail-closed seam.
const CN = "packages-galerina/galerina-core-network";
const CN_BUILD = ["node", "../galerina-tower-citizen/node_modules/typescript/lib/tsc.js", "-p", "tsconfig.json"];
const CN_TEST = ["node", "--test", "tests/cert-gate.test.mjs"];
const CERT = [
  {
    id: "cert-revocation-unknown-allow",
    file: `${CN}/src/cert-gate.ts`,
    find: 'if (resolved !== "good") return Verdict.INDETERMINATE;',
    replace: 'if (resolved !== "good") return Verdict.ALLOW;',
    cwd: CN, build: CN_BUILD, test: CN_TEST,
    desc: "S1 revocation-UNKNOWN soft-fails to ALLOW — the exact public-web hole the gate exists to close",
  },
  {
    id: "cert-revocation-stale-allow",
    file: `${CN}/src/cert-gate.ts`,
    find: "if (age < 0 || age > freshnessMs) return Verdict.INDETERMINATE;",
    replace: "if (age < 0 || age > freshnessMs) return Verdict.ALLOW;",
    cwd: CN, build: CN_BUILD, test: CN_TEST,
    desc: "S1 a STALE / future-dated 'good' OCSP response is trusted — replayed-good authorizes the channel",
  },
  {
    id: "cert-revocation-throw-allow",
    file: `${CN}/src/cert-gate.ts`,
    find: "return Verdict.INDETERMINATE; // throwing check ⇒ unknown ⇒ 0 (fuse-loader.ts:537)",
    replace: "return Verdict.ALLOW; // throwing check ⇒ unknown ⇒ 0 (fuse-loader.ts:537)",
    cwd: CN, build: CN_BUILD, test: CN_TEST,
    desc: "S1 a THROWING revocation check fails OPEN to ALLOW — a responder error would authorize admission",
  },
  {
    id: "cert-pin-mismatch-soften",
    file: `${CN}/src/cert-gate.ts`,
    find: "return pinned.some((d) => d.toLowerCase() === p) ? Verdict.ALLOW : Verdict.DENY;",
    replace: "return pinned.some((d) => d.toLowerCase() === p) ? Verdict.ALLOW : Verdict.INDETERMINATE;",
    cwd: CN, build: CN_BUILD, test: CN_TEST,
    desc: "S1 a pin MISMATCH softens from −1 (annihilator) to 0 — the MITM-with-valid-cert no longer hard-denies",
  },
  {
    id: "cert-no-pin-allow",
    file: `${CN}/src/cert-gate.ts`,
    find: "if (pinned === undefined || pinned.length === 0) return Verdict.INDETERMINATE;",
    replace: "if (pinned === undefined || pinned.length === 0) return Verdict.ALLOW;",
    cwd: CN, build: CN_BUILD, test: CN_TEST,
    desc: "S1 fail-closed seam broken — a missing pin defaults to +1 instead of 0 (absence-of-evidence → ALLOW)",
  },
];

// ── fuse-loader: the three fail-closed package-admission gates (hash · signature · revocation) ──
// Each mutant is a REACHABLE, compile-clean weakening (a plausible planted bug, not dead code) so the
// KILL comes from the adversarial fuse test — proving the test fires, not merely that tsc rejects dead
// code. These are the "three fail-closed gates" the module header documents.
const KERNEL_FUSE_TEST = ["node", "--test", "tests/fuse-loader.test.mjs"];
const FUSE = [
  {
    id: "fuse-gate1-hash-mismatch",
    file: `${K}/src/fuse-loader.ts`,
    find: "if (actualSha !== descriptor.wasmSha256) {",
    replace: "if (actualSha.length !== descriptor.wasmSha256.length) {",
    cwd: K, build: KERNEL_BUILD, test: KERNEL_FUSE_TEST,
    desc: "Gate 1 — hash gate weakened to a LENGTH compare; a tampered .wasm (same-length digest) is admitted",
  },
  {
    id: "fuse-gate2-sig-invalid",
    file: `${K}/src/fuse-loader.ts`,
    find: "valid = crypto.verify(null, bytesForVerification, publicKey, base64ToBytes(signature as string));",
    replace: "valid = crypto.verify(null, bytesForVerification, publicKey, base64ToBytes(signature as string)) || true;",
    cwd: K, build: KERNEL_BUILD, test: KERNEL_FUSE_TEST,
    desc: "Gate 2 — signature result forced truthy; an INVALID Ed25519 manifest signature is accepted as verified",
  },
  {
    id: "fuse-gate2b-key-revoked",
    file: `${K}/src/fuse-loader.ts`,
    find: "revoked = opts.revocationCheck(keyId) === true;",
    replace: "revoked = opts.revocationCheck(keyId) === false;",
    cwd: K, build: KERNEL_BUILD, test: KERNEL_FUSE_TEST,
    desc: "Gate 2b — revocation verdict inverted; a cryptographically-valid signature from a REVOKED key is admitted",
  },
];

// ── i32 strict-trapping arithmetic — the fail-closed "overflow/div0 must TRAP, never wrap" gate ──
// Owner decision 2026-06-18 (Fork A = TRAP): integer overflow must NEVER silently wrap (a wrap past a
// bounds check is a capability-gate exploit). i32-arith.ts is the SINGLE source of truth shared by the
// walker, the bytecode VM, and the WASM emitter, so a wrap-mutant here is a cross-tier fail-open. Each
// mutant makes one op wrap instead of trap; i32-arith.test.mjs kills it [test]. core-compiler has its own
// typescript, so build with the local vendored tsc (not a bare `tsc`).
const CC = "packages-galerina/galerina-core-compiler";
const CC_BUILD = ["node", "node_modules/typescript/lib/tsc.js", "-p", "tsconfig.json"];
const CC_TEST = ["node", "--test", "tests/i32-arith.test.mjs"];
const CC_I32 = [
  {
    // Pre-wrap r with `| 0` BEFORE the range check: an already-i32-wrapped r is never out of [MIN,MAX],
    // so the overflow check never fires → silent wrap. Single-line anchor (CRLF-agnostic; the file has
    // mixed line endings), unique to add.
    id: "i32-add-overflow-wrap",
    file: `${CC}/src/i32-arith.ts`,
    find: "const r = a + b;",
    replace: "const r = (a + b) | 0;",
    cwd: CC, build: CC_BUILD, test: CC_TEST,
    desc: "i32 ADD silently WRAPS on signed overflow instead of trapping — the exact wrap-past-bounds-check exploit Fork-A forbids",
  },
  {
    id: "i32-sub-overflow-wrap",
    file: `${CC}/src/i32-arith.ts`,
    find: "const r = a - b;",
    replace: "const r = (a - b) | 0;",
    cwd: CC, build: CC_BUILD, test: CC_TEST,
    desc: "i32 SUB silently WRAPS on signed underflow instead of trapping (also breaks neg, which is 0 - x)",
  },
  {
    id: "i32-mul-overflow-wrap",
    file: `${CC}/src/i32-arith.ts`,
    find: 'return p < -2147483648n || p > 2147483647n ? "IntegerOverflow" : Number(p) | 0;',
    replace: "return Number(p) | 0;",
    cwd: CC, build: CC_BUILD, test: CC_TEST,
    desc: "i32 MUL (BigInt slow path) silently WRAPS on overflow instead of trapping — large-operand products escape the bound",
  },
  {
    id: "i32-div-minint-wrap",
    file: `${CC}/src/i32-arith.ts`,
    find: 'if (a === I32_MIN && b === -1) return "IntegerOverflow"; // 2^31 overflows i32 (the one signed-div overflow)',
    replace: 'if (a === I32_MIN && b === -1) return Math.trunc(a / b) | 0; // 2^31 overflows i32 (the one signed-div overflow)',
    cwd: CC, build: CC_BUILD, test: CC_TEST,
    desc: "i32 DIV INT32_MIN/-1 (the one signed-division overflow = 2^31) silently wraps instead of trapping",
  },
];

// ── secret-egress: the value-state-checker SINK gate (unsafe/tainted/secret → exfiltration sink) ──
// isNetworkSink (value-state-checker.ts) recognises the egress paths a tainted/secret value must not reach;
// when it does, FUNGI-VALUESTATE-003 fires (a compile-time deny). Make a sink go UNRECOGNISED and the unsafe
// value escapes with NO diagnostic — a fail-OPEN (the exact class the comment notes was a past VSC-003 hole).
// domain-security.test.mjs asserts the diagnostic fires at each sink, so it kills these [test].
const VSC_EGRESS_TEST = ["node", "--test", "tests/domain-security.test.mjs"];
const VSC_EGRESS = [
  {
    // Corrupt the registry KEY so the SINK_REQUIREMENTS lookup misses → the sink is ungoverned →
    // an unsafe value reaches it with no FUNGI-VALUESTATE-003. (Registry is the single source of truth.)
    id: "vsc-response-body-sink-unregistered",
    file: `${CC}/src/value-state-checker.ts`,
    find: '["response.body",',
    replace: '["response.body.MUTANT",',
    cwd: CC, build: CC_BUILD, test: VSC_EGRESS_TEST,
    desc: "secret-egress hole — response.body removed from SINK_REQUIREMENTS, so an unsafe value in the HTTP response leaving the trust boundary is no longer flagged",
  },
  {
    id: "vsc-remote-inference-sink-unregistered",
    file: `${CC}/src/value-state-checker.ts`,
    find: '["ai.remoteInference",',
    replace: '["ai.remoteInference.MUTANT",',
    cwd: CC, build: CC_BUILD, test: VSC_EGRESS_TEST,
    desc: "secret-egress hole — ai.remoteInference removed from SINK_REQUIREMENTS, so an unsafe value shipped to a third-party model is no longer flagged",
  },
];

// ── tower-citizen K3 custody + governance gates: anti-Sybil quorum + No-Coercion + deny-by-default ──────
// Prevention coverage for the verdict-combining core (the owner-gated "quorum / No-Coercion" rule, built as
// BEHAVIOR-gated mutation testing rather than a brittle text-anchor lint). Each mutant re-introduces a real
// fail-open in quorum.ts / three-valued-governance.ts; a KILL proves the existing adversarial test guards it.
const TC = "packages-galerina/galerina-tower-citizen";
const TC_BUILD = ["node", "node_modules/typescript/lib/tsc.js", "-p", "tsconfig.json"];
const TC_QUORUM_TEST = ["node", "--test", "tests/quorum.test.mjs"];
const TC_GOV_TEST = ["node", "--test", "tests/three-valued-governance.test.mjs"];
const TC_CONSENSUS_TEST = ["node", "--test", "tests/consensus-confidence.test.mjs"];
const QUORUM_GOV = [
  {
    id: "quorum-distinctness-sybil",
    file: `${TC}/src/quorum.ts`,
    find: "  for (const verdict of bySigner.values()) if (verdict === Verdict.ALLOW) approvals += 1;",
    replace: "  for (const v2 of votes) if (v2.verdict === Verdict.ALLOW) approvals += 1;",
    cwd: TC, build: TC_BUILD, test: TC_QUORUM_TEST,
    desc: "quorum counts NON-distinct signers (Sybil: one signer's M ALLOW votes reach an M-of-N quorum) — anti-Sybil distinctness removed",
  },
  {
    id: "quorum-equivocation-blind",
    file: `${TC}/src/quorum.ts`,
    find: "    if (prev !== undefined && prev !== v.verdict) return { malformed: true, distinctApprovals: 0 }; // equivocation",
    replace: "    if (false && prev !== undefined && prev !== v.verdict) return { malformed: true, distinctApprovals: 0 }; // equivocation",
    cwd: TC, build: TC_BUILD, test: TC_QUORUM_TEST,
    desc: "equivocation guard disabled — a signer presenting two conflicting verdicts is no longer malformed (authorize past a detected equivocation)",
  },
  {
    id: "quorum-threshold-m-floor",
    file: `${TC}/src/quorum.ts`,
    find: "  if (typeof m !== \"number\" || !Number.isInteger(m) || m < 1) return { malformed: true, distinctApprovals: 0 };",
    replace: "  if (typeof m !== \"number\" || !Number.isInteger(m) || m < 0) return { malformed: true, distinctApprovals: 0 };",
    cwd: TC, build: TC_BUILD, test: TC_QUORUM_TEST,
    desc: "threshold floor weakened m<1 -> m<0, so m=0 is 'valid' and 0 distinct approvals >= 0 -> ALLOW (empty-quorum fail-open)",
  },
  {
    id: "no-coercion-vand-lift",
    file: `${TC}/src/three-valued-governance.ts`,
    // Anchor updated 2026-07-18: S0 (arith-Trit brand) replaced the `as Verdict` cast with the validating
    // `asVerdict()` mint, so the old `return minTrit(a, b) as Verdict;` no longer exists. Same mutation
    // (min -> max) on the current `asVerdict(minTrit(a, b))` form.
    find: "asVerdict(minTrit(a, b))",
    replace: "asVerdict(maxTrit(a, b))",
    cwd: TC, build: TC_BUILD, test: TC_GOV_TEST,
    desc: "vAnd (Kleene AND / No-Coercion) swapped min->max: an untrusted DENY operand no longer LOWERS the verdict (a lift) — vAnd(ALLOW,DENY) would yield ALLOW",
  },
  {
    id: "collapse-indeterminate-to-allow",
    file: `${TC}/src/three-valued-governance.ts`,
    find: "  return v === Verdict.ALLOW ? \"allow\" : \"deny\";",
    replace: "  return v === Verdict.DENY ? \"deny\" : \"allow\";",
    cwd: TC, build: TC_BUILD, test: TC_GOV_TEST,
    desc: "collapse() at the boundary lets INDETERMINATE coerce to 'allow' (was deny-by-default: only ALLOW -> allow)",
  },
  {
    id: "consensus-tie-to-allow",
    file: `${TC}/src/three-valued-governance.ts`,
    find: "  return (sum > 0 ? Verdict.ALLOW : sum < 0 ? Verdict.DENY : Verdict.INDETERMINATE);",
    replace: "  return (sum >= 0 ? Verdict.ALLOW : sum < 0 ? Verdict.DENY : Verdict.INDETERMINATE);",
    cwd: TC, build: TC_BUILD, test: TC_CONSENSUS_TEST,
    desc: "consensusTritN tie (sum===0) coerces to ALLOW instead of INDETERMINATE (deny-by-default lost on a split vote)",
  },
];

// ── RD-0361 execution-cutover twins: the T1 sentinel DIFFERENTIALS must be NON-VACUOUS (R4 anti-neuter) ──
// The R4 authority flip (make a `.fungi`/WASM twin the real decider + delete the `.ts`) is gated on a
// soaked-clean differential — the twin's WASM verdict must EQUAL the real `.ts` verdict over the boundary
// corpus. A differential that would NOT notice a WRONG twin is the fail-OPEN that gate exists to prevent
// (RD-0361 R4 unlock protocol, evidence item c: "an injected mismatch turns the differential RED"). Each
// mutant WEAKENS the twin's verdict fold; the execution-cutover test (which rebuilds the WASM from the
// mutated `.fungi` at runtime, then compares to the real `.ts`) must KILL it. No `build` step — the `.fungi`
// is compiled INSIDE the test, and the package's `.ts` dist is unchanged by a `.fungi` mutation.
const RD0361_T1 = [
  {
    id: "rd0361-t1-sync-drift-boundary",
    file: "packages-galerina/galerina-core-sentinel-time/src/self-hosted/synchronization-gate.fungi",
    find: "driftAbs > maxDriftTicks",
    replace: "driftAbs >= maxDriftTicks",
    cwd: "packages-galerina/galerina-core-sentinel-time",
    test: ["node", "--test", "tests/rd0361-execution-cutover.test.mjs"],
    desc: "RD-0361 T1 — the synchronization-gate TWIN's LST-DRIFT-001 boundary weakened > to >= (drift==max would wrongly DENY in the WASM); the R0->R3 execution-cutover differential must catch WASM != real .ts (proves the cutover differential is non-vacuous — R4 evidence item c)",
  },
  {
    id: "rd0361-t1-power-adjustment-boundary",
    file: "packages-galerina/galerina-core-sentinel-power/src/self-hosted/power-governor.fungi",
    find: "targetRank < permittedRank",
    replace: "targetRank <= permittedRank",
    cwd: "packages-galerina/galerina-core-sentinel-power",
    test: ["node", "--test", "tests/rd0361-power-governor-execution.test.mjs"],
    desc: "RD-0361 T1 — power-governor adjustmentVerdict boundary < -> <= (a cooler-or-EQUAL kernel request would be wrongly DENIED in the WASM); the execution-cutover differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-t1-coldboot-integrity",
    file: "packages-galerina/galerina-core-sentinel-state/src/self-hosted/cold-boot.fungi",
    find: "integrityOk == false",
    replace: "integrityOk != false",
    cwd: "packages-galerina/galerina-core-sentinel-state",
    test: ["node", "--test", "tests/rd0361-cold-boot-execution.test.mjs"],
    desc: "RD-0361 T1 — cold-boot restoreVerdict integrity check inverted (a FAILED-integrity snapshot would be restored — fail-open); the execution-cutover differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-t1-egress-mac",
    file: "packages-galerina/galerina-core-sentinel-egress/src/self-hosted/audit-egress.fungi",
    find: "macMatches == false",
    replace: "macMatches != false",
    cwd: "packages-galerina/galerina-core-sentinel-egress",
    test: ["node", "--test", "tests/rd0361-audit-egress-execution.test.mjs"],
    desc: "RD-0361 T1 — audit-egress chainLinkVerdict MAC check inverted (a TAMPERED batch with a bad MAC would verify — fail-open); the execution-cutover differential must catch WASM != real .ts",
  },
];

// ── RD-0361 T2 (Memory tranche): the sentinel-memory differentials must also be non-vacuous ────────────
// Same anti-neuter pattern as T1, extended to the four sentinel-memory twins that carry an execution-cutover
// differential (trit-buffer-guard is shadow-only, no differential to guard). Each mutant plants a fail-open
// in the twin's `.fungi` fold; its rd0361-*-execution differential rebuilds the WASM and KILLS it.
const RD0361_T2_MEMORY = [
  {
    id: "rd0361-t2-memvalidator-align",
    file: "packages-galerina/galerina-core-sentinel-memory/src/self-hosted/memory-validator.fungi",
    find: "ptr % align == 0",
    replace: "ptr % align != 0",
    cwd: "packages-galerina/galerina-core-sentinel-memory",
    test: ["node", "--test", "tests/rd0361-memory-validator-execution.test.mjs"],
    desc: "RD-0361 T2 — memory-validator isAligned inverted (an UNALIGNED ptr would pass the alignment gate); the execution-cutover differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-t2-poolalloc-exhaust",
    file: "packages-galerina/galerina-core-sentinel-memory/src/self-hosted/pool-allocation-guard.fungi",
    find: "runAvailable == false",
    replace: "runAvailable != false",
    cwd: "packages-galerina/galerina-core-sentinel-memory",
    test: ["node", "--test", "tests/rd0361-pool-allocation-guard-execution.test.mjs"],
    desc: "RD-0361 T2 — pool-allocation-guard exhaustion check inverted (an EXHAUSTED pool would allocate — LSM-POOL-EXHAUSTED bypass); the execution-cutover differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-t2-poolpolicy-blockbytes",
    file: "packages-galerina/galerina-core-sentinel-memory/src/self-hosted/pool-policy.fungi",
    find: "blockBytes <= 0",
    replace: "blockBytes < 0",
    cwd: "packages-galerina/galerina-core-sentinel-memory",
    test: ["node", "--test", "tests/rd0361-pool-policy-execution.test.mjs"],
    desc: "RD-0361 T2 — pool-policy blockBytes floor <=0 -> <0 (a ZERO-byte block config accepted); the execution-cutover differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-t2-segguard-crosssegment",
    file: "packages-galerina/galerina-core-sentinel-memory/src/self-hosted/segmentation-guard.fungi",
    find: "actual != intended",
    replace: "actual == intended",
    cwd: "packages-galerina/galerina-core-sentinel-memory",
    test: ["node", "--test", "tests/rd0361-segmentation-guard-execution.test.mjs"],
    desc: "RD-0361 T2 — segmentation-guard cross-segment check inverted (a CROSS-segment access allowed — LSM-SEGV bypass); the execution-cutover differential must catch WASM != real .ts",
  },
];

// RD-0361 sentinel-io + core-network border tranche — the whole core-network decision surface (all 7 border
// twins) + both sentinel-io twins, proving each execution-cutover differential NON-VACUOUS. Landing this closed
// a real coverage gap: the cert-gate differential proved the sub-verdicts + certVerdict but never exercised
// boundaryAuthorized (the actual admit/deny collapse), so a weakened 0-collapse would have passed — the
// differential now covers boundaryAuthorized + revocationRecheckDue (label-verified), and the mutant is killed.
const RD0361_IO_NETWORK = [
  {
    id: "rd0361-io-hardenedborder-integrity",
    file: "packages-galerina/galerina-core-sentinel-io/src/self-hosted/hardened-border.fungi",
    find: "digestMatches == false",
    replace: "digestMatches != false",
    cwd: "packages-galerina/galerina-core-sentinel-io",
    test: ["node", "--test", "tests/rd0361-hardened-border-execution.test.mjs"],
    desc: "sentinel-io hardened-border integrityVerdict inverted (a TAMPERED block whose digest does not match would be RELEASED); the execution-cutover differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-io-manifestvalidator-allblocks",
    file: "packages-galerina/galerina-core-sentinel-io/src/self-hosted/manifest-validator.fungi",
    find: "allBlocksOk == false",
    replace: "allBlocksOk != false",
    cwd: "packages-galerina/galerina-core-sentinel-io",
    test: ["node", "--test", "tests/rd0361-manifest-validator-execution.test.mjs"],
    desc: "sentinel-io manifest-validator manifestVerdict inverted (a manifest with a BAD block accepted as 'valid'); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-net-certgate-boundary",
    file: "packages-galerina/galerina-core-network/src/self-hosted/cert-gate.fungi",
    find: "verdict == 1",
    replace: "verdict >= 0",
    cwd: "packages-galerina/galerina-core-network",
    test: ["node", "--test", "tests/rd0361-cert-gate-execution.test.mjs"],
    desc: "core-network cert-gate boundaryAuthorized weakened (INDETERMINATE 0 would AUTHORIZE — the revocation-unknown soft-fail hole); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-net-inboundguard-denymatch",
    file: "packages-galerina/galerina-core-network/src/self-hosted/inbound-guard.fungi",
    find: "hasDenyMatch == true",
    replace: "hasDenyMatch == false",
    cwd: "packages-galerina/galerina-core-network",
    test: ["node", "--test", "tests/rd0361-inbound-guard-execution.test.mjs"],
    desc: "core-network inbound-guard inboundVerdict inverted (an explicit DENY rule would be IGNORED); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-net-corspolicy-allowlist",
    file: "packages-galerina/galerina-core-network/src/self-hosted/cors-policy.fungi",
    find: "isExactAllowlisted == false",
    replace: "isExactAllowlisted == true",
    cwd: "packages-galerina/galerina-core-network",
    test: ["node", "--test", "tests/rd0361-cors-policy-execution.test.mjs"],
    desc: "core-network cors-policy corsVerdict inverted (a NON-allowlisted origin admitted — the unvalidated-origin reflection hole); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-net-egressguard-metadata",
    file: "packages-galerina/galerina-core-network/src/self-hosted/egress-guard.fungi",
    find: "if d == 254 { return 0 }",
    replace: "if d == 254 { return 10 }",
    cwd: "packages-galerina/galerina-core-network",
    test: ["node", "--test", "tests/rd0361-egress-guard-execution.test.mjs"],
    desc: "core-network egress-guard classifyIpv4Category weakened (169.254.169.254 metadata classified PUBLIC and dialled — the SSRF prize); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-net-admissionfeedback-harddeny",
    file: "packages-galerina/galerina-core-network/src/self-hosted/admission-feedback.fungi",
    find: "v = vAnd(v, 0 - 1)",
    replace: "v = vAnd(v, 1)",
    cwd: "packages-galerina/galerina-core-network",
    test: ["node", "--test", "tests/rd0361-admission-feedback-execution.test.mjs"],
    desc: "core-network admission-feedback telemetrySideSignal weakened (a hard-DENY telemetry reading would NOT degrade the channel); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-net-defensivecontrols-mtlspin",
    file: "packages-galerina/galerina-core-network/src/self-hosted/defensive-controls.fungi",
    find: "if mtlsPinned == true { return 1 }",
    replace: "if mtlsPinned == false { return 1 }",
    cwd: "packages-galerina/galerina-core-network",
    test: ["node", "--test", "tests/rd0361-defensive-controls-execution.test.mjs"],
    desc: "core-network defensive-controls proxyTrustVerdict inverted (an UNPINNED verified mTLS cert would trust the proxy — the pinning bypass, RD-0325); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-net-b8admission-boundary",
    file: "packages-galerina/galerina-core-network/src/self-hosted/b8-admission.fungi",
    find: "if verdict == 1 {",
    replace: "if verdict >= 0 {",
    cwd: "packages-galerina/galerina-core-network",
    test: ["node", "--test", "tests/rd0361-b8-admission-execution.test.mjs"],
    desc: "core-network b8-admission authorized weakened (INDETERMINATE 0 would AUTHORIZE — B8's TLS soft-fail hole); the differential must catch WASM != real .ts",
  },
];

// RD-0361 app-kernel + tower-citizen tranche — the LAST execution-cutover differentials: the app-kernel's
// six governed twins (secret-gate, route-defaults, fuse-admission, kernel auth gate 6, registry-index,
// package-admission) + tower-citizen's governance core (quorum/lease) + the S4 transport FSM. With this the
// anti-neuter covers EVERY rd0361-*-execution differential (trit-buffer-guard is shadow-only, no differential).
const RD0361_APPKERNEL_TOWER = [
  {
    id: "rd0361-ak-secretgate-present",
    file: "packages-galerina/galerina-framework-app-kernel/src/self-hosted/secret-gate.fungi",
    find: "s.status != \"present\"",
    replace: "s.status == \"present\"",
    cwd: "packages-galerina/galerina-framework-app-kernel",
    test: ["node", "--test", "tests/rd0361-secret-gate-execution.test.mjs"],
    desc: "app-kernel secret-gate admitSecrets inverted (a NON-present required secret would be admitted); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-ak-routedefaults-authrelax",
    file: "packages-galerina/galerina-framework-app-kernel/src/self-hosted/route-defaults.fungi",
    find: "mode == \"public\"",
    replace: "mode != \"public\"",
    cwd: "packages-galerina/galerina-framework-app-kernel",
    test: ["node", "--test", "tests/rd0361-route-defaults-execution.test.mjs"],
    desc: "app-kernel route-defaults isAuthRelaxation inverted (an auth=public relaxation would NOT be flagged in the security report); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-ak-fuseadmission-hashtamper",
    file: "packages-galerina/galerina-framework-app-kernel/src/self-hosted/fuse-admission.fungi",
    find: "hashMatches == false",
    replace: "hashMatches != false",
    cwd: "packages-galerina/galerina-framework-app-kernel",
    test: ["node", "--test", "tests/rd0361-fuse-admission-execution.test.mjs"],
    desc: "app-kernel fuse-admission hashGateVerdict inverted (a TAMPERED .wasm whose sha256 != the signed descriptor would pass Gate 1); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-ak-kernel-authgate",
    file: "packages-galerina/galerina-framework-app-kernel/src/self-hosted/kernel.fungi",
    find: "channelVerdictAuthorized == true",
    replace: "channelVerdictAuthorized == false",
    cwd: "packages-galerina/galerina-framework-app-kernel",
    test: ["node", "--test", "tests/rd0361-kernel-auth-gate-execution.test.mjs"],
    desc: "app-kernel kernel auth gate 6 inverted (a NON-authorizing channel verdict would admit -- the RD-0307/0309 mTLS presence-only bypass, task #10); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-ak-registryindex-lookup-hash",
    file: "packages-galerina/galerina-framework-app-kernel/src/self-hosted/registry-index.fungi",
    find: "hashMatches == false",
    replace: "hashMatches != false",
    cwd: "packages-galerina/galerina-framework-app-kernel",
    test: ["node", "--test", "tests/rd0361-packages-execution-cutover.test.mjs"],
    desc: "app-kernel registry-index lookupVerdict inverted (a registry entry whose sourceHash does not match the query would be admitted); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-ak-packageadmission-capexpand",
    file: "packages-galerina/galerina-framework-app-kernel/src/self-hosted/package-admission.fungi",
    find: "if addedCount > 0 {",
    replace: "if addedCount < 0 {",
    cwd: "packages-galerina/galerina-framework-app-kernel",
    test: ["node", "--test", "tests/rd0361-packages-execution-cutover.test.mjs"],
    desc: "app-kernel package-admission capabilityVerdict weakened (a manifest expanding capabilities beyond the lockfile would NOT be flagged FUNGI-PKG-001 -- dependency-confusion escalation); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-tc-transportfsm-resume",
    file: "packages-galerina/galerina-tower-citizen/src/self-hosted/transport-fsm.fungi",
    find: "if g == 1 { return 0 }",
    replace: "if g >= 0 { return 0 }",
    cwd: "packages-galerina/galerina-tower-citizen",
    test: ["node", "--test", "tests/rd0361-transport-fsm-execution.test.mjs"],
    desc: "tower-citizen transport-fsm s4NextState weakened (an INDETERMINATE 0 reverify would RESUME to Established -- manufactured authority, INV-2/INV-5/INV-6, resume must ride === ALLOW only); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0361-tc-governance-quorum",
    file: "packages-galerina/galerina-tower-citizen/src/self-hosted/governance-decisions.fungi",
    find: "distinctApprovals >= m",
    replace: "distinctApprovals <= m",
    cwd: "packages-galerina/galerina-tower-citizen",
    test: ["node", "--test", "tests/rd0361-governance-decisions-execution.test.mjs"],
    desc: "tower-citizen governance-decisions quorumVerdict boundary flipped (a sub-M distinct-signer count would reach ALLOW -- quorum-shortfall bypass); the differential must catch WASM != real .ts",
  },
];

// The differential TAIL — the four execution-cutover twins that the RD-0361 tranches missed because their
// tests are named for a LATER RD (0363/0364/0365) or (trit-buffer-guard) were mis-remembered as shadow-only.
// The kernel-fungi-twins gate reports 29 differential twins; these four are the balance beyond the 25 above,
// so with them the anti-neuter covers EVERY differential twin the gate counts (29/29):
//   trit-buffer-guard (rd0361, memory tamper sentinel) · passive-plan-replay-admission (rd0363, replay authority)
//   inference-governance (rd0364, model output-taint) · pq-admission-policy (rd0365, PQ no-downgrade).
const RD_DIFFERENTIAL_TAIL = [
  {
    id: "rd0361-mem-tritbufferguard-tamper",
    file: "packages-galerina/galerina-core-sentinel-memory/src/self-hosted/trit-buffer-guard.fungi",
    find: "if enc > 2 {",
    replace: "if enc > 3 {",
    cwd: "packages-galerina/galerina-core-sentinel-memory",
    test: ["node", "--test", "tests/rd0361-trit-buffer-guard-execution.test.mjs"],
    desc: "sentinel-memory trit-buffer-guard checkTritEnc weakened (the 2-bit corruption sentinel code 3 would decode 'ok' -- tampered backing memory accepted, LSM-TRIT-CORRUPT bypass); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0363-rt-passiveplan-authority",
    file: "packages-galerina/galerina-core-runtime/src/self-hosted/passive-plan-replay-admission.fungi",
    find: "if capabilityCurrent == false { return 0 - 1 }",
    replace: "if capabilityCurrent == false { return 1 }",
    cwd: "packages-galerina/galerina-core-runtime",
    test: ["node", "--test", "tests/rd0363-passive-plan-replay-execution.test.mjs"],
    desc: "core-runtime passive-plan-replay authorityVerdict weakened (an approved-then-REVOKED capability would still replay -- an old plan escalating past today's authority, RD-0363 2.2); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0364-tc-inferencegov-outputtaint",
    file: "packages-galerina/galerina-tower-citizen/src/self-hosted/inference-governance.fungi",
    find: "if dischargedByVerifier == false { return 0 }",
    replace: "if dischargedByVerifier == false { return 1 }",
    cwd: "packages-galerina/galerina-tower-citizen",
    test: ["node", "--test", "tests/rd0364-inference-governance-execution.test.mjs"],
    desc: "tower-citizen inference-governance outputTrustTrit weakened (UNDISCHARGED model output would be TRUSTED +1 -- prompt-injection/hallucination could cross a requireTrusted boundary, RD-0364 2); the differential must catch WASM != real .ts",
  },
  {
    id: "rd0365-tc-pqadmission-classical",
    file: "packages-galerina/galerina-tower-citizen/src/self-hosted/pq-admission-policy.fungi",
    find: "if edValid == false { return 0 - 1 }",
    replace: "if edValid == false { return 1 }",
    cwd: "packages-galerina/galerina-tower-citizen",
    test: ["node", "--test", "tests/rd0365-pq-admission-policy-execution.test.mjs"],
    desc: "tower-citizen pq-admission-policy classicalVerdict weakened (an INVALID Ed25519 signature would admit -- the classical-half bypass in the hybrid PQ admission fold, CRYPTO-002); the differential must catch WASM != real .ts",
  },
];

// ── RD-0528 compiler self-hosting (I-1 item c): the 7 self-hosted COMPILER stages' correctness
// differentials must be NON-VACUOUS too. Unlike the sentinel verdict-folds, these stages have LOOPS,
// so a mutant MUST be a VALUE change (a wrong-output planted bug), NEVER a loop-control flip — a
// loop-condition mutation hangs the tokenizer/parser (infinite loop) instead of failing the test.
// Each mutant is killed by the stage's `self-hosted-*` CORRECTNESS oracle (interp output === EXPECTED;
// the .fungi is read + compiled INSIDE the test, so no build step). PROPOSAL evidence only — no stage
// is authoritative until the owner's condition-form nod over its pack (RD-0528 I-4).
const RD0528_COMPILER = [
  {
    id: "rd0528-lexer-keyword-table",
    file: "packages-galerina/galerina-core-compiler/src/self-hosted/lexer.fungi",
    find: '"let", "mut", "readonly", "return", "if", "else", "match",',
    replace: '"lett", "mut", "readonly", "return", "if", "else", "match",',
    cwd: "packages-galerina/galerina-core-compiler",
    test: ["node", "--test", "tests/self-hosted-lexer.test.mjs"],
    desc: "RD-0528 compiler self-hosting — lexer.fungi keyword table 'let' mis-spelled 'lett' (the 'let' keyword tokenizes as an Identifier, wrong kind); a VALUE change (no loop control touched) so the self-hosted-lexer correctness oracle catches interp output != EXPECTED without hanging",
  },
  {
    id: "rd0528-governance-verifier-gov002",
    file: "packages-galerina/galerina-core-compiler/src/self-hosted/governance-verifier.fungi",
    find: '"FUNGI-GOV-002"',
    replace: '"FUNGI-GOV-902"',
    cwd: "packages-galerina/galerina-core-compiler",
    test: ["node", "--test", "tests/self-hosted-governance-verifier.test.mjs"],
    desc: "RD-0528 compiler self-hosting — governance-verifier.fungi emits the wrong diagnostic code for a secure flow that declares no effects (FUNGI-GOV-002 -> 902; unique 1x anchor); the self-hosted-governance-verifier oracle asserts the exact code",
  },
  {
    id: "rd0528-type-checker-type003",
    file: "packages-galerina/galerina-core-compiler/src/self-hosted/type-checker.fungi",
    find: 'code: "FUNGI-TYPE-003"',
    replace: 'code: "FUNGI-TYPE-903"',
    cwd: "packages-galerina/galerina-core-compiler",
    test: ["node", "--test", "tests/self-hosted-type-checker.test.mjs"],
    desc: "RD-0528 compiler self-hosting — type-checker.fungi emits the wrong code at its single FUNGI-TYPE-003 emission (-> 903); the oracle deepEquals [FUNGI-TYPE-002, FUNGI-TYPE-003]. The colon-form `code:` anchor is unique — it skips the two `if code ==` label/severity maps (which would make a bare-code find vacuous).",
  },
  {
    id: "rd0528-effect-checker-effect006",
    file: "packages-galerina/galerina-core-compiler/src/self-hosted/effect-checker.fungi",
    find: 'code: "FUNGI-EFFECT-006"',
    replace: 'code: "FUNGI-EFFECT-906"',
    cwd: "packages-galerina/galerina-core-compiler",
    test: ["node", "--test", "tests/self-hosted-effect-checker.test.mjs"],
    desc: "RD-0528 compiler self-hosting — effect-checker.fungi emits the wrong code at its single FUNGI-EFFECT-006 emission (-> 906); the oracle deepEquals [FUNGI-EFFECT-006]. The colon-form `code:` anchor is unique — it skips the `if code ==` map.",
  },
  {
    id: "rd0528-gir-emitter-op-load",
    file: "packages-galerina/galerina-core-compiler/src/self-hosted/gir-emitter.fungi",
    find: 'op = "load"',
    replace: 'op = "xoad"',
    cwd: "packages-galerina/galerina-core-compiler",
    test: ["node", "--test", "tests/self-hosted-gir-emitter.test.mjs"],
    desc: "RD-0528 compiler self-hosting — gir-emitter.fungi emits the wrong op for a param read at its unique `op = \"load\"` assignment (the path the 'param -> op load' test exercises; -> xoad); the oracle asserts e.op == 'load'. NB the OTHER `op: \"load\"` literal is a distinct return path covered by neither self-hosted test.",
  },
  {
    id: "rd0528-runtime-tier-sync",
    file: "packages-galerina/galerina-core-compiler/src/self-hosted/runtime.fungi",
    find: 'tier: "sync"',
    replace: 'tier: "synx"',
    cwd: "packages-galerina/galerina-core-compiler",
    test: ["node", "--test", "tests/self-hosted-runtime.test.mjs"],
    desc: "RD-0528 compiler self-hosting — runtime.fungi mis-classifies the execution tier at its single `tier: \"sync\"` site (no-effects fast-path -> synx); the self-hosted-runtime oracle asserts field(d,'tier') == 'sync' (VALUE change, no loop).",
  },
  {
    id: "rd0528-parser-param-readonly",
    file: "packages-galerina/galerina-core-compiler/src/self-hosted/parser.fungi",
    find: "isReadonly: false",
    replace: "isReadonly: true",
    cwd: "packages-galerina/galerina-core-compiler",
    test: ["node", "--test", "tests/self-hosted-parser.test.mjs"],
    desc: "RD-0528 compiler self-hosting — parser.fungi mis-classifies a non-readonly param as readonly at its unique `isReadonly: false` field (the non-readonly path; -> true); the self-hosted-parser oracle asserts params[0].isReadonly == 'false'. The parser's outputs are otherwise structural __tags, so this classification field is the clean data anchor (a record-field bool, no loop control).",
  },
];

const MUTANTS = configArg ? JSON.parse(readFileSync(configArg, "utf8")) : [...BUILTIN, ...CERT, ...FUSE, ...CC_I32, ...VSC_EGRESS, ...QUORUM_GOV, ...RD0361_T1, ...RD0361_T2_MEMORY, ...RD0361_IO_NETWORK, ...RD0361_APPKERNEL_TOWER, ...RD_DIFFERENTIAL_TAIL, ...RD0528_COMPILER];

function git(args) { return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }); }
function isClean(file) { return git(["diff", "--quiet", "--", file]).status === 0; }
function restore(file) {
  git(["checkout", "--", file]);
  // If the working-tree copy is STILL dirty (e.g. a stale index entry), force from HEAD — a
  // mutation must NEVER survive restore in fail-closed security source.
  if (!isClean(file)) git(["checkout", "HEAD", "--", file]);
}
function run(spec, cmd) {
  // npm/npx are .cmd shims on Windows — spawning them needs shell:true (EINVAL otherwise, the CVE-2024-27980 fix).
  const needsShell = cmd[0] === "npm" || cmd[0] === "npx";
  return spawnSync(exe(cmd[0]), cmd.slice(1), { cwd: join(ROOT, spec.cwd), encoding: "utf8", shell: needsShell });
}

// Precondition: refuse to mutate if ANY target file is already dirty (stale leftover or real edit).
const targets = [...new Set(MUTANTS.map((m) => m.file))];
const dirty = targets.filter((f) => !isClean(f));
if (dirty.length) {
  const msg = `REFUSING TO MUTATE — target file(s) not git-clean: ${dirty.join(", ")}. Commit/stash/restore first.`;
  console.log(asJson ? JSON.stringify({ tool: "mutation", error: msg }) : msg + "\nVIOLATIONS: 0");
  process.exit(soft ? 0 : 255);
}

const results = [];
try {
  for (const m of MUTANTS) {
    const abs = join(ROOT, m.file);
    const orig = readFileSync(abs, "utf8");
    const occurrences = orig.split(m.find).length - 1;
    if (occurrences !== 1) { results.push({ id: m.id, killed: false, by: "anchor", note: `mutation anchor matched ${occurrences}× (need exactly 1)`, desc: m.desc }); continue; }
    let verdict;
    try {
      writeFileSync(abs, orig.replace(m.find, m.replace));
      let killedByBuild = false;
      if (m.build) {
        const b = run(m, m.build);
        if (b.status === null) throw new Error(`build runner could not execute (${b.error?.code}) for ${m.id}`);
        killedByBuild = b.status !== 0; // mutation broke compilation = a valid kill
      }
      if (killedByBuild) {
        verdict = { id: m.id, killed: true, by: "build", desc: m.desc };
      } else {
        const t = run(m, m.test);
        if (t.status === null) throw new Error(`test runner could not execute (${t.error?.code}) for ${m.id}`);
        verdict = { id: m.id, killed: t.status !== 0, by: "test", desc: m.desc };
      }
    } finally {
      restore(m.file); // ALWAYS revert, even if a runner threw
    }
    results.push(verdict);
  }
} finally {
  // Belt-and-suspenders: ensure every target is clean again, then rebuild dist from clean
  // source — for EVERY distinct (cwd, build) target. restore() reverts the SOURCE but not the
  // built artifact, so a mutant in package B would otherwise leave B/dist reflecting the hole
  // even after the source is clean. Rebuild each distinct package exactly once.
  for (const f of targets) if (!isClean(f)) restore(f);
  const rebuilt = new Set();
  for (const m of MUTANTS) {
    if (!m.build) continue;
    const key = `${m.cwd}\0${JSON.stringify(m.build)}`;
    if (rebuilt.has(key)) continue;
    rebuilt.add(key);
    run(m, m.build); // clean rebuild so this package's artifacts match its restored source
  }
}

const leftDirty = targets.filter((f) => !isClean(f));
const survived = results.filter((r) => !r.killed);

if (asJson) {
  console.log(JSON.stringify({ tool: "mutation", total: results.length, killed: results.length - survived.length, survived, results, leftDirty }, null, 2));
} else {
  const out = ["# SEC-002 mutation / red-team gate (re-introduce the hole, prove the test catches it)\n"];
  for (const r of results) out.push(`${r.killed ? "✓ KILLED " : "✗ SURVIVED"} ${r.id}${r.note ? " — " + r.note : ""}${r.desc ? "\n    " + r.desc : ""}`);
  if (leftDirty.length) out.push(`\n⚠ SAFETY: target file(s) left DIRTY after restore: ${leftDirty.join(", ")} — inspect git status.`);
  out.push(`\nTOTAL: ${results.length} mutant(s) · ${results.length - survived.length} killed · ${survived.length} survived`);
  out.push(survived.length === 0 ? "ALL MUTANTS KILLED ✓ — every registered fail-closed gate is genuinely guarded." : "SURVIVING MUTANTS — a gate's test does NOT guard its fail-closed behavior.");
  out.push(`VIOLATIONS: ${survived.length}`);
  console.log(out.join("\n"));
}
// SAFETY OVERRIDE — a target left dirty means a mutation may REMAIN in fail-closed security
// source: a tool malfunction, NOT a reportable finding, so it ALWAYS fails (even under --soft,
// which otherwise downgrades surviving-mutant findings to exit 0). This closes the silent-leak
// path where the SEC-002 audit ran --soft in the --full security tier and could swallow a
// left-behind egress-sink mutant at exit 0.
if (leftDirty.length) {
  console.error(`FATAL: ${leftDirty.length} mutation(s) left in source after restore — ${leftDirty.join(", ")}. Run 'git restore' on these NOW; a fail-closed gate may be holed.`);
  process.exit(255);
}
process.exit(soft ? 0 : Math.min(survived.length, 250));
