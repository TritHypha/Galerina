// rd0361-cors-policy-frozen.test.mjs: RD-0361 SLIDE track. The cors-policy twin is checked against its
// hash-pinned FROZEN REFERENCE SET (schema v2, shared loader scripts/lib/rd0361-frozen-reference.mjs).
// Additive: the existing rd0361 execution test still runs unchanged and the `.ts` still decides at runtime.
// Oracle: differential-spec-capture: the reference spec copied verbatim from the existing rd0361 execution test (not the real .ts; a real-.ts adapter is required before S13). NON_AUTHORIZING.
//   F0 built WASM hash == ledger pin == frozen pin · F1 #105 requireSigned admission · F2 WASM == frozen,
//   N of N compared · F3 reference oracle == frozen · F4 planted fault fires on exactly one case.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { checkFrozenTwin } from "../../../scripts/lib/rd0361-frozen-reference.mjs";
import * as spec from "./fixtures/rd0361-cors-policy.capture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const COMPILER = join(ROOT, "packages-ts", "galerina-core-compiler", "dist", "index.js");
const LEDGER = join(ROOT, "docs", "security", "rd0361-authoritative-twins.json");

test("RD-0361 frozen reference · cors-policy: WASM == frozen == reference oracle; planted fault fires", async () => {
  assert.ok(existsSync(COMPILER), "galerina-core-compiler dist not built: build the compiler first");
  const L = await import(pathToFileURL(COMPILER).href);
  const r = await checkFrozenTwin(L, {
    root: ROOT, spec, ledgerText: readFileSync(LEDGER, "utf8"),
    fixturePath: join(HERE, "fixtures", "rd0361-cors-policy.frozen.json"),
  });
  assert.equal(r.wasmSha256, r.pin, "F0: built WASM hashes to the authority-ledger pin");
  assert.deepEqual(r.wasm.mismatches, [], "F2: admitted WASM equals the frozen set");
  assert.equal(r.wasm.compared, r.caseCount, "F2: N cases, N compared, 0 skipped");
  assert.deepEqual(r.reference.mismatches, [], "F3: the reference oracle reproduces the frozen set");
  assert.equal(r.reference.compared, r.caseCount, "F3: N cases, N compared, 0 skipped");
  assert.ok(r.distinctExpected >= 2, "frozen set holds more than one verdict");
  assert.deepEqual(r.planted.mismatches.map((m) => m.id), [r.plantedId], "F4: planted fault fires on exactly one case");
});
