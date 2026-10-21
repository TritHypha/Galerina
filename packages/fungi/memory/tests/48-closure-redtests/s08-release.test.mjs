// S8 (1415-T7, RETRY, KG07, CP4): reserve/commit idempotency and an ALICE-style crash campaign.
// Q10 ruling: durability is claimed only for SQLite WAL synchronous=FULL with verified fsync, or a measured
// local rename+fsync+dir-fsync protocol, after a crash campaign; everything else is DELIVERY_UNKNOWN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { red, have, unitText, evidence } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CAMPAIGN = process.env.Q48_CRASHCELL === "1";

function campaign(mode) {
  const dir = mkdtempSync(join(tmpdir(), "q48cc-"));
  try {
    const r = spawnSync("python3", [join(HERE, "crashcell.py"), mode, join(dir, mode)], { encoding: "utf8", timeout: 600000 });
    const m = (r.stdout || "").match(/CRASHCELL_VIOLATIONS \S+ (\d+)/);
    return m ? Number(m[1]) : -1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("S8 crash-cell control (green, opt-in Q48_CRASHCELL=1): Reserved -> Committed|Indeterminate holds for SQLite WAL FULL and rename+fsync+dir-fsync; the no-fsync control is caught", { skip: !CAMPAIGN || !have("strace") || !have("python3") }, () => {
  assert.equal(campaign("sqlite"), 0, "sqlite WAL synchronous=FULL violations");
  assert.equal(campaign("file"), 0, "rename+fsync+dir-fsync violations");
  assert.ok(campaign("file-nosync") > 0, "negative control must show violations");
});

test("S8 crash cell: the product release store carries a crash-campaign receipt with 0 violations per durable adapter", red("S8", "crash-cell test under SQLite WAL FULL / rename+fsync+dir-fsync"), () => {
  const t = evidence("closure/S8-crashcell-receipt.json");
  assert.notEqual(t, null, "evidence/closure/S8-crashcell-receipt.json missing");
  const j = JSON.parse(t);
  assert.ok(Array.isArray(j.adapters) && j.adapters.length > 0, "adapters[]");
  for (const a of j.adapters) {
    assert.ok(["sqlite-wal-full", "rename-fsync-dirfsync"].includes(a.backend) || a.durability === "DELIVERY_UNKNOWN", a.adapter + " backend");
    if (a.durability === "DURABLE") {
      assert.equal(a.violations, 0, a.adapter + " violations");
      assert.ok(a.points > 0, a.adapter + " crash points");
      assert.equal(a.powerloss, true, a.adapter + " power-loss replay");
    }
  }
});

test("S8 RETRY: reserve/commit idempotency with uncertain reconciliation flows exist (no stranded key)", red("S8", "Q3 reserve/commit + uncertain reconciliation"), () => {
  const t = unitText("release-commit-point");
  for (const n of ["reserve", "commit", "reconcile"]) {
    assert.match(t, new RegExp("pure flow " + n + "\\w*Idempotency\\w*\\("), n + "*Idempotency* flow missing");
  }
});

test("S8 KG-07: the adapter profile admits a durable class only with a crash-campaign token; unmeasured stays DELIVERY_UNKNOWN", red("S8", "KG-07 DELIVERY_UNKNOWN until proven by a crash campaign"), () => {
  const t = unitText("adapter-profile");
  assert.match(t, /DELIVERY_UNKNOWN/);
  assert.match(t, /\bcrashCampaign\w*\s*:\s*Int\b/, "adapter-profile must take a crashCampaign* token before any durable class");
});