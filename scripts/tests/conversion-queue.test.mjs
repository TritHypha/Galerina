import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { aggregateCorpusReceipts } from "../lib/fungi-corpus-receipt.mjs";
import { deriveCorpusShards } from "../lib/fungi-corpus-shards.mjs";

const TOOL = join(import.meta.dirname, "..", "conversion-queue.mjs");
const digest = "a".repeat(64);
const limits = { maxFiles: 8, maxBytes: 1_048_576, timeoutMs: 10_000, maxOutputBytes: 65_536 };

function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, timeout: 10_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function write(root, relativePath, contents) {
  const path = join(root, ...relativePath.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function makeRoot(decisions = []) {
  const root = mkdtempSync(join(tmpdir(), "galerina-conversion-queue-"));
  const paths = ["packages/a/src/a.ts", "packages/a/src/b.mjs", "packages/b/src/c.ts", "packages/b/src/d.js"];
  const ledger = paths.map((path, index) => ({
    path,
    package: index < 2 ? "a" : "b",
    dependencyTranche: index === 0 ? "T0-compiler" : "T3-package-graph",
    declaredFloor: index === 1 ? "bounded-bootstrap-floor" : null,
  }));
  const retirement = { allTrackedExecutablePaths: paths, retirementLedger: ledger, twinnedPairs: [paths[2]] };
  write(root, "build/ts-retirement/ts-retirement.json", `${JSON.stringify(retirement)}\n`);
  write(root, "governance/conversion-queue-decisions.json", `${JSON.stringify({ schemaVersion: 2, decisions })}\n`);
  for (const path of paths) write(root, path, `export const fixture = "${path}";\n`);
  const fungiPath = "packages/fungi/products/galerina/fixture/fixture.fungi";
  write(root, fungiPath, "@version 1\npure flow fixture() -> Int { return 1 }\n");
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "Queue Fixture"]);
  git(root, ["config", "user.email", "queue@example.invalid"]);
  git(root, ["add", "--", "build/ts-retirement/ts-retirement.json", "governance/conversion-queue-decisions.json", "packages"]);
  git(root, ["commit", "--quiet", "-m", "fixture"]);
  const head = git(root, ["rev-parse", "HEAD"]);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"]);
  const request = {
    schema: "galerina.fungi-corpus-request.v2",
    profile: "PROJECT",
    productId: "galerina",
    repositoryHead: head,
    repositoryTree: tree,
    compilerDigest: canonicalDigest({ compiler: "fixture" }),
    fileSetDigest: canonicalDigest({ files: [fungiPath] }),
    shardCount: 1,
    files: [{
      path: fungiPath,
      digest: canonicalDigest("@version 1\npure flow fixture() -> Int { return 1 }\n"),
      expectationDigest: canonicalDigest({ expected: [] }),
      mode: "plain",
    }],
  };
  writeProjectEvidence(root, request);
  return root;
}

function projectEvidence(root, request, mutate = (value) => value) {
  const shardsResult = deriveCorpusShards(request, limits);
  assert.equal(shardsResult.kind, "accepted");
  const shard = shardsResult.value[0];
  const completed = shard.files.map((file) => ({ ...file, resultDigest: canonicalDigest({ path: file.path, ok: true }) }));
  const receiptBase = {
    schema: "galerina.fungi-corpus-shard-receipt.v2",
    shardId: shard.shardId,
    shardDigest: canonicalDigest(shard),
    requestDigest: shard.requestDigest,
    startIndex: shard.startIndex,
    endIndexExclusive: shard.endIndexExclusive,
    status: "PASS",
    termination: "COMPLETE",
    completed,
    unprocessed: [],
  };
  const receipt = { ...receiptBase, resultDigest: canonicalDigest(receiptBase) };
  const aggregate = aggregateCorpusReceipts(request, shardsResult.value, [receipt]);
  assert.equal(aggregate.kind, "accepted");
  const base = {
    schema: "galerina.fungi-corpus-evidence.v1",
    request,
    limits,
    run: {
      schema: "galerina.fungi-corpus-run.v2",
      receipts: [receipt],
      aggregate: aggregate.value,
    },
  };
  const changed = mutate(structuredClone(base));
  return { ...changed, digest: canonicalDigest(changed) };
}

function writeProjectEvidence(root, request, mutate) {
  const relative = "build/fungi-corpus-check/evidence/project.json";
  write(root, relative, `${JSON.stringify(projectEvidence(root, request, mutate))}\n`);
  return relative;
}

function readRequest(root) {
  const receipt = JSON.parse(readFileSync(join(root, "build", "fungi-corpus-check", "evidence", "project.json"), "utf8"));
  return receipt.request;
}

function run(root, mode, receipt = "build/fungi-corpus-check/evidence/project.json", env = process.env) {
  return spawnSync(process.execPath, [TOOL, mode, "--root", root, "--project-corpus-receipt", receipt], {
    encoding: "utf8",
    shell: false,
    timeout: 10_000,
    env,
  });
}

