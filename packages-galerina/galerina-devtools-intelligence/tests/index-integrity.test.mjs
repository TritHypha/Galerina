// index-integrity.test.mjs — SPORE-INTEL-001 (poisoned-index) + SPORE-INTEL-002 (unsandboxed write).
//
// Proves the .lindex cache is no longer trusted blindly: a tampered index is discarded + re-parsed
// (fail-closed), an HMAC tag is unforgeable without the key, and a path-traversal indexDir is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const { buildIndex, loadIndex, computeIndexIntegrity, verifyIndexIntegrity } =
  await import(pathToFileURL(join(DIST, "index.js")).href);

const LINDEX = "workspace.lindex";
const SAMPLE = `// a governed flow
flow chargeCard(amount: Int) -> Bool
  contract { effects { network.out } }
{
  return true
}
`;

async function tmpWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), "spore-intel-"));
  await writeFile(join(dir, "pay.spore"), SAMPLE, "utf8");
  return dir;
}

test("a freshly built index carries a valid integrity tag and loads", async () => {
  const dir = await tmpWorkspace();
  try {
    const res = await buildIndex(dir);
    assert.ok(res.flowCount >= 1, "expected at least one flow indexed");
    const raw = JSON.parse(await readFile(join(dir, LINDEX), "utf8"));
    assert.ok(typeof raw.integrity === "string" && raw.integrity.startsWith("sha256:"), "index should carry a sha256 integrity tag");
    assert.equal(verifyIndexIntegrity(raw), true);
    const flows = await loadIndex(dir);
    assert.ok(flows.length >= 1, "loadIndex should return the flows for a valid index");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("POISONED INDEX: tampered flows with a STALE integrity tag are discarded (fail-closed), not trusted", async () => {
  const dir = await tmpWorkspace();
  try {
    await buildIndex(dir);
    const idxPath = join(dir, LINDEX);
    const idx = JSON.parse(await readFile(idxPath, "utf8"));
    // attacker fabricates a flow but leaves the integrity tag stale (can't recompute without re-sealing)
    idx.flows.push({ ...idx.flows[0], flowName: "exfiltrate", filePath: idx.flows[0].filePath });
    await writeFile(idxPath, JSON.stringify(idx, null, 2), "utf8");
    const flows = await loadIndex(dir);
    // loadIndex discards the tampered cache -> returns [] (the consumer must re-parse), never the forged flow
    assert.ok(!flows.some((f) => f.flowName === "exfiltrate"), "the fabricated flow must NOT be trusted");
    assert.equal(flows.length, 0, "a tampered index is discarded -> empty (fail-closed), forcing a re-parse");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("verifyIndexIntegrity: any field mutation breaks the tag; a missing tag fails closed", async () => {
  const base = { version: 1, builtAt: "2026-06-24T00:00:00Z", workspaceDir: "/w", flows: [{ flowName: "a", filePath: "/w/a.spore" }], fileHashes: { "/w/a.spore": "abc" }, skippedFiles: 0 };
  const sealed = { ...base, integrity: computeIndexIntegrity(base) };
  assert.equal(verifyIndexIntegrity(sealed), true);
  assert.equal(verifyIndexIntegrity({ ...sealed, flows: [{ flowName: "b", filePath: "/w/a.spore" }] }), false, "mutating a flow breaks the tag");
  assert.equal(verifyIndexIntegrity({ ...sealed, fileHashes: { "/w/a.spore": "DEAD" } }), false, "mutating a fileHash breaks the tag");
  assert.equal(verifyIndexIntegrity(base), false, "no integrity tag → fail-closed");
});

test("HMAC mode: with GALERINA_INDEX_HMAC_KEY the tag is unforgeable without the key", async () => {
  const base = { version: 1, builtAt: "t", workspaceDir: "/w", flows: [], fileHashes: {}, skippedFiles: 0 };
  const prev = process.env.GALERINA_INDEX_HMAC_KEY;
  try {
    process.env.GALERINA_INDEX_HMAC_KEY = "super-secret-key";
    const keyed = computeIndexIntegrity(base);
    assert.ok(keyed.startsWith("hmac-sha256:"), "keyed mode emits an hmac tag");
    assert.equal(verifyIndexIntegrity({ ...base, integrity: keyed }), true);
    // an attacker without the key can only produce a sha256 digest tag → rejected under the key
    delete process.env.GALERINA_INDEX_HMAC_KEY;
    const forgedDigest = computeIndexIntegrity(base); // sha256:...
    process.env.GALERINA_INDEX_HMAC_KEY = "super-secret-key";
    assert.equal(verifyIndexIntegrity({ ...base, integrity: forgedDigest }), false, "a digest tag is rejected when an HMAC key is required");
    // wrong key also fails
    process.env.GALERINA_INDEX_HMAC_KEY = "different-key";
    assert.equal(verifyIndexIntegrity({ ...base, integrity: keyed }), false, "a tag from a different key is rejected");
  } finally {
    if (prev === undefined) delete process.env.GALERINA_INDEX_HMAC_KEY; else process.env.GALERINA_INDEX_HMAC_KEY = prev;
  }
});

test("SPORE-INTEL-002: an indexDir with a '..' path-traversal segment is refused", async () => {
  const dir = await tmpWorkspace();
  try {
    await assert.rejects(
      () => buildIndex(dir, "../../escape"),        // raw traversal segments
      /SPORE-INTEL-002/,
      "a '..'-traversal indexDir must be rejected before any write",
    );
    await assert.rejects(
      () => buildIndex(dir, "cache/../../etc"),     // traversal hidden mid-path
      /SPORE-INTEL-002/,
    );
    // (a deliberate absolute cache dir with no `..` is allowed — proven by main-suite test 11.)
  } finally { await rm(dir, { recursive: true, force: true }); }
});
