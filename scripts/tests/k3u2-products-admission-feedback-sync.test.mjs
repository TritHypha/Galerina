// K3U2 (K3-UNKNOWN-NOT-ZERO, owner decision D-A, Phillip 2026-10-25 18:28 GMT):
// the native product copy of the admission-feedback twin under packages/fungi/products
// must carry the same bytes as the authoritative self-hosted twin, and its committed
// build must be the exact WebAssembly the RD-0361 authority ledger pins. A stale product
// copy that still folds an undecided degrade to trit 0 is a fail-open twin.
// Zero-trust: every lookup must resolve to exactly one entry, otherwise the test fails.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const at = (p) => join(ROOT, p);
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const TWIN_DIR = "packages-ts/galerina-core-network/src/self-hosted";
const TWIN = `${TWIN_DIR}/admission-feedback.fungi`;
const PROD_DIR = "packages/fungi/products/galerina-core-network";
const PROD = `${PROD_DIR}/admission-feedback.fungi`;
const BUILD = `${PROD_DIR}/build/admission-feedback`;
const OUT_EXTS = [".wasm", ".wat", ".lmanifest", ".lmanifest.json", ".governance-impact.json"];

function collect(node, pred, hits) {
  if (Array.isArray(node)) { for (const v of node) collect(v, pred, hits); return hits; }
  if (node && typeof node === "object") {
    if (pred(node)) hits.push(node);
    for (const v of Object.values(node)) collect(v, pred, hits);
  }
  return hits;
}

function ledgerPin() {
  const ledger = JSON.parse(readFileSync(at("docs/security/rd0361-authoritative-twins.json"), "utf8"));
  const hits = collect(ledger, (o) => o.file === "admission-feedback.fungi" && o.dir === TWIN_DIR, []);
  assert.equal(hits.length, 1, "exactly one authority-ledger entry for the admission-feedback twin");
  assert.match(hits[0].sha256, /^[0-9a-f]{64}$/);
  return hits[0].sha256;
}

function regenRecord() {
  const recs = JSON.parse(readFileSync(at("build/fungi-build-regeneration-records.json"), "utf8"));
  const hits = recs.filter((r) => r && r.source === PROD);
  assert.equal(hits.length, 1, "exactly one regeneration record for the product copy");
  return hits[0];
}

test("K3UP-R1 product copy is byte-identical to the authoritative self-hosted twin", () => {
  assert.equal(sha(readFileSync(at(PROD))), sha(readFileSync(at(TWIN))));
});

test("K3UP-R2 product copy never folds an undecided degrade to trit 0", () => {
  const src = readFileSync(at(PROD), "utf8");
  assert.doesNotMatch(src, /vAnd\(\s*v\s*,\s*0\s*\)/, "undecided degrade folded to trit 0");
  assert.doesNotMatch(src, /INDETERMINATE\s*=\s*0/, "header still documents INDETERMINATE = 0");
  assert.match(src, /pure flow k3Unknown\(\) -> Int[\s\S]*?return -128/, "native UNKNOWN sentinel -128 present");
  assert.equal((src.match(/vAnd\(v, k3Unknown\(\)\)/g) || []).length, 3, "all three undecided degrades use k3Unknown()");
});

test("K3UP-R3 committed product WebAssembly is exactly the ledger-pinned build", () => {
  assert.equal(sha(readFileSync(at(`${BUILD}.wasm`))), ledgerPin());
});

test("K3UP-R4 product manifests bind the current product source, by relative path", () => {
  const srcHash = `sha256:${sha(readFileSync(at(PROD)))}`;
  for (const ext of [".lmanifest.json", ".governance-impact.json"]) {
    const m = JSON.parse(readFileSync(at(`${BUILD}${ext}`), "utf8"));
    assert.equal(m.sourceHash, srcHash, `${ext} sourceHash`);
    assert.equal(m.sourceFile, "admission-feedback.fungi", `${ext} sourceFile is relative`);
  }
});

test("K3UP-R5 regeneration record matches every committed product output", () => {
  const rec = regenRecord();
  assert.equal(rec.status, "PASS");
  assert.equal(rec.outputs.length, OUT_EXTS.length);
  for (const ext of OUT_EXTS) {
    const rel = `${BUILD}${ext}`;
    const hits = rec.outputs.filter((o) => String(o.path).replace(/\\/g, "/") === rel);
    assert.equal(hits.length, 1, `exactly one record output for ${rel}`);
    const buf = readFileSync(at(rel));
    assert.equal(hits[0].sha256, sha(buf), `${ext} sha256`);
    assert.equal(hits[0].bytes, buf.length, `${ext} bytes`);
  }
  const wasm = rec.outputs.find((o) => String(o.path).endsWith(".wasm"));
  assert.equal(wasm.sha256, ledgerPin(), "recorded wasm equals the ledger pin");
});