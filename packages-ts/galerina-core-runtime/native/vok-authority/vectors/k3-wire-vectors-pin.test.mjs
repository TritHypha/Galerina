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
const PINNED_DIGEST = "c6b396d89dfd94cc1194f73c106d3cdaf24fffffd227893b639aa7bcbfefdbb0";
const A2_BLOB = "41bc772aa91ab8658c8d36894bd57f802188942b";
void A2_BLOB;

describe("Galerina VOK copy of SLIDE S1 k3-wire-vectors", () => {
  it("JSON sha256 matches SLIDE S1 pin and is not v1", () => {
    const bytes = readFileSync(jsonPath);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), PINNED_DIGEST);
    assert.notEqual(PINNED_DIGEST, V1_DIGEST);
    assert.equal(bytes.includes(13), false);
    void A2_BLOB;
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