test("queue v3 conserves every executable path and binds only the PROJECT evidence digest", () => {
  const root = makeRoot();
  assert.equal(run(root, "--write").status, 0);
  const queue = JSON.parse(readFileSync(join(root, "build", "conversion-queue", "queue.json"), "utf8"));
  assert.equal(queue.schemaVersion, 3);
  assert.equal(queue.counts.total, 4);
  assert.equal(queue.counts.BOOTSTRAP_FLOOR, 2);
  assert.equal(queue.counts.BLOCKED, 2);
  assert.equal(queue.counts.CANDIDATE, 0);
  assert.match(queue.projectCorpusReceiptDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.hasOwn(queue, "projectCorpusReceipt"), false);
  assert.equal(queue.entries.length, new Set(queue.entries.map((entry) => entry.path)).size);
  assert.equal(run(root, "--check").status, 0);
});

test("repository identity ignores ambient Git redirection", () => {
  const root = makeRoot();
  const env = { ...process.env, GIT_DIR: join(root, "missing-git-directory") };
  assert.equal(run(root, "--write", undefined, env).status, 0);
});

test("symbol candidates carry exact product, package, file and symbol scope", () => {
  const root = makeRoot([{
    path: "packages/b/src/d.js",
    scope: "SYMBOLS",
    symbols: ["alphaDecision", "betaDecision"],
    classification: "CANDIDATE",
    reason: "BOUNDED_PURE_LEAF_DOSSIER",
    evidenceDigest: digest,
  }]);
  assert.equal(run(root, "--write").status, 0);
  const queue = JSON.parse(readFileSync(join(root, "build", "conversion-queue", "queue.json"), "utf8"));
  assert.deepEqual(queue.scopedCandidates.map(({ product, package: packageName, file, symbol }) => ({
    product, package: packageName, file, symbol,
  })), [
    { product: "galerina", package: "b", file: "packages/b/src/d.js", symbol: "alphaDecision" },
    { product: "galerina", package: "b", file: "packages/b/src/d.js", symbol: "betaDecision" },
  ]);
  assert.equal(queue.entries[3].classification, "BLOCKED");
  assert.equal(queue.entries[3].reason, "SCOPED_CANDIDATES_ONLY");
});

test("missing, stale, wrong-profile, product-mismatched and non-PASS corpus evidence refuses", () => {
  const root = makeRoot();
  const request = readRequest(root);
  const cases = [
    ["build/fungi-corpus-check/evidence/missing.json", null],
    [null, (value) => ({ ...value, request: { ...value.request, repositoryHead: "0".repeat(40) } })],
    [null, (value) => ({ ...value, request: { ...value.request, profile: "WORKSET" } })],
    [null, (value) => ({ ...value, request: { ...value.request, productId: "trametes" } })],
    [null, (value) => ({ ...value, run: { ...value.run, aggregate: { ...value.run.aggregate, status: "FINDING" } } })],
  ];
  for (const [path, mutate] of cases) {
    if (mutate !== null) writeProjectEvidence(root, request, mutate);
    assert.equal(run(root, "--write", path ?? undefined).status, 1);
  }
});

test("invalid, incomplete, duplicate and digest-mismatched PROJECT evidence refuses", () => {
  const root = makeRoot();
  const request = readRequest(root);
  for (const mutate of [
    (value) => ({ ...value, surplus: true }),
    (value) => ({ ...value, run: { ...value.run, receipts: [] } }),
    (value) => ({ ...value, run: { ...value.run, receipts: [...value.run.receipts, value.run.receipts[0]] } }),
    (value) => ({ ...value, limits: { ...value.limits, maxFiles: 0 } }),
  ]) {
    writeProjectEvidence(root, request, mutate);
    assert.equal(run(root, "--write").status, 1);
  }
  const path = join(root, "build", "fungi-corpus-check", "evidence", "project.json");
  const evidence = projectEvidence(root, request);
  writeFileSync(path, `${JSON.stringify({ ...evidence, digest: canonicalDigest({ foreign: true }) })}\n`);
  assert.equal(run(root, "--write").status, 1);
});

test("unknown, duplicate, reordered, unscoped and bootstrap-floor decisions refuse", () => {
  const candidate = { scope: "WHOLE_FILE", symbols: [], classification: "CANDIDATE", reason: "DOSSIER", evidenceDigest: digest };
  for (const decisions of [
    [{ path: "missing.ts", ...candidate }],
    [{ path: "packages/b/src/d.js", ...candidate }, { path: "packages/b/src/d.js", ...candidate }],
    [{ path: "packages/b/src/d.js", ...candidate }, { path: "packages/b/src/c.ts", ...candidate }],
    [{ path: "packages/b/src/d.js", ...candidate, scope: undefined }],
    [{ path: "packages/a/src/a.ts", ...candidate }],
  ]) {
    const normalized = decisions.map((decision) => Object.fromEntries(Object.entries(decision).filter(([, value]) => value !== undefined)));
    assert.equal(run(makeRoot(normalized), "--write").status, 1);
  }
});

test("malformed and product-mismatched symbol scopes refuse", () => {
  const base = {
    path: "packages/b/src/d.js",
    scope: "SYMBOLS",
    symbols: ["alphaDecision"],
    classification: "CANDIDATE",
    reason: "DOSSIER",
    evidenceDigest: digest,
  };
  for (const decision of [
    { ...base, symbols: [] },
    { ...base, symbols: ["betaDecision", "alphaDecision"] },
    { ...base, symbols: ["alphaDecision", "alphaDecision"] },
    { ...base, symbols: ["not-a-symbol"] },
    { ...base, classification: "BLOCKED" },
    { ...base, scope: "WHOLE_FILE" },
    { ...base, path: "packages/a/src/a.ts" },
  ]) assert.equal(run(makeRoot([decision]), "--write").status, 1);
});
