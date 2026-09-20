#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  dirname, isAbsolute, join, relative, resolve, sep,
} from "node:path";
import {
  lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { parseStrictJsonBytes } from "./lib/assurance-fabric/strict-json.mjs";
import {
  aggregateCorpusReceipts,
  validateCorpusRequest,
  validateShardReceipt,
} from "./lib/fungi-corpus-receipt.mjs";
import { deriveCorpusShards } from "./lib/fungi-corpus-shards.mjs";

const CLASSIFICATIONS = [
  "CANDIDATE", "BLOCKED", "NO_RUNTIME_BEHAVIOR",
  "SUPERSEDED_BY_EXISTING_FUNGI", "BOOTSTRAP_FLOOR",
];
const DECISION_FIELDS = ["classification", "evidenceDigest", "path", "reason", "scope", "symbols"];
const EVIDENCE_FIELDS = ["digest", "limits", "request", "run", "schema"];
const LIMIT_FIELDS = ["maxBytes", "maxFiles", "maxOutputBytes", "timeoutMs"];
const RUN_FIELDS = ["aggregate", "receipts", "schema"];
const DIGEST = /^[0-9a-f]{64}$/u;
const CORPUS_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const HASH = /^[0-9a-f]{40}$/u;
const SYMBOL = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const EVIDENCE_PREFIX = "build/fungi-corpus-check/evidence/";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalDigest(value) {
  return `sha256:${sha256(Buffer.from(JSON.stringify(value), "utf8"))}`;
}

function parseArgs(argv) {
  let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  let mode = null;
  let projectCorpusReceipt = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write" || arg === "--check") {
      if (mode !== null) throw new Error("choose exactly one of --write or --check");
      mode = arg;
    } else if (arg === "--root" && index + 1 < argv.length) {
      root = resolve(argv[++index]);
    } else if (arg === "--project-corpus-receipt" && index + 1 < argv.length) {
      if (projectCorpusReceipt !== null) throw new Error("duplicate --project-corpus-receipt");
      projectCorpusReceipt = argv[++index];
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (mode === null) throw new Error("choose exactly one of --write or --check");
  if (projectCorpusReceipt === null) throw new Error("--project-corpus-receipt is required");
  return { root, mode, projectCorpusReceipt };
}

function exactRecord(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string")) return false;
  const sorted = [...keys].sort();
  return sorted.every((key, index) => key === fields[index]
    && descriptors[key]?.enumerable === true
    && descriptors[key]?.get === undefined
    && descriptors[key]?.set === undefined
    && Object.hasOwn(descriptors[key] ?? {}, "value"));
}

function exactArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(descriptors).length !== length + 1) return null;
  const result = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor?.enumerable !== true
        || descriptor.get !== undefined
        || descriptor.set !== undefined
        || !Object.hasOwn(descriptor ?? {}, "value")) return null;
    result.push(descriptor.value);
  }
  return result;
}

