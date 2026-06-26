// #146/#179 — CLI integration test for `galerina-pci ledger <egress-dir>`.
// Exercises the post-hoc compliance-report verb wired onto the devtools-pci CLI:
// reads an audit-egress batch, builds the hash-linked report, and appends the
// append-only ledger. Deny-by-default is asserted (an opaque record → deny).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function makeEgressDir() {
  const dir = mkdtempSync(join(tmpdir(), "spore-ledger-"));
  const records = [
    JSON.stringify({ who: "svc-a", what: "charge", effect: "Network", decision: "allow", timestamp: "2026-06-15T10:00:00Z" }),
    JSON.stringify({ who: "svc-b", what: "refund", effect: "Network", decision: "deny", timestamp: "2026-06-15T10:01:00Z" }),
    "opaque-non-json-record", // undeterminable → must fail closed to deny
  ];
  const batch = { seq: 0, count: records.length, prevHash: "0".repeat(64), batchHash: "x".repeat(64), records };
  writeFileSync(join(dir, "audit-egress.jsonl"), JSON.stringify(batch) + "\n");
  return dir;
}

test("ledger — builds report + writes append-only ledger; deny-by-default", () => {
  const dir = makeEgressDir();
  const r = spawnSync(process.execPath, [CLI, "ledger", dir, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.schemaVersion, "spore.compliance-ledger.v1");
  assert.equal(report.entries.length, 3);
  assert.equal(report.allowCount, 1);
  assert.equal(report.denyCount, 2); // explicit deny + opaque record failing closed
  assert.ok(existsSync(join(dir, "compliance-ledger.jsonl")), "compliance-ledger.jsonl written");
});

test("ledger — missing egress-dir arg → usage + exit 1", () => {
  const r = spawnSync(process.execPath, [CLI, "ledger"], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Usage: galerina-pci ledger/);
});

test("ledger — nonexistent dir → empty report, exit 0 (no egress file = nothing to report)", () => {
  const dir = join(tmpdir(), `spore-ledger-absent-${process.pid}`);
  const r = spawnSync(process.execPath, [CLI, "ledger", dir, "--json"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.entries.length, 0);
});
