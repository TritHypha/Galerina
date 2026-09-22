import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  MAX_INDEX_TERMS_PER_FILE,
  validateStoredIndex,
} from "../src/graph/index-contract.ts";
import { SearchGraph } from "../src/graph/model.ts";
import { loadGraph, loadGraphOutcome, saveGraph } from "../src/graph/store.ts";
import { readFileSync } from "node:fs";

test("boundary policy admits the live node:crypto import", () => {
  const policy = JSON.parse(readFileSync(new URL("../.graph/boundary-policy.json", import.meta.url), "utf8"));
  const store = readFileSync(new URL("../src/graph/store.ts", import.meta.url), "utf8");
  assert.equal(store.includes('from "node:crypto"'), true);
  assert.equal(policy.allowedExternal.includes("node:crypto"), true);
});

function validIndex(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 1,
    createdAt: 1,
    files: [{
      p: "src/a.ts",
      m: 1,
      s: 3,
      t: [["alpha", 1]],
    }],
    ...overrides,
  };
}

async function writeIndex(root: string, value: unknown): Promise<void> {
  await fs.mkdir(path.join(root, ".myco"), { recursive: true });
  await fs.writeFile(
    path.join(root, ".myco", "index.json"),
    JSON.stringify(value),
    "utf8",
  );
}

