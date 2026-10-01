// index-ceiling.test.ts — aggregate index size is not an arbitrary refusal
// condition; structural, per-file and filesystem safety checks still apply.

import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";

import {
  MAX_INDEX_TERM_LENGTH,
  validateStoredIndex,
} from "../src/graph/index-contract.ts";
import { SearchGraph } from "../src/graph/model.ts";
import {
  INDEX_DIR,
  INDEX_FILE,
  loadGraphOutcome,
  saveGraph,
} from "../src/graph/store.ts";
import { buildIndex, DEFAULT_INDEX_OPTIONS } from "../src/ingest/indexer.ts";

async function tempRoot(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "myco-ceiling-"));
}

function graphWithEdges(edgeCount: number): SearchGraph {
  const graph = new SearchGraph();
  const counts = new Map<string, number>();
  for (let i = 0; i < edgeCount; i += 1) counts.set(`term${i}`, 1);
  graph.setFile("a.txt", 1, 1, counts);
  return graph;
}

test("termEdgeCount tracks forward edges across add, replace and remove", () => {
  const graph = new SearchGraph();
  assert.equal(graph.termEdgeCount(), 0);

  graph.setFile("a.txt", 1, 1, new Map([["x", 1], ["y", 2]]));
  assert.equal(graph.termEdgeCount(), 2);

  graph.setFile("b.txt", 1, 1, new Map([["z", 1]]));
  assert.equal(graph.termEdgeCount(), 3);

  // Replacing a file must not double-count: setFile removes the old node first.
  graph.setFile("a.txt", 2, 2, new Map([["x", 1]]));
  assert.equal(graph.termEdgeCount(), 2);

  graph.removeFile("b.txt");
  assert.equal(graph.termEdgeCount(), 1);

  graph.removeFile("a.txt");
  assert.equal(graph.termEdgeCount(), 0);
});

test("stored-index validation has no fixed aggregate file or term-edge ceiling", () => {
  const files = Array.from({ length: 250_001 }, (_unused, index) => ({
    p: `file-${index}.txt`,
    m: 1,
    s: 0,
    t: [],
  }));
  const manyFiles = validateStoredIndex({ format: 1, createdAt: 1, files });
  assert.equal(manyFiles?.files.length, 250_001);

  const terms = Array.from({ length: 100_000 }, (_unused, index) => [`term-${index}`, 1] as [string, number]);
  const manyEdges = validateStoredIndex({
    format: 1,
    createdAt: 1,
    files: Array.from({ length: 21 }, (_unused, index) => ({
      p: `edge-${index}.txt`,
      m: 1,
      s: 0,
      t: terms,
    })),
  });
  assert.equal(manyEdges?.files.length, 21);
  assert.equal(manyEdges?.files.reduce((sum, file) => sum + file.t.length, 0), 2_100_000);
});

test("saveGraph persists and reloads more than the historical aggregate edge ceiling", async () => {
  const root = await tempRoot();
  const graph = new SearchGraph();
  const terms = new Map<string, number>();
  for (let index = 0; index < 100_000; index += 1) terms.set(`term-${index}`, 1);
  for (let index = 0; index < 21; index += 1) {
    graph.setFile(`edge-${index}.txt`, 1, 0, terms);
  }

  const saved = await saveGraph(root, graph);
  assert.deepEqual(saved, { written: true });
  const loaded = await loadGraphOutcome(root);
  assert.equal(loaded.status, "ok");
  if (loaded.status !== "ok") throw new Error("unreachable — narrowing for types");
  assert.equal(loaded.meta.termCount, 100_000);
  assert.equal(loaded.graph.termEdgeCount(), 2_100_000);
});

test("saveGraph refuses an over-limit direct graph term before writing", async () => {
  const root = await tempRoot();
  const graph = new SearchGraph();
  graph.setFile(
    "a.txt",
    1,
    1,
    new Map([["x".repeat(MAX_INDEX_TERM_LENGTH + 1), 1]]),
  );

  const outcome = await saveGraph(root, graph);
  assert.deepEqual(outcome, { written: false, reason: "invalid-payload" });
  const onDisk = await fs
    .stat(path.join(root, INDEX_DIR, INDEX_FILE))
    .catch(() => undefined);
  assert.equal(onDisk, undefined, "an invalid graph must not create an index file");
});

test("loadGraphOutcome tells ABSENT apart from REJECTED", async () => {
  const root = await tempRoot();

  // Nothing written yet — a genuine first run.
  assert.equal((await loadGraphOutcome(root)).status, "absent");

  // A file that exists but is not a valid index is a refusal, NOT an absence.
  await fs.mkdir(path.join(root, INDEX_DIR), { recursive: true });
  await fs.writeFile(path.join(root, INDEX_DIR, INDEX_FILE), "{ not json", "utf8");
  assert.equal((await loadGraphOutcome(root)).status, "rejected");

  // A structurally invalid index is refused, not absent.
  const invalidIndex = {
    format: 1,
    createdAt: 1,
    files: [
      {
        p: "a.txt",
        m: 1,
        s: 1,
        t: Array.from({ length: 4 }, (_v, i) => [`t${i}`, 1]),
      },
    ],
  };
  invalidIndex.files[0].t[0][1] = 0;
  await fs.writeFile(
    path.join(root, INDEX_DIR, INDEX_FILE),
    JSON.stringify(invalidIndex),
    "utf8",
  );
  const refused = await loadGraphOutcome(root);
  assert.equal(refused.status, "rejected", "a malformed index is refused, not absent");
});

