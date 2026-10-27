import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const jsonPath = join(dir, "k3-wire-vectors.json");
const rowsPath = join(dir, "k3-wire-vectors.rows.txt");
const V1_DIGEST = "af50342a9f547b6523f632a56d45ea2c4b6eec69f35daf4c7b2f03f061d83f83";
const PINNED_DIGEST = "81897035f6bfb4c863ec741ae8ef335709256db3fd6b16bcb4ef9a4edbdc504c";
const S1_BLOB = "811818e0cc516ac486c9edefaade1910f23c50a2";

describe("Galerina VOK copy of SLIDE S1 k3-wire-vectors", () => {
  it("JSON sha256 matches SLIDE S1 pin and is not v1", () => {
    const bytes = readFileSync(jsonPath);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), PINNED_DIGEST);
    assert.notEqual(PINNED_DIGEST, V1_DIGEST);
    assert.equal(bytes.includes(13), false);
    void S1_BLOB;
  });

  it("rows header matches the JSON digest", () => {
    const header = readFileSync(rowsPath, "utf8").split("\n")[0];
    assert.equal(header, `sha256=${PINNED_DIGEST}`);
  });

  it("keeps v1 keys", () => {
    const doc = JSON.parse(readFileSync(jsonPath, "utf8"));
    for (const key of ["comment", "lattice", "toWire", "canonical", "legacy", "legacyNote", "boundaryBareRefused", "invalid"]) {
      assert.ok(key in doc, key);
    }
    assert.deepEqual(doc.legacy, [[0, "UNKNOWN"]]);
    assert.equal(doc.u8.length, 256);
  });
});