test("persisted index path traversal is refused before graph construction", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "myco-index-path-"));
  const root = path.join(parent, "root");
  try {
    await fs.writeFile(path.join(parent, "outside.txt"), "needle outside root\n");
    await writeIndex(
      root,
      {
        format: 1,
        createdAt: 1,
        files: [{
          p: "../outside.txt",
          m: 1,
          s: 20,
          t: [["needle", 1]],
        }],
      },
    );

    assert.equal(
      await loadGraph(root),
      null,
      "an escaping path must invalidate the complete advisory index",
    );
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test("persisted index has a closed bounded record shape", async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "myco-index-shape-"));
  try {
    const cases: Array<[string, unknown]> = [
      ["unexpected top-level field", validIndex({ authority: "ALLOW" })],
      ["duplicate file path", validIndex({
        files: [
          { p: "src/a.ts", m: 1, s: 3, t: [["alpha", 1]] },
          { p: "src/a.ts", m: 2, s: 4, t: [["beta", 1]] },
        ],
      })],
      ["duplicate term", validIndex({
        files: [{ p: "src/a.ts", m: 1, s: 3, t: [["alpha", 1], ["alpha", 2]] }],
      })],
      ["non-positive count", validIndex({
        files: [{ p: "src/a.ts", m: 1, s: 3, t: [["alpha", 0]] }],
      })],
      ["unexpected file field", validIndex({
        files: [{ p: "src/a.ts", m: 1, s: 3, t: [["alpha", 1]], allow: true }],
      })],
      ["zero omitted-term count", validIndex({
        files: [{ p: "src/a.ts", m: 1, s: 3, t: [["alpha", 1]], o: 0 }],
      })],
      ["fractional omitted-term count", validIndex({
        files: [{ p: "src/a.ts", m: 1, s: 3, t: [["alpha", 1]], o: 1.5 }],
      })],
      ["excessive omitted-term count", validIndex({
        files: [{
          p: "src/a.ts",
          m: 1,
          s: 3,
          t: [["alpha", 1]],
          o: MAX_INDEX_TERMS_PER_FILE + 1,
        }],
      })],
      ["content-skip and omission marker combined", validIndex({
        files: [{ p: "src/a.ts", m: 1, s: 3, t: [], k: "b", o: 1 }],
      })],
      ["Windows absolute path", validIndex({
        files: [{ p: "C:/secret.txt", m: 1, s: 3, t: [["alpha", 1]] }],
      })],
      ["UNC or backslash path", validIndex({
        files: [{ p: "\\\\host\\share\\secret.txt", m: 1, s: 3, t: [["alpha", 1]] }],
      })],
      ["empty path segment", validIndex({
        files: [{ p: "src//a.ts", m: 1, s: 3, t: [["alpha", 1]] }],
      })],
    ];

    for (const [name, value] of cases) {
      await t.test(name, async () => {
        const root = path.join(parent, name.replaceAll(" ", "-"));
        await writeIndex(root, value);
        assert.equal(await loadGraph(root), null);
      });
    }
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test("valid persisted index round-trips through the graph", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "myco-index-valid-"));
  try {
    await writeIndex(root, validIndex());
    const loaded = await loadGraph(root);
    assert.ok(loaded);
    assert.equal(loaded.graph.fileCount(), 1);
    assert.equal(loaded.graph.filesWithTerm("alpha")?.size, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("name-only content-skip tags round-trip (k=b / k=l) and refuse polluted rows", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "myco-index-skip-"));
  try {
    // Valid name-only binary node.
    await writeIndex(root, {
      format: 1,
      createdAt: 1,
      files: [{ p: "assets/pic.bin", m: 1, s: 99, t: [], k: "b" }],
    });
    const loaded = await loadGraph(root);
    assert.ok(loaded);
    const rec = [...loaded!.graph.files()][0];
    assert.equal(rec?.path, "assets/pic.bin");
    assert.equal(rec?.contentSkip, "binary");
    assert.equal(loaded!.graph.filesWithTerm("anything"), undefined);

    // Terms on a name-only row are hostile — refuse the whole index.
    assert.equal(
      validateStoredIndex({
        format: 1,
        createdAt: 1,
        files: [{ p: "x.bin", m: 1, s: 1, t: [["sneak", 1]], k: "b" }],
      }),
      null,
      "name-only file must not carry term postings",
    );
    // Unknown k value refuses.
    assert.equal(
      validateStoredIndex({
        format: 1,
        createdAt: 1,
        files: [{ p: "x.bin", m: 1, s: 1, t: [], k: "z" }],
      }),
      null,
    );

    // saveGraph preserves k
    const g = new SearchGraph();
    g.setFile("big.dat", 2, 1_000_000, new Map(), "large");
    await saveGraph(root, g);
    const again = await loadGraph(root);
    assert.ok(again);
    assert.equal([...again!.graph.files()][0]?.contentSkip, "large");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("index collection budgets are enforced by the structural validator", () => {
  assert.equal(
    validateStoredIndex(validIndex(), {
      maxFiles: 0,
      maxTermsPerFile: 0,
      maxTermEdges: 0,
    } as never),
    null,
  );
});

test("index bytes are bounded before JSON parsing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "myco-index-bytes-"));
  try {
    await writeIndex(root, validIndex());
    assert.equal(
      await loadGraph(root, { maxIndexBytes: 16 } as never),
      null,
      "a caller may tighten, but never raise, the fixed byte ceiling",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a symlinked index directory cannot redirect cache reads outside the root", async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "myco-index-link-"));
  const root = path.join(parent, "root");
  const outside = path.join(parent, "outside-index");
  try {
    await fs.mkdir(root, { recursive: true });
    await writeIndex(outside, validIndex());
    try {
      await fs.symlink(
        path.join(outside, ".myco"),
        path.join(root, ".myco"),
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        t.skip("host cannot create a directory link for the containment test");
        return;
      }
      throw error;
    }
    assert.equal(await loadGraph(root), null);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test("programmatic graph construction repeats the canonical path gate", () => {
  const graph = new SearchGraph();
  assert.throws(
    () => graph.setFile("../outside.txt", 1, 1, new Map([["needle", 1]])),
    /MYCO-INDEX-PATH/,
  );
});

test("saved index ordering is canonical apart from observational createdAt", async () => {
  const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), "myco-index-order-a-"));
  const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "myco-index-order-b-"));
  try {
    const first = new SearchGraph();
    first.setFile("z.ts", 2, 2, new Map([["zeta", 1], ["alpha", 2]]));
    first.setFile("a.ts", 1, 1, new Map([["beta", 1]]));
    const second = new SearchGraph();
    second.setFile("a.ts", 1, 1, new Map([["beta", 1]]));
    second.setFile("z.ts", 2, 2, new Map([["alpha", 2], ["zeta", 1]]));

    await saveGraph(firstRoot, first);
    await saveGraph(secondRoot, second);
    const firstStored = JSON.parse(
      await fs.readFile(path.join(firstRoot, ".myco", "index.json"), "utf8"),
    );
    const secondStored = JSON.parse(
      await fs.readFile(path.join(secondRoot, ".myco", "index.json"), "utf8"),
    );
    delete firstStored.createdAt;
    delete secondStored.createdAt;
    assert.deepEqual(firstStored, secondStored);
  } finally {
    await fs.rm(firstRoot, { recursive: true, force: true });
    await fs.rm(secondRoot, { recursive: true, force: true });
  }
});

test("canonical persistence order is code-unit based, not host-locale based", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "myco-index-code-unit-"));
  try {
    const graph = new SearchGraph();
    graph.setFile("ä.ts", 2, 2, new Map([["äther", 1], ["zeta", 1]]));
    graph.setFile("z.ts", 1, 1, new Map([["zeta", 1]]));
    await saveGraph(root, graph);
    const stored = JSON.parse(
      await fs.readFile(path.join(root, ".myco", "index.json"), "utf8"),
    );
    assert.deepEqual(stored.files.map((file: { p: string }) => file.p), [
      "z.ts",
      "ä.ts",
    ]);
    assert.deepEqual(
      stored.files[1].t.map((entry: [string, number]) => entry[0]),
      ["zeta", "äther"],
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("saveGraph refuses to write through a linked cache directory", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "myco-unsafe-"));
  const root = path.join(parent, "root");
  const outside = path.join(parent, "outside");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  try {
    await fs.symlink(outside, path.join(root, ".myco"), "dir");
  } catch {
    await fs.rm(parent, { recursive: true, force: true });
    return;
  }
  const graph = new SearchGraph();
  graph.setFile("a.ts", 1, 1, new Map([["alpha", 1]]));
  const saved = await saveGraph(root, graph);
  assert.equal(saved.written, false);
  if (saved.written === false) assert.equal(saved.reason, "unsafe-path");
  const loaded = await loadGraphOutcome(root);
  assert.equal(loaded.status, "unsafe");
  let escapedExists = true;
  try {
    await fs.stat(path.join(outside, "index.json"));
  } catch {
    escapedExists = false;
  }
  assert.equal(escapedExists, false);
  await fs.rm(parent, { recursive: true, force: true });
});