function canonicalRelativePath(value) {
  return typeof value === "string"
    && value.length > 0
    && value === value.normalize("NFC")
    && !isAbsolute(value)
    && !value.includes("\\")
    && !value.includes("\0")
    && value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function exactExistingPath(root, value) {
  if (!canonicalRelativePath(value) || !value.startsWith(EVIDENCE_PREFIX) || !value.endsWith(".json")) {
    throw new Error("project corpus receipt path is outside the approved evidence subtree");
  }
  const canonicalRoot = realpathSync(root);
  if (canonicalRoot !== resolve(root)) throw new Error("repository root is not canonical");
  let current = canonicalRoot;
  for (const segment of value.split("/")) {
    const matches = readdirSync(current, { withFileTypes: true })
      .filter((entry) => entry.name.toLowerCase() === segment.toLowerCase());
    if (matches.length !== 1 || matches[0].name !== segment || matches[0].isSymbolicLink()) {
      throw new Error("project corpus receipt path identity is not exact");
    }
    current = join(current, segment);
    if (realpathSync(current) !== current) throw new Error("project corpus receipt path is indirect");
  }
  const back = relative(canonicalRoot, current);
  const state = lstatSync(current);
  if (back.startsWith(`..${sep}`) || back === ".." || isAbsolute(back) || !state.isFile() || state.isSymbolicLink()) {
    throw new Error("project corpus receipt is not a direct regular file");
  }
  return current;
}

function gitIdentity(root) {
  const gitEnv = { ...process.env };
  for (const key of Object.keys(gitEnv)) {
    if (key.toUpperCase().startsWith("GIT_")) delete gitEnv[key];
  }
  gitEnv.GIT_TERMINAL_PROMPT = "0";
  gitEnv.GIT_OPTIONAL_LOCKS = "0";
  gitEnv.GCM_INTERACTIVE = "Never";
  const run = (args) => {
    const result = spawnSync("git", ["-c", `safe.directory=${root}`, ...args], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      env: gitEnv,
    });
    return result.status === 0 ? result.stdout.trim() : "";
  };
  const head = run(["rev-parse", "HEAD"]);
  const tree = run(["rev-parse", "HEAD^{tree}"]);
  if (!HASH.test(head) || !HASH.test(tree)) throw new Error("repository identity unavailable");
  return { head, tree };
}

function validateProjectEvidence(root, evidencePath) {
  const path = exactExistingPath(root, evidencePath);
  const bytes = readFileSync(path);
  const evidence = parseStrictJsonBytes(bytes, { label: "PROJECT corpus evidence", maxBytes: 8_388_608 });
  if (!exactRecord(evidence, EVIDENCE_FIELDS)
      || evidence.schema !== "galerina.fungi-corpus-evidence.v1"
      || !CORPUS_DIGEST.test(evidence.digest)
      || evidence.digest !== canonicalDigest({
        schema: evidence.schema,
        request: evidence.request,
        limits: evidence.limits,
        run: evidence.run,
      })) throw new Error("invalid PROJECT corpus evidence envelope");

  const requestResult = validateCorpusRequest(evidence.request);
  if (requestResult.kind !== "accepted") throw new Error("invalid PROJECT corpus request");
  const request = requestResult.value;
  const repository = gitIdentity(root);
  if (request.profile !== "PROJECT"
      || request.productId !== "galerina"
      || request.repositoryHead !== repository.head
      || request.repositoryTree !== repository.tree) {
    throw new Error("stale, wrong-profile or product-mismatched PROJECT corpus evidence");
  }
  if (!exactRecord(evidence.limits, LIMIT_FIELDS)
      || Object.values(evidence.limits).some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error("invalid PROJECT corpus limits");
  }
  const shardsResult = deriveCorpusShards(request, evidence.limits);
  if (shardsResult.kind !== "accepted") throw new Error("invalid PROJECT corpus shard derivation");
  if (!exactRecord(evidence.run, RUN_FIELDS)
      || evidence.run.schema !== "galerina.fungi-corpus-run.v2") {
    throw new Error("invalid PROJECT corpus run");
  }
  const receipts = exactArray(evidence.run.receipts);
  if (receipts === null || receipts.length !== shardsResult.value.length) {
    throw new Error("incomplete PROJECT corpus coverage");
  }
  for (let index = 0; index < receipts.length; index += 1) {
    const result = validateShardReceipt(receipts[index], shardsResult.value[index]);
    if (result.kind !== "accepted"
        || result.value.status !== "PASS"
        || result.value.termination !== "COMPLETE"
        || result.value.unprocessed.length !== 0) {
      throw new Error("non-PASS or incomplete PROJECT corpus shard");
    }
  }
  const aggregate = aggregateCorpusReceipts(request, shardsResult.value, receipts);
  if (aggregate.kind !== "accepted"
      || aggregate.value.status !== "PASS"
      || aggregate.value.holdReasons.length !== 0
      || JSON.stringify(aggregate.value) !== JSON.stringify(evidence.run.aggregate)) {
    throw new Error("invalid or non-PASS PROJECT corpus aggregate");
  }
  return { digest: evidence.digest, repository };
}

