#!/usr/bin/env node
// ts-retirement-graph.mjs — graph 7/7: the LIVE `.ts` retirement meter (owner-directed 2026-07-16:
// "build a dev tool as part of the % to track .ts using graph").
//
// WHY: "why does *.ts still exist?" must be answerable with a NUMBER per retirement path, not prose.
// Every tracked `.ts` under packages-ts/*/src retires through exactly one of three events:
//   1. #143 R4 flip     — it has a `.fungi` TWIN beside it (same package, same stem); an authority
//                          ledger records whether TypeScript remains the differential oracle or the
//                          checked `.fungi` twin is authoritative. Physical `.ts` retirement waits
//                          for executable SLIDE integration and is tracked separately.
//   2. bootstrap fixpoint — it IS the compiler (galerina-core-compiler): the .fungi stages are compiled
//                          BY this .ts, so it retires last (post-v1, self-hosting Stages 3-6).
//   3. the #38 migration — everything else: the 49-package codemod program (owner-gated re-sign).
// This tool derives those buckets from the tree and writes build/ts-retirement/ so component-health's
// % audit reads the numbers LIVE (tool = source; no hand-typed count to drift — the version.json rule).
//
// FIND: one checked, bounded, NUL-delimited staged Git-index snapshot is the
// corpus source of truth. Every executable/Fungi/compatibility fact below is
// derived from that single frozen view; process or ownership failure refuses.
//
//   node scripts/ts-retirement-graph.mjs              # regenerate build/ts-retirement/ + summary line
//   node scripts/ts-retirement-graph.mjs --self-test  # finder coverage + a known twin pair + sum check
//   node scripts/ts-retirement-graph.mjs --help       # usage only; never writes (unknown flags refuse)
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyzeTopologyRecords,
  loadTopologyBaseline,
  scanWorkspace,
} from "./audit-flat-package-topology.mjs";
import {
  readStagedGitBlob,
  readStagedGitIndex,
} from "./lib/staged-git-index.mjs";
import {
  generatedOutputMatches,
  gitCommit,
  provenance,
} from "./lib/provenance.mjs";
import { loadTrustedRevocationSnapshot } from "../governance/revocation-registry.mjs";
import { loadBetaV1ReleaseEvidenceAuthority } from "./beta-v1-release-admission.mjs";
import { verifyPostSlideAuthorityLedgerEntries } from "./lib/post-slide-authority-ledger.mjs";
import { parseStrictJsonObject } from "./lib/flat-package-root-lock.mjs";

// Argument contract (zero-trust default, owner may revisit): `--help`/`-h` (alone, or with only
// `--root <dir>`) prints usage and exits 0 WITHOUT writing; any unknown or repeated argument refuses
// (exit 2) before any read or write. A generator owner must never treat an unrecognised flag as a
// request to regenerate tracked output.
const TS_RETIREMENT_USAGE = [
  "usage: node scripts/ts-retirement-graph.mjs [--root <dir>] [--check] [--json] [--terminal-check] [--post-slide] [--self-test]",
  "  (no mode flag)    regenerate build/ts-retirement/ and print the summary line",
  "  --root <dir>      inventory <dir> instead of this repository",
  "  --check           compare the generated output without writing; exit 1 on drift",
  "  --json            print the JSON summary",
  "  --terminal-check  terminal-retirement gate",
  "  --post-slide      post-SLIDE authority-ledger gate",
  "  --self-test       finder coverage + a known twin pair + sum check",
  "  --help, -h        print this usage and exit 0 without writing",
].join("\n");
{
  const args = process.argv.slice(2);
  const refuse = (why) => {
    console.error(`ts-retirement: REFUSED ${why}; nothing was written.\n${TS_RETIREMENT_USAGE}`);
    process.exit(2);
  };
  const flags = new Set(["--check", "--json", "--terminal-check", "--post-slide", "--self-test"]);
  const seen = new Set();
  let help = false;
  let other = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg)) refuse(`repeated argument ${JSON.stringify(arg)}`);
    seen.add(arg);
    if (arg === "--root") { i++; continue; } // value presence is checked just below
    if (arg === "--help" || arg === "-h") { help = true; continue; }
    if (!flags.has(arg)) refuse(`unknown argument ${JSON.stringify(arg)}`);
    other = true;
  }
  if (help && other) refuse("--help combined with a mode flag");
  if (help) {
    console.log(TS_RETIREMENT_USAGE);
    process.exit(0);
  }
}
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_INDEX = process.argv.indexOf("--root");
if (
  ROOT_INDEX >= 0
  && (
    !process.argv[ROOT_INDEX + 1]
    || process.argv[ROOT_INDEX + 1].startsWith("--")
  )
) {
  console.error("ts-retirement: --root requires a value");
  process.exit(2);
}
const ROOT = ROOT_INDEX >= 0 && process.argv[ROOT_INDEX + 1]
  ? resolve(process.argv[ROOT_INDEX + 1])
  : DEFAULT_ROOT;
const OUT = join(ROOT, "build", "ts-retirement");
const CHECK = process.argv.includes("--check");
const JSON_OUT = process.argv.includes("--json");
const TERMINAL_CHECK = process.argv.includes("--terminal-check");
const POST_SLIDE = process.argv.includes("--post-slide");

// The bounded bootstrap-TCB FLOOR (census handover §2): these remain .ts/native
// until an independently admitted SLIDE-native replacement can carry the same
// host/crypto/algorithm contract. They are not "unfinished" beta work, but they
// are not a permanent TypeScript exemption either.
const FLOOR_PACKAGES = new Set(["galerina-substrate-math", "galerina-devtools-graph-algorithms", "galerina-core-security"]);
const FLOOR_PATHS = new Set([
  "packages-ts/galerina-framework-app-kernel/src/host-floor.ts",
]);

