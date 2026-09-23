import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

const dist = join(dirname(fileURLToPath(import.meta.url)), "../dist/index.js");
const { buildIndex } = await import(pathToFileURL(dist).href);

test("hostile: workspace nesting above 24 is refused", async () => {
  const root = await mkdtemp(join(tmpdir(), "intel-depth-"));
  try {
    let current = root;
    for (let i = 0; i < 25; i++) {
      current = join(current, `d${i}`);
      await mkdir(current);
    }
    await writeFile(join(current, "x.fungi"), "pure flow f() -> Int { 1 }\n", "utf8");
    await assert.rejects(() => buildIndex(root), /FUNGI-INTEL-003.*nesting/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hostile: a .fungi file above 1 MiB is refused before parse", async () => {
  const root = await mkdtemp(join(tmpdir(), "intel-size-"));
  try {
    await writeFile(join(root, "big.fungi"), "x".repeat(1_048_576 + 1), "utf8");
    await assert.rejects(() => buildIndex(root), /FUNGI-INTEL-003.*exceeds/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
