// S6-R2 (closure path S6, RD-1413 O2/O3): Fungi query-custody verdict for POST /auth/verify. RED FIRST (gcw-s6c, 2026-10-23).
// Zero-trust choice: /auth/verify takes a CLOSED query schema {object, version}, exact decoded byte names.
// Any other name (v, OBJECT, %4FBJECT -> OBJECT) refuses; it is never aliased or case-folded onto a known name,
// because alias/fold tables are a second decider that can disagree with the provider. Repeats refuse.
// The host only COUNTS exact-name matches over the raw ordered pair custody it received and reports whether
// the flat Record equals those pairs; the Fungi flow decides. A Record with no pair custody is UNKNOWN -> refuse.
// Rejected: (a) alias v->version / case-fold (second decider, widens surface);
// (b) TS admitQueryOnce as sole decider (frozen TS, single decider);
// (c) re-derive from the Record (repeats already erased, absence unprovable).
// Contract: admitQueryCustody(custodyClass, custodyToken, objectClass, objectCount, versionClass, versionCount,
//   unknownClass, unknownCount, recordClass, recordToken) -> Int
//   custodyToken 0 present 1 absent; counts are SafeInteger >= 0; recordToken 0 equal 1 differs.
//   Returns 0 admit, 1 custody-absent (UNKNOWN), 2 duplicate, 3 unknown-name, 4 record-mismatch, 11 foreign/unlisted.
//   Precedence: foreign input 11, then custody 1, then unknown 3, then duplicate 2, then record 4. Never 0 on any fault.
// Synthetic data only.
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const UNIT = join(MEM, "src", "query-custody.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  assert.notEqual(first, -1, "version marker");
  return src.slice(first + marker.length);
}

function flatten() {
  assert.equal(existsSync(UNIT), true, "query-custody.fungi missing: " + UNIT);
  const unit = readFileSync(UNIT, "utf8");
  const parts = unit.split(CB_IMPORT);
  assert.equal(parts.length, 2, "unit must import c-boundary exactly once");
  const dir = mkdtempSync(join(tmpdir(), "s6qc-flat-"));
  const file = join(dir, basename(dir) + ".fungi");
  writeFileSync(file, readFileSync(BOUNDARY, "utf8") + "\n" + stripVersion(parts[0] + "\n" + parts[1]));
  return { dir, file };
}

function invoke(file, args) {
  const r = spawnSync(process.execPath, [GALERINA, "run", file, "--invoke", "admitQueryCustody", ...args.map(String)], { encoding: "utf8", cwd: REPO, timeout: 120000 });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  assert.ok(m, "invoke value absent: " + text.slice(-400));
  const v = Number(m[1]);
  assert.equal(Number.isSafeInteger(v), true, "invoke value not a safe integer");
  return v;
}

// [label, custodyClass, custodyToken, objectClass, objectCount, versionClass, versionCount, unknownClass, unknownCount, recordClass, recordToken, expected]
const VECTORS = [
  ["admit object+version", 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
  ["admit object only", 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  ["admit empty query", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ["Record-only, no custody", 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1],
  ["custody absent beats every other fault", 0, 1, 0, 2, 0, 2, 0, 3, 0, 1, 1],
  ["object repeated", 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2],
  ["version repeated", 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2],
  ["unknown name (v / OBJECT)", 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 3],
  ["unknown beats duplicate", 0, 0, 0, 2, 0, 0, 0, 1, 0, 0, 3],
  ["Record differs from custody", 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 4],
  ["custody token unlisted", 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 11],
  ["record token unlisted", 0, 0, 0, 1, 0, 0, 0, 0, 0, 7, 11],
  ["negative object count", 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 11],
  ["negative unknown count", 0, 0, 0, 0, 0, 0, 0, -1, 0, 0, 11],
  ["foreign NaN class on version count", 0, 0, 0, 1, 3, 0, 0, 0, 0, 0, 11],
  ["foreign Null class on custody", 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 11],
  ["foreign Absent class on record", 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 11],
  ["unlisted class tag", 0, 0, 99, 1, 0, 0, 0, 0, 0, 0, 11],
];

test("S6-R2a admitQueryCustody closed sum: admit only with custody, exact closed names, no repeats, Record equal", () => {
  const { dir, file } = flatten();
  try {
    for (const v of VECTORS) {
      const got = invoke(file, v.slice(1, 11));
      assert.equal(got, v[11], v[0]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("S6-R2b no fault vector ever admits; typed UNKNOWN only in the unit", () => {
  for (const v of VECTORS) {
    const fault = v[1] !== 0 || v[2] !== 0 || v[3] !== 0 || v[5] !== 0 || v[7] !== 0 || v[9] !== 0 || v[4] > 1 || v[4] < 0 || v[6] > 1 || v[6] < 0 || v[8] !== 0 || v[10] !== 0;
    if (fault) assert.notEqual(v[11], 0, "vector table self-check: " + v[0]);
  }
  const src = existsSync(UNIT) ? readFileSync(UNIT, "utf8") : "";
  assert.notEqual(src, "", "query-custody.fungi missing");
  assert.equal(/\bnull\b|\bNaN\b/.test(src.replace(/\/\/\/.*$/gm, "")), false, "typed UNKNOWN only: no null or NaN in code");
});