function isBoundedBootstrapFloor(path, packageName) {
  return FLOOR_PACKAGES.has(packageName) || FLOOR_PATHS.has(path);
}
const COMPILER_AUTHORITY_LEDGER =
  "docs/security/rd0528-compiler-authoritative-stages.json";
const GOVERNED_AUTHORITY_LEDGER =
  "docs/security/rd0361-authoritative-twins.json";
const POST_SLIDE_AUTHORITY_LEDGER =
  "docs/security/post-slide-execution-authority.json";
const AUTHORITY_LEDGER_MAX_BYTES = 1024 * 1024;
const AUTHORITY_ARTIFACT_MAX_BYTES = 16 * 1024 * 1024;
const WORKSPACE_MANIFEST_MAX_BYTES = 1024 * 1024;
const COMPILER_STAGE_FILES = new Set([
  "effect-checker.fungi",
  "gir-emitter.fungi",
  "governance-verifier.fungi",
  "lexer.fungi",
  "parser.fungi",
  "runtime.fungi",
  "type-checker.fungi",
]);
const GOVERNED_TWIN_DIRS = [
  "packages-ts/galerina-framework-app-kernel/src/self-hosted",
  "packages-ts/galerina-tower-citizen/src/self-hosted",
  "packages-ts/galerina-core-runtime/src/self-hosted",
  "packages-ts/galerina-core-sentinel-memory/src/self-hosted",
  "packages-ts/galerina-core-sentinel-io/src/self-hosted",
  "packages-ts/galerina-core-network/src/self-hosted",
  "packages-ts/galerina-core-sentinel-time/src/self-hosted",
  "packages-ts/galerina-core-sentinel-power/src/self-hosted",
  "packages-ts/galerina-core-sentinel-egress/src/self-hosted",
  "packages-ts/galerina-core-sentinel-state/src/self-hosted",
];

const SOURCE_CANDIDATE_FIELDS = new Set([
  "path", "ownerPackage", "tranche", "profileId", "state",
  "sourceSha256", "graphSha256", "evidencePath", "evidenceSha256",
]);
const CHECKED_DECISION_RECEIPT_FIELDS = new Set([
  "schema", "frontendId", "frontendVersion", "languageEdition", "packageId",
  "profileId", "sourceNormalization", "sourceByteLength", "sourceDigest",
  "flowName", "parameters", "returnType", "k3Sensitive",
  "semanticTokenDigest", "mappings", "decisionGraphCanonical",
  "decisionGraphDigest", "instructionCount", "diagnosticDigest",
  "memoryPlanDigest", "effectPlanDigest", "failurePlanDigest",
  "capabilityPlanDigest", "producerGIRDigest", "deterministic",
  "referenceOnly",
]);
const HOST_SOURCE_EXTENSION = /\.(?:[cm]?[jt]s|rs|fungi)$/;
const HOST_BOUNDARY_PATTERN = /(?:\bnode:(?:fs|net|tls|dgram|child_process|os|crypto|worker_threads)\b|\bprocess\.(?:env|argv|cwd|platform|exit)\b|\b(?:dlopen|process\.dlopen|node-gyp)\b|\.node["']|\bnative\.call\b|\bstd::(?:fs|net|process)\b)/;

function isRuntimeHostCandidate(path) {
  if (
    !HOST_SOURCE_EXTENSION.test(path)
    || path.endsWith(".d.ts")
    || /\.[cm]?ts$/.test(path)
  ) return false;
  if (/^test_/.test(basename(path))) return false;
  if (
    /\/(?:tests?|test-fixtures|fixtures|docs?|examples?|benchmarks?|scripts|results|coverage|dist)\//.test(path)
    || /\.(?:test|spec)\.[cm]?[jt]s$/.test(path)
  ) return false;
  const segments = path.split("/");
  return segments.length === 3
    || segments[2] === "src"
    || segments[2] === "host"
    || segments[2] === "runtime";
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalFungiSource(bytes, label, violations) {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const normalized = decoded.replaceAll("\r\n", "\n");
    if (normalized.includes("\r")) {
      violations.push(`${label} contains a bare carriage return`);
      return null;
    }
    return Buffer.from(normalized, "utf8");
  } catch (error) {
    violations.push(`${label} is not canonical UTF-8: ${error.message}`);
    return null;
  }
}

function checkedDecisionCandidateReceipt(bytes, label, violations) {
  let text;
  let receipt;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    receipt = JSON.parse(text);
  } catch (error) {
    violations.push(`${label} is not a checked-decision JSON receipt: ${error.message}`);
    return null;
  }
  if (text !== `${JSON.stringify(receipt, null, 2)}\n`) {
    violations.push(`${label} is not exact canonical JSON`);
    return null;
  }
  if (
    receipt === null
    || typeof receipt !== "object"
    || Array.isArray(receipt)
    || !exactFields(receipt, CHECKED_DECISION_RECEIPT_FIELDS)
    || receipt.schema !== "galerina.slide.checked-decision-frontend.v1"
    || receipt.frontendId !== "@galerina/core-compiler"
    || receipt.languageEdition !== 1
    || receipt.sourceNormalization !== "UTF8_LF_V1"
    || receipt.returnType !== "Int"
    || receipt.deterministic !== true
    || receipt.referenceOnly !== true
  ) {
    violations.push(`${label} has an unknown or malformed checked-decision schema`);
    return null;
  }
  return receipt;
}

function packageOf(path) {
  return path.split("/")[1] ?? "";
}

const EXECUTABLE_FAMILY_KEYS = Object.freeze([
  "ts",
  "declarationTs",
  "mts",
  "cts",
  "mjs",
  "js",
  "cjs",
]);

function executableClass(path) {
  if (path.endsWith(".d.ts")) return "declarationTs";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".mts")) return "mts";
  if (path.endsWith(".cts")) return "cts";
  if (path.endsWith(".mjs")) return "mjs";
  if (path.endsWith(".js")) return "js";
  if (path.endsWith(".cjs")) return "cjs";
  return "notExecutableFamily";
}

