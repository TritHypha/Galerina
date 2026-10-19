import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const EVIDENCE = join(MEM, "evidence", "32-release-commit-point", "ts-differential.txt");
const PIN = "dc0f9c8c4f1365f0228cda213b2ecd001400463e";
const TS_PATH = "packages-ts/galerina-framework-app-kernel/src/release-commit-point.ts";
const TS_SHA = "ab0080fb6efc20937f69f88e85da4d65d37d4e0da634e495753015a9fca9e5b3";

function invoke(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, timeout: 120000 });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/(-?\d+)\s*$/m);
  const value = m ? Number(m[1]) : 0;
  return { status: r.status, text, value };
}

function packed(file, flow, args) {
  const r = invoke(file, flow, args);
  assert.equal(r.status, 0, flow + " " + r.text);
  return r.value;
}

test("F5 TS pin sha256 and differential rows from invoked fungi values", async () => {
  const shown = spawnSync("git", ["show", PIN + ":" + TS_PATH], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 2_000_000,
  });
  assert.equal(shown.status, 0, shown.stderr);
  const sha = createHash("sha256").update(shown.stdout, "utf8").digest("hex");
  assert.equal(sha, TS_SHA);

  const dir = mkdtempSync(join(tmpdir(), "q32-05-ts-"));
  const tsFile = join(dir, "release-commit-point.ts");
  writeFileSync(tsFile, shown.stdout);
  try {
    const ts = await import(pathToFileURL(tsFile).href);
    const auth = new ts.ReleaseCommitAuthority();
    const helperNaN = ts.readForeignSafeInteger(Number.NaN);
    const helperOk = ts.readForeignSafeInteger(4);
    assert.equal(helperNaN.ok, false);
    assert.equal(helperOk.ok, true);
    assert.equal(helperOk.value, 4);

    const id = auth.issueLeaseId();
    const minted = auth.mint(id, 1);
    assert.equal(typeof minted.token, "string");
    const first = auth.consume(id, minted.token, 1);
    assert.equal(first, "released");
    const second = auth.consume(id, minted.token, 1);
    assert.equal(second, "replay");

    let missingKind = "";
    try {
      auth.mint("", 1);
    } catch (e) {
      missingKind = e && e.outcome ? String(e.outcome) : "threw";
    }
    assert.equal(missingKind, "missing");

    const eq = ts.bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]));
    const ne = ts.bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]));
    assert.equal(eq, true);
    assert.equal(ne, false);

    const rows = [
      { row: "CN-1 helper NaN", ts: "ok=false", fungi: packed(BOUNDARY, "readForeignSafeInteger", [3, 0]), expect: 3, verdict: "PRESERVED" },
      { row: "CN-1 helper ok 4", ts: "ok=true value=4", fungi: packed(BOUNDARY, "readForeignSafeInteger", [0, 4]), expect: 0, verdict: "PRESERVED" },
      { row: "mint fresh", ts: "credentials", fungi: packed(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 1, 0, 1, 0]), expect: 100, verdict: "PRESERVED" },
      { row: "mint absent id", ts: "refused missing", fungi: packed(RCP, "mintAdmit", [0, 0, 1, 0, 0, 0, 1, 0, 1, 0]), expect: 105, verdict: "PRESERVED" },
      { row: "mint NaN epoch", ts: "refused stale", fungi: packed(RCP, "mintAdmit", [1, 3, 0, 0, 0, 0, 1, 0, 1, 0]), expect: 111, verdict: "INTENDED_DIVERGENCE" },
      { row: "mint epoch -1", ts: "refused stale", fungi: packed(RCP, "mintAdmit", [1, 0, -1, 0, 0, 0, 1, 0, 1, 0]), expect: 104, verdict: "PRESERVED" },
      { row: "mint in-flight unused", ts: "refused replay", fungi: packed(RCP, "mintAdmit", [1, 0, 1, 1, 0, 0, 1, 0, 1, 1]), expect: 103, verdict: "PRESERVED" },
      { row: "mint reissue existing terminal", ts: "credentials same-shape-return", fungi: packed(RCP, "mintAdmit", [1, 0, 1, 1, 1, 0, 1, 0, 1, 1]), expect: 107, verdict: "INTENDED_DIVERGENCE" },
      { row: "consume first matching", ts: "released", fungi: packed(RCP, "consumeStep", [1, 1, 0, 1, 0, 0, 100]), expect: 100, verdict: "PRESERVED" },
      { row: "consume second", ts: "replay", fungi: packed(RCP, "consumeStep", [1, 1, 0, 1, 1, 0, 100]), expect: 103, verdict: "PRESERVED" },
      { row: "consume forged unused", ts: "stale", fungi: packed(RCP, "consumeStep", [1, 0, 0, 1, 0, 0, 100]), expect: 102, verdict: "INTENDED_DIVERGENCE" },
      { row: "consume forged released", ts: "stale", fungi: packed(RCP, "consumeStep", [1, 0, 0, 1, 1, 0, 100]), expect: 104, verdict: "PRESERVED" },
      { row: "ack released with epoch", ts: "acknowledged", fungi: packed(RCP, "ackStep", [1, 1, 1, 0, 1, 1, 1]), expect: 101, verdict: "PRESERVED" },
      { row: "ack omitted epoch", ts: "acknowledged", fungi: packed(RCP, "ackStep", [1, 1, 0, 0, 1, 1, 1]), expect: 104, verdict: "INTENDED_DIVERGENCE" },
      { row: "ack wrong epoch", ts: "stale", fungi: packed(RCP, "ackStep", [1, 1, 1, 0, 0, 1, 1]), expect: 104, verdict: "PRESERVED" },
      { row: "status unused live", ts: "DELIVERY_UNKNOWN", fungi: packed(RCP, "classifyRecovery", [1, 0, 0, 0]), expect: 103, verdict: "PRESERVED" },
      { row: "status absent", ts: "NOT_FOUND", fungi: packed(RCP, "classifyRecovery", [0, 0, 0, 0]), expect: 104, verdict: "PRESERVED" },
      { row: "revokeDelivery acked", ts: "DELIVERY_UNKNOWN", fungi: packed(RCP, "revokeDelivery", [2]), expect: 106, verdict: "PRESERVED" },
      { row: "revokeDelivery released no-op", ts: "RELEASED_UNACKED", fungi: packed(RCP, "revokeDelivery", [1]), expect: 108, verdict: "INTENDED_DIVERGENCE" },
      { row: "bytesEqual equal", ts: "true", fungi: packed(RCP, "bytesEqualScan", [4, 4, 0, 4]), expect: 100, verdict: "NEEDS_LANGUAGE" },
      { row: "bytesEqual length", ts: "false", fungi: packed(RCP, "bytesEqualScan", [4, 3, 0, 4]), expect: 101, verdict: "NEEDS_LANGUAGE" },
      { row: "bytesEqual mismatch", ts: "false", fungi: packed(RCP, "bytesEqualScan", [4, 4, 1, 4]), expect: 101, verdict: "NEEDS_LANGUAGE" },
      { row: "TS instanceNonce fallback", ts: "mint succeeds with u4-auth-N when crypto.randomUUID absent", fungi: packed(RCP, "mintAdmit", [1, 0, 1, 0, 0, 0, 0, 0, 1, 0]), expect: 102, verdict: "INTENDED_DIVERGENCE" },
      { row: "TS ack has no auditCommitted gate", ts: "ack after consume returns acknowledged", fungi: packed(RCP, "ackStep", [1, 1, 1, 0, 1, 1, 0]), expect: 106, verdict: "INTENDED_DIVERGENCE" },
    ];

    let i = 0;
    while (i < rows.length) {
      const row = rows[i];
      assert.equal(row.fungi, row.expect, row.row + " fungi=" + String(row.fungi));
      const listed = row.verdict === "PRESERVED" || row.verdict === "INTENDED_DIVERGENCE" || row.verdict === "NEEDS_LANGUAGE";
      assert.equal(listed, true, row.row + " unlisted verdict");
      i = i + 1;
    }

    const evidence = readFileSync(EVIDENCE, "utf8");
    i = 0;
    while (i < rows.length) {
      const row = rows[i];
      const needle = row.row + " | " + String(row.fungi) + " | " + row.verdict;
      assert.equal(evidence.includes(needle), true, "evidence missing " + needle);
      i = i + 1;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
