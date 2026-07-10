#!/usr/bin/env node
/**
 * galerina — Galerina program compiler and runner
 *
 * Usage:
 *   node galerina.mjs run <program.fungi>           # compile + run via Node.js WebAssembly
 *   node galerina.mjs build <program.fungi>         # compile to .wasm + .wat in build/
 *   node galerina.mjs check <program.fungi>         # type-check + governance only
 *   node galerina.mjs run <program.fungi> --invoke <flow> [args...]  # invoke a specific flow
 *
 * The WASM path:
 *   .fungi source → parseProgram → emitGIR → buildWATModuleFromGIR → renderWAT
 *               → assembleWAT (wabt) → WebAssembly.instantiate → run
 *
 * To use with wasmtime instead of Node:
 *   node galerina.mjs build program.fungi
 *   wasmtime --invoke main build/program.wasm
 *
 * Baseline (governance-cost, Stage-A tree-walker): 3,200 ops/sec
 * This WASM path:                                  ~1,880,000 ops/sec  (588×)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { join, basename, dirname, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { totalmem, freemem } from "node:os";

// ── Pre-governance ingest guard (threat-model: file-ingestion DoS) ────────────
// Untrusted .fungi is read into a JS string BEFORE any governance runs. The lexer's FUNGI-LEX-004 10MB guard
// is POST-allocation (it checks source.length AFTER the whole file is decoded), so a 500MB file commits
// +500MB RSS before being rejected, and a >512MB file throws an uncaught ERR_STRING_TOO_LONG that crashes
// the CLI with no diagnostic. This statSyncs the SIZE on disk first and fails CLOSED (returns null; the
// caller exits on a main path, continues on a batch path), so an oversized/unreadable file is rejected
// before the allocation it would otherwise exhaust the host with.
const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // 10MB — mirrors the lexer's FUNGI-LEX-004 constant

// ── Repo-relative source paths in COMMITTED artifacts (no-absolute-local-paths) ──
// .lmanifest{,.json} + governance-impact.json record sourceFile. An absolute input
// path (rebuild-fusable-packages passes one) would leak the local user home into a
// tracked artifact (audit-path-leak windows-user-home class — leaked 2026-07-10).
// Record repo-relative (POSIX) whenever the source sits under the working dir;
// paths OUTSIDE the repo (scratch/temp builds) stay as given — their artifacts
// land outside the tree and are never committed.
function toRepoRelative(p) {
  const norm = String(p).replace(/\\/g, "/");
  const root = process.cwd().replace(/\\/g, "/").replace(/\/+$/, "") + "/";
  return norm.startsWith(root) ? norm.slice(root.length) : norm;
}

function readUntrustedSource(path) {
  try {
    const st = statSync(path);
    if (st.size > MAX_SOURCE_BYTES) {
      console.error(`❌ FUNGI-LEX-004: ${path} is ${(st.size / 1048576).toFixed(1)}MB, over the ${MAX_SOURCE_BYTES / 1048576}MB source limit — refusing to read (fail-closed).`);
      return null;
    }
    return readFileSync(path, "utf8");
  } catch (e) {
    console.error(`❌ FUNGI-BACKEND-001: could not read ${path} — ${e instanceof Error ? e.message : String(e)} (fail-closed).`);
    return null;
  }
}

// ── Auto assimilation memory budget ──────────────────────────────────────────
// Called when boot.fungi declares `assimilation_memory_budget: auto`
// OR when the governance block is omitted entirely (auto is the default).
//
// Formula: min(available_RAM * 0.20, 256MB)
// Conservative: 20% of currently free RAM, hard ceiling of 256MB.
//
// Tiers based on available RAM:
//   < 4GB  → 10% of free RAM, ceiling 50MB   (constrained / container)
//   4–16GB → 20% of free RAM, ceiling 128MB  (developer workstation)
//   > 16GB → 20% of free RAM, ceiling 256MB  (server / production)
//
// Developers can always override with an explicit value:
//   governance { assimilation_memory_budget: 50MB }  ← fixed ceiling
//   governance { assimilation_memory_budget: auto }  ← this function
//   governance { assimilation_memory_budget: auto max 100MB } ← auto with cap
function computeAutoAssimilationBudgetMB(explicitMaxMB = null) {
  const totalMB  = Math.round(totalmem()  / (1024 * 1024));
  const freeMB   = Math.round(freemem()   / (1024 * 1024));

  let ceilingMB;
  if (totalMB < 4096)       ceilingMB = 50;   // < 4GB  → 50MB ceiling
  else if (totalMB < 16384) ceilingMB = 128;  // 4–16GB → 128MB ceiling
  else                      ceilingMB = 256;  // > 16GB → 256MB ceiling

  // If explicit max provided, use the smaller of the two
  if (explicitMaxMB !== null) ceilingMB = Math.min(ceilingMB, explicitMaxMB);

  const autoBudgetMB = Math.round(freeMB * 0.20);
  return Math.min(autoBudgetMB, ceilingMB);
}

// ── Plugin blacklist (panic-as-security) ──────────────────────────────────
// Any plugin that fires an unexpected trap (not from a governed invariant)
// is blacklisted. The Tower refuses to load blacklisted plugin versions.
function loadPluginBlacklist() {
  const path = "build/plugin-blacklist.json";
  if (!existsSync(path)) return [];
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return []; }
}

function blacklistPlugin(pluginId, reason) {
  const path = "build/plugin-blacklist.json";
  mkdirSync("build", { recursive: true });
  const list = loadPluginBlacklist();
  if (!list.find(e => e.pluginId === pluginId)) {
    list.push({ pluginId, reason, blacklistedAt: new Date().toISOString() });
    writeFileSync(path, JSON.stringify(list, null, 2));
    console.log(`  [BLACKLISTED] Plugin blacklisted: ${pluginId} — ${reason}`);
  }
}

const __dir = dirname(fileURLToPath(import.meta.url));
const compilerPath = new URL("packages-galerina/galerina-core-compiler/dist/index.js", import.meta.url).href;

async function main() {
  let [, , command = "help", ...rest] = process.argv;

  // ── `generate tests` — canonical surface for contract-driven test obligations (0016) ──
  // This command was historically `gen-tests`; it is now the two-word `galerina generate tests`.
  // Normalize the subcommand into an internal dispatch token (the literal string "generate tests",
  // which contains a space and therefore can never equal a single shell argv token) and drop the
  // consumed `tests` token, leaving the downstream `fungiFile = rest[0]` + parse pipeline unchanged.
  if (command === "generate") {
    if (rest[0] === "tests") {
      command = "generate tests";
      rest = rest.slice(1);
    } else {
      console.error(`Unknown 'generate' subcommand: '${rest[0] ?? ""}'. Did you mean:  galerina generate tests <file.fungi> [--tap]`);
      process.exit(1);
    }
  }
  // The old `gen-tests` spelling was renamed to `generate tests` — redirect rather than 404 silently.
  if (command === "gen-tests") {
    console.error("`galerina gen-tests` was renamed. Use:  galerina generate tests <file.fungi> [--tap]");
    process.exit(1);
  }

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`galerina — Galerina compiler + runtime (Phase 27 WASM)

Commands:
  galerina run <file.fungi> [--invoke <flow>] [args...]   compile .fungi → WASM → run
                                                      (--invoke targets pure flows returning a primitive Int/Bool;
                                                       args are ints or true/false. Secure/effectful flows run in
                                                       the governed runtime, not the raw WASM --invoke surface.)
  galerina run <file.fungi> --invoke <flow> --governed    run ANY flow through the GOVERNED runtime (#125): contract
                                                       enforcer + fail-closed capability host (only declared effects)
                                                       + audit. Required for secure/effectful flows; fail-closed.
  galerina build <file.fungi>                             compile → build/<name>.wasm + .wat + .lmanifest
  galerina build --package <dir>                        compile a package's /src → governed .wasm in <dir>/dist/ (fusable, emits .fuse.json)
  galerina build --package <dir> --no-refresh           ...without refreshing the //fungi: dependency metadata (reproducible CI)
  galerina fuse <dir...> [--invoke <pkg>:<export>]       host-link a SET of built packages (multi-module; deny-by-default, fail-closed)
  galerina deps <file.fungi> [--flow <name>]              print generated //fungi: USES/USEDBY/IMPACT/COMPLEXITY for a file
  galerina deps <file.fungi> --write                      write the //fungi: metadata into that file (machine-owned tier)
  galerina deps --all [dir] [--write]                   refresh //fungi: across EVERY .fungi in the app (cross-file; default dir = cwd)
  galerina deps --all [dir] --check                     CI gate: exit 1 if any //fungi: is stale (don't write)
  galerina check <file.fungi>                             type-check + governance verify
  galerina check <file.fungi> --diff                      show change class vs HEAD~1 before pushing
  galerina check --what-if <policy.fungi>                 shadow policy analysis (dry run)
  galerina check --what-if <policy.fungi> <file.fungi>      what-if against single file
  galerina verify <file.fungi>                            DRCM Phase 3 admission gate — verify manifest
  galerina generate tests <file.fungi> [--tap]            contract-driven test obligations (0016) — 5 dimensions; --tap = TAP plan
  galerina manifest-to-dot <file.fungi>                   export manifest as Graphviz DOT for DAG audit
  galerina init-env                                      validate capabilities against root policy
  galerina keygen                                        generate Ed25519 signing keypair for manifests
  galerina keygen --hybrid                               generate hybrid Ed25519 + ML-DSA-65 (PQ) keypair (#34)
  galerina deploy <file.fungi> [--tag <image>]            run full deploy pipeline (check+build+verify+health)
  galerina budget                                        show auto assimilation_memory_budget for this machine
  galerina version                                      show version and runtime status
  galerina diagnostic                                    run diagnostic fault-injection benchmark suite
  galerina border-check                                  validate all plugin schemas in governance/plugins/
  galerina kb-graph [--all]                              scan ../ZTF-Knowledge-Bases/ cross-reference graph
  galerina ledger <egress-dir> [--json]                  build hash-linked compliance report from audit-egress
  galerina new <target-dir> [--name <pkg>]               scaffold an opinionated secure governed package
  galerina new app <target-dir> [--name <app>]           scaffold a governed app (App.fungi + App.manifest + flows/ deps/ proofs/)
  galerina infer <file.fungi> [--invoke F] [--prompt P] [--model M]   run governed AI inference from a flow's ai {} contract

Examples:
  galerina run   governance-cost.fungi --invoke main
  galerina build governance-cost.fungi
  galerina check examples/auth-service/verifyPassword.fungi

  # After build, run the raw WASM binary without Node.js:
  wasmtime --invoke main build/governance-cost.wasm

Install (if galerina not yet on PATH):
  cd <projects>\\Galerina && npm link       (Windows cmd.exe)
  cd <projects>/Galerina && npm link        (Git Bash / Linux)

Baseline comparison (governance-cost):
  Stage-A tree-walker (governed):  3,200 ops/sec
  This WASM path:                  ~1,880,000 ops/sec  (588×)
`);
    return;
  }

  // ── galerina version — show version and runtime status (#117) ─────────────────
  if (command === "version" || command === "--version" || command === "-v") {
    const v = JSON.parse(readFileSync("version.json", "utf-8"));
    console.log(`Galerina ${v.version} (${v.stage})`);
    console.log(`  Runtime:  ${v.runtime}`);
    console.log(`  DRCM:     ${v.drcmPhases}`);
    console.log(`  Tests:    ${v.testCount} tests / ${v.packageCount} packages`);
    console.log(`  Status:   ${v.milestone}`);
    process.exit(0);
  }

  // ── galerina deploy — full governed deploy pipeline (#112) ─────────────────────
  // Runs: governance check → build WASM → verify manifest → health check
  // Prints OCI packaging instructions for Dockerfile.galerina + deploy-linux.sh
  if (command === "deploy") {
    const tagIdx = rest.indexOf("--tag");
    const imageTag = tagIdx >= 0 ? rest[tagIdx + 1] : "galerina-app:latest";
    // Flag-order-robust target = the .fungi arg, EXCLUDING flag-consumed tokens. AUDIT FIX: a `.fungi` value
    // passed to `--tag` must not be mistaken for the deploy target (`--tag evil.fungi real.fungi` shadowing).
    const consumed = new Set(tagIdx >= 0 ? [tagIdx, tagIdx + 1] : []);
    const fungiFile = rest.find((a, i) => !consumed.has(i) && !a.startsWith("--") && /^[A-Za-z0-9_./\\-]+\.fungi$/.test(a));
    if (!fungiFile) {
      console.error("Usage: galerina deploy <file.fungi> [--tag <image-tag>] [--dev]");
      process.exit(1);
    }
    // A deploy is inherently a PRODUCTION action, so the pipeline runs under GALERINA_PROFILE=production by
    // default — build must sign, and `verify` enforces the signature + revocation (fail-closed). This closes
    // the fail-open where `galerina deploy` inherited the ambient (dev) profile and shipped UNSIGNED code.
    // `--dev` opts into a non-production deploy (auto-provisioned dev key, lenient verify) for local testing.
    // AUDIT FIX: --dev must NOT silently defeat an ops-enforced production posture. If the inherited
    // environment resolves to production, refuse the downgrade unless --force-dev is given explicitly.
    const devDeploy = rest.includes("--dev");
    if (devDeploy && !rest.includes("--force-dev")) {
      const { resolveSigningProfile } = await import("./governance/profile.mjs");
      if (resolveSigningProfile(process.env.GALERINA_PROFILE).profile === "production") {
        console.error("❌ Refusing --dev: the environment set GALERINA_PROFILE=production. A dev deploy would sign with a throwaway key and skip the production admission gate. Pass --force-dev to override (you are deliberately deploying unsigned).");
        process.exit(2);
      }
    }
    const deployProfile = devDeploy ? "dev" : "production";

    // SECURITY (2026-06-06): validate the user-supplied path and NEVER interpolate it
    // into a shell string. A `.fungi` path containing shell metacharacters (backticks,
    // ;, |, $(), …) would otherwise be executed by the shell. We reject obviously
    // hostile input and dispatch via argv-based spawnSync with shell:false.
    if (!/^[A-Za-z0-9_./\\-]+\.fungi$/.test(fungiFile)) {
      console.error(`❌ Refusing to deploy: '${fungiFile}' is not a safe .fungi path (alphanumerics, _ . / \\ - only, must end in .fungi).`);
      process.exit(2);
    }
    // AUDIT FIX (path traversal): the safe-char regex still admits `../../../x.fungi`. Confine the target to
    // the project root — a deploy must never compile/ship an out-of-tree file or clobber a build artifact by
    // basename collision. Reject any `..` segment and any path that resolves outside cwd.
    const root = resolve(process.cwd());
    const absTarget = resolve(fungiFile);
    const hasDotDot = fungiFile.split(/[\\/]/).includes("..");
    if (hasDotDot || !(absTarget === root || absTarget.startsWith(root + sep))) {
      console.error(`❌ Refusing to deploy: '${fungiFile}' resolves outside the project root (no '..' / out-of-tree paths).`);
      process.exit(2);
    }
    if (!existsSync(fungiFile)) {
      console.error(`❌ Deploy target not found: ${fungiFile}`);
      process.exit(2);
    }

    console.log(`\n🏰 Galerina Deploy — ${fungiFile}`);
    console.log(`   Image tag: ${imageTag}`);
    console.log(devDeploy
      ? `   Profile:   dev  ⚠️  --dev: NON-PRODUCTION deploy — signing/admission NOT enforced (local testing only)`
      : `   Profile:   production  (build signs · verify enforces signature + revocation, fail-closed)`);
    console.log("");

    // Run every step under the deploy profile so build signs and verify enforces (or stays lenient in --dev).
    const stepEnv = { ...process.env, GALERINA_PROFILE: deployProfile };
    const self = "galerina.mjs";
    // argv arrays — NOT shell strings. spawnSync(shell:false) passes each arg verbatim,
    // so path contents can never be interpreted as shell syntax.
    const steps = [
      { name: "Governance check", argv: [self, "check", fungiFile] },
      { name: "Build WASM",       argv: [self, "build", fungiFile] },
      { name: "Verify manifest",  argv: [self, "verify", fungiFile] },
      // --governed: the health-check module has a secure flow (audit.write), so the plain WASM --invoke
      // instantiation can't satisfy the host imports. Run it through the governed interpreter instead.
      { name: "Health check",     argv: [self, "run", "examples/deployment/health-check.fungi", "--invoke", "getHealthStatus", "--governed"] },
    ];

    for (const step of steps) {
      process.stdout.write(`  ⏳ ${step.name}...`);
      const r = spawnSync(process.execPath, step.argv, { cwd: process.cwd(), encoding: "utf-8", timeout: 60000, shell: false, env: stepEnv });
      if (r.status !== 0) {
        console.log(`  ❌ ${step.name} FAILED`);
        console.error((r.stderr || r.stdout || r.error?.message || "").toString());
        process.exit(1);
      }
      console.log(`  ✅ ${step.name}`);
    }

    console.log(`\n✅ Deploy pipeline complete`);
    console.log(`   WASM:     build/`);
    console.log(`   Receipts: build/receipt-ledger/receipts.jsonl`);
    console.log(`   Audit:    build/audit-log/audit-log.jsonl`);
    console.log(`\n   OCI packaging: see scripts/Dockerfile.galerina`);
    console.log(`   Deployment:     ./scripts/deploy-linux.sh ${fungiFile}\n`);
    process.exit(0);
  }

  // ── galerina init-env — validate capabilities against root governance policy (#65) ─
  // Must be checked BEFORE fungiFile requirement since it takes no file argument.
  if (command === "init-env") {
    const m2 = await import(compilerPath);
    const { readdirSync: rds } = await import("node:fs");
    const scanDir = (dir) => {
      try { return rds(dir).filter(f => f.endsWith(".fungi")).map(f => `${dir}/${f}`); }
      catch { return []; }
    };
    const flowFiles = [...scanDir("flows"), ...scanDir("examples/auth-service"), ...scanDir("tests/patterns")];
    let allFlows = 0, violations = 0;
    console.log(`galerina init-env — scanning ${flowFiles.length} flow file(s) for policy violations`);
    let unanalyzable = 0;
    for (const file of flowFiles) {
      try {
        const src = readFileSync(file, "utf8");
        const p = m2.parseProgram(src, file, { requireVersionHeader: true });
        // H8 (threat-model) — a file that does not PARSE cleanly cannot be fully analyzed, so its parse
        // errors ARE violations (unknown → deny). init-env previously inspected only GOVERNANCE
        // diagnostics, so a truncated/garbage/half-parsed flow (parse errors but 0 governance errors on
        // the partial AST) read as CLEAN — a governance-scan evasion. Counting them makes the dev tool
        // LOCATE the unanalyzable file (and the non-zero exit fails CI).
        const parseErrs = (p.diagnostics ?? []).filter(d => d.severity === "error");
        if (parseErrs.length > 0) {
          violations += parseErrs.length;
          parseErrs.slice(0, 3).forEach(d => console.log(`  ❌ ${file}: ${d.code} — ${d.message.slice(0, 100)} (parse error — file cannot be fully analyzed)`));
        }
        const fx = m2.checkEffects(p.flows, p.ast);
        const g = m2.verifyGovernance(p.ast, p.flows, fx, "dev");
        allFlows += p.flows.length;
        const errs = g.diagnostics.filter(d => d.severity === "error");
        if (errs.length > 0) {
          violations += errs.length;
          errs.forEach(d => console.log(`  ❌ ${file}: ${d.code} — ${d.message.slice(0, 100)}`));
        }
      } catch (e) {
        // H8 (threat-model) — a file the governance gate CANNOT analyze must FAIL the scan, never be
        // silently skipped as analyzed-clean. Otherwise a crafted flow that crashes the verifier escapes
        // the baseline ("governance-scan evasion"). Unknown → deny: count it as a hard violation so the
        // dev tool (init-env) LOCATES it (FUNGI-SCAN-UNANALYZABLE) and the non-zero exit fails CI.
        unanalyzable++; violations++;
        console.log(`  ❌ ${file}: FUNGI-SCAN-UNANALYZABLE — could not parse/verify (${String(e?.message ?? e).slice(0, 100)}) — a file the gate cannot analyze FAILS the scan`);
      }
    }
    if (violations === 0) {
      console.log(`✅ init-env: ${allFlows} flows scanned, 0 violations — clean baseline for diffing`);
    } else {
      console.log(`⚠️  init-env: ${allFlows} flows scanned, ${violations} violation(s)${unanalyzable ? ` (incl. ${unanalyzable} UNANALYZABLE → fail-closed)` : ""} — review before committing`);
      process.exit(2);
    }
    return;
  }

  // ── galerina keygen — generate Ed25519 signing keypair for manifest governance (#107) ─
  // Stage A: Ed25519 (Node.js native crypto)
  // Stage B: ML-DSA-65 (NIST FIPS 204) — upgrade once Node.js adds FIPS 204 support
  if (command === "keygen") {
    const { generateKeyPairSync, randomBytes, createPublicKey, createPrivateKey } = await import("node:crypto");
    const { writeFileSync: wfs, mkdirSync: mds, chmodSync: chm } = await import("node:fs");
    const { join: pjoin } = await import("node:path");

    // ── #34: hybrid Ed25519 + ML-DSA-65 (NIST FIPS 204) keygen — wires the shipped, tested
    // generateHybridGovernanceKeyPair into the offline key ceremony. Opt-in via --hybrid/--pq; the
    // Ed25519 material stays byte-compatible with the legacy path (DER→PEM) so existing verify works.
    if (rest.includes("--hybrid") || rest.includes("--pq")) {
      const keyId = randomBytes(8).toString("hex");
      const cc = await import(new URL("packages-galerina/galerina-core-compiler/dist/index.js", import.meta.url).href);
      const kp = await cc.generateHybridGovernanceKeyPair(keyId);
      const pubPem = createPublicKey({ key: Buffer.from(kp.publicKey), format: "der", type: "spki" }).export({ type: "spki", format: "pem" });
      const privPem = createPrivateKey({ key: Buffer.from(kp.privateKey), format: "der", type: "pkcs8" }).export({ type: "pkcs8", format: "pem" });
      mds("governance", { recursive: true });
      const pubKeyPath = pjoin("governance", `signing-key-${keyId}.pub.pem`);
      const mldsaPubPath = pjoin("governance", `signing-key-${keyId}.mldsa.pub.b64`);
      wfs(pubKeyPath, pubPem);
      wfs(mldsaPubPath, Buffer.from(kp.mlDsaPublicKey).toString("base64") + "\n");
      const envPath = ".env.galerina-signing";
      const envContent = [
        `# Galerina governance signing key — NEVER COMMIT THIS FILE`,
        `# Key ID: ${keyId}`,
        `# Algorithm: ${kp.algorithm} (hybrid Ed25519 + ML-DSA-65, NIST FIPS 204 — #34 post-quantum)`,
        `GALERINA_SIGNING_KEY_ID=${keyId}`,
        `GALERINA_SIGNING_ALGORITHM=${kp.algorithm}`,
        `GALERINA_SIGNING_KEY_CREATED=${new Date().toISOString()}`,
        `GALERINA_SIGNING_PRIVATE_KEY_B64=${Buffer.from(privPem).toString("base64")}`,
        `GALERINA_SIGNING_MLDSA_PRIVATE_KEY_B64=${Buffer.from(kp.mlDsaPrivateKey).toString("base64")}`,
        ``,
      ].join("\n");
      wfs(envPath, envContent, { mode: 0o600 });
      try { chm(envPath, 0o600); } catch { /* Windows / unsupported FS — best-effort */ }
      console.log(`\n✅ Galerina HYBRID (post-quantum) governance signing keypair generated`);
      console.log(`   Algorithm:   ${kp.algorithm}  (Ed25519 + ML-DSA-65, NIST FIPS 204)`);
      console.log(`   Key ID:      ${keyId}`);
      console.log(`   Public keys: ${pubKeyPath}`);
      console.log(`                ${mldsaPubPath}  (safe to commit)`);
      console.log(`   Private keys: ${envPath}      (NEVER COMMIT — keep in OFFLINE custody)`);
      console.log(`\n   #34 offline ceremony: run on an air-gapped host; keep ${envPath} in offline custody.`);
      console.log(`   Runbook: docs/security/galerina-34-offline-key-ceremony-runbook.md\n`);
      process.exit(0);
    }

    // Generate Ed25519 keypair (Stage A — will upgrade to ML-DSA-65 in Stage B)
    const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // Key ID = first 16 hex chars of random bytes
    const keyId = randomBytes(8).toString("hex");

    // Store public key in governance/ directory (safe to commit)
    mds("governance", { recursive: true });
    const pubKeyPath = pjoin("governance", `signing-key-${keyId}.pub.pem`);
    wfs(pubKeyPath, publicKey);

    // Store private key in .env.galerina-signing (never commit)
    const envPath = ".env.galerina-signing";
    const envContent = [
      `# Galerina governance signing key — NEVER COMMIT THIS FILE`,
      `# Key ID: ${keyId}`,
      `# Algorithm: Ed25519 (Stage A) → ML-DSA-65 NIST FIPS 204 (Stage B)`,
      `GALERINA_SIGNING_KEY_ID=${keyId}`,
      `GALERINA_SIGNING_KEY_CREATED=${new Date().toISOString()}`,
      `GALERINA_SIGNING_PRIVATE_KEY_B64=${Buffer.from(privateKey).toString("base64")}`,
      ``,
    ].join("\n");
    // #175: the private key file must not be group/world-readable. Create it 0o600 and
    // re-enforce on any pre-existing file (writeFileSync's mode only applies on creation).
    wfs(envPath, envContent, { mode: 0o600 });
    try { chm(envPath, 0o600); } catch { /* Windows / unsupported FS — mode is best-effort */ }

    console.log(`\n✅ Galerina governance signing keypair generated`);
    console.log(`   Algorithm:  Ed25519 (Stage A — ML-DSA-65 in Stage B)`);
    console.log(`   Key ID:     ${keyId}`);
    console.log(`   Public key: ${pubKeyPath}  (safe to commit)`);
    console.log(`   Private key: ${envPath}    (NEVER COMMIT — add to .gitignore)`);
    console.log(`\n   Add to .gitignore:`);
    console.log(`     .env.galerina-signing`);
    console.log(`\n   To start signing manifests:`);
    console.log(`     export GALERINA_SIGNING_KEY_ID=${keyId}`);
    console.log(`     source ${envPath}  # or add to your shell env`);
    console.log(`     galerina build <file.fungi>  # will now sign the manifest\n`);

    process.exit(0);
  }

  // ── galerina check --what-if <policyFile> [targetFile]: Shadow Policy Analysis (#71) ─
  // Runs governance verification against a proposed policy WITHOUT applying it.
  // Shows which flows would fail, which effects would be denied, and change class.
  // Exit 0 = policy compatible, Exit 2 = expansion violations
  if (command === "check" && rest[0] === "--what-if" && rest[1]) {
    const policyFile = rest[1];
    const targetFile = rest[2]; // optional: target specific .fungi file

    if (!existsSync(policyFile)) {
      console.error(`❌ Policy file not found: ${policyFile}`);
      process.exit(1);
    }

    console.log(`\n🔍 Shadow Policy Analysis — What-If Mode`);
    console.log(`   Policy:  ${policyFile}`);
    console.log(`   Target:  ${targetFile ?? "all .fungi files in build/"}`);
    console.log(`   Status:  DRY RUN — no changes applied\n`);

    // Read the shadow policy file
    const shadowPolicyContent = readFileSync(policyFile, "utf-8");

    // Parse to extract policy name and permitted_effects
    const policyNameMatch = shadowPolicyContent.match(/policy\s+(\w+)\s*\{/);
    const policyName = policyNameMatch?.[1] ?? "ShadowPolicy";

    // Extract permitted_effects from shadow policy
    const permittedEffectsMatch = shadowPolicyContent.match(/permitted_effects\s*\{([^}]*)\}/s);
    const permittedEffects = permittedEffectsMatch?.[1]
      ?.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith(';'))
      ?? [];

    // Extract enforced_limits from shadow policy
    const enforcedLimitsMatch = shadowPolicyContent.match(/enforced_limits\s*\{([^}]*)\}/s);
    const enforcedLimits = enforcedLimitsMatch?.[1]
      ?.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith(';'))
      ?? [];

    // Find all .fungi files to check
    const fungiFiles = targetFile
      ? [targetFile]
      : readdirSync(".", { recursive: true })
          .filter(f => String(f).endsWith(".fungi") && !String(f).includes("node_modules"))
          .map(f => String(f))
          .slice(0, 20); // cap at 20

    // Analyse each file against the shadow policy
    let violations = 0;
    let warnings = 0;
    let compatible = 0;
    const report = [];

    for (const fungiFile of fungiFiles) {
      if (!existsSync(fungiFile)) continue;
      const src = readUntrustedSource(fungiFile);
      if (src === null) continue; // oversized/unreadable → skip this file in the batch (fail-closed)

      // Extract declared effects from the file
      const effectsMatches = [...src.matchAll(/effects\s*\{([^}]*)\}/sg)];
      const declaredEffects = effectsMatches.flatMap(m =>
        (m[1] ?? "").split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0 && !l.startsWith('//') && !l.startsWith(';'))
      );

      // Check which effects would be blocked by the shadow policy
      const blockedEffects = declaredEffects.filter(eff => {
        const effName = eff.replace(/^allow\s+/, "").trim();
        // If permitted_effects is empty, all are allowed (no restriction)
        if (permittedEffects.length === 0) return false;
        // Check if the effect is covered by the policy's permitted list
        return !permittedEffects.some(pe => {
          const peName = pe.replace(/^allow\s+/, "").trim();
          return peName === effName || peName === effName.split('.')[0] + '.*';
        });
      });

      if (blockedEffects.length > 0) {
        violations++;
        report.push({
          file: fungiFile,
          status: "❌ VIOLATION",
          blocked: blockedEffects,
          allowed: declaredEffects.filter(e => !blockedEffects.includes(e)),
        });
      } else if (declaredEffects.length > 0) {
        compatible++;
        report.push({ file: fungiFile, status: "✅ compatible", blocked: [], allowed: declaredEffects });
      }
    }

    // Print report
    for (const entry of report) {
      console.log(`  ${entry.status}  ${entry.file}`);
      if (entry.blocked.length > 0) {
        console.log(`    Would block: ${entry.blocked.join(', ')}`);
      }
    }

    // Summary
    const changeClass = violations > 0 ? "TIGHTENING" : "NEUTRAL";
    console.log(`\n─────────────────────────────────────────────────`);
    console.log(`  Shadow Policy: ${policyName}`);
    console.log(`  Change Class:  ${changeClass}`);
    console.log(`  Compatible:    ${compatible} file(s)`);
    console.log(`  Violations:    ${violations} file(s) — would fail under this policy`);
    console.log(`  Warnings:      ${warnings}`);
    console.log(`\n  📋 This is a DRY RUN — policy '${policyName}' has NOT been applied.`);
    console.log(`     To apply: cp ${policyFile} governance/${policyName}.fungi && galerina init-env\n`);

    process.exit(violations > 0 ? 2 : 0);
  }

  // ── galerina budget — show auto assimilation_memory_budget for this machine ──
  if (command === "budget") {
    const totalMB = Math.round(totalmem() / (1024 * 1024));
    const freeMB  = Math.round(freemem()  / (1024 * 1024));
    const autoBudget = computeAutoAssimilationBudgetMB();
    console.log(`\n  🏰 Galerina Assimilation Memory Budget`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  Total RAM:          ${totalMB} MB`);
    console.log(`  Available RAM:      ${freeMB} MB`);
    console.log(`  Auto budget (20%):  ${Math.round(freeMB * 0.20)} MB (before ceiling)`);
    console.log(`  Resolved budget:    ${autoBudget} MB  ← what 'auto' uses`);
    console.log();
    console.log(`  boot.fungi options:`);
    console.log(`    governance { }                                           → ${autoBudget} MB (omitted = auto)`);
    console.log(`    governance { assimilation_memory_budget: auto }         → ${autoBudget} MB`);
    console.log(`    governance { assimilation_memory_budget: auto max 50MB }→ ${computeAutoAssimilationBudgetMB(50)} MB`);
    console.log(`    governance { assimilation_memory_budget: 100MB }        → 100 MB (explicit)`);
    console.log();
    console.log(`  Ceiling tiers: <4GB RAM → 50MB · 4–16GB → 128MB · >16GB → 256MB\n`);
    process.exit(0);
  }

  // ── galerina border-check — FAIL-CLOSED plugin admission gate ──────────────────
  // SECURITY (2026-06-06): previously this only checked file presence and counted a
  // BLACKLISTED plugin as "clean". A plugin requesting real authority
  // (ai.inference / network.outbound / audit.write) with a placeholder
  // "sha256:pending-…" hash sailed through. The gate now DENIES by default and
  // validates: source-hash format (no pending/placeholder), blacklist state,
  // capability allowlist, resource-limit ranges, governance tier, and schema file.
  if (command === "border-check") {
    console.log("\n  Hardened Border Check");
    console.log("  ─────────────────────────");
    const pluginsDir = "governance/plugins";
    if (!existsSync(pluginsDir)) {
      console.log("  No plugins directory found at governance/plugins/");
      process.exit(0);
    }
    // Capability allow-list (deny anything not on it). B2: the canonical,
    // alias-aware admission vocabulary lives in the compiler (capability-types) —
    // the SAME schema the fusion gate is drift-checked against — so the two
    // admission gates validate against ONE list and can't silently diverge.
    const { isAdmissibleCapability, normalizeCapability } = await import(
      new URL("packages-galerina/galerina-core-compiler/dist/capability-types.js", import.meta.url).href
    );
    const CEILINGS = { maxMemoryMB: 4096, maxCpuCycles: 1e10, maxWallMs: 60000 };
    // High-authority (sandbox-escape / secret-reading) capabilities are admissible
    // under the unified vocabulary, but must NEVER be gated like a benign I/O shim:
    // they demand the strictest governance tier (3). Security review 2026-06-21 #1.
    const HIGH_AUTHORITY_CAPS = new Set(["shell.execute", "native.call", "secret.access"]);
    const SHA256 = /^sha256:[0-9a-f]{64}$/;

    function validatePlugin(plugin) {
      const reasons = [];
      const manifestPath = join(pluginsDir, plugin, "manifest.json");
      const schemaPath = join(pluginsDir, plugin, "schemas/data_types.json");
      if (!existsSync(manifestPath)) return ["missing manifest.json"];
      if (!existsSync(schemaPath)) reasons.push("missing schemas/data_types.json");
      let m;
      try { m = JSON.parse(readFileSync(manifestPath, "utf-8")); }
      catch (e) { return [`unparseable manifest.json: ${e.message}`]; }
      try { JSON.parse(readFileSync(schemaPath, "utf-8")); }
      catch { reasons.push("unparseable schemas/data_types.json"); }
      // Source integrity pin — reject placeholders / malformed hashes.
      if (typeof m.sourceHash !== "string" || !SHA256.test(m.sourceHash)) {
        reasons.push(`invalid/placeholder sourceHash: ${JSON.stringify(m.sourceHash)} (must be sha256:<64 hex>)`);
      }
      // Deny-by-default blacklist.
      if (m.blacklisted === true) reasons.push("plugin is blacklisted");
      // Governance tier.
      if (![1, 2, 3].includes(m.governanceTier)) reasons.push(`invalid governanceTier: ${JSON.stringify(m.governanceTier)}`);
      // Capabilities: must be a non-empty array, each on the allow-list.
      if (!Array.isArray(m.capabilities) || m.capabilities.length === 0) {
        reasons.push("capabilities missing or empty");
      } else {
        for (const c of m.capabilities) {
          if (typeof c !== "string" || !isAdmissibleCapability(c)) {
            reasons.push(`unknown/unpermitted capability: ${JSON.stringify(c)}`);
          } else if (HIGH_AUTHORITY_CAPS.has(normalizeCapability(c)) && m.governanceTier !== 3) {
            reasons.push(`high-authority capability ${JSON.stringify(c)} requires governanceTier 3 (got ${JSON.stringify(m.governanceTier)})`);
          }
        }
      }
      // Resource limits within ceilings.
      const rl = m.resourceLimits ?? {};
      for (const k of ["maxMemoryMB", "maxCpuCycles", "maxWallMs"]) {
        const v = rl[k];
        if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > CEILINGS[k])) {
          reasons.push(`resourceLimits.${k} out of range: ${JSON.stringify(v)} (1..${CEILINGS[k]})`);
        }
      }
      return reasons;
    }

    const plugins = readdirSync(pluginsDir);
    let clean = 0, denied = 0;
    for (const plugin of plugins) {
      const reasons = validatePlugin(plugin);
      if (reasons.length === 0) {
        console.log(`  [ADMITTED]  ${plugin}`);
        clean++;
      } else {
        console.log(`  [DENIED]    ${plugin}`);
        for (const r of reasons) console.log(`              ↳ ${r}`);
        denied++;
      }
    }
    console.log(`\n  ${clean} admitted · ${denied} denied\n`);
    process.exit(denied > 0 ? 1 : 0);
  }

  // ── galerina kb-graph — scan ../ZTF-Knowledge-Bases/ cross-reference graph ──────
  if (command === "kb-graph") {
    // #174: pass argv as an array with shell:false — never interpolate user input
    // into a shell string (the prior execSync concatenation was a command-injection sink).
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(
      process.execPath,
      ["packages-galerina/galerina-devtools-kb-graph/dist/cli.js", ...(rest.length ? rest : ["--all"])],
      { stdio: "inherit", cwd: process.cwd(), shell: false }
    );
    process.exit(r.status ?? 0);
  }

  // ── galerina ledger — #146 hash-linked compliance report over audit-egress ────
  if (command === "ledger") {
    // #174-safe: argv array + shell:false, no shell interpolation of user input.
    const { spawnSync } = await import("node:child_process");
    if (!rest[0]) {
      process.stderr.write("Usage: galerina ledger <egress-dir> [--json]\n");
      process.exit(1);
    }
    const r = spawnSync(
      process.execPath,
      ["packages-galerina/galerina-devtools-pci/dist/cli.js", "ledger", ...rest],
      { stdio: "inherit", cwd: process.cwd(), shell: false }
    );
    process.exit(r.status ?? 0);
  }

  // ── galerina new — scaffold an opinionated secure governed package (#176) ─────
  if (command === "new") {
    // #174-safe: argv array + shell:false. Delegates to the standalone scaffolder.
    const { spawnSync } = await import("node:child_process");
    if (!rest[0]) {
      process.stderr.write("Usage: galerina new [package|app] <target-dir> [--name <pkg>]\n");
      process.exit(1);
    }
    const r = spawnSync(
      process.execPath,
      ["scripts/galerina-new.mjs", ...rest],
      { stdio: "inherit", cwd: process.cwd(), shell: false }
    );
    process.exit(r.status ?? 0);
  }

  // ── galerina bridge-attest — sign / verify bridge manifests (CF-3/CF-7) ───────
  if (command === "bridge-attest") {
    const tc = await import(new URL("packages-galerina/galerina-tower-citizen/dist/index.js", import.meta.url).href);
    const sub = rest[0];
    if (sub === "keygen") {
      const { publicKeyPem, privateKeyPem } = tc.generateAttestationKeypair();
      console.log("# Ed25519 bridge-attestation keypair");
      console.log("# Keep the private key offline; pin the public key in the deployment's attestation policy.\n");
      console.log(publicKeyPem.trim());
      console.log(privateKeyPem.trim());
      process.exit(0);
    }
    if (sub === "hash" && rest[1]) {
      const manifest = JSON.parse(readFileSync(rest[1], "utf8"));
      console.log(tc.attestationHash(manifest));
      process.exit(0);
    }
    if (sub === "sign" && rest[1] && rest[2]) {
      const manifest = JSON.parse(readFileSync(rest[1], "utf8"));
      const privateKeyPem = readFileSync(rest[2], "utf8");
      const attestation = tc.signManifest(manifest, privateKeyPem);
      console.log(JSON.stringify(attestation, null, 2));
      process.exit(0);
    }
    if (sub === "verify" && rest[1] && rest[2]) {
      // verify <attestation.json> <pubkey.pem> [--keyid <id>]
      // attestation.json = the { manifest, signature } object produced by `sign`.
      const attestation = JSON.parse(readFileSync(rest[1], "utf8"));
      const publicKeyPem = readFileSync(rest[2], "utf8");
      const kidIdx = rest.indexOf("--keyid");
      let signerKeyId;
      if (kidIdx !== -1) {
        signerKeyId = rest[kidIdx + 1];
        // A valueless --keyid must NOT silently disable the revocation gate.
        if (!signerKeyId || signerKeyId.startsWith("--")) {
          console.error("Error: --keyid requires a value (the signer's keyId)");
          process.exit(2);
        }
      }
      const policy = { requireSigned: true, publicKeyPem };
      // Revocation (fail-closed): when a signer keyId is given, refuse a revoked signer.
      // An untrustworthy/tampered revocation registry fails the whole verify closed.
      if (signerKeyId) {
        try {
          const { isKeyRevoked, assertRegistryTrustworthy } = await import("./governance/revocation-registry.mjs");
          assertRegistryTrustworthy("."); // throws if the registry is unsigned-under-pin / signed by a revoked key
          policy.signerKeyId = signerKeyId;
          policy.revocationCheck = (k) => isKeyRevoked(k, ".");
        } catch (e) {
          console.error(`❌ bridge-attest verify: revocation registry untrusted (${e.message}) — refusing (fail-closed)`);
          process.exit(1);
        }
      } else {
        console.warn("⚠  no --keyid given: signature verified, but REVOCATION was NOT checked");
      }
      const result = tc.verifyAttestation(attestation, policy);
      if (result.ok) {
        console.log(`✅ attestation OK (hash ${result.hash})`);
        process.exit(0);
      }
      console.error(`❌ attestation DENIED: ${result.reason}`);
      process.exit(1);
    }
    console.error("Usage: galerina bridge-attest keygen | hash <manifest.json> | sign <manifest.json> <privkey.pem> | verify <attestation.json> <pubkey.pem> [--keyid <id>]");
    process.exit(2);
  }

  // ── galerina diagnostic — run diagnostic fault-injection benchmark suite ──────
  if (command === "diagnostic") {
    // #174: argv array + shell:false (no shell-string interpolation of user argv).
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(
      process.execPath,
      ["packages-galerina/galerina-devtools-benchmarks/src/diagnostic-runner.mjs", ...rest],
      { stdio: "inherit", cwd: process.cwd(), shell: false }
    );
    process.exit(r.status ?? 0);
  }

  const m = await import(compilerPath);

  // ── //fungi: whole-app refresh helpers (R&D 0045 — `deps --all` and the build auto-refresh) ──────
  // Recursively collect every .fungi source under a root (skipping build/vendor dirs), then run a
  // CROSS-FILE flow analysis so USES/USEDBY/IMPACT span files (a flow called from another file is
  // never mislabelled "safe to delete"). Returns per-file rewrite results; `write:true` persists them.
  const collectFungiFiles = (root) => {
    const SKIP = new Set(["node_modules", "dist", "build", ".git", ".galerina"]);
    const out = [];
    const walk = (dir) => {
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p); }
        else if (e.isFile() && e.name.endsWith(".fungi")) out.push(p);
      }
    };
    try {
      const st = statSync(root);
      if (st.isFile()) { if (root.endsWith(".fungi")) out.push(root); }
      else walk(root);
    } catch { /* missing root → no files */ }
    return out;
  };
  // ── signed-package write guard (cascade fix, owner-directed 2026-07-01) ──────
  // A fusable package whose dist/<name>.lmanifest.json carries a REAL signature
  // (object governanceSignature with string keyId + signature — mirrors
  // fuse-loader verifyManifestSignature and scripts/lib/signed-lmanifest.mjs) is
  // owned by the OFFLINE signing ceremony. Dirtying its src (even a generated
  // //fungi: comment) bumps mtimes, the fuse-rebuild hook re-fuses it, and the
  // regenerated manifest is UNSIGNED → the fuse loader fail-closes
  // (FUNGI-FUSE-UNSIGNED). So the comment writer must never write into a signed
  // package. Deny-by-default: an existing-but-unreadable manifest counts as signed.
  const signedPkgCache = new Map();
  const isUnderSignedPackage = (file) => {
    let dir = dirname(file);
    const start = dir;
    if (signedPkgCache.has(start)) return signedPkgCache.get(start);
    let verdict = false;
    for (let hops = 0; hops < 8; hops++) {
      const desc = join(dir, "package.fungi.json");
      if (existsSync(desc)) {
        try {
          const name = JSON.parse(readFileSync(desc, "utf8")).name;
          const manPath = name ? join(dir, "dist", `${name}.lmanifest.json`) : null;
          if (manPath && existsSync(manPath)) {
            const sig = JSON.parse(readFileSync(manPath, "utf8")).governanceSignature;
            verdict = sig !== null && typeof sig === "object" &&
              typeof sig.keyId === "string" && typeof sig.signature === "string" &&
              sig.signature.length > 0 && !sig.signature.startsWith("placeholder");
          }
        } catch { verdict = true; } // unreadable descriptor/manifest → protect
        break;
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
    signedPkgCache.set(start, verdict);
    return verdict;
  };
  const refreshGeneratedComments = (root, { write }) => {
    const FK = new Set(["pureFlowDecl", "flowDecl", "secureFlowDecl", "guardedFlowDecl"]);
    const files = [];
    const sources = new Map();
    let parseErrors = 0;
    for (const f of collectFungiFiles(root)) {
      try {
        const src = readFileSync(f, "utf8");
        const p = m.parseProgram(src, f, { requireVersionHeader: true });
        // Fail-closed: never rewrite a file whose program does not parse cleanly.
        if ((p.diagnostics ?? []).some(d => d.severity === "error")) { parseErrors++; continue; }
        files.push({ file: f, ast: p.ast });
        sources.set(f, src);
      } catch { parseErrors++; }
    }
    const { deps } = m.analyzeProgramFlowDependencies(files);
    const results = [];
    for (const { file, ast } of files) {
      const genMap = new Map();
      for (const child of ast.children ?? []) {
        if (!FK.has(child.kind) || !child.value) continue;
        const d = deps.get(child.value);
        if (d === undefined) continue;
        genMap.set(child.value, [...m.renderDependencyComments(d), ...m.renderComplexityComment(child)]);
      }
      if (genMap.size === 0) continue;
      const before = sources.get(file);
      const after = m.rewriteGeneratedComments(before, genMap);
      const changed = after !== before;
      // `blocked` = would change, but the file lives in a SIGNED fusable package
      // (see guard above) — never written, reported instead.
      const blocked = changed && isUnderSignedPackage(file);
      if (write && changed && !blocked) writeFileSync(file, after);
      results.push({ file, flows: genMap.size, changed, blocked, genMap });
    }
    return { results, parseErrors, parsedCount: files.length };
  };

  // ── Package build mode: `galerina build --package <dir>` (#175, design-doc §11)
  // Compiles a package's /src entry (with its `import ./*.fungi` DAG, #94) into one
  // governed, signed .wasm + .lmanifest written INTO the package's dist/, plus a
  // <name>.fuse.json fusion descriptor — ready to be FUSED into a host App Kernel.
  let packageBuild = null;
  let packageDescriptor = null;
  let fungiFile = rest[0];
  {
    const pkgIdx = command === "build" ? rest.indexOf("--package") : -1;
    if (pkgIdx >= 0) {
      const pkgDir = rest[pkgIdx + 1];
      if (!pkgDir) { console.error("Error: --package requires a directory path"); process.exit(1); }
      const descPath = join(pkgDir, "package.fungi.json");
      if (!existsSync(descPath)) { console.error(`Error: missing package descriptor: ${descPath}`); process.exit(1); }
      try { packageDescriptor = JSON.parse(readFileSync(descPath, "utf8")); }
      catch (e) { console.error(`Error: invalid package.fungi.json — ${e.message}`); process.exit(1); }
      if (!packageDescriptor.name) { console.error('Error: package.fungi.json must declare a "name"'); process.exit(1); }
      packageBuild = pkgDir;
      fungiFile = join(pkgDir, packageDescriptor.entry || "src/index.fungi");
      // ── CG-7 third end (owner-approved 2026-07-02; committed-state refinement
      // 2026-07-10, #21): refuse to locally rebuild a SIGNED fusable package via direct
      // `build --package` when its manifest is a COMMITTED ceremony artifact — git-tracked
      // AND real-signed IN HEAD. The committed dist/<name>.wasm + .lmanifest ARE the signed
      // artifacts, owned by the OFFLINE re-sign ceremony; a local rebuild mints an UNSIGNED
      // manifest → the fuse loader fail-closes (FUNGI-FUSE-UNSIGNED). Protection is decided
      // from GIT, not disk shape (mirrors scripts/lib/signed-lmanifest.mjs
      // isCommittedSignedManifest — keep the two in step):
      //   untracked manifest            → a LOCAL dev artifact (api-protocol-rest's
      //                                   test-regenerated dist) — rebuilds freely
      //   tracked + HEAD real-signed    → refuse (the ceremony's)
      //   tracked + HEAD placeholder    → rebuilds freely (regenerable; e.g. the fuse-demo
      //                                   fixture until its ceremony — a locally minted
      //                                   dev-key manifest sitting over it must NOT refuse)
      //   tracked + HEAD unreadable     → refuse (cannot prove regenerable)
      //   git errors / not a repo       → fall back to the DISK predicate (most-secure
      //                                   default; matches isUnderSignedPackage's stance)
      // `--force` overrides for the deliberate pre-re-sign rebuild
      // (rebuild-fusable-packages forwards it). The rebuild-hook guard + the
      // `signed:fixtures` drift gate cover the automated paths; this closes the
      // DIRECT-invocation path with the SAME predicate they use.
      if (!rest.includes("--force")) {
        const manRel = join("dist", `${packageDescriptor.name}.lmanifest.json`);
        const manRelFwd = manRel.replace(/\\/g, "/");
        let committedFixture;
        const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", manRelFwd],
          { cwd: packageBuild, encoding: "utf8", timeout: 15000 });
        if (tracked.status === 1) {
          committedFixture = false;                       // untracked → dev-local
        } else if (tracked.status !== 0) {
          committedFixture = isUnderSignedPackage(fungiFile); // git can't answer → disk floor
        } else {
          // `HEAD:./path` resolves relative to cwd (the package dir).
          const show = spawnSync("git", ["show", `HEAD:./${manRelFwd}`],
            { cwd: packageBuild, encoding: "utf8", timeout: 15000 });
          if (show.status !== 0) {
            committedFixture = true;                      // tracked but no HEAD blob → protect
          } else {
            try {
              const sig = JSON.parse(show.stdout).governanceSignature;
              committedFixture = sig !== null && typeof sig === "object" &&
                typeof sig.keyId === "string" && typeof sig.signature === "string" &&
                sig.signature.length > 0 && !sig.signature.startsWith("placeholder");
            } catch { committedFixture = true; }          // tracked + unparseable → protect
          }
        }
        if (committedFixture) {
          console.error(`⛔ Refusing to locally rebuild SIGNED package "${packageDescriptor.name}" — dist/${packageDescriptor.name}.lmanifest is a git-tracked ceremony-signed artifact (signed in HEAD) owned by the offline re-sign ceremony. A local rebuild would mint an UNSIGNED manifest and the fuse loader would fail-close. Pass --force only if you are deliberately rebuilding ahead of an offline re-sign.`);
          process.exit(1);
        }
      }
    }
  }

  // ── galerina deps --all [dir] [--write] — refresh //fungi: across EVERY .fungi file in the app ──────
  // Cross-file: builds one whole-program flow graph so USES/USEDBY/IMPACT span files. Without
  // --write it prints a per-file preview; with --write it rewrites each file's //fungi: block in place
  // (machine-owned tier, R&D 0045 #3 — touches only //fungi: lines). Default root = the --package dir,
  // else a positional path, else the current directory. Must run BEFORE the single-file read below.
  if (command === "deps" && rest.includes("--all")) {
    const dirArg = rest.find(a => !a.startsWith("--"));
    const root = packageBuild ?? dirArg ?? ".";
    const write = rest.includes("--write");
    const check = rest.includes("--check");
    // --check never writes (even if --write is also passed) — it is the CI staleness GATE.
    const { results, parseErrors, parsedCount } = refreshGeneratedComments(root, { write: write && !check });
    if (check) {
      // A file whose generated block WOULD change is stale (the don't-trust-check rule applied to
      // the tool's own output). Exit non-zero so CI fails when someone forgot to refresh.
      // Signed-package files are excluded from the failure (--write can never fix them — the
      // offline re-sign ceremony owns those artifacts); they are reported instead.
      const stale = results.filter(r => r.changed && !r.blocked);
      for (const r of results) if (r.blocked) console.log(`🔒 ${r.file}: //fungi: stale but src belongs to a SIGNED package (offline ceremony owns it)`);
      for (const r of stale) console.log(`✗ ${r.file}: //fungi: is STALE`);
      if (stale.length > 0) {
        console.log(`\n${stale.length}/${results.length} file(s) have stale //fungi: metadata — run: galerina deps --all --write`);
        process.exit(1);
      }
      console.log(`✓ //fungi: metadata current across ${parsedCount} file(s).`);
      process.exit(0);
    }
    if (write) {
      let changed = 0;
      for (const r of results) {
        if (r.blocked) { console.log(`🔒 ${r.file}: skipped — SIGNED package src is never rewritten (offline ceremony owns it)`); continue; }
        if (r.changed) { changed++; console.log(`✅ ${r.file}: refreshed //fungi: on ${r.flows} flow(s)`); }
      }
      console.log(`\n${changed}/${results.length} file(s) updated across ${parsedCount} parsed file(s)${parseErrors ? `, ${parseErrors} skipped (parse errors)` : ""}.`);
    } else {
      for (const r of results) {
        console.log(`# ${r.file}`);
        for (const [flow, lines] of r.genMap) { console.log(`flow ${flow}`); for (const l of lines) console.log(`  ${l}`); }
      }
      console.log(`\n(${parsedCount} file(s) analysed${parseErrors ? `, ${parseErrors} skipped` : ""}; re-run with --write to apply.)`);
    }
    process.exit(0);
  }

  // ── galerina fuse <dir...> — compose multiple built packages (R&D 0052 Phase A) ─────────────────
  // Host-links a SET of `galerina build --package` outputs: packages can live OUTSIDE the app as
  // separate signed .wasm and be wired at admission. Fail-closed (set-signed, deny-by-default,
  // acyclic). First-party/trusted only (shared memory; isolation is Phase B). Prints the resolved
  // composition; `--invoke <pkg>:<export>` runs an entry. Must run BEFORE the single-file read.
  if (command === "fuse") {
    let allowUnsigned = false, governanceDir, invokeSpec;
    const dirs = [];
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === "--allow-unsigned") allowUnsigned = true;
      else if (a === "--governance-dir") governanceDir = rest[++i];
      else if (a === "--invoke") invokeSpec = rest[++i];
      else if (!a.startsWith("--")) dirs.push(a);
    }
    if (dirs.length === 0) { console.error("Error: galerina fuse needs one or more package directories"); process.exit(1); }
    // RD-0234b Class B(ii): the production posture is fail-secure and OVERRIDES --allow-unsigned.
    // Admitting an unsigned package into a production fuse would defeat signed-admission entirely, so the
    // flag is REFUSED (not silently ignored) under GALERINA_PROFILE=production; dev/unset still honours it.
    // (Previously the posture-derived requireSignature override was dead code — an unsigned package was
    // admitted even under the production profile.)
    if (allowUnsigned) {
      const { resolveSigningProfileWarned } = await import("./governance/profile.mjs");
      if (resolveSigningProfileWarned().profile === "production") {
        console.error("❌ FUNGI-FUSE-UNSIGNED-DENIED: --allow-unsigned is refused under GALERINA_PROFILE=production (fail-secure) — a production fuse requires every package to carry a valid signed .lmanifest. Remove --allow-unsigned, or build+sign the package first.");
        process.exit(1);
      }
    }
    const ak = await import(new URL("packages-galerina/galerina-framework-app-kernel/dist/index.js", import.meta.url).href);
    try {
      const opts = { allowUnsigned, warn: (msg) => console.warn(`  ⚠ ${msg}`) };
      if (governanceDir) opts.governanceDir = governanceDir;
      // AUDIT FIX (fail-closed revocation): the runtime fuse gate must refuse a validly-signed but
      // REVOKED key (the revoked key's public key is shipped in-repo). Inject a registry-backed check;
      // an untrustworthy/tampered revocation registry fails the whole fuse closed.
      try {
        const { isKeyRevoked, assertRegistryTrustworthy } = await import("./governance/revocation-registry.mjs");
        assertRegistryTrustworthy("."); // throws if the registry is unsigned-under-pin / signed by a revoked key
        opts.revocationCheck = (keyId) => isKeyRevoked(keyId, ".");
      } catch (e) {
        console.error(`❌ FUNGI-FUSE-REVOCATION-UNTRUSTED: ${e.message} — refusing to fuse (fail-closed)`);
        process.exit(1);
      }
      // #49 (H3/H4) — verify a HYBRID (Ed25519+ML-DSA-65) .lmanifest signature AT LOAD. The kernel stays
      // PQ-crypto-free; inject the compiler's production verifier (reuses makeManifestEnvelope +
      // verifyGovernanceSignatureHybrid, proofgraph context, base64url). Fail-closed / NO PQ downgrade —
      // a missing/malformed ML-DSA key for a v2 manifest is a hard deny. Classical Ed25519 manifests unaffected.
      try {
        const cc = await import(new URL("packages-galerina/galerina-core-compiler/dist/index.js", import.meta.url).href);
        opts.hybridVerifier = cc.makeLmanifestHybridVerifier();
      } catch (e) {
        console.error(`❌ FUNGI-FUSE-HYBRID-VERIFIER-UNAVAILABLE: ${e.message} — refusing to fuse (fail-closed)`);
        process.exit(1);
      }
      const components = await ak.fusePackages(dirs, opts);
      console.log(`✅ Fused ${components.size} package(s) (host-linked, first-party):`);
      for (const [name, c] of components) {
        console.log(`   - ${name}  seam=${c.seam ?? "—"}  capabilities=[${[...c.capabilities].join(", ")}]`);
      }
      if (invokeSpec) {
        const [pkg, exp] = invokeSpec.split(":");
        const comp = components.get(pkg);
        if (!comp) { console.error(`Error: no fused package named '${pkg}' (have: ${[...components.keys()].join(", ")})`); process.exit(1); }
        console.log(`   invoke ${pkg}:${exp} → ${comp.invoke(exp)}`);
      }
      process.exit(0);
    } catch (e) {
      console.error(`❌ ${e.message}`); // fail-closed FUNGI-FUSE-* codes
      process.exit(1);
    }
  }

  if (!fungiFile) { console.error("Error: no .fungi file specified"); process.exit(1); }

  const source = readUntrustedSource(fungiFile);
  if (source === null) process.exit(1); // fail-closed: oversized/unreadable .fungi rejected before parse
  const parsed = m.parseProgram(source, fungiFile, { requireVersionHeader: true });
  const errors = (parsed.diagnostics ?? []).filter(d => d.severity === "error");

  // ── galerina infer — run a governed AI inference from a flow's ai {} contract ──
  // The Governed Inference Tower seam: reads the flow's `ai {}` block (approved
  // models, governance tier, call budget), builds the Hybrid Inference Engine
  // (Brain) wired to the BitNet CPU bridge (Brawn) from galerina-ext-bridge-cpp,
  // runs one governed inference, prints the receipt and writes the audit ledger.
  if (command === "infer") {
    const flag = (name, def) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : def; };
    const flowName = flag("--invoke", parsed.flows[0]?.name);
    const prompt = flag("--prompt", "Summarise the input document under governance.");
    let model = flag("--model", undefined);

    // Extract the `ai {}` contract sub-block for the target flow from the AST.
    const extractAiBlock = (ast, targetFlow) => {
      const out = { approvedModels: undefined, governanceTier: undefined, maxModelCalls: undefined, maxTokenCost: undefined };
      const flow = (ast.children ?? []).find(c => /FlowDecl$/.test(c.kind ?? "") && c.value === targetFlow)
        ?? (ast.children ?? []).find(c => /FlowDecl$/.test(c.kind ?? ""));
      if (!flow) return out;
      const contract = (flow.children ?? []).find(c => c.kind === "contractDecl");
      if (!contract) return out;
      const aiBlock = (contract.children ?? []).find(c => c.value === "ai:block");
      if (!aiBlock) return out;
      for (const child of aiBlock.children ?? []) {
        const v = String(child.value ?? "");
        if (v === "approved_models:block") {
          const models = (child.children ?? [])
            .flatMap(d => String(d.value ?? "").replace(/^decl:/, "").split(/\s+/))
            .filter(Boolean);
          if (models.length) out.approvedModels = models;
        } else if (v.startsWith("decl:")) {
          const body = v.replace(/^decl:/, "").split(";;")[0].trim(); // drop trailing govComment
          const [key, ...vals] = body.split(/\s+/);
          if (key === "governance_tier") {
            const t = parseInt(String(vals[0] ?? "").replace(/[^0-9]/g, ""), 10);
            if (t >= 1 && t <= 3) out.governanceTier = t;
          } else if (key === "max_model_calls") {
            const n = parseInt(vals[0] ?? "", 10);
            if (Number.isFinite(n)) out.maxModelCalls = n;
          } else if (key === "max_token_cost") {
            out.maxTokenCost = vals.join("").replace(/\s+/g, "");
          }
        }
      }
      return out;
    };

    const ai = extractAiBlock(parsed.ast, flowName);
    if (!model && ai.approvedModels?.length) model = ai.approvedModels[0];
    const tier = ai.governanceTier ?? 1;

    // Brain (engine) + Brawn (cpp BitNet bridge registry).
    const tc = await import(new URL("packages-galerina/galerina-tower-citizen/dist/index.js", import.meta.url).href);
    let registry;
    try {
      const cpp = await import(new URL("packages-galerina/galerina-ext-bridge-cpp/dist/index.js", import.meta.url).href);
      registry = cpp.createCppBridgeRegistry();
    } catch { registry = undefined; } // fall back to the in-package stub registry

    const engine = tc.createHybridEngine({
      governanceTier: tier,
      airGapped: tier === 1,
      ...(registry ? { bridges: registry } : {}),
      governance: {
        ...(ai.approvedModels ? { approvedModels: ai.approvedModels } : {}),
        ...(ai.maxModelCalls !== undefined ? { maxModelCalls: ai.maxModelCalls } : {}),
      },
    });

    const correlationId = `INFER-${flowName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const receipt = await engine.infer({ prompt, correlationId, ...(model ? { model } : {}) });

    console.log(`\n  Governed Inference — ${flowName}  (${fungiFile})`);
    console.log("  ─────────────────────────────────────────────");
    console.log(`  governance_tier:   tier-${tier} ${tier === 1 ? "(air-gapped CPU · BitNet ternary)" : tier === 2 ? "(cloud)" : "(Blackwell GPU)"}`);
    console.log(`  approved_models:   ${ai.approvedModels ? ai.approvedModels.join(", ") : "(unrestricted)"}`);
    console.log(`  model invoked:     ${model ?? "(none specified)"}`);
    console.log(`  max_model_calls:   ${ai.maxModelCalls ?? "(unbounded)"}`);
    if (ai.maxTokenCost) console.log(`  max_token_cost:    ${ai.maxTokenCost}`);
    console.log("  ─────────────────────────────────────────────");
    if (receipt.trapFired) {
      console.log(`  ❌ TRAP: ${receipt.trapCode} — inference denied at the governance boundary (no compute ran)`);
    } else {
      console.log(`  ✅ ${receipt.text}`);
      console.log(`  engines blended:   ${receipt.enginesBlended.join(" + ")}`);
      console.log(`  bridges executed:  ${receipt.bridgesUsed.join(", ") || "(host-native only)"}`);
      console.log(`  executed natively: ${receipt.executedNatively} ${receipt.executedNatively ? "" : "(deterministic simulator — native addon not compiled)"}`);
      console.log(`  ternary checksum:  ${receipt.ternaryChecksum}  (bit-identical across CPU/GPU/photonic)`);
      console.log(`  avg bits/weight:   ${receipt.avgBitsPerWeight}`);
      console.log(`  latency:           ${receipt.latencyMs}ms`);
    }

    // Append-only audit ledger (one JSONL per inference, like the tower-log journal).
    try {
      const events = engine.getAudit().query({ correlationId });
      mkdirSync("build/tower-logs", { recursive: true });
      const ledgerPath = `build/tower-logs/infer-${correlationId}.jsonl`;
      writeFileSync(ledgerPath, events.map(e => JSON.stringify(e)).join("\n") + "\n");
      console.log(`  audit ledger:      ${ledgerPath} (${events.length} events)\n`);
    } catch { /* non-fatal */ }

    process.exit(receipt.trapFired ? 1 : 0);
  }

  // ── galerina deps — graph the app's flow→flow call graph (R&D 0045 //@ vocabulary) ──────────────
  // Read-only. Prints, per flow, the generated //@USES (upstream callees) / //@USEDBY (downstream
  // "dependants") / //@IMPACT (transitive blast-radius; 0 = safe to delete) comment lines. Does NOT
  // modify source — the source-writer (inject the //@ lines into the file) is a later phase. Scope
  // to one flow with `--flow <name>`.
  if (command === "deps") {
    if (errors.length > 0) {
      errors.forEach(d => console.log(`❌ ${d.code}: ${d.message}`));
      process.exit(1);
    }
    const depMap = m.analyzeFlowDependencies(parsed.ast);
    const FK = new Set(["pureFlowDecl", "flowDecl", "secureFlowDecl", "guardedFlowDecl"]);
    const flowNodeByName = new Map();
    for (const child of parsed.ast.children ?? []) {
      if (FK.has(child.kind) && child.value) flowNodeByName.set(child.value, child);
    }
    const flagIdx = rest.indexOf("--flow");
    const only = flagIdx >= 0 ? rest[flagIdx + 1] : undefined;
    if (only !== undefined && !depMap.has(only)) {
      console.error(`Error: no flow named '${only}' in ${fungiFile}`);
      process.exit(1);
    }
    const names = only !== undefined ? [only] : [...depMap.keys()];

    // Build the generated //fungi: lines per flow (USES/USEDBY/IMPACT + COMPLEXITY).
    const genLines = new Map();
    for (const name of names) {
      const d = depMap.get(name);
      if (d === undefined) continue;
      const lines = [...m.renderDependencyComments(d)];
      const node = flowNodeByName.get(name);
      if (node !== undefined) lines.push(...m.renderComplexityComment(node));
      genLines.set(name, lines);
    }

    // ── --write: silently overwrite the //fungi: block above each flow IN THE SOURCE (R&D 0045 #3) ──
    // Touches ONLY //fungi: lines — removes the old contiguous //fungi: block immediately above each flow
    // declaration and inserts the fresh block; never modifies a human // line, a contract, or any code.
    // Processes bottom-up so line indices stay valid. Fail-closed: parse errors already exited above.
    if (rest.includes("--write")) {
      const out = m.rewriteGeneratedComments(source, genLines);
      if (out !== source) {
        writeFileSync(fungiFile, out);
        console.log(`✅ ${fungiFile}: refreshed //fungi: metadata on ${genLines.size} flow(s)`);
      } else {
        console.log(`✓ ${fungiFile}: //fungi: metadata already current (${genLines.size} flow(s))`);
      }
      process.exit(0);
    }

    if (names.length === 0) console.log(`(${fungiFile}: no flows)`);
    for (const name of names) {
      const lines = genLines.get(name);
      if (lines === undefined) continue;
      console.log(`flow ${name}`);
      for (const line of lines) console.log(`  ${line}`);
    }
    process.exit(0);
  }

  if (command === "check") {
    const fx = m.checkEffects(parsed.flows, parsed.ast);
    const gov = m.verifyGovernance(parsed.ast, parsed.flows, fx, "production");
    // Surface the dev/check-mode tier-floor + boundary-input WARNINGS (FUNGI-TIER-001 / FUNGI-VALUESTATE-008)
    // so a tester sees the obligation here, before a production build escalates the SAME finding to a
    // fail-closed error. The floor scan always runs; only its severity is gated on the production profile,
    // so in `check` these arrive as warnings — display-only, they do not fail the check.
    const tierWarnings = fx.flatMap(r => (r.diagnostics ?? []).filter(d => d.code === "FUNGI-TIER-001"));
    // P2 (threat-model): FUNGI-EFFECT-003 (an effectful op in a PURE flow — a zero-trust boundary breach)
    // and FUNGI-STDLIB-002 (deny-by-default unrecognized effectful method) are integrity invariants the
    // PRODUCTION build already rejects. `check` (all modes) surfaced NEITHER — it took only FUNGI-TIER-001
    // from `fx` and the exit predicate ignored fx entirely — so a pure-flow effect breach or a
    // deny-by-default escape printed "0 errors" EXIT=0. Surface them and FAIL CLOSED in ALL modes.
    // (Deliberately narrow: the broader undeclared-effect class EFFECT-001/STDLIB-001 stays dev-advisory.)
    // FUNGI-EFFECT-006 (deny-only effect, 2026-07-02) joins the always-fail-closed set:
    // a deny-only name is never grantable at ANY profile, so even dev/check refuse.
    const INTEGRITY_EFFECT_CODES = new Set(["FUNGI-EFFECT-003", "FUNGI-STDLIB-002", "FUNGI-EFFECT-006"]);
    const integrityEffectErrors = fx.flatMap(r => (r.diagnostics ?? []).filter(
      d => d.severity === "error" && INTEGRITY_EFFECT_CODES.has(d.code)));
    // Run the value-state checker ONCE and surface ALL of its ERROR-severity diagnostics, not just the
    // migration-grade FUNGI-VALUESTATE-008 boundary warning. The old code filtered to VALUESTATE-008 ALONE,
    // so a fail-closed value-state ERROR — e.g. FUNGI-NUMERIC-001 for a still-gated 64-bit width (UInt64)
    // the WASM backend would silently truncate — was discarded and `check` printed "0 errors" on a file the
    // production build rejects (the verified hole). These errors are UNCONDITIONAL (not mode-gated), so they
    // also drive the exit code below; VALUESTATE-008 stays a dev/check WARNING and remains display-only.
    const vsDiags = m.checkValueStates(parsed.ast).diagnostics ?? [];
    const valueStateErrors = vsDiags.filter(d => d.severity === "error");
    const boundaryWarnings = vsDiags.filter(d => d.code === "FUNGI-VALUESTATE-008" && d.severity !== "error");
    // Finding-(ii) closure (2026-07-10): `check` never ran the TYPE-CHECKER, so a file could be
    // check-clean yet REJECTED fail-closed at `run --governed` on FUNGI-TYPE-* (runtime.fungi was
    // the repro). Surface type ERRORS here in every mode so the divergence is visible at check
    // time. Exit behavior follows the house staged-enforcement pattern (lint-conventions --soft
    // precedent): an unconditional flip would red ~150 repo files including the DELIBERATE
    // negative examples under docs/examples, so hard-fail is opt-in via --strict-types while the
    // baseline burns down. The self-hosted corpus is 8/8 type-clean and must stay so.
    const strictTypes = rest.includes("--strict-types");
    const typeErrors = (m.checkTypes(parsed.ast).diagnostics ?? []).filter(d => d.severity === "error");
    // Advisory in plain check: type errors must NOT suppress the ✅ clean line — they are a separate
    // NOTE below it. Otherwise every one of the ~150 baseline files with an unmigrated type error (or a
    // checkTypeRef false positive) loses its ✅, and the canonical clean example verifyPassword.fungi —
    // which trips two false positives on Brand<String,"tag"> + enum — reads as failing. Only
    // --strict-types folds them into the hard, ✅-suppressing, exit-failing set.
    const allDiags = [...errors, ...gov.diagnostics, ...tierWarnings, ...valueStateErrors, ...boundaryWarnings, ...integrityEffectErrors, ...(strictTypes ? typeErrors : [])];
    if (allDiags.length === 0) {
      // We're building the language — distinguish "compiled real content" from "found nothing". A clean
      // parse with ZERO top-level declarations (an empty or comment-only file) must NOT report a blanket
      // ✅, which reads as a successful compile when nothing was actually compiled. `parsed.ast.children`
      // is the list of top-level decls (secureFlowDecl / policyDecl / typeDecl / …) — empty ⇒ no content.
      const declCount = (parsed.ast?.children ?? []).length;
      const flowCount = parsed.flows?.length ?? 0;
      if (declCount === 0) {
        console.log(`ℹ️  ${fungiFile}: parsed OK, but found NO flows or declarations — nothing to compile (an empty or comment-only file?).`);
      } else {
        console.log(`✅ ${fungiFile}: 0 errors, 0 governance warnings (${flowCount} flow(s), ${declCount} top-level declaration(s))`);
      }
    } else {
      allDiags.forEach(d => console.log(`${d.severity === "error" ? "❌" : "⚠️"} ${d.code}: ${d.message}`));
    }
    // Advisory type-error NOTE — printed AFTER the ✅/diagnostics in plain mode (a COUNT, not the full
    // list, to keep clean output readable) so the check↔governed divergence stays visible without
    // suppressing ✅. --strict-types instead surfaces each as ❌ above and exits non-zero.
    if (!strictTypes && typeErrors.length > 0) {
      console.log(`ℹ️  +${typeErrors.length} FUNGI-TYPE-* advisory (not counted in plain check; they FAIL a governed run — run 'galerina check ${fungiFile} --strict-types' to see + enforce).`);
    }

    // ── --diff flag: show change class vs HEAD~1 before pushing (#64) ─────────
    // Lets developers see governance impact before git push. Equivalent to running
    // `galerina diff HEAD~1` but scoped to a single file.
    if (rest.includes("--diff")) {
      try {
        const { spawnSync } = await import("node:child_process");
        const { diffGovernance, renderGovernanceDiff } = await import(
          new URL("packages-galerina/galerina-core-compiler/dist/governance-diff.js", import.meta.url).href
        );
        // Get the HEAD~1 version of this file from git
        const gitResult = spawnSync("git", ["show", `HEAD~1:${fungiFile}`],
          { encoding: "utf8", cwd: process.cwd() });
        if (gitResult.status === 0) {
          const prevSource = gitResult.stdout;
          const prevParsed = m.parseProgram(prevSource, fungiFile);
          const diff = diffGovernance(prevParsed.flows, parsed.flows);
          console.log("\n── Governance diff (HEAD~1 → current) ──");
          console.log(renderGovernanceDiff(diff));
          if (diff.changeClass === "expansion") {
            console.log("⚠️  EXPANSION — 2 reviewers required (security/governance owner)");
          } else if (diff.changeClass === "experimental") {
            console.log("🔴 EXPERIMENTAL — architecture review required");
          } else {
            console.log(`✅ Change class: ${diff.changeClass.toUpperCase()}`);
          }
        } else {
          console.log("\n── Governance diff: no HEAD~1 version found (new file)");
        }
      } catch { /* non-fatal */ }
    }

    // Exit non-zero on parse errors OR fail-closed value-state errors (e.g. FUNGI-NUMERIC-001 for a
    // still-gated width) — these are unconditional correctness failures the build/run path also rejects.
    // Tier/boundary findings stay display-only WARNINGS in check mode and do NOT affect the exit code.
    process.exit(errors.length > 0 || valueStateErrors.length > 0 || integrityEffectErrors.length > 0
      || (strictTypes && typeErrors.length > 0) ? 1 : 0);
  }

  // ── galerina generate tests <file.fungi> [--tap] — contract-driven test obligations (0016) ──
  // Derives the fail-closed test obligations a flow's contract implies, across all five
  // generator dimensions (fault-injection / effect-egress / capability-denial / boundary /
  // substrate-violation), from the flow GIR. --tap prints a TAP plan for the fault dimension.
  // (The internal "generate tests" token is set by the argv normalization at the top of main().)
  if (command === "generate tests") {
    const fx = m.checkEffects(parsed.flows, parsed.ast);
    const gir = m.emitGIR(parsed.ast, parsed.flows, fx).gir;
    const suite = m.generateContractTestSuite(gir.flows);
    const dims = [
      ["fault-injection",     suite.faultInjection],
      ["effect-egress",       suite.effectEgress],
      ["capability-denial",   suite.capabilityDenial],
      ["boundary/fuzz",       suite.boundary],
      ["substrate-violation", suite.substrateViolation],
    ];
    const total = dims.reduce((n, [, c]) => n + c.length, 0);
    console.log(`\n🧪 Contract-driven test obligations — ${fungiFile}`);
    console.log(`   ${total} obligation(s) across ${gir.flows.length} flow(s) · 5 dimensions`);
    for (const [name, cases] of dims) {
      console.log(`\n── ${name} (${cases.length}) ──`);
      for (const c of cases) console.log(`  • ${c.id}\n      ${c.assertion}`);
    }
    if (rest.includes("--tap")) {
      console.log("\n" + m.renderFaultInjectionTAP(suite.faultInjection));
    }
    process.exit(0);
  }

  // ── galerina manifest-to-dot — export manifest DAG as Graphviz DOT ────────────
  if (command === "manifest-to-dot") {
    const name = basename(fungiFile, ".fungi");
    const manifestPath = `build/${name}.lmanifest`;
    if (!existsSync(manifestPath)) {
      console.error(`❌ No manifest at ${manifestPath}. Run 'galerina build ${fungiFile}' first.`);
      process.exit(1);
    }
    try {
      const { decodeCBOR } = await import(
        new URL("packages-galerina/galerina-core-compiler/dist/manifest-generator.js", import.meta.url).href
      );
      const manifestBytes = new Uint8Array(readFileSync(manifestPath));
      const { value: manifest } = decodeCBOR(manifestBytes);
      const EFFECT_BIT_NAMES = { 0:"network.outbound", 1:"storage.write", 2:"secret.access", 3:"audit.write", 4:"database.write", 5:"ai.inference", 6:"shell.execute", 7:"native.call" };
      const allowedMask = manifest.policyResolutionDag?.allowedEffects ?? 0;
      const deniedMask  = manifest.policyResolutionDag?.deniedEffects  ?? 0;
      let dot = `digraph "${name}_manifest" {\n`;
      dot += `  graph [label="${name}.lmanifest — PolicyResolutionDAG\\nallowed=${allowedMask.toString(2).padStart(8,"0")} denied=${deniedMask.toString(2).padStart(8,"0")}" fontsize=12 labelloc=t]\n`;
      dot += `  node [shape=box fontname="Courier" fontsize=10]\n  rankdir=LR\n\n`;
      // Capability nodes
      for (let bit = 0; bit <= 7; bit++) {
        const effName = EFFECT_BIT_NAMES[bit];
        const allowed = (allowedMask >> bit) & 1;
        const denied  = (deniedMask  >> bit) & 1;
        const color = denied ? "lightcoral" : allowed ? "lightgreen" : "lightgray";
        dot += `  cap_${bit} [label="${effName}\\nbit${bit}${allowed?" ✓":denied?" ✗":" —"}" style=filled fillcolor=${color}]\n`;
      }
      // Flow nodes
      dot += `\n`;
      for (const ob of manifest.proofObligations ?? []) {
        const fid = (ob.flowName ?? "f").replace(/[^a-zA-Z0-9_]/g, "_");
        const desc = ob.description ?? "";
        const em = desc.match(/effects \[([^\]]*)\]/);
        const effs = em ? em[1].split(",").map(e=>e.trim()).filter(Boolean) : [];
        const isNet = effs.some(e=>e.startsWith("network"));
        const isMut = effs.some(e=>e.includes(".write")||e.includes(".mutate"));
        const col = isNet?"lightcoral":isMut?"lightyellow":"lightblue";
        dot += `  f_${fid} [label="${ob.flowName}\\n${effs.length} effect(s)" style=filled fillcolor=${col}]\n`;
        for (const eff of effs) {
          for (let bit=0; bit<=7; bit++) {
            if (EFFECT_BIT_NAMES[bit]===eff || eff.startsWith((EFFECT_BIT_NAMES[bit]??"").split(".")[0])) {
              dot += `  f_${fid} -> cap_${bit} [color=gray]\n`;
            }
          }
        }
      }
      // Topology nodes
      dot += `\n  dag_valid [label="dag_edge_valid\\nbit 8\\n(Topology FIRST)" style=filled fillcolor=gold shape=diamond]\n`;
      dot += `  quarantine [label="quarantine_engaged\\nbit 30" style=filled fillcolor=orange]\n`;
      dot += `  emergency_node [label="emergency_mode\\nbit 31" style=filled fillcolor=red fontcolor=white]\n`;
      dot += `  dag_valid -> quarantine [style=dashed label="violation"]\n`;
      dot += `  quarantine -> emergency_node [style=dashed label="escalate"]\n`;
      dot += `}\n`;
      const dotPath = `build/${name}.dot`;
      writeFileSync(dotPath, dot);
      console.log(`✅ ${dotPath} written`);
      console.log(`\nRender: dot -Tsvg ${dotPath} > build/${name}.svg`);
      console.log(`Colours: 🔴 network | 🟡 mutation | 🔵 pure | 🟢 allowed cap | ⬜ inactive cap`);
    } catch (e) { console.error(`❌ DOT generation failed: ${e.message}`); process.exit(1); }
    return;
  }

  // ── galerina verify — DRCM Phase 3 admission gate (#37) ──────────────────────
  // Verifies the .lmanifest for a compiled .fungi file:
  //   1. Checks the manifest exists (build/<name>.lmanifest)
  //   2. Decodes the binary CBOR manifest
  //   3. Computes SHA-256 of the source and compares to manifest.sourceHash
  //   4. Verifies CBOR round-trip (canonical encoding)
  //
  // FUNGI-MANIFEST-TAMPER: sourceHash mismatch — binary may have been modified
  // FUNGI-MANIFEST-MISSING: no .lmanifest found for this source file
  // ── galerina budget ─────────────────────────────────────────────────────────
  // Shows the auto-computed assimilation_memory_budget for this machine.
  // Helps developers understand what boot.fungi `auto` will resolve to.
  if (command === "budget") {
    const totalMB = Math.round(totalmem() / (1024 * 1024));
    const freeMB  = Math.round(freemem()  / (1024 * 1024));
    const autoBudget = computeAutoAssimilationBudgetMB();

    console.log(`\n  🏰 Galerina Assimilation Memory Budget`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  Total RAM:          ${totalMB} MB`);
    console.log(`  Available RAM:      ${freeMB} MB`);
    console.log(`  Auto budget (20%):  ${Math.round(freeMB * 0.20)} MB (before ceiling)`);
    console.log(`  Resolved budget:    ${autoBudget} MB  ← what 'auto' uses`);
    console.log();
    console.log(`  boot.fungi options:`);
    console.log(`    governance { assimilation_memory_budget: auto }        → ${autoBudget} MB`);
    console.log(`    governance { assimilation_memory_budget: auto max 50MB } → ${computeAutoAssimilationBudgetMB(50)} MB`);
    console.log(`    governance { }                                          → ${autoBudget} MB (omitted = auto)`);
    console.log(`    governance { assimilation_memory_budget: 100MB }       → 100 MB (explicit)`);
    console.log();
    console.log(`  Ceiling tiers: <4GB RAM → 50MB · 4–16GB → 128MB · >16GB → 256MB\n`);
    process.exit(0);
  }

  if (command === "verify") {
    const name = basename(fungiFile, ".fungi");
    const manifestPath = `build/${name}.lmanifest`;
    if (!existsSync(manifestPath)) {
      console.error(`❌ FUNGI-MANIFEST-MISSING: No manifest found at ${manifestPath}`);
      console.error(`   Run 'galerina build ${fungiFile}' first to generate the manifest.`);
      process.exit(1);
    }
    try {
      const { decodeCBOR, encodeCBOR } = await import(
        new URL("packages-galerina/galerina-core-compiler/dist/manifest-generator.js", import.meta.url).href
      );
      const manifestBytes = new Uint8Array(readFileSync(manifestPath));
      const { value: manifest } = decodeCBOR(manifestBytes);

      // Check 1: sourceHash
      const actualHash = "sha256:" + createHash("sha256").update(source, "utf8").digest("hex");
      if (manifest.sourceHash !== actualHash) {
        console.error(`❌ FUNGI-MANIFEST-TAMPER: Source hash mismatch for '${fungiFile}'`);
        console.error(`   Manifest has: ${manifest.sourceHash}`);
        console.error(`   Current file: ${actualHash}`);
        console.error(`   The source has been modified since the manifest was generated.`);
        console.error(`   Rebuild with: galerina build ${fungiFile}`);
        process.exit(1);
      }

      // Check 2: CBOR round-trip canonicality
      const reEncoded = encodeCBOR(manifest);
      const canonical = manifestBytes.length === reEncoded.length &&
        manifestBytes.every((b, i) => b === reEncoded[i]);
      if (!canonical) {
        console.error(`❌ FUNGI-MANIFEST-NONCANONICAL: CBOR round-trip failed — manifest is non-canonical`);
        process.exit(1);
      }

      // Check 3: schema version — v1 = Ed25519-or-placeholder (default); v2 = a persisted hybrid signature (0102 / #34 (c)).
      if (manifest.schemaVersion !== "fungi.manifest.v1" && manifest.schemaVersion !== "fungi.manifest.v2") {
        console.error(`❌ FUNGI-MANIFEST-VERSION: Unknown schema version '${manifest.schemaVersion}'`);
        process.exit(1);
      }

      // ── CERTIFIED-CONSUME PQ FLOOR (consume-side mirror of the sign-side certified gate, galerina.mjs:1917-1932) ──
      // The SIGN side mandates a hybrid Ed25519+ML-DSA-65 manifest when GALERINA_MANIFEST_PROFILE=certified, but the
      // CONSUME side only gated on GALERINA_PROFILE=production (= "a signature is required"), so a v1 (Ed25519-only)
      // manifest was ACCEPTED here even under a PQ-required posture (one-directional gap). Resolve certified the SAME
      // fail-secure way as the signer: trim+lowercase; only UNSET/empty or an explicit off/dev token relaxes; ANYTHING
      // ELSE set fail-secures to certified (a typo can never silently drop the PQ mandate — Adv #3). This is keyed on
      // GALERINA_MANIFEST_PROFILE (NOT GALERINA_PROFILE — orthogonal axes; production!=certified, Adv #1/#5) and is
      // evaluated on the AUTHORITATIVE decoded-CBOR `manifest` BEFORE the signature dispatch below, so a v1 manifest
      // (and any placeholder/unsigned/missing-json variant) is refused before it can reach the classical pass path
      // (Adv #2). The acceptance predicate is a subset of what the signer writes (schemaVersion "fungi.manifest.v2" +
      // sigAlgorithm "fungi.gov.sig.v2" + a both-half "|" signature; galerina.mjs:2045-2052) and of the existing v2
      // detection (1357-1358), so a valid v2 manifest passes and flows into the untouched hybrid-verify path (Adv #4).
      // DEFAULT (non-certified) consume is byte-for-byte unchanged — the whole block is a no-op when certified is off.
      // This sits inside the outer manifest try (catch at ~1520 always exits 1), so an error here is fail-closed (Adv #5).
      {
        const _mpRawV = String(process.env.GALERINA_MANIFEST_PROFILE ?? "").trim().toLowerCase();
        const _mpOffV = new Set(["", "dev", "development", "test", "off", "none", "default"]);
        const certifiedConsume = !_mpOffV.has(_mpRawV);
        if (certifiedConsume && _mpRawV !== "certified") {
          console.warn(`   ⚠️  FUNGI-MANIFEST-PROFILE-UNRECOGNIZED: GALERINA_MANIFEST_PROFILE='${process.env.GALERINA_MANIFEST_PROFILE}' is not recognized — fail-securing to certified (post-quantum signature REQUIRED at verify). Set 'certified' or 'dev' explicitly.`);
        }
        if (certifiedConsume) {
          const _sigV = manifest.governanceSignature;
          const _isV2Hybrid = manifest.schemaVersion === "fungi.manifest.v2"
            && _sigV && typeof _sigV === "object"
            && _sigV.sigAlgorithm === "fungi.gov.sig.v2"
            && typeof _sigV.signature === "string" && _sigV.signature.includes("|");
          if (!_isV2Hybrid) {
            console.error("❌ FUNGI-MANIFEST-PQ-REQUIRED: GALERINA_MANIFEST_PROFILE=certified requires a v2 hybrid Ed25519+ML-DSA-65 manifest " +
              "(schemaVersion 'fungi.manifest.v2', sigAlgorithm 'fungi.gov.sig.v2', a both-half '|' signature), but this manifest is not v2 hybrid. " +
              "Refusing to accept a classical-only (v1) manifest under a post-quantum-required posture (fail-closed, no PQ downgrade). " +
              "Rebuild under certified: GALERINA_MANIFEST_PROFILE=certified galerina keygen --hybrid && galerina build.");
            process.exit(1);
          }
        }
      }

      const proofCount = manifest.proofObligations?.length ?? 0;
      const constraintCount = manifest.derivedConstraints?.length ?? 0;
      console.log(`✅ ${fungiFile}: manifest verified`);
      console.log(`   Source hash:         ${actualHash.slice(0, 30)}...`);
      console.log(`   CBOR size:           ${manifestBytes.length}B (canonical ✅)`);
      console.log(`   Schema version:      ${manifest.schemaVersion}`);
      console.log(`   Flow count:          ${manifest.flowCount}`);
      console.log(`   Proof obligations:   ${proofCount}`);
      console.log(`   Derived constraints: ${constraintCount}`);

      // ── Signature verification (#109) ────────────────────────────────────────
      // Stage A: Ed25519-SHA256 (Node.js native crypto)
      // Stage B: ML-DSA-65 (NIST FIPS 204) — upgrade once Node.js adds FIPS 204 support
      // Signature is stored in the .lmanifest.json (human-readable counterpart)
      // AUDIT (profile-gated signature-required policy): in production an unsigned / placeholder /
      // incomplete manifest must fail-closed; dev keeps the informational behaviour. Default (no
      // GALERINA_PROFILE) is dev, so existing usage is byte-unchanged. Mirrors #178 fail-closed-in-prod.
      // FAIL-SECURE profile resolution: a set-but-unrecognized value (e.g. a typo'd "prod") resolves to
      // production with a warning, so a malformed profile can never silently disable this gate.
      const { resolveSigningProfileWarned } = await import("./governance/profile.mjs");
      const requireSigned = resolveSigningProfileWarned().profile === "production";
      const jsonManifestPath = `build/${name}.lmanifest.json`;
      if (existsSync(jsonManifestPath)) {
        try {
          const jsonManifestRaw = readFileSync(jsonManifestPath, "utf-8");
          const jsonManifest = JSON.parse(jsonManifestRaw);

          if (jsonManifest.governanceSignature && typeof jsonManifest.governanceSignature === "object") {
            const sig = jsonManifest.governanceSignature;

            // ── 0102 / #34: HYBRID (v2) manifest signature branch — dispatch on the signature's OWN fields ──
            // A v2 sig is self-describing: sigAlgorithm "fungi.gov.sig.v2" OR algorithm "Ed25519+ML-DSA-65" OR a
            // pipe in the signature (base64url never contains '|', so a classical Ed25519 sig can't trip it).
            // Checked FIRST; the classical branch below becomes `else if`, so a v2 sig is NEVER decoded by the
            // single-key Buffer.from(sig.signature,'base64') path (which would silently truncate at the '|' —
            // Adv-1 #2). This mirrors the shipped verifyGovernanceSignature v2-refusal at proof-graph.ts:763.
            const isHybridSig = sig.sigAlgorithm === "fungi.gov.sig.v2" || sig.algorithm === "Ed25519+ML-DSA-65"
              || (typeof sig.signature === "string" && sig.signature.includes("|"));
            if (isHybridSig) {
              if (!sig.keyId || !sig.signature || !sig.bodyHash || sig.sigAlgorithm !== "fungi.gov.sig.v2" || !sig.signature.includes("|")) {
                console.error(`❌ FUNGI-MANIFEST-PQ-REQUIRED: incomplete/inconsistent or non-both-half hybrid (v2) signature — fail-closed (no PQ downgrade).`);
                process.exit(1);
              }
              try {
                // Revocation pre-check (same registry gate as the classical path).
                const reg = await import("./governance/revocation-registry.mjs");
                const trust = reg.assertRegistryTrustworthy(".");
                if (trust.present && !trust.signed) {
                  console.warn(`   ⚠️  FUNGI-REVOCATION-UNSIGNED: governance/revocations.json is not signed (tamperable) — run: node governance/sign-revocations.mjs`);
                }
                if (reg.isKeyRevoked(sig.keyId)) {
                  console.error(`❌ FUNGI-MANIFEST-REVOKED-KEY: manifest signed by REVOKED key ${sig.keyId} — fail-closed (Deny).`);
                  process.exit(1);
                }
                const edPubPath = join("governance", `signing-key-${sig.keyId}.pub.pem`);
                const mlPubPath = join("governance", `signing-key-${sig.keyId}.mldsa.pub.b64`);
                if (!existsSync(edPubPath) || !existsSync(mlPubPath)) {
                  console.error(`❌ FUNGI-MANIFEST-PUBKEY-MISSING: hybrid public key(s) missing for keyId ${sig.keyId} (${edPubPath} / ${mlPubPath}) — fail-closed (cannot verify both halves).`);
                  process.exit(1);
                }
                const { createPublicKey } = await import("node:crypto");
                const { manifestSigningInput, manifestSigCanon } = await import(
                  new URL("packages-galerina/galerina-core-compiler/dist/manifest-generator.js", import.meta.url).href
                );
                const cc = await import(new URL("packages-galerina/galerina-core-compiler/dist/index.js", import.meta.url).href);
                // RE-DERIVE bodyHash from the actual body over the SIGNER's canon — NEVER trust sig.bodyHash as
                // the signed input (Adv-1 #8). The recomputed hash is what goes into the reconstructed
                // envelope, so the signature only validates if it matches what was signed.
                const { governanceSignature: _sigH, ...manifestWithoutSig } = jsonManifest;
                const bodyHash = createHash("sha256").update(Buffer.from(manifestSigningInput(manifestWithoutSig, manifestSigCanon(sig)))).digest("hex");
                // Defence-in-depth: the explicit bodyHash field must match the recomputed body.
                if (sig.bodyHash !== `sha256:${bodyHash}`) {
                  console.error(`❌ FUNGI-MANIFEST-TAMPER: v2 manifest bodyHash mismatch (declared ${sig.bodyHash} vs computed sha256:${bodyHash}) — fail-closed.`);
                  process.exit(1);
                }
                // Reconstruct the EXACT envelope the signer bound via the SAME shared helper (no drift).
                // generatedAt & evidence are excluded from the signed payload, so any value verifies;
                // jsonManifest.generatedAt is used for fidelity.
                const envelope = cc.makeManifestEnvelope(bodyHash, jsonManifest.generatedAt);
                // Attach the persisted v2 signature in the ProofGraph-layer shape (algorithm + signature are the
                // only fields verifyGovernanceSignatureHybrid reads; proof-graph.ts:786-789).
                envelope.governanceSignature = { algorithm: "fungi.gov.sig.v2", signerKeyId: sig.keyId, signature: sig.signature, signedAt: sig.signedAt };
                // Published Ed25519 pubkey is PEM → DER SPKI (verifier expects DER, proof-graph.ts:797);
                // ML-DSA pubkey is base64 of raw bytes.
                const edPubDer = new Uint8Array(createPublicKey(readFileSync(edPubPath, "utf-8")).export({ type: "spki", format: "der" }));
                const mlPubRaw = new Uint8Array(Buffer.from(readFileSync(mlPubPath, "utf-8").trim(), "base64"));
                const valid = await cc.verifyGovernanceSignatureHybrid(envelope, edPubDer, mlPubRaw);
                if (valid) {
                  console.log(`   🔐🛡️  Hybrid signature verified (Ed25519+ML-DSA-65, keyId: ${sig.keyId.slice(0, 8)}...) — both halves`);
                } else {
                  console.error(`❌ FUNGI-MANIFEST-TAMPER: hybrid signature verification FAILED (both halves required) — manifest may be tampered or PQ-downgraded.`);
                  process.exit(1);
                }
              } catch (err) {
                console.error(`❌ FUNGI-MANIFEST-TAMPER: hybrid signature verification could not be completed — fail-closed: ${err.message}`);
                process.exit(1);
              }
            } else if (sig.algorithm && sig.keyId && sig.signature) {
              // ── Key revocation pre-check (Gap B, zero-trust v(k) mandate) ──
              // A revoked key id is Deny even with a valid signature. The registry
              // is tamper-evident: fail closed if it is signed-but-invalid (edited
              // without re-signing) or unreadable; warn (but still enforce) while
              // it is unsigned.
              try {
                const reg = await import("./governance/revocation-registry.mjs");
                const trust = reg.assertRegistryTrustworthy("."); // throws on tamper / revoked signer
                if (trust.present && !trust.signed) {
                  console.warn(`   ⚠️  FUNGI-REVOCATION-UNSIGNED: governance/revocations.json is not signed (tamperable) — run: node governance/sign-revocations.mjs`);
                }
                if (reg.isKeyRevoked(sig.keyId)) {
                  console.error(`❌ FUNGI-MANIFEST-REVOKED-KEY: manifest signed by REVOKED key ${sig.keyId} — fail-closed (Deny). See security/revocations/REV-2026-06.md`);
                  process.exit(1);
                }
              } catch (revErr) {
                console.error(`❌ FUNGI-REVOCATION-REGISTRY: revocation registry untrustworthy — fail-closed (cannot confirm key is not revoked): ${revErr.message}`);
                process.exit(1);
              }
              // Look for the public key file
              const pubKeyPath = join("governance", `signing-key-${sig.keyId}.pub.pem`);
              if (existsSync(pubKeyPath)) {
                try {
                  const { verify: cryptoVerify, createPublicKey } = await import("node:crypto");
                  const { manifestSigningInput, manifestSigCanon } = await import(
                    new URL("packages-galerina/galerina-core-compiler/dist/manifest-generator.js", import.meta.url).href
                  );
                  const pubKeyPem = readFileSync(pubKeyPath, "utf-8");
                  const publicKey = createPublicKey(pubKeyPem);

                  // Reconstruct the EXACT signed bytes by stripping the signature and re-canonicalizing
                  // in the format named by the signature (`canon`: RFC 8785 JCS for new sigs, pretty-JSON
                  // "legacy" for older ones). One shared helper keeps signer + verifier from drifting.
                  const { governanceSignature: _sig, ...manifestWithoutSig } = jsonManifest;
                  const manifestForVerification = manifestSigningInput(manifestWithoutSig, manifestSigCanon(sig));

                  // Ed25519 uses deterministic signing — pass null as algorithm (per RFC 8032)
                  const valid = cryptoVerify(null, Buffer.from(manifestForVerification), publicKey, Buffer.from(sig.signature, "base64"));

                  if (valid) {
                    console.log(`   🔐 Signature verified (${sig.algorithm}, keyId: ${sig.keyId.slice(0, 8)}...)`);
                  } else {
                    console.error(`❌ FUNGI-MANIFEST-TAMPER: Signature verification FAILED — manifest may be tampered`);
                    process.exit(1);
                  }
                } catch (err) {
                  // AUDIT FIX (fail-closed): a manifest that CLAIMS a signature but whose verification
                  // cannot be COMPLETED (malformed key/sig, crypto error) must DENY — not warn-and-pass.
                  // Treating present-but-unverifiable as fine is the canonical fail-open. (The genuinely
                  // unsigned/dev case is handled by the `=== "placeholder"` branch below, unaffected.)
                  console.error(`❌ FUNGI-MANIFEST-TAMPER: signature verification could not be completed — fail-closed: ${err.message}`);
                  process.exit(1);
                }
              } else {
                // AUDIT FIX (fail-closed): the manifest asserts a signature but its public key is absent,
                // so integrity cannot be verified — DENY rather than skip.
                console.error(`❌ FUNGI-MANIFEST-PUBKEY-MISSING: public key ${pubKeyPath} not found but manifest asserts a signature — fail-closed (cannot verify integrity)`);
                process.exit(1);
              }
            } else {
              // Signature object present but INCOMPLETE (missing algorithm/keyId/signature) — can't even
              // attempt verification. Treat as unsigned: fail-closed under production, warn in dev.
              if (requireSigned) {
                console.error(`❌ FUNGI-MANIFEST-UNSIGNED: signature object is incomplete (missing algorithm/keyId/signature) but GALERINA_PROFILE=production requires a valid signature — fail-closed.`);
                process.exit(1);
              }
              console.warn(`   ⚠️  Manifest signature object is incomplete — treated as unsigned.`);
            }
          } else if (jsonManifest.governanceSignature === "placeholder") {
            // An unsigned (placeholder) manifest is fine for dev; under GALERINA_PROFILE=production a
            // signature is REQUIRED — fail-closed (mirrors #178 fail-closed-in-prod).
            if (requireSigned) {
              console.error(`❌ FUNGI-MANIFEST-UNSIGNED: manifest is unsigned (placeholder) but GALERINA_PROFILE=production requires a signature — fail-closed. Run: galerina keygen && galerina build`);
              process.exit(1);
            }
            console.log(`   ℹ️  Manifest is unsigned (placeholder). Run: galerina keygen && galerina build`);
          } else {
            // No signature field at all, or an unexpected scalar — treat as unsigned.
            if (requireSigned) {
              console.error(`❌ FUNGI-MANIFEST-UNSIGNED: manifest carries no signature but GALERINA_PROFILE=production requires one — fail-closed.`);
              process.exit(1);
            }
            console.log(`   ℹ️  Manifest has no signature field — treated as unsigned.`);
          }
        } catch (err) {
          // In production a signature MUST be confirmable; an unreadable signature copy means it cannot
          // be — fail-closed rather than warn-and-pass.
          if (requireSigned) {
            console.error(`❌ FUNGI-MANIFEST-INVALID: could not read ${jsonManifestPath} for the required signature check under GALERINA_PROFILE=production — fail-closed: ${err.message}`);
            process.exit(1);
          }
          console.warn(`   ⚠️  Could not read .lmanifest.json for signature check: ${err.message}`);
        }
      } else {
        // No signed-manifest copy at all. Dev = skip; production = deny (signature required).
        if (requireSigned) {
          console.error(`❌ FUNGI-MANIFEST-UNSIGNED: no ${jsonManifestPath} present but GALERINA_PROFILE=production requires a signed manifest — fail-closed.`);
          process.exit(1);
        }
        console.log(`   ℹ️  No .lmanifest.json found — signature check skipped`);
      }
    } catch (e) {
      console.error(`❌ FUNGI-MANIFEST-INVALID: Failed to parse manifest — ${e.message}`);
      process.exit(1);
    }
    return;
  }

  if (errors.length > 0) {
    errors.forEach(e => console.error(`❌ ${e.code}: ${e.message}`));
    process.exit(1);
  }

  // ── Admission gate check for run command ─────────────────────────────────
  // Before executing, verify the source matches its manifest (if one exists).
  // This is the Stage A equivalent of the DSS.wasm admission check in Phase 5.
  if (command === "run") {
    const name = basename(fungiFile, ".fungi");
    const manifestPath = `build/${name}.lmanifest`;
    if (existsSync(manifestPath)) {
      let manifest;
      try {
        const { decodeCBOR } = await import(
          new URL("packages-galerina/galerina-core-compiler/dist/manifest-generator.js", import.meta.url).href
        );
        const manifestBytes = new Uint8Array(readFileSync(manifestPath));
        manifest = decodeCBOR(manifestBytes).value;
        const actualHash = "sha256:" + createHash("sha256").update(source, "utf8").digest("hex");
        if (manifest.sourceHash && manifest.sourceHash !== actualHash) {
          console.error(`❌ FUNGI-MANIFEST-TAMPER: Source has changed since manifest was signed.`);
          console.error(`   Manifest: ${manifest.sourceHash}`);
          console.error(`   Current:  ${actualHash}`);
          console.error(`   Rebuild with: galerina build ${fungiFile}`);
          process.exit(1);
        }
      } catch (e) {
        // AUDIT FIX (fail-closed): a manifest that EXISTS but cannot be read/decoded is suspicious
        // (possible tamper of the authoritative CBOR) — DENY rather than silently proceed. An ABSENT
        // manifest is the dev "run the source directly" case, already handled by the existsSync guard.
        console.error(`❌ FUNGI-MANIFEST-INVALID: admission manifest ${manifestPath} is present but could not be read/decoded — fail-closed: ${e.message}`);
        process.exit(1);
      }

      // ── CERTIFIED-CONSUME PQ FLOOR at run-admission (consume-side mirror of the sign-side certified gate) ──
      // Independent of GALERINA_PROFILE (Adv #5): the production-gated block below only fires under
      // GALERINA_PROFILE=production, so a present v1 (Ed25519-only) manifest was admitted to RUN even under a
      // PQ-required posture. Resolve certified the SAME fail-secure way as the signer (trim+lowercase; only
      // unset/empty or an explicit off/dev token relaxes; anything else set fail-secures to certified — Adv #3),
      // keyed on GALERINA_MANIFEST_PROFILE not GALERINA_PROFILE (Adv #1). Evaluated on the authoritative decoded-CBOR
      // `manifest` BEFORE the classical run path (Adv #2): when certified, the present manifest MUST be v2 hybrid
      // (subset of the signer/run-detect predicate, so a valid v2 still runs — Adv #4) or we refuse fail-closed.
      // Scoped INSIDE the existing existsSync(manifestPath) guard, so the no-manifest raw-run posture is untouched
      // (this only rejects a PRESENT v1 manifest); every violation process.exit(1)s — never warn-and-continue.
      // DEFAULT (non-certified) admission below is byte-for-byte unchanged (no-op when certifiedRun is false).
      {
        const _mpRawR = String(process.env.GALERINA_MANIFEST_PROFILE ?? "").trim().toLowerCase();
        const _mpOffR = new Set(["", "dev", "development", "test", "off", "none", "default"]);
        const certifiedRun = !_mpOffR.has(_mpRawR);
        if (certifiedRun && _mpRawR !== "certified") {
          console.warn(`   ⚠️  FUNGI-MANIFEST-PROFILE-UNRECOGNIZED: GALERINA_MANIFEST_PROFILE='${process.env.GALERINA_MANIFEST_PROFILE}' is not recognized — fail-securing to certified (post-quantum signature REQUIRED to run). Set 'certified' or 'dev' explicitly.`);
        }
        if (certifiedRun) {
          const _sigR = manifest && manifest.governanceSignature;
          const _isV2HybridR = manifest && manifest.schemaVersion === "fungi.manifest.v2"
            && _sigR && typeof _sigR === "object"
            && _sigR.sigAlgorithm === "fungi.gov.sig.v2"
            && typeof _sigR.signature === "string" && _sigR.signature.includes("|");
          if (!_isV2HybridR) {
            console.error("❌ FUNGI-MANIFEST-PQ-REQUIRED: GALERINA_MANIFEST_PROFILE=certified requires a v2 hybrid Ed25519+ML-DSA-65 manifest " +
              "(schemaVersion 'fungi.manifest.v2', sigAlgorithm 'fungi.gov.sig.v2', a both-half '|' signature), but this flow's manifest is not v2 hybrid. " +
              "Refusing to run a classical-only (v1) manifest under a post-quantum-required posture (fail-closed, no PQ downgrade). " +
              "Rebuild under certified: GALERINA_MANIFEST_PROFILE=certified galerina keygen --hybrid && galerina build.");
            process.exit(1);
          }
        }
      }

      // ── AUDIT: production-gated signature + revocation admission (verify-if-present) ───────────
      // The sourceHash check above is SELF-REFERENTIAL — an attacker who edits the source AND rewrites
      // the manifest's sourceHash passes it. Only the SIGNATURE binds the manifest to a trusted signer,
      // and only the revocation registry catches a stolen-but-revoked key. So in production, RUNNING a
      // flow whose present manifest is unsigned/placeholder, tamper-flagged, signed by a REVOKED key, or
      // missing its public key must fail-closed. Dev (the default profile) keeps today's sourceHash-only
      // behaviour byte-for-byte; this is additive and fires ONLY under GALERINA_PROFILE=production.
      // (Defence-in-depth, not sole enforcement — the run residual is bounded: the governed runtime
      // re-derives effects from the sourceHash-bound source and the WASM gate attests over the binary.)
      // Posture note: this is "verify-if-present" — a flow with NO manifest at all still raw-runs. The
      // stricter "production requires a signed manifest to run" is a deliberate posture left for owner opt-in.
      // Profile resolved FAIL-SECURE (a typo'd value resolves to production, never silently off).
      const { resolveSigningProfileWarned: resolveRunProfile } = await import("./governance/profile.mjs");
      if (resolveRunProfile().profile === "production") {
        try {
          // #67 — verify the AUTHORITATIVE CBOR directly (self-contained); the human-readable .json is
          // never consulted. This is possible because new builds sign over RFC 8785 canonical JSON, which
          // is representation-independent, so the signed bytes reconstruct identically from the decoded CBOR.
          const { manifestSigningInput, manifestSigCanon } = await import(
            new URL("packages-galerina/galerina-core-compiler/dist/manifest-generator.js", import.meta.url).href
          );
          const sig = manifest && manifest.governanceSignature;
          if (!sig || typeof sig !== "object" || !(sig.algorithm && sig.keyId && sig.signature)) {
            console.error(`❌ FUNGI-MANIFEST-UNSIGNED: the authoritative manifest is unsigned/placeholder but GALERINA_PROFILE=production requires a signature to run — fail-closed. Run: galerina keygen && galerina build ${fungiFile}`);
            process.exit(1);
          }
          // ── 0102 / #34: HYBRID (v2) admission branch — self-describing on the signature's own fields ──
          // A v2 sig MUST be verified with BOTH halves; it must NOT reach the classical legacy-format guard
          // (which would mis-reject the jcs v2 sig) NOR the single-key cryptoVerify below (Adv-1 #2 / Adv-2 #2).
          const runIsHybridSig = sig.sigAlgorithm === "fungi.gov.sig.v2" || sig.algorithm === "Ed25519+ML-DSA-65"
            || (typeof sig.signature === "string" && sig.signature.includes("|"));
          if (runIsHybridSig) {
            if (sig.sigAlgorithm !== "fungi.gov.sig.v2" || !sig.bodyHash || !sig.keyId || !String(sig.signature).includes("|")) {
              console.error(`❌ FUNGI-MANIFEST-PQ-REQUIRED: incomplete/inconsistent or non-both-half hybrid (v2) signature — refusing to run (fail-closed, no PQ downgrade).`);
              process.exit(1);
            }
            const reg = await import("./governance/revocation-registry.mjs");
            reg.assertRegistryTrustworthy(".");
            if (reg.isKeyRevoked(sig.keyId)) {
              console.error(`❌ FUNGI-MANIFEST-REVOKED-KEY: manifest signed by REVOKED key ${sig.keyId} — refusing to run (fail-closed, Deny).`);
              process.exit(1);
            }
            const edPubPath = join("governance", `signing-key-${sig.keyId}.pub.pem`);
            const mlPubPath = join("governance", `signing-key-${sig.keyId}.mldsa.pub.b64`);
            if (!existsSync(edPubPath) || !existsSync(mlPubPath)) {
              console.error(`❌ FUNGI-MANIFEST-PUBKEY-MISSING: hybrid public key(s) missing for keyId ${sig.keyId} — refusing to run (fail-closed, cannot verify both halves).`);
              process.exit(1);
            }
            const { createPublicKey } = await import("node:crypto");
            const cc = await import(new URL("packages-galerina/galerina-core-compiler/dist/index.js", import.meta.url).href);
            const { governanceSignature: _omitH, ...withoutSigH } = manifest;
            // RE-DERIVE bodyHash from the decoded CBOR body over sig's canon (jcs → representation-independent,
            // self-verifiable from CBOR per #67); never trust sig.bodyHash as the signed input.
            const runBodyHash = createHash("sha256").update(Buffer.from(manifestSigningInput(withoutSigH, manifestSigCanon(sig)))).digest("hex");
            if (sig.bodyHash !== `sha256:${runBodyHash}`) {
              console.error(`❌ FUNGI-MANIFEST-TAMPER: v2 manifest bodyHash mismatch — refusing to run (fail-closed).`);
              process.exit(1);
            }
            // Reconstruct the signed envelope via the SAME shared helper the signer/verify paths use.
            const envelope = cc.makeManifestEnvelope(runBodyHash, manifest.generatedAt);
            envelope.governanceSignature = { algorithm: "fungi.gov.sig.v2", signerKeyId: sig.keyId, signature: sig.signature, signedAt: sig.signedAt };
            const edPubDer = new Uint8Array(createPublicKey(readFileSync(edPubPath, "utf-8")).export({ type: "spki", format: "der" }));
            const mlPubRaw = new Uint8Array(Buffer.from(readFileSync(mlPubPath, "utf-8").trim(), "base64"));
            const sigOkHybrid = await cc.verifyGovernanceSignatureHybrid(envelope, edPubDer, mlPubRaw);
            if (!sigOkHybrid) {
              console.error(`❌ FUNGI-MANIFEST-TAMPER: hybrid manifest signature verification FAILED (both halves required) — refusing to run (fail-closed).`);
              process.exit(1);
            }
          } else {
          // A legacy (pretty-JSON) signature can't be self-verified from CBOR (key order is not preserved
          // through canonical CBOR) — push toward the current canonical signer rather than mis-report it as tampered.
          if (manifestSigCanon(sig) !== "jcs") {
            console.error(`❌ FUNGI-MANIFEST-LEGACY-FORMAT: the authoritative CBOR carries a legacy-format signature that cannot be self-verified — rebuild with the current canonical signer: galerina build ${fungiFile}`);
            process.exit(1);
          }
          // A revoked signer is Deny even with a cryptographically valid signature.
          const reg = await import("./governance/revocation-registry.mjs");
          reg.assertRegistryTrustworthy("."); // throws on a tampered / revoked-signer registry → caught below
          if (reg.isKeyRevoked(sig.keyId)) {
            console.error(`❌ FUNGI-MANIFEST-REVOKED-KEY: manifest signed by REVOKED key ${sig.keyId} — refusing to run (fail-closed, Deny).`);
            process.exit(1);
          }
          // Signature integrity over the manifest body (mirrors verify / #109).
          const pubKeyPath = join("governance", `signing-key-${sig.keyId}.pub.pem`);
          if (!existsSync(pubKeyPath)) {
            console.error(`❌ FUNGI-MANIFEST-PUBKEY-MISSING: public key ${pubKeyPath} not found but the manifest asserts a signature — fail-closed (cannot verify before running).`);
            process.exit(1);
          }
          const { verify: cryptoVerify, createPublicKey } = await import("node:crypto");
          const { governanceSignature: _omit, ...withoutSig } = manifest;
          const sigOk = cryptoVerify(null, Buffer.from(manifestSigningInput(withoutSig, manifestSigCanon(sig))), createPublicKey(readFileSync(pubKeyPath, "utf-8")), Buffer.from(sig.signature, "base64"));
          if (!sigOk) {
            console.error(`❌ FUNGI-MANIFEST-TAMPER: manifest signature verification FAILED — refusing to run (fail-closed).`);
            process.exit(1);
          }
          }
        } catch (e) {
          // Only genuine errors reach here (bad JSON / unreadable key / crypto error / untrustworthy
          // registry); the explicit process.exit(1) calls above terminate synchronously, they do not
          // throw. Any failure to COMPLETE the admission check is itself fail-closed.
          console.error(`❌ FUNGI-MANIFEST-INVALID: could not complete the required signature/revocation admission under GALERINA_PROFILE=production — fail-closed: ${e.message}`);
          process.exit(1);
        }
      }
    }

    // ── #125 secure-flow-run — run secure/effectful flows through the GOVERNED runtime ──
    // The raw WASM `--invoke` surface (below) only exports PURE flows returning a primitive.
    // Secure/effectful flows (effects, secrets, Result/Void returns) — and any flow the WASM
    // emitter can't yet lower — must run through the full governed pipeline: m.run() builds a
    // ContractEnforcer from the contract + a FAIL-CLOSED CapabilityHost granting ONLY the flow's
    // declared effects, then executes with audit + proof chain. `--governed` routes here and
    // returns BEFORE WASM assembly (which a secure flow may not compile through at all).
    if (rest.includes("--governed")) {
      const gflag = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
      const gflow = gflag("--invoke", parsed.flows[0]?.name);
      const gmeta = (parsed.flows ?? []).find(f => f.name === gflow);
      if (!gmeta) {
        console.error(`No flow named '${gflow}'. Declared: ${(parsed.flows ?? []).map(f => f.name).join(", ") || "(none)"}`);
        process.exit(1);
      }
      // Marshal positional args to the flow's NAMED params (param text is "readonly x: T" / "n: Int"
      // / "n" — take the identifier before ':', last token strips qualifiers). Fail loud on junk.
      const gparamNames = (gmeta.params ?? []).map(p => {
        const toks = String(p).split(":")[0].trim().split(/\s+/);
        return toks[toks.length - 1];
      });
      const invokeAt = rest.indexOf("--invoke");
      const gposArgs = (invokeAt >= 0 ? rest.slice(invokeAt + 2) : []).filter(a => a !== "--governed");
      const gargs = new Map();
      gposArgs.forEach((a, i) => {
        const name = gparamNames[i];
        if (name === undefined) return; // extra positional arg with no param — ignore (flow decides)
        let v;
        if (a === "true") v = { __tag: "bool", value: true };
        else if (a === "false") v = { __tag: "bool", value: false };
        else if (a.trim() !== "" && Number.isFinite(Number(a))) v = { __tag: "int", value: Number(a) };
        else v = { __tag: "string", value: a };
        gargs.set(name, v);
      });

      const gres = await m.run(source, fungiFile, gflow, gargs, { mode: "dev" });

      for (const d of gres.diagnostics ?? []) if (d.severity === "error") console.error(`  ✗ ${d.code}: ${d.message}`);
      for (const g of gres.governanceDiagnostics ?? []) if (g.severity === "error") console.error(`  ⛔ ${g.code}: ${g.message}`);

      if (!gres.ok) {
        console.error(`\n❌ Governed run of '${gflow}' FAILED (fail-closed) — see the FUNGI-* diagnostics above.`);
        process.exit(1);
      }

      const render = (val) => {
        if (!val) return "(void)";
        switch (val.__tag) {
          case "int": case "byte": case "float": return String(val.value);
          case "bool": return val.value ? "true" : "false";
          case "string": return JSON.stringify(val.value);
          case "void": return "(void)";
          case "runtimeError": case "error": return `<error: ${val.message ?? "runtime error"}>`;
          // Result::Err carries its payload under `.error`, NOT `.value` (interpreter.ts GalerinaValue:
          // `{ __tag: "err", error: GalerinaValue }`; the Err ctor is at interpreter.ts ~2290). Without an
          // explicit case an err value fell through to `default` below, where `val.value` is undefined so
          // the `?? val.__tag` fallback printed the bare tag "err" instead of the payload. Render it
          // recursively as `Err(<payload>)` to mirror the standalone raw-WASM formatRunOutput() display
          // (e.g. Err("not positive")). Display-only — the interpreter value is untouched.
          case "err": return `Err(${render(val.error)})`;
          default: return JSON.stringify(val.value ?? val.__tag);
        }
      };
      const gexec = gres.execution;
      const geffects = gexec?.audit?.effectsObserved ?? gexec?.effectsObserved ?? [];
      console.log(render(gres.value));
      console.log(`\n🛡  governed · flow=${gflow} · tier=${gexec?.executionTier ?? "tree"} · effects=[${geffects.join(", ")}]`);
      return;
    }
  }

  // Compile to WASM
  // ── Production-gated governance floor (mirror of
  //    packages-galerina/galerina-core-compiler/src/cli.ts:405-450) ───────────────────────────────────
  // The internal compiler bin (cli.ts) derives the effect-checker mode + FUNGI-TIER-001 tier-floor flag
  // from the build mode and SURFACES checkValueStates / checkEffects ERROR diagnostics so an
  // under-declared flow fails the build. The user-facing `galerina build` path did NEITHER: checkEffects
  // was 2-arg (enforceTierFloor defaulted false) and its `.diagnostics` were fed to emitGIR but never
  // inspected, so FUNGI-TIER-001 / FUNGI-VALUESTATE-008 / FUNGI-EFFECT-* errors never failed the build — only
  // codegen (assembled.valid) did. We gate strictness on the SAME fail-secure GALERINA_PROFILE resolver
  // the signing/admission gates already use (galerina.mjs:1815): UNSET/dev → enforcement OFF (zero-touch
  // local dev), exact "production" → ON, any set-but-unrecognized value fail-secures to ON. The
  // governed-run gate at ~1699-1705 is the surfacing/exit model mirrored below.
  const { resolveSigningProfileWarned: resolveBuildProfile } = await import("./governance/profile.mjs");
  const buildIsProduction = resolveBuildProfile().profile === "production";
  const govErrors = [];
  let fx;
  if (buildIsProduction) {
    // PRODUCTION ONLY: turn on the flow-kind tier floor (FUNGI-TIER-001) and escalate the boundary-input
    // check (FUNGI-VALUESTATE-008). mode is passed EXPLICITLY as the 3rd arg so enforceTierFloor lands in
    // the 4th position. checkEffects/emitGIR ignore `.diagnostics` for codegen (emitGIR reads only
    // observedEffects), so the floored fx produces byte-identical GIR — the floor only adds diagnostics.
    fx = m.checkEffects(parsed.flows, parsed.ast, "production", true);
    for (const result of fx) {
      for (const d of result.diagnostics ?? []) {
        if (d.severity === "error") govErrors.push(d);
      }
    }
  } else {
    // DEV / CHECK / UNSET: no tier floor, checkEffects diagnostics stay advisory (mode defaults to
    // "production", enforceTierFloor defaults to false) — `fx` is byte-identical to the pre-existing call.
    fx = m.checkEffects(parsed.flows, parsed.ast);
    // P2 (threat-model): EVEN in dev, two effect invariants fail closed — FUNGI-EFFECT-003 (effectful op in
    // a PURE flow, a boundary breach) and FUNGI-STDLIB-002 (deny-by-default unrecognized effectful method).
    // The production branch above already folds ALL error diagnostics; this keeps these two fail-closed at
    // every profile (the broader EFFECT-001/STDLIB-001 class stays dev-advisory, by design).
    // FUNGI-EFFECT-006 (deny-only effect, 2026-07-02) joins the always-fail-closed set:
    // a deny-only name is never grantable at ANY profile, so even dev/check refuse.
    const INTEGRITY_EFFECT_CODES = new Set(["FUNGI-EFFECT-003", "FUNGI-STDLIB-002", "FUNGI-EFFECT-006"]);
    for (const result of fx) {
      for (const d of result.diagnostics ?? []) {
        if (d.severity === "error" && INTEGRITY_EFFECT_CODES.has(d.code)) govErrors.push(d);
      }
    }
  }
  // UNCONDITIONAL value-state gate (mirror of cli.ts:416 + runtime.ts:116 — the internal compiler bin and
  // the governed runtime BOTH run checkValueStates on every build/run). The FUNGI-NUMERIC-001 numeric-
  // truncation gate is fail-closed and NOT mode-gated: a still-unlowerable 64-bit width (UInt64) the WASM
  // backend would silently truncate 64→32 (CWE-704) MUST reject the build REGARDLESS of profile. This scan
  // previously ran ONLY under GALERINA_PROFILE=production, so a default `build` of an unlowerable-width flow
  // silently emitted a truncating module (the verified hole). The MODE only governs whether the
  // migration-grade FUNGI-VALUESTATE-008 boundary warning ALSO escalates to a fail-closed error (production)
  // or stays a warning (dev). Int64 is no longer rejected here — the emitter now lowers it faithfully.
  const valueStateResult = m.checkValueStates(parsed.ast, buildIsProduction ? "production" : "development");
  for (const d of valueStateResult.diagnostics ?? []) {
    if (d.severity === "error") govErrors.push(d);
  }
  // RD-0234b Class A(iii): the bundled build path never ran symbol resolution, so a file
  // referencing an UNRESOLVED symbol (typo'd flow / missing helper) still minted a hybrid-signed
  // manifest. Mirror cli.ts and fail the BUILD closed on any unresolved-symbol (FUNGI-NAME-*) error.
  // Scoped to `build` ONLY: this shared compile section is also reached by `run --invoke` (which needs
  // the WASM), and name-resolution is a SIGNING concern — a `run` name issue surfaces at execution
  // anyway, and gating it here would pre-empt run's own "not in the WASM --invoke surface" guidance.
  if (command === "build") {
    try {
      for (const d of (m.resolveSymbols(parsed.ast).diagnostics ?? [])) {
        if (d.severity === "error") govErrors.push(d);
      }
    } catch { /* resolver unavailable → the full security gate below still applies (fail-closed) */ }
  }
  if (govErrors.length > 0) {
    for (const d of govErrors) {
      const loc = d.location?.line !== undefined ? ` (${fungiFile}:${d.location.line}:${d.location.column ?? 0})` : "";
      console.error(`  ⛔ ${d.code}: ${d.message}${loc}`);
    }
    const profileNote = buildIsProduction ? " under GALERINA_PROFILE=production" : "";
    console.error(`\n❌ Build of '${fungiFile}' FAILED (fail-closed${profileNote}) — ${govErrors.length} governance error(s) above. Declare the required tier/effects (or seal/gate boundary inputs) and rebuild.`);
    process.exit(1);
  }
  const { gir } = m.emitGIR(parsed.ast, parsed.flows, fx);
  const watModule = m.buildWATModuleFromGIR(gir, undefined, "wasm-standalone", parsed.ast, true);
  const wat = m.renderWAT(watModule);
  const assembled = await m.assembleWAT(wat);

  if (!assembled.valid) {
    console.error("Compilation failed:", assembled.diagnostics.map(d => d.message).join("; "));
    process.exit(1);
  }

  // ── C2 (threat-model) — never SIGN a non-faithful stub as if it were a faithful artifact ──────
  // The JS assembler returns a `valid:true` STUB carrying a "NOT a faithful compile" diagnostic when
  // wabt declines the WAT (wat-assembler.ts:240-247); a faithful compile returns diagnostics:[]. The
  // build path below hashes `assembled.wasm` INTO the SIGNED manifest, so signing a stub attests
  // fidelity over a silently-wrong binary (threat-model P1). Gate strictness on the SAME fail-secure
  // GALERINA_PROFILE resolver the rest of this function already uses: PRODUCTION fail-closes (refuse to
  // sign/ship a stub — the WASM emitter must faithfully lower the flow first); DEV warns loudly but
  // proceeds (the .wasm is for local inspection, a dev key is not a production trust anchor, and many
  // flows the emitter can't yet lower legitimately stub during local iteration).
  const faithfulCompile = assembled.diagnostics.length === 0;
  if (!faithfulCompile) {
    const stubReason = assembled.diagnostics.map(d => d.message).join("; ");
    if (buildIsProduction) {
      console.error(`  ⛔ FUNGI-EMIT-STUB: '${fungiFile}' did not lower to a FAITHFUL WASM module — the JS assembler produced a stub (${stubReason}).`);
      console.error(`\n❌ Build of '${fungiFile}' FAILED (fail-closed under GALERINA_PROFILE=production) — refusing to sign a non-faithful artifact: a signed stub would attest fidelity it does not have. The WASM emitter cannot yet faithfully lower this flow.`);
      process.exit(1);
    }
    console.warn(`  ⚠ FUNGI-EMIT-STUB: '${fungiFile}' lowered to a NON-FAITHFUL stub (${stubReason}). The .wasm is for local inspection only — it MUST NOT be shipped (a production build will fail closed here rather than sign it).`);
  }

  if (command === "build") {
    const name = packageBuild ? packageDescriptor.name : basename(fungiFile, ".fungi");
    const outDir = packageBuild ? join(packageBuild, "dist") : "build";
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/${name}.wasm`, assembled.wasm);
    writeFileSync(`${outDir}/${name}.wat`, wat);

    // ── SIGNING-BOUNDARY GATE — the ONE production security gate (RD-0234/0234b) ──
    // Formerly (CG-4, 2026-07-01) this re-ran ONLY value-state / effects / governance,
    // and ONLY on the lenient (dev) path — so the bundled signing CLI still minted
    // hybrid-signed .lmanifests for taint injection (GNG-01), runtime monkey-patching
    // (Class A), and the @name{} escape hatch (Class D) in EVERY profile, because it ran
    // NONE of those checks. It now runs m.runProductionSecurityGate — the SAME complete
    // set cli.ts runs — in EVERY profile. Any error withholds the .lmanifest credential
    // (loudly, never silently); a production build additionally fails closed. The
    // .wasm/.wat still emit for local inspection.
    let mintManifest = true;
    try {
      const gate = m.runProductionSecurityGate(parsed.ast, parsed.flows, source, fungiFile);
      const gateErrors = gate.filter((d) => d.severity === "error");
      if (gateErrors.length > 0) {
        mintManifest = false;
        for (const d of gateErrors) {
          const loc = d.line !== undefined ? ` (${fungiFile}:${d.line}:${d.column ?? 0})` : "";
          console.error(`  ⛔ ${d.code}: ${d.message}${loc}`);
        }
        if (buildIsProduction) {
          console.error(`\n❌ Build of '${name}' FAILED (fail-closed under GALERINA_PROFILE=production) — ${gateErrors.length} security/governance violation(s) above. A signed .lmanifest is an admission credential; it is not minted for a violating artifact.`);
          process.exit(1);
        }
      }
    } catch (gateErr) {
      mintManifest = false; // cannot prove clean → do not sign (fail-closed)
      console.warn(`   ⚠️  Security gate failed (${gateErr.message}) — refusing to mint a manifest it cannot vouch for.`);
      if (buildIsProduction) process.exit(1);
    }
    if (!mintManifest) {
      console.warn(`  ⛔ CG-4 signing boundary: NOT minting a .lmanifest for '${name}' — the artifact fails the production security gate. Run GALERINA_PROFILE=production galerina build to see the errors; an unminted manifest is inadmissible at fuse (FUNGI-FUSE-UNSIGNED, fail-closed).`);
    }

    // ── Class E (RD-0234b): reconcile the SIGNED fuse ACL against the flows' PROVEN effects ──
    // build --package embeds package.fungi.json "capabilities" into the SIGNED manifest verbatim, so a
    // package could self-declare a NARROW ACL while its flows perform MORE — a host granting on that ACL
    // would be deceived. Deny-by-default (owner 2026-07-02: "verify caps ⊇ proven effects"): every effect
    // the flows declare MUST be covered by a declared capability, else refuse to sign (fail-closed). Pure
    // packages (no effects) pass trivially; the seam grant (e.g. network.inbound) is a superset, not a lie.
    if (packageBuild && mintManifest) {
      const declaredCaps = new Set(packageDescriptor.capabilities ?? []);
      const provenEffects = new Set();
      for (const f of (parsed.flows ?? [])) for (const e of (f.declaredEffects ?? [])) provenEffects.add(e);
      const uncovered = [...provenEffects].filter((e) => !declaredCaps.has(e));
      if (uncovered.length > 0) {
        mintManifest = false;
        console.error(`  ⛔ FUNGI-FUSE-ACL-UNDERDECLARED: package '${packageDescriptor.name}' declares capabilities [${[...declaredCaps].join(", ")}] but its flows perform effect(s) NOT covered by the ACL: ${uncovered.join(", ")}. A signed fuse ACL must cover every effect the package performs (deny-by-default) — add them to package.fungi.json "capabilities", or remove the effect.`);
        console.error(`\n❌ Refusing to sign package '${packageDescriptor.name}' — the fuse ACL under-declares its flows' effects (fail-closed).`);
        process.exit(1);
      }
    }

    // .lmanifest generation (DRCM Phase 3 task #67 — binary CBOR RFC 8949)
    if (mintManifest) try {
      const { generateManifest, serializeManifest, serializeManifestCBOR, prettyManifest, verifyManifestRoundTrip, manifestSigningInput } = await import(
        new URL("packages-galerina/galerina-core-compiler/dist/manifest-generator.js", import.meta.url).href
      );
      const govResult = m.verifyGovernance(parsed.ast, parsed.flows,
        m.checkEffects(parsed.flows, parsed.ast), "dev");
      const source = readUntrustedSource(fungiFile);
      if (source === null) process.exit(1); // fail-closed: oversized/unreadable .fungi rejected
      const baseManifest = generateManifest(source, toRepoRelative(fungiFile), parsed.flows, govResult);

      // ── Net a: embed the fusion descriptor INTO the manifest BEFORE signing ──────
      // (Fuse B2 STEP A) The fuse fields (kind/provides/seam/capabilities) and the
      // .wasm sha256 are folded into the SIGNED manifest object so they are
      // tamper-evident: a host App Kernel verifies one signature over both the
      // governance facts AND the fusion contract. The standalone .fuse.json emitted
      // below is now just a convenience copy — the manifest's `fuse` block is the
      // authoritative, signed source of truth.
      const wasmSha256 = "sha256:" + createHash("sha256").update(Buffer.from(assembled.wasm)).digest("hex");
      const manifest = packageBuild
        ? {
            ...baseManifest,
            fuse: {
              schemaVersion: "fungi.fuse.v1",
              name,
              version: packageDescriptor.version ?? "0.0.0",
              kind: packageDescriptor.kind ?? "capability",
              provides: packageDescriptor.provides ?? null,
              seam: packageDescriptor.seam ?? null,
              capabilities: packageDescriptor.capabilities ?? [],
              wasmSha256,
            },
          }
        : baseManifest;

      // Dual output (galerina-cbor-manifest-spec.md):
      //   .lmanifest      = Binary CBOR (RFC 8949) — signing target, DSS.wasm parses this
      //   .lmanifest.json = Pretty JSON — human inspection only
      const roundTripOk = verifyManifestRoundTrip(manifest);
      if (roundTripOk) {
        const cborBytes = serializeManifestCBOR(manifest);
        writeFileSync(`${outDir}/${name}.lmanifest`, Buffer.from(cborBytes));
        console.log(`   ${outDir}/${name}.lmanifest      (CBOR ${cborBytes.length}B — round-trip ✅)`);
      } else {
        // Safety fallback: CBOR round-trip failed, use canonical JSON
        writeFileSync(`${outDir}/${name}.lmanifest`, serializeManifest(manifest));
        console.log(`   ${outDir}/${name}.lmanifest      (JSON fallback — CBOR round-trip failed)`);
      }
      const manifestJsonPath = `${outDir}/${name}.lmanifest.json`;
      const manifestJson = prettyManifest(manifest);
      writeFileSync(manifestJsonPath, manifestJson);
      console.log(`   ${outDir}/${name}.lmanifest.json (human-readable)`);

      // ── Real manifest signing (#108) — ZERO-TOUCH key lifecycle ──────────────
      // Stage A: Ed25519 (Node.js native crypto). Stage B: ML-DSA-65 (FIPS 204).
      // A developer never handles keys: the dev signing key is auto-provisioned, healthy
      // keys sign silently, and a coded FUNGI-KEY-* diagnostic appears ONLY when action is
      // needed (stale → warn; revoked/tampered/prod-missing → fail-closed).
      let signingKeyId = process.env.GALERINA_SIGNING_KEY_ID;
      let signingKeyB64 = process.env.GALERINA_SIGNING_PRIVATE_KEY_B64;
      // #34 / 0102: the `keygen --hybrid` ceremony also persists the ML-DSA private half + an algorithm
      // tag (galerina.mjs:315,318). Declared with `let` in the SAME outer scope as the two key vars above
      // (NOT inside the try) so they remain in scope at the sign step (~1731). Default Ed25519 builds
      // leave signingMlDsaB64 undefined → useHybridManifestSig stays false → existing path byte-for-byte.
      let signingAlgorithm = process.env.GALERINA_SIGNING_ALGORITHM;          // "hybrid-ed25519-mldsa65" when minted by `keygen --hybrid`
      let signingMlDsaB64  = process.env.GALERINA_SIGNING_MLDSA_PRIVATE_KEY_B64;
      try {
        const kl = await import("./governance/key-lifecycle.mjs");
        // FAIL-SECURE profile: a set-but-unrecognized GALERINA_PROFILE (e.g. typo'd "prod") resolves to
        // production (with a warning) so a malformed value can't silently downgrade to throwaway dev-key
        // signing. UNSET stays dev (zero-touch local development). Mirrors core-config posture.ts.
        const { resolveSigningProfileWarned } = await import("./governance/profile.mjs");
        const profile = resolveSigningProfileWarned().profile;
        const assessment = kl.assessSigningKey({ rootDir: ".", profile });
        if (assessment.diagnostics.length > 0) console.log(kl.formatDiagnostics(assessment.diagnostics));
        if (assessment.fatal) {
          console.error(`❌ Refusing to sign (fail-closed) — resolve the FUNGI-KEY-* issue above and re-run.`);
          process.exit(1);
        }
        if (assessment.action === "auto-provision") {
          const newId = kl.provisionDevKey(".");
          console.log(`   🔑 Auto-provisioned a development signing key (${newId.slice(0, 8)}…) — zero-touch, no action needed.`);
        }
        // Auto-load from .env.galerina-signing so the developer never has to `source` it.
        if ((!signingKeyId || !signingKeyB64 || !signingAlgorithm || !signingMlDsaB64) && existsSync(".env.galerina-signing")) {
          for (const line of readFileSync(".env.galerina-signing", "utf-8").split(/\r?\n/)) {
            const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
            if (!m) continue;
            if (m[1] === "GALERINA_SIGNING_KEY_ID") signingKeyId = signingKeyId || m[2].trim();
            if (m[1] === "GALERINA_SIGNING_PRIVATE_KEY_B64") signingKeyB64 = signingKeyB64 || m[2].trim();
            // 0102 / #34: the two extra vars the `keygen --hybrid` ceremony writes (galerina.mjs:315,318).
            if (m[1] === "GALERINA_SIGNING_ALGORITHM") signingAlgorithm = signingAlgorithm || m[2].trim();
            if (m[1] === "GALERINA_SIGNING_MLDSA_PRIVATE_KEY_B64") signingMlDsaB64 = signingMlDsaB64 || m[2].trim();
          }
        }
        // Final fail-safe: never sign with a revoked key, whatever its source (env or file).
        if (signingKeyId) {
          const { isKeyRevoked } = await import("./governance/revocation-registry.mjs");
          if (isKeyRevoked(signingKeyId)) {
            console.error(`❌ FUNGI-KEY-004 (error): signing key ${signingKeyId} is REVOKED — refusing to sign. Mint a fresh key.`);
            process.exit(1);
          }
        }
      } catch (klErr) {
        console.warn(`   ⚠️  key-lifecycle check skipped (${klErr.message}) — proceeding with existing env key if present.`);
      }

      // ── #34 / 0102: choose the manifest signature mode. Default = Ed25519 (byte-unchanged). ──────────
      // HYBRID IS DETECTED BY THE ML-DSA PRIVATE HALF, NOT the algorithm tag (Adv-2 guard): if the
      // ML-DSA half is present we MUST use it — a hybrid key can never silently sign classical-only just
      // because GALERINA_SIGNING_ALGORITHM was dropped. If the tag IS present it must agree, else fail-closed.
      const isHybridKey = !!signingMlDsaB64;
      if (isHybridKey && signingAlgorithm && signingAlgorithm !== "hybrid-ed25519-mldsa65") {
        console.error(`❌ FUNGI-MANIFEST-PQ-REQUIRED: an ML-DSA signing half is present but GALERINA_SIGNING_ALGORITHM='${signingAlgorithm}' is not 'hybrid-ed25519-mldsa65' — refusing to sign with an inconsistent key (fail-closed).`);
        process.exit(1);
      }
      // CERTIFIED MODE — FAIL-SECURE resolution (Adv-1 #3 / Adv-2 #4). `profile` (line 1699) is scoped to
      // the try above and only ever yields dev/production, so it can NEVER be "certified"; certified is a
      // dedicated opt-in keyed off GALERINA_MANIFEST_PROFILE. We do NOT do a raw `=== "certified"` (that is
      // the fail-OPEN string-compare the profile resolver was written to kill — a typo would silently drop
      // the PQ mandate). Instead: trim+lowercase; only an UNSET/empty value or an explicit off/dev token
      // relaxes; ANYTHING ELSE set (incl. "Certified ", "certifed", "strict") fail-secures to certified.
      const _mpRaw = String(process.env.GALERINA_MANIFEST_PROFILE ?? "").trim().toLowerCase();
      const _mpOff = new Set(["", "dev", "development", "test", "off", "none", "default"]);
      const certifiedMode = !_mpOff.has(_mpRaw);
      if (certifiedMode && _mpRaw !== "certified") {
        console.warn(`   ⚠️  FUNGI-MANIFEST-PROFILE-UNRECOGNIZED: GALERINA_MANIFEST_PROFILE='${process.env.GALERINA_MANIFEST_PROFILE}' is not recognized — fail-securing to certified (post-quantum signature REQUIRED). Set 'certified' or 'dev' explicitly.`);
      }
      // Certified MANDATES hybrid: a real classical-only key under certified is fail-closed (no PQ downgrade).
      // Gated on a key actually being present so a no-key dev/certified build still emits an (unsigned)
      // manifest that the production VERIFY gate already fail-closes on — existing production Ed25519 signing
      // WITHOUT GALERINA_MANIFEST_PROFILE is untouched.
      if (certifiedMode && signingKeyId && signingKeyB64 && !isHybridKey) {
        console.error("❌ FUNGI-MANIFEST-PQ-REQUIRED: the certified manifest profile requires a hybrid Ed25519+ML-DSA-65 signing key, " +
          "but the ML-DSA half (GALERINA_SIGNING_MLDSA_PRIVATE_KEY_B64) is missing. Refusing to emit a classical-only manifest (fail-closed, no PQ downgrade). " +
          "Run the offline ceremony: galerina keygen --hybrid, then re-build.");
        process.exit(1);
      }
      const useHybridManifestSig = isHybridKey;   // opt-in; default false → existing Ed25519 path, byte-for-byte

      if (signingKeyId && signingKeyB64) {
        try {
          if (!useHybridManifestSig) {
          const { sign: cryptoSign, createPrivateKey } = await import("node:crypto");
          const privateKeyPem = Buffer.from(signingKeyB64, "base64").toString("utf-8");
          const privateKey = createPrivateKey(privateKeyPem);

          // Sign the manifest without the governanceSignature field so verification
          // can reconstruct the exact same bytes by stripping the signature before checking.
          // Ed25519 uses deterministic signing — no external hash algorithm needed (RFC 8032).
          // VERSIONED signing (charter): we sign over RFC 8785 canonical JSON ("jcs"). Because that
          // form is representation-independent, the SAME bytes reconstruct from either the .json or the
          // decoded CBOR — which is what makes the authoritative CBOR self-verifiable (#67). The format
          // is named in the signature (`canon`) so this change never invalidates older "legacy" sigs.
          const signCanon = "jcs";
          const manifestObjForSigning = JSON.parse(manifestJson);
          const { governanceSignature: _placeholder, ...manifestWithoutSig } = manifestObjForSigning;
          const manifestBytesForSigning = manifestSigningInput(manifestWithoutSig, signCanon);
          const signature = cryptoSign(null, Buffer.from(manifestBytesForSigning), privateKey).toString("base64");

          // Update the .lmanifest.json with real signature
          const signedManifest = JSON.parse(manifestJson);
          signedManifest.governanceSignature = {
            algorithm: "Ed25519",  // Stage A; will be ML-DSA-65 (NIST FIPS 204) in Stage B
            keyId: signingKeyId,
            signature: signature,
            canon: signCanon,      // canonicalization of the signed bytes (RFC 8785 JCS) — verifiers dispatch on this
            signedAt: new Date().toISOString(),
          };

          writeFileSync(manifestJsonPath, JSON.stringify(signedManifest, null, 2));

          // #180: re-serialize the AUTHORITATIVE CBOR .lmanifest with the REAL Ed25519 signature.
          // Until now only the .json carried the signature; the CBOR (the on-disk manifest DSS.wasm
          // parses, the admission-gate artifact) kept the placeholder — i.e. the authoritative
          // artifact was effectively UNSIGNED while only the human-readable copy was signed. Write the
          // signed manifest to BOTH outputs so they agree and the CBOR is genuinely signed.
          try {
            if (verifyManifestRoundTrip(signedManifest)) {
              writeFileSync(`${outDir}/${name}.lmanifest`, Buffer.from(serializeManifestCBOR(signedManifest)));
            } else {
              writeFileSync(`${outDir}/${name}.lmanifest`, serializeManifest(signedManifest));
            }
            console.log(`   🔐 Manifest signed (Ed25519, keyId: ${signingKeyId.slice(0, 8)}...) — CBOR + JSON authoritative`);
          } catch (cborErr) {
            console.warn(`   ⚠️  Signed CBOR re-serialize failed (.json is signed; CBOR kept prior bytes): ${cborErr.message}`);
          }
          } else {
            // ── OPT-IN: HYBRID Ed25519 + ML-DSA-65 — REUSE the shipped signProofGraphHybrid (no new crypto) ──
            // Bind the EXACT manifest body (minus signature) into the SAME ProofGraph envelope the rd-0102
            // bench proves sound (10/10), sign it with BOTH halves, persist a self-describing v2 signature.
            const { createPrivateKey } = await import("node:crypto");
            // Dist-availability probe (Adv-1 #6): if the hybrid signer is absent we must NOT fall through to a
            // raw import stack trace. With a hybrid key in hand this is always fail-closed (intent is explicit).
            let cc;
            try {
              cc = await import(new URL("packages-galerina/galerina-core-compiler/dist/index.js", import.meta.url).href);
              if (typeof cc.signProofGraphHybrid !== "function" || typeof cc.makeManifestEnvelope !== "function") {
                throw new Error("shipped dist does not export signProofGraphHybrid/makeManifestEnvelope");
              }
            } catch (distErr) {
              console.error(`❌ FUNGI-MANIFEST-PQ-REQUIRED: hybrid signing requested (ML-DSA key present) but the shipped hybrid signer is unavailable — fail-closed (build the compiler: npm run build): ${distErr.message}`);
              process.exit(1);
            }

            // Reconstruct the in-memory hybrid key pair from env material. signProofGraphHybrid expects the
            // Ed25519 private key as DER pkcs8 bytes (proof-graph.ts:722) and the ML-DSA half as raw bytes.
            // The env stores the Ed25519 key as base64(PKCS8 PEM) (keygen --hybrid, galerina.mjs:303/317).
            const edPrivPem = Buffer.from(signingKeyB64, "base64").toString("utf-8");
            const edPrivDer = createPrivateKey(edPrivPem).export({ type: "pkcs8", format: "der" });
            const keyPair = {
              keyId: signingKeyId,
              privateKey: new Uint8Array(edPrivDer),
              publicKey: new Uint8Array(0),                            // not consulted when signing
              algorithm: "hybrid-ed25519-mldsa65",
              mlDsaPrivateKey: new Uint8Array(Buffer.from(signingMlDsaB64, "base64")),
            };

            // Bind the manifest body hash over the SAME RFC 8785 JCS canon the Ed25519 path uses so the
            // bodyHash reconstructs identically on the verify side (build-verify & run-verify).
            const signCanon = "jcs";
            const manifestObjForSigning = JSON.parse(manifestJson);
            // Bump schemaVersion to v2 BEFORE hashing: the PERSISTED body is v2 (set on signedManifest
            // below), so the signed bodyHash must bind the v2 body — otherwise the verifier, which
            // re-derives the hash over the persisted v2 body, mismatches (caught by the E2E round-trip).
            // The signed body == the persisted body, minus the governanceSignature field.
            manifestObjForSigning.schemaVersion = "fungi.manifest.v2";
            const { governanceSignature: _ph, ...manifestWithoutSig } = manifestObjForSigning;
            const bodyHash = createHash("sha256").update(Buffer.from(manifestSigningInput(manifestWithoutSig, signCanon))).digest("hex");

            // EXACT envelope the bench signs (rd-0102 makeEnvelope): all-zero ExecutionSignature, one
            // effect-obligation carrying the bodyHash in `claim`, matching evidence so verified===true.
            // Only schemaVersion+flowName+signatureHash+verified+obligations are signed (proof-graph.ts:640-665);
            // generatedAt & evidence are EXCLUDED, so generatedAt is irrelevant — built for fidelity only.
            // SINGLE SOURCE OF TRUTH for this shape = cc.makeManifestEnvelope (proof-graph.ts); the
            // build-verify and run-admission branches reconstruct it via the SAME helper so they cannot drift.
            const envelope = cc.makeManifestEnvelope(bodyHash, manifest.generatedAt);
            const signedEnv = await cc.signProofGraphHybrid(envelope, keyPair);   // → v2, "<ed>|<mldsa>"

            // FAIL-CLOSED: the shipped signer falls back to Ed25519-only (v1) if it does not recognise the
            // key as hybrid (proof-graph.ts:714). Refuse to persist anything that is not a both-halves v2.
            if (!signedEnv.governanceSignature || signedEnv.governanceSignature.algorithm !== "fungi.gov.sig.v2"
                || !signedEnv.governanceSignature.signature.includes("|")) {
              console.error("❌ FUNGI-MANIFEST-PQ-REQUIRED: hybrid signing did not produce a v2 (both-half) signature — refusing to write a downgraded manifest (fail-closed).");
              process.exit(1);
            }

            const signedManifest = JSON.parse(manifestJson);
            // (c) VERSION BUMP — a persisted hybrid signature is a durable on-disk crypto fact (charter:
            // bump once a real signature persists). The Ed25519 default path stays fungi.manifest.v1.
            signedManifest.schemaVersion = "fungi.manifest.v2";
            signedManifest.governanceSignature = {
              algorithm: "Ed25519+ML-DSA-65",                        // hybrid, both required (NIST FIPS 204)
              sigAlgorithm: "fungi.gov.sig.v2",                        // envelope sig version — verifiers dispatch on this
              keyId: signingKeyId,
              canon: signCanon,                                      // body canon the bodyHash binds (RFC 8785 JCS)
              bodyHash: `sha256:${bodyHash}`,                        // explicit, audit-legible body binding (defence-in-depth only)
              signature: signedEnv.governanceSignature.signature,    // "<ed25519_b64url>|<mldsa_b64url>"
              signedAt: signedEnv.governanceSignature.signedAt,
            };

            writeFileSync(manifestJsonPath, JSON.stringify(signedManifest, null, 2));
            try {
              if (verifyManifestRoundTrip(signedManifest)) {
                writeFileSync(`${outDir}/${name}.lmanifest`, Buffer.from(serializeManifestCBOR(signedManifest)));
              } else {
                writeFileSync(`${outDir}/${name}.lmanifest`, serializeManifest(signedManifest));
              }
              console.log(`   🔐🛡️  Manifest signed HYBRID (Ed25519+ML-DSA-65, keyId: ${signingKeyId.slice(0, 8)}...) — v2, both halves required, CBOR + JSON authoritative`);
            } catch (cborErr) {
              // Hybrid intent → fail-closed (a PQ-signed .json with a stale CBOR would be an admission-gate mismatch).
              console.error(`❌ Signed hybrid CBOR re-serialize failed (fail-closed): ${cborErr.message}`);
              process.exit(1);
            }
          }
        } catch (err) {
          // FAIL-CLOSED when certified OR when a hybrid key is in use (Adv-2 #6): minting a PQ key is an
          // explicit intent that must never silently degrade to unsigned. Warn-and-continue ONLY for the
          // ordinary auto-provisioned dev Ed25519 key (default path, behaviour unchanged).
          if (certifiedMode || useHybridManifestSig) { console.error(`❌ Manifest signing failed (fail-closed): ${err.message}`); process.exit(1); }
          console.warn(`   ⚠️  Signing failed (continuing unsigned): ${err.message}`);
        }
      }

      // governance-impact.json (#63) — security surface area artifact per build
      // Summarises effects, invariants, domain guards, change class, resilience
      // Used by AI agents to self-assess proposals, and by CI to post PR comments.
      try {
        const { diffGovernance, flowShape } = await import(
          new URL("packages-galerina/galerina-core-compiler/dist/governance-diff.js", import.meta.url).href
        );
        const impactArtifact = {
          schemaVersion: "fungi.governance-impact.v1",
          sourceFile: toRepoRelative(fungiFile),
          sourceHash: manifest.sourceHash,
          generatedAt: manifest.generatedAt,
          flowCount: parsed.flows.length,
          flows: parsed.flows.map(f => ({
            name: f.name,
            qualifier: f.qualifier,
            effects: f.declaredEffects,
            hasInvariant: (f.declaredEffects.length > 0) || false,
          })),
          surfaceArea: {
            totalEffects: parsed.flows.flatMap(f => f.declaredEffects).length,
            uniqueEffects: [...new Set(parsed.flows.flatMap(f => f.declaredEffects))],
            networkFlows: parsed.flows.filter(f => f.declaredEffects.some(e => e.startsWith("network"))).map(f => f.name),
            secretFlows: parsed.flows.filter(f => f.declaredEffects.some(e => e.includes("secret"))).map(f => f.name),
            mutationFlows: parsed.flows.filter(f => f.declaredEffects.some(e => e.includes(".write") || e.includes(".mutate"))).map(f => f.name),
          },
          proofObligationCount: manifest.proofObligations?.length ?? 0,
          derivedConstraintCount: manifest.derivedConstraints?.length ?? 0,
        };
        writeFileSync(`${outDir}/${name}.governance-impact.json`, JSON.stringify(impactArtifact, null, 2));
        console.log(`   ${outDir}/${name}.governance-impact.json (security surface area)`);
      } catch { /* non-fatal */ }
    } catch { /* manifest generation non-fatal */ }

    // ── Fusion descriptor (#175, design-doc §11) ─────────────────────────────
    // In package mode, emit <name>.fuse.json so a host App Kernel can FUSE this
    // package's governed .wasm at its declared seam, capability-bounded by its
    // manifest (admission-gate verified, deny-by-default). This is the contract
    // between a fusable package and the App Kernel — never a runtime middleware.
    //
    // Net a (Fuse B2): the AUTHORITATIVE, tamper-evident fuse contract now lives
    // INSIDE the signed .lmanifest (`fuse` block, embedded above before signing).
    // This standalone file is a convenience copy — the loader cross-checks it
    // against the signed manifest and prefers the manifest on any disagreement.
    // CG-4: no fusion descriptor without a manifest — a .fuse.json pointing at an
    // unminted .lmanifest is misleading residue (admission would fail-close anyway).
    if (packageBuild && mintManifest) {
      // Recompute defensively so this block stays valid even if the manifest
      // embedding above was skipped (e.g. manifest generation threw, non-fatal).
      const fuseWasmSha256 = "sha256:" + createHash("sha256").update(Buffer.from(assembled.wasm)).digest("hex");
      const fuseDescriptor = {
        schemaVersion: "fungi.fuse.v1",
        name,
        version: packageDescriptor.version ?? "0.0.0",
        kind: packageDescriptor.kind ?? "capability",
        provides: packageDescriptor.provides ?? null,
        seam: packageDescriptor.seam ?? null,
        capabilities: packageDescriptor.capabilities ?? [],
        artifacts: { wasm: `${name}.wasm`, manifest: `${name}.lmanifest` },
        wasmSha256: fuseWasmSha256,
        generatedAt: new Date().toISOString(),
      };
      writeFileSync(`${outDir}/${name}.fuse.json`, JSON.stringify(fuseDescriptor, null, 2));
      console.log(`   ${outDir}/${name}.fuse.json   (fusion descriptor — kind=${fuseDescriptor.kind}, seam=${fuseDescriptor.seam ?? "—"})`);
    }

    // ── //fungi: auto-refresh (R&D 0045) ── a package build refreshes the generated dependency
    // metadata across the package's sources by DEFAULT, so `galerina build --package` keeps every
    // //fungi: USES/USEDBY/IMPACT/COMPLEXITY block current (cross-file). Opt out with --no-refresh for
    // reproducible CI builds. Only //fungi: lines are touched — human // comments and code are never
    // modified. Scoped to the package's own source tree, so it never rewrites files elsewhere.
    if (packageBuild && !rest.includes("--no-refresh")) {
      const { results } = refreshGeneratedComments(dirname(fungiFile), { write: true });
      const changed = results.filter(r => r.changed && !r.blocked);
      const blocked = results.filter(r => r.blocked);
      if (changed.length > 0) {
        const flows = changed.reduce((n, r) => n + r.flows, 0);
        console.log(`   refreshed //fungi: metadata on ${flows} flow(s) in ${changed.length} file(s)  (--no-refresh to skip)`);
      }
      if (blocked.length > 0) {
        console.log(`   🔒 //fungi: refresh skipped on ${blocked.length} file(s) — SIGNED package src is never rewritten`);
      }
    }

    console.log(`✅ Compiled ${packageBuild ? packageDescriptor.name + " (package)" : fungiFile}`);
    console.log(`   ${outDir}/${name}.wasm  (${assembled.wasm.byteLength} bytes)`);
    console.log(`   ${outDir}/${name}.wat   (${wat.split("\n").length} lines)`);
    if (!packageBuild) {
      console.log(`\nRun with wasmtime:`);
      console.log(`   wasmtime --invoke main ${outDir}/${name}.wasm`);
    }
    return;
  }

  if (command === "run") {
    const invokeIdx = rest.indexOf("--invoke");
    const flowName = invokeIdx >= 0 ? rest[invokeIdx + 1] : "main";
    // Marshal CLI args to WASM i32. Bool literals → 1/0; numbers → themselves. Fail LOUDLY on
    // anything else — the old `.map(Number)` turned BOTH "true" and "false" into NaN→i32 0→false,
    // so a wrong-but-plausible Bool arg silently fizzled to `false` with no error (dogfooding #3).
    const args = (invokeIdx >= 0 ? rest.slice(invokeIdx + 2) : []).map((a, i) => {
      if (a === "true") return 1;
      if (a === "false") return 0;
      const n = Number(a);
      if (!Number.isFinite(n)) {
        console.error(`\n  ✗ invoke argument #${i + 1} = ${JSON.stringify(a)} is not a valid Int or Bool.`);
        console.error(`    Pass a number (e.g. 42, -3) or a Bool literal (true / false).\n`);
        process.exit(2);
      }
      return n;
    });

    // ── Host runtime (P9.3) — the CANONICAL closed import object ───────────────
    // Single source of truth: createHostRuntime() (wasm-runtime.ts) — the registry the
    // emitter's HOST_RUNTIME_IMPORTS declares against and wat-host-runtime-completeness
    // pins. An inline copy here drifted twice (#169 char classifiers, then the whole
    // Result/Option surface — every ADT-touching module failed at instantiate) and
    // diverged semantically (None 0 vs the -1 sentinel, void __array_append, UTF-16
    // charAt vs code points, ASCII-only isLetter). Do not re-inline it.
    // No admission gate on this path: the module was compiled from source in-process
    // above — there is no foreign binary to attest. Foreign/persisted binaries are
    // admitted via admitAndInstantiate (attestation-first, fail-closed).
    const host = m.createHostRuntime();
    // Seed the emitter's string-literal handles from the structured intern table (#145),
    // not by re-parsing the `;; ID = "value"` WAT comments.
    for (const { handle, value } of m.getInternedStrings()) host.seedString(handle, value);

    // Resolve an i32 return by the flow's DECLARED type — string/array/result handles
    // are registry indices, so the type is the only sound disambiguator (an Int that
    // happens to equal an interned-string handle must still print as the Int; the old
    // registry-membership probe got that wrong). One generic level is enough here.
    function splitGenericArgs(t) {
      const inner = t.slice(t.indexOf("<") + 1, t.lastIndexOf(">"));
      const parts = []; let depth = 0, cur = "";
      for (const ch of inner) {
        if (ch === "<") depth += 1;
        else if (ch === ">") depth -= 1;
        if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; continue; }
        cur += ch;
      }
      if (cur.trim() !== "") parts.push(cur.trim());
      return parts;
    }
    function formatRunOutput(raw, declaredType) {
      if (typeof raw !== "number") return raw;
      const t = String(declaredType).trim();
      if (t === "String") {
        const s = host.readString(raw);
        return s === undefined ? raw : `"${s}"`;
      }
      if (t.startsWith("Result<")) {
        const r = host.readResult(raw);
        if (r === undefined) return raw;
        const [okT = "", errT = ""] = splitGenericArgs(t);
        return `${r.tag === "ok" ? "Ok" : "Err"}(${formatRunOutput(r.value, r.tag === "ok" ? okT : errT)})`;
      }
      if (t.startsWith("Option<")) {
        // Sentinel convention at the WASM boundary (wasm-runtime.ts): None = -1, Some(v) = v.
        if (raw === -1) return "None";
        return `Some(${formatRunOutput(raw, splitGenericArgs(t)[0] ?? "")})`;
      }
      if (t.startsWith("Array<") || t.startsWith("List<")) {
        const a = host.readArray(raw);
        if (a === undefined) return raw;
        const elemT = splitGenericArgs(t)[0] ?? "";
        return "[" + a.map((x) => formatRunOutput(x, elemT)).join(", ") + "]";
      }
      // No declared type: legacy heuristic (array, then string) for un-annotated flows.
      if (t === "") {
        const a = host.readArray(raw);
        if (a !== undefined) return "[" + a.map((x) => formatRunOutput(x, "")).join(", ") + "]";
        const s = raw > 0 ? host.readString(raw) : undefined;
        if (s !== undefined) return `"${s}"`;
      }
      return raw;
    }

    const result = await WebAssembly.instantiate(assembled.wasm, host.imports);
    const memExport = result.instance.exports.memory;
    if (memExport instanceof WebAssembly.Memory) host.bindMemory(memExport);
    const fn = result.instance.exports[flowName];
    if (typeof fn !== "function") {
      const exported = Object.keys(result.instance.exports).filter(k => k !== "memory");
      const declared = (parsed.flows ?? []).some(f => f.name === flowName);
      if (declared) {
        // The flow EXISTS in the source but is not a WASM export. Only pure flows (and effect-free
        // guarded flows, P9.4c) are exported (exportAllPure); effectful/secure flows (e.g. `console.log`)
        // run in the governed runtime, not the raw WASM --invoke surface (dogfooding #2).
        console.error(`Flow '${flowName}' exists but is NOT in the WASM --invoke surface — only pure flows (and effect-free guarded flows) are exported.`);
        console.error(`('${flowName}' is likely a secure/effectful flow; those run in the governed runtime, not raw WASM --invoke.)`);
        console.error(`→ Run it under governance:  galerina run ${fungiFile} --invoke ${flowName} --governed`);
        console.error(`Invokable here (raw WASM, pure only): ${exported.join(", ") || "(none)"}`);
      } else {
        console.error(`No flow named '${flowName}'. Invokable here: ${exported.join(", ") || "(none)"}`);
      }
      process.exit(1);
    }
    const rawOutput = fn(...args);
    const declaredReturn = (parsed.flows ?? []).find((f) => f.name === flowName)?.returnType ?? "";
    console.log(formatRunOutput(rawOutput, declaredReturn));
    return;
  }

  console.error(`Unknown command: ${command}. Run with --help.`);
  process.exit(1);
}

main().catch(e => { console.error(e.message); process.exit(1); });
