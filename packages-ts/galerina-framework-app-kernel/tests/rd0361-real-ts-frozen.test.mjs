// rd0361-real-ts-frozen.test.mjs: RD-0361 SLIDE track, slice S6b. The frozen reference sets of this
// package's twins were captured from the hand-written spec in the existing rd0361 execution tests
// (oracle differential-spec-capture). This test checks each frozen set against the REAL shipped .ts module,
// through the adapters in tests/fixtures/rd0361-<stem>.real-ts.mjs. Nothing is re-captured: a disagreement
// fails here and is reported (re-capture authority is owner decision D-A, PLAN S7). NON_AUTHORIZING.
//   R1 every frozen export has a real-.ts adapter or a named no-counterpart reason · R2 no adapter error ·
//   R3 real .ts == frozen on every realisable case · R4 planted fault fires on exactly one compared case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { ledgerPin, loadFrozenReference } from "../../../scripts/lib/rd0361-frozen-reference.mjs";
import { checkRealTsAgainstFrozen, plantedRealTsControl } from "../../../scripts/lib/rd0361-real-ts-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const LEDGER_TEXT = readFileSync(join(ROOT, "docs", "security", "rd0361-authoritative-twins.json"), "utf8");
const STEMS = ["route-defaults"];

for (const stem of STEMS) {
  test(`RD-0361 S6b · ${stem}: frozen set == REAL shipped .ts on every realisable case`, async (t) => {
    const fixtures = join(HERE, "fixtures");
    const spec = await import(pathToFileURL(join(fixtures, `rd0361-${stem}.capture.mjs`)).href);
    const realTs = await import(pathToFileURL(join(fixtures, `rd0361-${stem}.real-ts.mjs`)).href);
    const { dir, file } = spec.twin;
    const frozen = loadFrozenReference(join(fixtures, `rd0361-${stem}.frozen.json`), { dir, file, ledgerSha256: ledgerPin(LEDGER_TEXT, dir, file) });
    const r = checkRealTsAgainstFrozen(frozen, realTs);
    t.diagnostic(`${stem}: ${r.compared}/${r.total} frozen cases compared against ${realTs.source}; ${r.skipped} outside the realisable domain`);
    for (const [name, c] of Object.entries(r.perExport)) t.diagnostic(`  ${name}: ${c.compared} compared, ${c.skipped} skipped`);
    assert.deepEqual(r.unadapted, [], "R1: every frozen export has a real-.ts adapter or a named no-counterpart reason");
    assert.deepEqual(r.strayAdapters, [], "R1: no adapter names an export the frozen set does not hold");
    assert.deepEqual(r.idleAdapters, [], "R1: every adapter compares at least one case");
    assert.deepEqual(r.errors, [], "R2: no adapter realisation error");
    assert.equal(r.compared + r.skipped, r.total, "every frozen case is either compared or counted as skipped");
    assert.deepEqual(r.mismatches, [], "R3: the real .ts agrees with every realisable frozen case");
    const planted = plantedRealTsControl(frozen, realTs);
    assert.deepEqual(planted.mismatches, [planted.plantedId], "R4: planted fault fires on exactly one compared case");
  });
}