function loadInputs(root) {
  const retirementPath = join(root, "build", "ts-retirement", "ts-retirement.json");
  const decisionsPath = join(root, "governance", "conversion-queue-decisions.json");
  const retirementBytes = readFileSync(retirementPath);
  const decisionsBytes = readFileSync(decisionsPath);
  const retirement = parseStrictJsonBytes(retirementBytes, { label: "ts-retirement.json", maxBytes: 8_388_608 });
  const decisions = parseStrictJsonBytes(decisionsBytes, { label: "conversion-queue-decisions.json", maxBytes: 1_048_576 });
  if (!Array.isArray(retirement.allTrackedExecutablePaths)
      || !Array.isArray(retirement.retirementLedger)
      || !Array.isArray(retirement.twinnedPairs)
      || retirement.allTrackedExecutablePaths.length !== retirement.retirementLedger.length) {
    throw new Error("retirement graph does not conserve executable-family paths");
  }
  if (!exactRecord(decisions, ["decisions", "schemaVersion"])
      || decisions.schemaVersion !== 2
      || !Array.isArray(decisions.decisions)) {
    throw new Error("invalid conversion queue decisions root");
  }
  return { retirement, decisions: decisions.decisions, retirementBytes, decisionsBytes };
}

function deriveQueue(root, projectEvidence) {
  const { retirement, decisions, retirementBytes, decisionsBytes } = loadInputs(root);
  const paths = retirement.allTrackedExecutablePaths;
  if (paths.some((path) => typeof path !== "string")
      || new Set(paths).size !== paths.length
      || paths.some((path, index) => retirement.retirementLedger[index]?.path !== path)) {
    throw new Error("retirement ledger path identity is not exact");
  }
  const pathSet = new Set(paths);
  const decisionMap = new Map();
  let previousPath = "";
  for (const decision of decisions) {
    const wholeFile = decision?.scope === "WHOLE_FILE"
      && Array.isArray(decision?.symbols)
      && decision.symbols.length === 0;
    const scopedSymbols = decision?.scope === "SYMBOLS"
      && decision?.classification === "CANDIDATE"
      && Array.isArray(decision?.symbols)
      && decision.symbols.length > 0
      && decision.symbols.every((symbol, index) => typeof symbol === "string"
        && SYMBOL.test(symbol)
        && (index === 0 || decision.symbols[index - 1] < symbol));
    if (!exactRecord(decision, DECISION_FIELDS)
        || typeof decision.path !== "string"
        || !pathSet.has(decision.path)
        || decisionMap.has(decision.path)
        || (previousPath !== "" && decision.path <= previousPath)
        || !CLASSIFICATIONS.slice(0, 4).includes(decision.classification)
        || typeof decision.reason !== "string"
        || !/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/u.test(decision.reason)
        || !DIGEST.test(decision.evidenceDigest)
        || (!wholeFile && !scopedSymbols)) {
      throw new Error("invalid, duplicate, reordered or unknown conversion decision");
    }
    decisionMap.set(decision.path, decision);
    previousPath = decision.path;
  }
  const twins = new Set(retirement.twinnedPairs);
  const entries = paths.map((path, index) => {
    const ledger = retirement.retirementLedger[index];
    const floor = ledger.dependencyTranche === "T0-compiler" || ledger.declaredFloor === "bounded-bootstrap-floor";
    const decision = decisionMap.get(path);
    if (floor && decision !== undefined) throw new Error(`bootstrap floor override refused: ${path}`);
    if (floor) {
      return { path, package: ledger.package, tranche: ledger.dependencyTranche, classification: "BOOTSTRAP_FLOOR", reason: "FIXPOINT_OR_PLATFORM_EVIDENCE_REQUIRED", evidenceDigest: null };
    }
    if (decision !== undefined) {
      if (decision.scope === "SYMBOLS") {
        return { path, package: ledger.package, tranche: ledger.dependencyTranche, classification: "BLOCKED", reason: "SCOPED_CANDIDATES_ONLY", evidenceDigest: decision.evidenceDigest };
      }
      return { path, package: ledger.package, tranche: ledger.dependencyTranche, classification: decision.classification, reason: decision.reason, evidenceDigest: decision.evidenceDigest };
    }
    return {
      path,
      package: ledger.package,
      tranche: ledger.dependencyTranche,
      classification: "BLOCKED",
      reason: twins.has(path) ? "EXISTING_FUNGI_NOT_CONSUMER_AUTHORITY" : "DOSSIER_REQUIRED",
      evidenceDigest: null,
    };
  });
  const counts = { total: entries.length };
  for (const classification of CLASSIFICATIONS) counts[classification] = entries.filter((entry) => entry.classification === classification).length;
  if (CLASSIFICATIONS.reduce((sum, classification) => sum + counts[classification], 0) !== counts.total
      || new Set(entries.map((entry) => entry.path)).size !== paths.length) {
    throw new Error("conversion queue classification is not conserved");
  }
  const ledgerByPath = new Map(retirement.retirementLedger.map((ledger) => [ledger.path, ledger]));
  const scopedCandidates = decisions
    .filter((decision) => decision.scope === "SYMBOLS")
    .flatMap((decision) => decision.symbols.map((symbol) => {
      const ledger = ledgerByPath.get(decision.path);
      if (ledger === undefined) throw new Error("decision package scope is unknown");
      return {
        product: "galerina",
        package: ledger.package,
        file: decision.path,
        symbol,
        sourceContentDigest: `sha256:${sha256(readFileSync(join(root, ...decision.path.split("/"))))}`,
        reason: decision.reason,
        evidenceDigest: decision.evidenceDigest,
      };
    }));
  return {
    schemaVersion: 3,
    sourceDigest: sha256(retirementBytes),
    decisionsDigest: sha256(decisionsBytes),
    projectCorpusReceiptDigest: projectEvidence.digest,
    counts,
    scopedCandidateCount: scopedCandidates.length,
    scopedCandidateFileCount: new Set(scopedCandidates.map((candidate) => candidate.file)).size,
    scopedCandidates,
    entries,
  };
}

