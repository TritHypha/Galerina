// S8-R4: crash-cell receipt laws (red first). R1..R4 make the receipt evidence rather than a claim:
// R1 the harness must flag a torn/corrupt recovered state (a disabled STATE_ check would pass any corruption);
// R2 the receipt is bound to the exact harness bytes (sha256) so an edited harness voids it;
// R3 the receipt carries a no-fsync negative control that the harness caught (violations > 0), proving it can fail;
// R4 only the two Q10 backends may be DURABLE, each with points > 0, 0 violations, power-loss replay, and
//    crashCampaignToken 1 (PASSED_ZERO_VIOLATIONS) as classifyDurableAdapter expects; nothing else is DURABLE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evidence, have } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CC = join(HERE, "crashcell.py");

function pyCheck(st, out) {
  const code = "import sys,json;sys.path.insert(0,sys.argv[1]);import crashcell as c;print(json.dumps(c.check(json.loads(sys.argv[3]),sys.argv[2],[])))";
  const r = spawnSync("python3", ["-c", code, HERE, st, JSON.stringify(out)], { encoding: "utf8", timeout: 60000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(r.status, 0, "python3 check() failed: " + r.stderr);
  return JSON.parse(r.stdout.trim());
}

test("S8-R4 R1: the crash-cell harness flags torn and corrupt recovered states", { skip: !have("python3") }, () => {
  assert.ok(pyCheck("TORN", []).includes("STATE_TORN"), "TORN must be a violation");
  assert.ok(pyCheck("CORRUPT", []).includes("STATE_CORRUPT"), "CORRUPT must be a violation");
  assert.deepEqual(pyCheck("Committed", ["RESERVED", "ACK"]), [], "control: committed after ack is clean");
  assert.deepEqual(pyCheck("Indeterminate-Empty", ["RESERVED"]), [], "control: empty O_EXCL reservation is Indeterminate");
});

function receipt() {
  const t = evidence("closure/S8-crashcell-receipt.json");
  assert.notEqual(t, null, "evidence/closure/S8-crashcell-receipt.json missing");
  return JSON.parse(t);
}

test("S8-R4 R2: the receipt is bound to the exact crash-cell harness bytes", () => {
  const j = receipt();
  const sha = createHash("sha256").update(readFileSync(CC)).digest("hex");
  assert.equal(j.harness && j.harness.sha256, sha, "receipt harness.sha256 must equal sha256(crashcell.py)");
});

test("S8-R4 R3: the receipt carries a caught no-fsync negative control", () => {
  const j = receipt();
  const n = j.negativeControl;
  assert.ok(n && n.backend === "file-nosync", "negativeControl.backend file-nosync");
  assert.ok(Number.isInteger(n.violations) && n.violations > 0, "negative control must show violations");
  assert.equal(n.powerloss, true, "negative control ran power-loss replay");
});

test("S8-R4 R4: only the Q10 backends are DURABLE, each measured and tokened", () => {
  const j = receipt();
  const durable = j.adapters.filter((a) => a.durability === "DURABLE");
  assert.deepEqual(durable.map((a) => a.backend).sort(), ["rename-fsync-dirfsync", "sqlite-wal-full"]);
  for (const a of j.adapters) {
    assert.ok(a.durability === "DURABLE" || a.durability === "DELIVERY_UNKNOWN", a.adapter + " durability");
    if (a.durability !== "DURABLE") continue;
    assert.ok(Number.isInteger(a.points) && a.points > 0, a.adapter + " points");
    assert.equal(a.violations, 0, a.adapter + " violations");
    assert.equal(a.powerloss, true, a.adapter + " power-loss replay");
    assert.equal(a.crashCampaignToken, 1, a.adapter + " token PASSED_ZERO_VIOLATIONS");
  }
});