function classifyExecutableFamily(packagePaths) {
  const family = Object.fromEntries(
    EXECUTABLE_FAMILY_KEYS.map((key) => [key, []]),
  );
  for (const path of packagePaths) {
    const kind = executableClass(path);
    if (kind !== "notExecutableFamily") family[kind].push(path);
  }
  for (const key of EXECUTABLE_FAMILY_KEYS) family[key].sort();
  return family;
}

function registeredPackageRoots(root, entries) {
  const workspacePath = "galerina.workspace.json";
  const workspaceEntry = entries.find((entry) => entry.path === workspacePath);
  if (!workspaceEntry || !["100644", "100755"].includes(workspaceEntry.mode)) {
    throw new Error(`${workspacePath} is absent from the staged Git index`);
  }
  const bytes = readStagedGitBlob(
    root,
    workspaceEntry,
    {
      label: "staged workspace package registry",
      maxBytes: WORKSPACE_MANIFEST_MAX_BYTES,
    },
  );
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${workspacePath} is not UTF-8: ${error.message}`);
  }
  const workspace = parseStrictJsonObject(decoded, workspacePath);
  if (!Array.isArray(workspace.packages)) {
    throw new Error(`${workspacePath} must contain packages[]`);
  }
  const roots = new Set();
  for (const [index, value] of workspace.packages.entries()) {
    if (
      typeof value !== "string"
      || !/^packages-ts\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    ) {
      throw new Error(`${workspacePath} packages[${index}] is not one canonical owned package`);
    }
    if (roots.has(value)) throw new Error(`${workspacePath} duplicates owned package ${value}`);
    roots.add(value);
  }
  for (const packageRoot of roots) {
    const manifest = `${packageRoot}/package.json`;
    const entry = entries.find((candidate) => candidate.path === manifest);
    if (!entry || !["100644", "100755"].includes(entry.mode)) {
      throw new Error(`registered owned package is missing staged manifest ${manifest}`);
    }
  }
  return roots;
}

function frozenRetirementCorpus(root) {
  const entries = readStagedGitIndex(root);
  const packageRoots = registeredPackageRoots(root, entries);
  const repositoryPaths = entries
    .filter((entry) =>
      entry.mode !== "160000" && !entry.path.split("/").includes("node_modules")
    )
    .map((entry) => entry.path);
  const packagePaths = [];
  for (const entry of entries) {
    if (!entry.path.startsWith("packages-ts/")) continue;
    if (entry.mode === "160000") continue;
    const parts = entry.path.split("/");
    // Root metadata such as packages-ts/README.md has no package owner.
    if (parts.length < 3) continue;
    const packageRoot = parts.slice(0, 2).join("/");
    if (!packageRoots.has(packageRoot)) {
      throw new Error(`tracked path belongs to an unregistered owned package: ${entry.path}`);
    }
    if (parts.includes("node_modules")) continue;
    packagePaths.push(entry.path);
  }
  packagePaths.sort();
  repositoryPaths.sort();
  return Object.freeze({
    entries,
    packagePaths: Object.freeze(packagePaths),
    repositoryPaths: Object.freeze(repositoryPaths),
  });
}

function fungiReplacementPath(path) {
  if (path.endsWith(".d.ts")) return `${path.slice(0, -5)}.fungi`;
  for (const suffix of [".ts", ".mts", ".cts", ".mjs", ".js", ".cjs"]) {
    if (path.endsWith(suffix)) return `${path.slice(0, -suffix.length)}.fungi`;
  }
  throw new Error(`executable-family path has no admitted extension: ${path}`);
}

function trancheOf(pkg) {
  if (pkg === "galerina-core-compiler") return "T0-compiler";
  if (pkg === "galerina-framework-app-kernel" || pkg === "galerina-core-security") {
    return "T1-trust-root";
  }
  if (
    pkg.startsWith("galerina-core-")
    || pkg === "galerina-tower-citizen"
    || pkg === "galerina-tri-pipe"
  ) return "T2-runtime-core";
  return "T3-package-graph";
}

function readRegularFile(
  root,
  relativePath,
  label,
  violations,
  maxBytes = Number.POSITIVE_INFINITY,
) {
  const absolute = join(root, relativePath);
  try {
    const stat = lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      violations.push(`${label} is not a regular non-symlink file: ${relativePath}`);
      return null;
    }
    if (stat.size > maxBytes) {
      violations.push(
        `${label} exceeds its ${maxBytes}-byte limit: ${relativePath}`,
      );
      return null;
    }
    const realRoot = realpathSync(root);
    const realFile = realpathSync(absolute);
    const containment = relative(realRoot, realFile);
    if (
      containment === ".."
      || containment.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      || isAbsolute(containment)
    ) {
      violations.push(`${label} escapes the repository root: ${relativePath}`);
      return null;
    }
    return readFileSync(absolute);
  } catch (error) {
    violations.push(`${label} is missing or unreadable: ${relativePath} (${error.message})`);
    return null;
  }
}

function exactFields(entry, expected) {
  const actual = Object.keys(entry).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((field, index) => field === wanted[index]);
}

/**
 * Normalize one repository-relative ledger path and reject path ambiguity.
 *
 * @param {unknown} value
 * @param {string} label
 */
function authorityRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`authority ledger ${label} must be a non-empty string`);
  }
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/")
    || /^[A-Za-z]:/.test(normalized)
    || normalized.includes(":")
    || /[\0-\x1f\x7f]/.test(normalized)
    || segments.some((segment) =>
      segment.length === 0
      || segment === "."
      || segment === ".."
      || /[. ]$/.test(segment))
  ) {
    throw new Error(
      `authority ledger ${label} must be an unambiguous repository-relative path`,
    );
  }
  return normalized;
}

function loadPostSlideAuthority(root, tracked, fungiPaths, hostBridgePaths) {
  const violations = [];
  let ledger;
  const ledgerBytes = readRegularFile(
    root,
    POST_SLIDE_AUTHORITY_LEDGER,
    "post-SLIDE authority ledger",
    violations,
    AUTHORITY_LEDGER_MAX_BYTES,
  );
  if (ledgerBytes === null) {
    return {
      candidateFungi: new Set(),
      executedFungi: new Set(),
      ownedHostBridges: new Set(),
      violations,
    };
  }
  let ledgerText;
  try {
    ledgerText = new TextDecoder("utf-8", { fatal: true }).decode(ledgerBytes);
    ledger = parseStrictJsonObject(ledgerText, "post-SLIDE authority ledger");
  } catch (error) {
    return {
      candidateFungi: new Set(),
      executedFungi: new Set(),
      ownedHostBridges: new Set(),
      violations: [
        `post-SLIDE authority ledger is missing or malformed: ${error.message}`,
      ],
    };
  }
  if (ledgerText !== `${JSON.stringify(ledger, null, 2)}\n`) {
    return {
      candidateFungi: new Set(),
      executedFungi: new Set(),
      ownedHostBridges: new Set(),
      violations: [
        "post-SLIDE authority ledger must use exact canonical JSON bytes",
      ],
    };
  }
  if (
    ledger?.schemaVersion !== 3
    || !Number.isSafeInteger(ledger.minimumReceiptSerial)
    || ledger.minimumReceiptSerial < 1
    || !(ledger.verificationTime === null || typeof ledger.verificationTime === "string")
    || !Array.isArray(ledger.candidates)
    || !Array.isArray(ledger.fungiSources)
    || !Array.isArray(ledger.hostBridges)
    || !exactFields(
      ledger,
      new Set([
        "schemaVersion",
        "minimumReceiptSerial",
        "verificationTime",
        "candidates",
        "fungiSources",
        "hostBridges",
      ]),
    )
  ) {
    return {
      candidateFungi: new Set(),
      executedFungi: new Set(),
      ownedHostBridges: new Set(),
      violations: [
        "post-SLIDE authority ledger has an unknown or malformed schema",
      ],
    };
  }

  const validateCandidates = (entries) => {
    const admitted = new Set();
    const seen = new Set();
    for (const [index, entry] of entries.entries()) {
      const label = `${POST_SLIDE_AUTHORITY_LEDGER} candidates[${index}]`;
      const violationStart = violations.length;
      if (
        !entry
        || typeof entry !== "object"
        || Array.isArray(entry)
        || !exactFields(entry, SOURCE_CANDIDATE_FIELDS)
      ) {
        violations.push(`${label} has missing or unknown fields`);
        continue;
      }
      let path;
      let evidencePath;
      try {
        path = authorityRelativePath(entry.path, `${label}.path`);
        evidencePath = authorityRelativePath(
          entry.evidencePath,
          `${label}.evidencePath`,
        );
      } catch (error) {
        violations.push(error.message);
        continue;
      }
      if (seen.has(path)) {
        violations.push(`${label} duplicates ${path}`);
        continue;
      }
      seen.add(path);
      const owner = packageOf(path);
      if (!fungiPaths.has(path)) {
        violations.push(`${label} names stale or out-of-scope source ${path}`);
      }
      if (entry.ownerPackage !== owner || owner.length === 0) {
        violations.push(`${label} has incorrect ownerPackage`);
      }
      if (entry.state !== "candidate") {
        violations.push(`${label} must remain in candidate state`);
      }
      if (typeof entry.tranche !== "string" || entry.tranche.length === 0) {
        violations.push(`${label} has no bounded descriptor`);
      }
      if (
        typeof entry.profileId !== "string"
        || !/^galerina\.package\.[a-z0-9][a-z0-9.-]{0,95}$/.test(entry.profileId)
      ) {
        violations.push(`${label} has malformed profileId`);
      }
      if (!/^[a-f0-9]{64}$/.test(entry.sourceSha256)) {
        violations.push(`${label} has malformed sourceSha256`);
      }
      if (!/^[a-f0-9]{64}$/.test(entry.graphSha256)) {
        violations.push(`${label} has malformed graphSha256`);
      }
      if (!/^[a-f0-9]{64}$/.test(entry.evidenceSha256)) {
        violations.push(`${label} has malformed evidenceSha256`);
      }
      if (!tracked.has(path)) {
        violations.push(`${label} source is not tracked: ${path}`);
      }
      if (!tracked.has(evidencePath)) {
        violations.push(`${label} evidence is not tracked: ${evidencePath}`);
      }
      const sourceBytes = readRegularFile(
        root,
        path,
        `${label} source`,
        violations,
        AUTHORITY_ARTIFACT_MAX_BYTES,
      );
      const evidenceBytes = readRegularFile(
        root,
        evidencePath,
        `${label} evidence`,
        violations,
        AUTHORITY_ARTIFACT_MAX_BYTES,
      );
      const canonicalSource = sourceBytes === null
        ? null
        : canonicalFungiSource(sourceBytes, `${label} source`, violations);
      if (
        canonicalSource !== null
        && sha256(canonicalSource) !== entry.sourceSha256
      ) {
        violations.push(`${label} source digest does not match ${path}`);
      }
      if (
        evidenceBytes !== null
        && sha256(evidenceBytes) !== entry.evidenceSha256
      ) {
        violations.push(
          `${label} evidence digest does not match ${evidencePath}`,
        );
      }
      const receipt = evidenceBytes === null
        ? null
        : checkedDecisionCandidateReceipt(
          evidenceBytes,
          `${label} evidence`,
          violations,
        );
      if (
        receipt !== null
        && (
          receipt.packageId !== `@galerina/${entry.ownerPackage.replace(/^galerina-/, "")}`
          || receipt.profileId !== entry.profileId
          || receipt.sourceDigest !== entry.sourceSha256
          || receipt.decisionGraphDigest !== entry.graphSha256
        )
      ) {
        violations.push(`${label} evidence does not bind the ledger identity`);
      }
      if (violations.length === violationStart) admitted.add(path);
    }
    return admitted;
  };

  const candidateFungi = validateCandidates(ledger.candidates);
  if (ledger.fungiSources.length === 0 && ledger.hostBridges.length === 0) {
    if (ledger.verificationTime !== null) {
      violations.push(
        "post-SLIDE empty production authority ledger must have verificationTime null",
      );
    }
    return {
      candidateFungi,
      executedFungi: new Set(),
      ownedHostBridges: new Set(),
      violations,
    };
  }

  let verificationTime;
  try {
    const milliseconds = Date.parse(ledger.verificationTime);
    if (
      !Number.isFinite(milliseconds)
      || new Date(milliseconds).toISOString() !== ledger.verificationTime
    ) throw new Error("non-canonical verification time");
    verificationTime = ledger.verificationTime;
  } catch {
    violations.push(
      "post-SLIDE production authority ledger requires one canonical verificationTime",
    );
    return {
      candidateFungi,
      executedFungi: new Set(),
      ownedHostBridges: new Set(),
      violations,
    };
  }

  try {
    const revocations = loadTrustedRevocationSnapshot(root);
    const authority = loadBetaV1ReleaseEvidenceAuthority({
      policyPath: join(root, "governance", "beta-v1-platform-policy.json"),
      verificationTime,
      isRevoked: (keyId) => revocations.isRevoked(keyId),
    });
    const repositoryCommit = gitCommit(root);
    if (
      repositoryCommit === null
      || authority.targetRepositoryCommit !== repositoryCommit
    ) {
      throw new Error("release-evidence authority does not bind the current repository commit");
    }
    const verified = verifyPostSlideAuthorityLedgerEntries({
      authority: {
        verifiedDelegation: authority.verifiedDelegation,
        operationalPublicBundle: authority.operationalPublicBundle,
        verificationTime,
        minimumReceiptSerial: ledger.minimumReceiptSerial,
        isRevoked: (keyId) => revocations.isRevoked(keyId),
      },
      fungiSources: ledger.fungiSources,
      hostBridges: ledger.hostBridges,
      repositoryCommit,
      trackedPaths: tracked,
      readArtifact: (path) => {
        const artifactViolations = [];
        const bytes = readRegularFile(
          root,
          path,
          "post-SLIDE signed authority artifact",
          artifactViolations,
          AUTHORITY_ARTIFACT_MAX_BYTES,
        );
        if (bytes === null || artifactViolations.length > 0) {
          throw new Error(artifactViolations.join("; "));
        }
        return Uint8Array.from(bytes);
      },
    });
    const executedFungi = new Set(verified.fungiSources);
    const ownedHostBridges = new Set(verified.hostBridges);
    for (const path of executedFungi) {
      if (!fungiPaths.has(path)) {
        throw new Error(`signed Fungi receipt names stale or out-of-scope source ${path}`);
      }
    }
    for (const path of ownedHostBridges) {
      if (!hostBridgePaths.has(path)) {
        throw new Error(`signed host receipt names stale or out-of-scope boundary ${path}`);
      }
    }
    return { candidateFungi, executedFungi, ownedHostBridges, violations };
  } catch (error) {
    violations.push(
      `post-SLIDE signed production authority refused: ${error.message}`,
    );
    return {
      candidateFungi,
      executedFungi: new Set(),
      ownedHostBridges: new Set(),
      violations,
    };
  }
}

/**
 * Read one authority ledger and prove every entry owns one tracked Fungi twin.
 *
 * @param {string} root
 * @param {string} ledgerPath
 * @param {ReadonlySet<string>} fungiFiles
 */
function authoritativeTwins(root, ledgerPath, fungiFiles) {
  let ledger;
  try {
    ledger = JSON.parse(readFileSync(join(root, ledgerPath), "utf8"));
  } catch (error) {
    throw new Error(
      `authority ledger ${ledgerPath} is missing or malformed: ${error.message}`,
    );
  }
  if (!ledger || !Array.isArray(ledger.twins)) {
    throw new Error(`authority ledger ${ledgerPath} must contain twins[]`);
  }
  const seen = new Set();
  for (const [index, entry] of ledger.twins.entries()) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`authority ledger ${ledgerPath} twins[${index}] is malformed`);
    }
    const dir = authorityRelativePath(
      entry.dir,
      `${ledgerPath} twins[${index}].dir`,
    );
    const file = authorityRelativePath(
      entry.file,
      `${ledgerPath} twins[${index}].file`,
    );
    if (file.includes("/")) {
      throw new Error(
        `authority ledger ${ledgerPath} twins[${index}].file must be a filename`,
      );
    }
    const fungiPath = `${dir}/${file}`;
    if (seen.has(fungiPath)) {
      throw new Error(`authority ledger ${ledgerPath} duplicates ${fungiPath}`);
    }
    seen.add(fungiPath);
    if (!fungiFiles.has(fungiPath)) {
      throw new Error(
        `authority ledger ${ledgerPath} names missing Fungi source ${fungiPath}`,
      );
    }
  }
  return seen;
}

export function buildRetirementGraph(root = ROOT) {
  const scope = /^packages-ts\/[^/]+\/src\//;
  const corpus = frozenRetirementCorpus(root);
  const trackedRepositoryFiles = new Set(corpus.repositoryPaths);
  const allTrackedPackageFiles = [...corpus.packagePaths];
  const ts = allTrackedPackageFiles.filter(
    (path) => scope.test(path) && path.endsWith(".ts") && !path.endsWith(".d.ts"),
  );
  const fungi = allTrackedPackageFiles.filter(
    (path) => scope.test(path) && path.endsWith(".fungi"),
  );
  const finderDrift = 0;
  const executableFamily = classifyExecutableFamily(allTrackedPackageFiles);
  const allTrackedExecutablePaths = EXECUTABLE_FAMILY_KEYS
    .flatMap((key) => executableFamily[key])
    .sort();
  const allTrackedTsPaths = [
    ...executableFamily.ts,
    ...executableFamily.declarationTs,
  ].sort();
  const allTrackedFungiPaths = [...fungi].sort();
  const allTrackedFungi = new Set(allTrackedFungiPaths);
  const hostScanViolations = [];
  const hostBridgePaths = allTrackedPackageFiles.filter((path) => {
    if (!isRuntimeHostCandidate(path)) return false;
    const bytes = readRegularFile(
      root,
      path,
      "host-boundary scan source",
      hostScanViolations,
    );
    if (bytes === null) return false;
    // After TypeScript retirement, every non-Fungi runtime source is a host
    // boundary regardless of whether a lexical import happens to reveal it.
    // Fungi stays in the source ledger unless it explicitly crosses native.call.
    return !path.endsWith(".fungi")
      || HOST_BOUNDARY_PATTERN.test(bytes.toString("utf8"));
  });
  const hostBridges = new Set(hostBridgePaths);
  const pkgOf = packageOf;
  const stem = (p) => basename(p).replace(/\.(ts|fungi)$/, "");
  // twin key = package + stem: secret-gate.fungi twins secret-gate.ts IN THE SAME PACKAGE.
  const twinKeys = new Set(fungi.map((f) => `${pkgOf(f)}::${stem(f)}`));
  const fungiFiles = new Set(fungi);
  const compilerAuthority = authoritativeTwins(
    root,
    COMPILER_AUTHORITY_LEDGER,
    fungiFiles,
  );
  const governedAuthority = authoritativeTwins(
    root,
    GOVERNED_AUTHORITY_LEDGER,
    fungiFiles,
  );
  const postSlideAuthority = loadPostSlideAuthority(
    root,
    trackedRepositoryFiles,
    allTrackedFungi,
    hostBridges,
  );
  for (const fungiPath of compilerAuthority) {
    if (governedAuthority.has(fungiPath)) {
      throw new Error(
        `authority ledgers assign the same Fungi source twice: ${fungiPath}`,
      );
    }
    if (
      !fungiPath.startsWith(
        "packages-ts/galerina-core-compiler/src/self-hosted/",
      )
      || !COMPILER_STAGE_FILES.has(basename(fungiPath))
    ) {
      throw new Error(
        `compiler authority ledger names a non-canonical stage: ${fungiPath}`,
      );
    }
  }
  for (const fungiPath of governedAuthority) {
    if (!GOVERNED_TWIN_DIRS.some((dir) => fungiPath.startsWith(`${dir}/`))) {
      throw new Error(
        `governed authority ledger names a source outside governed twin dirs: ${fungiPath}`,
      );
    }
  }
  const compilerAuthoritativeFlips = compilerAuthority.size;
  const governedAuthoritativeFlips = governedAuthority.size;
  const authoritativeFlips =
    compilerAuthoritativeFlips + governedAuthoritativeFlips;
  const compilerStageTotal = fungi.filter((path) =>
    path.startsWith(
      "packages-ts/galerina-core-compiler/src/self-hosted/",
    ) && COMPILER_STAGE_FILES.has(basename(path))
  ).length;
  const governedTwinTotal = fungi.filter((path) =>
    GOVERNED_TWIN_DIRS.some((dir) => path.startsWith(`${dir}/`))
  ).length;
  // The earlier R4 ledgers authorize shadow-bake decisions, but the terminal
  // profile deliberately does not inherit that authority. Post-SLIDE source
  // must be re-admitted with its exact source and evidence digests here.
  const executedFungi = postSlideAuthority.executedFungi;
  const candidateFungiPaths = [...postSlideAuthority.candidateFungi].sort();
  const unexecutedFungiPaths = allTrackedFungiPaths.filter(
    (path) => !executedFungi.has(path),
  );
  const unownedHostBridgePaths = hostBridgePaths.filter(
    (path) => !postSlideAuthority.ownedHostBridges.has(path),
  );
  if (compilerAuthoritativeFlips > compilerStageTotal) {
    throw new Error(
      "compiler authority ledger exceeds the discovered canonical stage set",
    );
  }
  if (governedAuthoritativeFlips > governedTwinTotal) {
    throw new Error(
      "governed authority ledger exceeds the discovered governed twin set",
    );
  }

  const perPackage = {}; const twinnedPairs = [];
  let twinned = 0, compilerCore = 0, floor = 0, program = 0;
  for (const f of ts) {
    const pkg = pkgOf(f);
    const pp = (perPackage[pkg] ??= { ts: 0, twinned: 0, fungi: 0 });
    pp.ts++;
    if (twinKeys.has(`${pkg}::${stem(f)}`)) { twinned++; pp.twinned++; twinnedPairs.push(f); }
    else if (pkg === "galerina-core-compiler") compilerCore++;
    else if (isBoundedBootstrapFloor(f, pkg)) floor++;
    else program++;
  }
  for (const f of fungi) (perPackage[pkgOf(f)] ??= { ts: 0, twinned: 0, fungi: 0 }).fungi++;
  const retirementLedger = allTrackedExecutablePaths.map((path) => {
    const pkg = pkgOf(path);
    const replacement = fungiReplacementPath(path);
    const hasReplacement = allTrackedFungi.has(replacement);
    const authoritative = hasReplacement && executedFungi.has(replacement);
    return {
      path,
      package: pkg,
      dependencyTranche: trancheOf(pkg),
      fungiReplacement: hasReplacement ? replacement : null,
      executionAuthority: authoritative ? "executed" : "none",
      legacyShadowAuthority: hasReplacement && (
        compilerAuthority.has(replacement)
        || governedAuthority.has(replacement)
      ),
      declaredFloor: isBoundedBootstrapFloor(path, pkg)
        ? "bounded-bootstrap-floor"
        : null,
      replacementOwner: pkg,
      evidenceStatus: authoritative
        ? "authority-ledger-present"
        : hasReplacement
          ? "candidate-only-unexecuted"
          : "replacement-absent",
      retirementState: "physical-executable-family-present",
    };
  });

  const topologyViolations = [];
  let topology = {
    identityCount: 0,
    deferredNested: [],
    nodeModulesPaths: [],
  };
  try {
    const baseline = loadTopologyBaseline(root);
    const scan = scanWorkspace(join(root, "packages-ts"));
    const result = analyzeTopologyRecords({
      records: scan.records,
      legacyNestedNativeManifests: baseline.legacyNestedNativeManifests,
      nodeModulesPaths: scan.nodeModulesPaths,
      postSlide: true,
    });
    topology = {
      identityCount: result.identityCount,
      deferredNested: result.deferredNested,
      nodeModulesPaths: scan.nodeModulesPaths,
    };
    topologyViolations.push(...scan.scanViolations, ...result.violations);
  } catch (error) {
    topologyViolations.push(
      `post-SLIDE topology evidence is missing or malformed: ${error.message}`,
    );
  }

  const postSlideViolations = [
    ...hostScanViolations,
    ...postSlideAuthority.violations,
    ...topologyViolations,
  ];
  if (allTrackedExecutablePaths.length > 0) {
    postSlideViolations.push(
      `post-SLIDE retirement requires zero tracked package executable-family paths; found ${allTrackedExecutablePaths.length}`,
    );
  }
  for (const path of unexecutedFungiPaths) {
    postSlideViolations.push(
      `post-SLIDE retirement forbids unexecuted Fungi source '${path}'`,
    );
  }
  for (const path of unownedHostBridgePaths) {
    postSlideViolations.push(
      `post-SLIDE retirement forbids unowned host bridge '${path}'`,
    );
  }
  const postSlideReady = postSlideViolations.length === 0;
  return {
    generated: "ts-retirement-graph",
    terminalReady: allTrackedExecutablePaths.length === 0,
    postSlideReady,
    postSlideViolations,
    allTrackedTsPaths,
    allTrackedExecutablePaths,
    executableFamily,
    candidateFungiPaths,
    unexecutedFungiPaths,
    unownedHostBridgePaths,
    retirementLedger,
    topology,
    totals: {
      ts: ts.length,
      allTrackedTs: allTrackedTsPaths.length,
      allTrackedExecutable: allTrackedExecutablePaths.length,
      tsSource: executableFamily.ts.length,
      declarationTs: executableFamily.declarationTs.length,
      mts: executableFamily.mts.length,
      cts: executableFamily.cts.length,
      mjs: executableFamily.mjs.length,
      js: executableFamily.js.length,
      cjs: executableFamily.cjs.length,
      twinned,
      compilerCore,
      floor,
      program,
      fungiInSrc: fungi.length,
      packages: Object.keys(perPackage).length,
      finderDrift,
      compilerAuthoritativeFlips,
      governedAuthoritativeFlips,
      authoritativeFlips,
      compilerStageTotal,
      compilerDifferential: compilerStageTotal - compilerAuthoritativeFlips,
      governedTwinTotal,
      governedDifferential: governedTwinTotal - governedAuthoritativeFlips,
      allTrackedFungi: allTrackedFungiPaths.length,
      candidateFungi: candidateFungiPaths.length,
      executedFungi: executedFungi.size,
      unexecutedFungi: unexecutedFungiPaths.length,
      hostBridges: hostBridgePaths.length,
      ownedHostBridges: postSlideAuthority.ownedHostBridges.size,
      unownedHostBridges: unownedHostBridgePaths.length,
      nestedNativePackages: topologyViolations.filter((item) =>
        item.includes("nested native")
      ).length,
      nodeModulesTrees: topology.nodeModulesPaths.length,
    },
    retirementPaths: {
      twinned: "→ #143 R4 authority ledger (checked .fungi authority or retained .ts differential oracle)",
      compilerCore: "→ bootstrap fixpoint (the .fungi stages are compiled BY this .ts — retires last, post-v1)",
      floor: "→ post-beta admitted SLIDE replacement (bounded bootstrap TCB until equivalent crypto/host/algorithm evidence exists)",
      program: "→ the #38 migration codemod program (owner-gated re-sign ceremony)",
    },
    perPackage, twinnedPairs,
  };
}

if (process.argv.includes("--self-test")) {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  const g = buildRetirementGraph();
  ok(g.totals.ts > 300, `corpus found: ${g.totals.ts} tracked .ts in package src trees`);
  ok(
    EXECUTABLE_FAMILY_KEYS.reduce(
      (sum, key) => sum + g.executableFamily[key].length,
      0,
    ) === g.totals.allTrackedExecutable,
    "complete executable-family classes conserve the terminal denominator",
  );
  ok(
    g.totals.finderDrift === 0,
    "one staged-index snapshot conserves the tracked retirement corpus",
  );
  ok(g.twinnedPairs.includes("packages-ts/galerina-framework-app-kernel/src/secret-gate.ts"), "known twin pair detected: secret-gate.ts ↔ secret-gate.fungi");
  ok(
    g.retirementLedger.some((entry) =>
      entry.path === "packages-ts/galerina-framework-app-kernel/src/host-floor.ts"
      && entry.declaredFloor === "bounded-bootstrap-floor"
    ),
    "single app-kernel host seam is classified as bounded bootstrap floor",
  );
  ok(g.totals.twinned + g.totals.compilerCore + g.totals.floor + g.totals.program === g.totals.ts, "buckets partition the corpus exactly (twinned + compiler-core + floor + program == total)");
  ok(!g.retirementPaths.floor.includes("NEVER") && g.retirementPaths.floor.includes("SLIDE"),
    "bounded bootstrap floor has an admitted-SLIDE retirement path rather than a permanent TypeScript exemption");
  ok(
    g.totals.authoritativeFlips
      === g.totals.compilerAuthoritativeFlips
        + g.totals.governedAuthoritativeFlips
      && g.totals.compilerAuthoritativeFlips + g.totals.compilerDifferential
        === g.totals.compilerStageTotal
      && g.totals.governedAuthoritativeFlips + g.totals.governedDifferential
        === g.totals.governedTwinTotal,
    "authority ledgers partition the compiler and governed inventories",
  );
  console.log(process.exitCode ? "  ts-retirement self-test FAILED" : "  ts-retirement self-test: staged-index + twin-match + partition verified ✅");
  process.exit(process.exitCode ?? 0);
}

const g = buildRetirementGraph();
const t = g.totals;
if (JSON_OUT) {
  console.log(JSON.stringify(g, null, 2));
  if (POST_SLIDE && !g.postSlideReady) process.exitCode = 1;
  if (TERMINAL_CHECK && !g.terminalReady) process.exitCode = 1;
  process.exit(process.exitCode ?? 0);
}
if (POST_SLIDE) {
  if (!g.postSlideReady) {
    console.error(
      `ts-retirement: post-SLIDE refusal — ${g.postSlideViolations.length} violation(s)`,
    );
    for (const violation of g.postSlideViolations) {
      console.error(`  ${violation}`);
    }
    process.exit(1);
  }
  console.log(
    "ts-retirement: post-SLIDE gate GREEN (physical, execution, host and topology authority verified)",
  );
  process.exit(0);
}
if (TERMINAL_CHECK) {
  if (!g.terminalReady) {
    console.error(
      `ts-retirement: terminal refusal — ${t.allTrackedExecutable} tracked package executable-family path(s) remain`,
    );
    for (const path of g.allTrackedExecutablePaths) console.error(`  ${path}`);
    process.exit(1);
  }
  console.log("ts-retirement: terminal package executable-family gate GREEN (0 tracked paths)");
  process.exit(0);
}
const md = [
  `# Executable-family retirement graph (${t.allTrackedExecutable} tracked package paths; ${t.allTrackedTs} .ts-family)`,
  ``,
  `Regenerate: \`node scripts/ts-retirement-graph.mjs\` (graph-all 7/7). The % audit reads these numbers LIVE.`,
  ``,
  `| Retirement path | Count | Deletes via |`,
  `|---|--:|---|`,
  `| Twinned (.fungi beside it) | ${t.twinned} | ${g.retirementPaths.twinned} |`,
  `| Compiler core | ${t.compilerCore} | ${g.retirementPaths.compilerCore} |`,
  `| Bounded-TCB floor | ${t.floor} | ${g.retirementPaths.floor} |`,
  `| Migration program | ${t.program} | ${g.retirementPaths.program} |`,
  ``,
  `Authority ledgers: ${t.compilerAuthoritativeFlips} compiler + ${t.governedAuthoritativeFlips} governed = ${t.authoritativeFlips} authoritative twins.`,
  ``,
  `Complete executable family: ${t.tsSource} .ts source · ${t.declarationTs} .d.ts · ${t.mts} .mts · ${t.cts} .cts · ${t.mjs} .mjs · ${t.js} .js · ${t.cjs} .cjs.`,
  ``,
  `Terminal physical retirement: ${g.terminalReady ? "GREEN" : `OPEN — ${t.allTrackedExecutable} tracked package executable-family paths remain`}.`,
  ``,
  `Post-SLIDE authority: ${g.postSlideReady ? "GREEN" : "OPEN"} — ${t.candidateFungi} non-authorizing candidate(s); ${t.executedFungi}/${t.allTrackedFungi} production Fungi sources cryptographically admitted; ${t.ownedHostBridges}/${t.hostBridges} host boundaries owned; ${t.nodeModulesTrees} node_modules trees.`,
  ``,
  `\`.fungi\` in src trees: ${t.fungiInSrc} across ${t.packages} packages · staged-index drift: ${t.finderDrift}`,
  ``,
  `## Twinned .ts (the #143 flip queue)`,
  ...g.twinnedPairs.map((p) => `- ${p}`),
  ``,
].join("\n");
const generatedOutputs = new Map([
  [join(OUT, "ts-retirement.json"), JSON.stringify(g, null, 2)],
  [join(OUT, "TS-RETIREMENT.md"), md],
  [
    join(OUT, "provenance.json"),
    JSON.stringify(provenance("ts-retirement-graph", ROOT), null, 2) + "\n",
  ],
]);
if (CHECK) {
  for (const [path, expected] of generatedOutputs) {
    let actual;
    try { actual = readFileSync(path, "utf8"); } catch {
      console.error(`ts-retirement: missing generated output ${relative(ROOT, path).replace(/\\/g, "/")}`);
      process.exitCode = 1;
      continue;
    }
    if (!generatedOutputMatches(path, actual, expected)) {
      console.error(`ts-retirement: generated output drift ${relative(ROOT, path).replace(/\\/g, "/")}`);
      process.exitCode = 1;
    }
  }
} else {
  mkdirSync(OUT, { recursive: true });
  for (const [path, content] of generatedOutputs) writeFileSync(path, content);
}
console.log(
  `ts-retirement: ${t.allTrackedExecutable} executable-family (${t.allTrackedTs} .ts-family · ${t.mjs} .mjs · ${t.js} .js) · `
  + `${t.ts} src .ts · ${t.twinned} same-stem twins (→#143 inventory) · `
  + `authority ${t.authoritativeFlips}/${t.compilerStageTotal + t.governedTwinTotal} `
  + `(${t.compilerAuthoritativeFlips}/${t.compilerStageTotal} compiler + `
  + `${t.governedAuthoritativeFlips}/${t.governedTwinTotal} governed) · `
  + `${t.compilerCore} compiler-core (fixpoint) · ${t.floor} bootstrap floor (retires after admitted SLIDE replacement) · `
  + `${t.program} migration (#38) · ${t.fungiInSrc} .fungi in src`,
);