function renderMarkdown(queue) {
  const lines = [
    "# Conserved TypeScript/MJS Conversion Queue",
    "",
    `Source digest: \`${queue.sourceDigest}\``,
    `PROJECT corpus receipt: \`${queue.projectCorpusReceiptDigest}\``,
    "",
    "| Classification | Count |",
    "|---|---:|",
    ...CLASSIFICATIONS.map((name) => `| ${name} | ${queue.counts[name]} |`),
    `| TOTAL | ${queue.counts.total} |`,
    "",
    `Scoped symbol candidates: **${queue.scopedCandidateCount}** across **${queue.scopedCandidateFileCount}** files.`,
    "",
    "A zero candidate count means no source has an evidence-bound admission decision; it does not mean the corpus is complete.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  const { root, mode, projectCorpusReceipt } = parseArgs(process.argv.slice(2));
  const projectEvidence = validateProjectEvidence(root, projectCorpusReceipt);
  const queue = deriveQueue(root, projectEvidence);
  const json = `${JSON.stringify(queue, null, 2)}\n`;
  const markdown = renderMarkdown(queue);
  const outputRoot = join(root, "build", "conversion-queue");
  const outputs = [[join(outputRoot, "queue.json"), json], [join(outputRoot, "QUEUE.md"), markdown]];
  if (mode === "--write") {
    mkdirSync(outputRoot, { recursive: true });
    for (const [path, contents] of outputs) writeFileSync(path, contents);
  } else {
    for (const [path, contents] of outputs) {
      if (readFileSync(path, "utf8") !== contents) throw new Error(`stale conversion queue output: ${path}`);
    }
  }
  console.log(`conversion-queue: ${queue.counts.total}/${queue.counts.total} classified; ${queue.counts.CANDIDATE} whole-file candidates; ${queue.scopedCandidateCount} scoped candidates; ${queue.counts.BLOCKED} blocked`);
}

try {
  main();
} catch (error) {
  console.error(`REFUSED: ${error instanceof Error ? error.message : "unknown conversion queue failure"}`);
  process.exit(1);
}