test("loadGraphOutcome reads a valid index beyond the historical 64 MiB ceiling", async () => {
  const root = await tempRoot();
  await fs.mkdir(path.join(root, INDEX_DIR), { recursive: true });
  const payload = JSON.stringify({
    format: 1,
    createdAt: 1,
    files: [{ p: "a.txt", m: 1, s: 1, t: [] }],
  });
  const paddingBytes = 64 * 1024 * 1024 + 1;
  await fs.writeFile(path.join(root, INDEX_DIR, INDEX_FILE), `${" ".repeat(paddingBytes)}${payload}`, "utf8");

  const loaded = await loadGraphOutcome(root);
  assert.equal(loaded.status, "ok");
});

test("loadGraphOutcome treats a non-ENOENT filesystem failure as REJECTED", async () => {
  // An embedded NUL is rejected by the filesystem API before lookup. It is a
  // deterministic cross-platform stand-in for permission and I/O failures:
  // only ENOENT may mean that an index is genuinely absent.
  const outcome = await loadGraphOutcome(`invalid\0root`);
  assert.equal(outcome.status, "rejected");
});

test("CONTROL: a well-formed index loads as ok", async () => {
  const root = await tempRoot();
  await saveGraph(root, graphWithEdges(3));
  const outcome = await loadGraphOutcome(root);
  assert.equal(outcome.status, "ok");
});

test("buildIndex accepts a tree beyond a caller's former aggregate ceiling", async () => {
  const root = await tempRoot();
  // Two files whose combined distinct terms exceed the tightened ceiling.
  await fs.writeFile(path.join(root, "a.txt"), "alpha bravo charlie delta", "utf8");
  await fs.writeFile(path.join(root, "b.txt"), "echo foxtrot golf hotel", "utf8");

  const built = await buildIndex(root, DEFAULT_INDEX_OPTIONS);
  assert.equal(built.stats.files, 2);
  assert.equal(built.graph.termEdgeCount(), 8);
  assert.deepEqual(built.saved, { written: true });
});

test("CONTROL: a normal tree still indexes cleanly", async () => {
  const root = await tempRoot();
  await fs.writeFile(path.join(root, "a.txt"), "alpha bravo charlie delta", "utf8");
  await fs.writeFile(path.join(root, "b.txt"), "echo foxtrot golf hotel", "utf8");

  const built = await buildIndex(root, DEFAULT_INDEX_OPTIONS);
  assert.equal(built.stats.files, 2);
  assert.equal(built.saved.written, true);
});

test("buildIndex writes a reloadable index while preserving boundary terms", async () => {
  const root = await tempRoot();
  const exactLimit = "b".repeat(MAX_INDEX_TERM_LENGTH);
  const overLimit = `${exactLimit}b`;
  await fs.writeFile(
    path.join(root, "a.txt"),
    `alpha ${exactLimit} ${overLimit} omega`,
    "utf8",
  );

  const built = await buildIndex(root, DEFAULT_INDEX_OPTIONS);
  assert.equal(built.saved.written, true);
  assert.equal(built.stats.omittedOverlongTerms, 1);
  assert.equal(built.stats.filesWithOmittedOverlongTerms, 1);
  assert.deepEqual(built.omittedOverlongTermPaths, ["a.txt"]);

  const loaded = await loadGraphOutcome(root);
  assert.equal(loaded.status, "ok", "a freshly written index must load immediately");
  if (loaded.status !== "ok") return;

  const file = loaded.graph.fileByPath("a.txt");
  assert.ok(file, "the indexed file must survive the round trip");
  assert.equal(file.omittedOverlongTerms, 1);
  const stored = loaded.graph.forwardOf(file.id);
  assert.equal(stored?.get("alpha"), 1);
  assert.equal(stored?.get(exactLimit), 1);
  assert.equal(stored?.has(overLimit), false);
  assert.equal(stored?.get("omega"), 1);
  assert.equal(loaded.graph.filesWithTerm(exactLimit)?.has(file.id), true);
  assert.equal(loaded.graph.filesWithTerm("alpha")?.has(file.id), true);
  assert.equal(loaded.meta.omittedOverlongTerms, 1);
  assert.equal(loaded.meta.filesWithOmittedOverlongTerms, 1);

  const rebuilt = await buildIndex(root, DEFAULT_INDEX_OPTIONS);
  assert.equal(rebuilt.stats.unchanged, 1);
  assert.equal(rebuilt.saved.written, true);
  assert.equal((await loadGraphOutcome(root)).status, "ok");
});
