// OPEN-S6-1 D-2 (gcw d2, 2026-10-29): fuse signature + registry gate as one K3 verdict in .fungi.
// TS fuse-loader is frozen reference; this pins the .fungi decision against its rule.
// K3 owner decision 2026-10-26: ALLOW +1, DENY -1, UNKNOWN -128 (0x80) at byte boundaries; codec 0x01/0xFF/0x80,
// any other byte fails closed to UNKNOWN; strong Kleene AND; the gate admits only an exact ALLOW.
// D-2 state (real Ed25519 signature, public half absent) is sigState 2 NO_PUBKEY: UNKNOWN, never admitted
// without the explicit dev override, and always refused under requireSignature.
// Synthetic data only. No signing, no key material.
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
const UNIT = join(MEM, "src", "fuse-signature-gate.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const ALLOW = 1, DENY = -1, UNKNOWN = -128;

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  assert.notEqual(first, -1, "version marker");
  return src.slice(first + marker.length);
}

let FLAT;
function flat() {
  if (FLAT) return FLAT;
  assert.equal(existsSync(UNIT), true, "fuse-signature-gate.fungi missing");
  const parts = readFileSync(UNIT, "utf8").split(CB_IMPORT);
  assert.equal(parts.length, 2, "unit must import c-boundary exactly once");
  const dir = mkdtempSync(join(tmpdir(), "d2fsg-flat-"));
  const file = join(dir, basename(dir) + ".fungi");
  writeFileSync(file, readFileSync(BOUNDARY, "utf8") + "\n" + stripVersion(parts[0] + "\n" + parts[1]));
  FLAT = { dir, file };
  return FLAT;
}
process.on("exit", () => { if (FLAT) rmSync(FLAT.dir, { recursive: true, force: true }); });

function invoke(flow, args) {
  const r = spawnSync(process.execPath, [GALERINA, "run", flat().file, "--invoke", flow, ...args.map(String)], { encoding: "utf8", cwd: REPO, timeout: 120000 });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  assert.ok(m, flow + " invoke value absent: " + text.slice(-400));
  const v = Number(m[1]);
  assert.equal(Number.isSafeInteger(v), true, "invoke value not a safe integer");
  return v;
}

// Frozen-TS oracle (fuse-loader.ts fusePackage Gate 2 + registryAllows): admit iff the manifest verifies,
// or it degraded to unsigned and allowUnsigned is set without requireSignature; INVALID throws; and the
// registry verdict is exactly ok === true (here: byte 0x01).
function tsAdmits(sig, req, allow, regByte) {
  if (sig === 4) return false;
  const sigOk = sig === 0 || (allow === 1 && req !== 1);
  return sigOk && regByte === 1;
}

const args = (sig, req, allow, reg) => [0, sig, 0, req, 0, allow, 0, reg];

test("S6-D2-01 codec: 0x01 ALLOW, 0xFF DENY, 0x80 UNKNOWN (-128), every other byte fails closed to UNKNOWN", () => {
  for (const [b, want] of [[1, ALLOW], [255, DENY], [128, UNKNOWN], [0, UNKNOWN], [2, UNKNOWN], [127, UNKNOWN], [129, UNKNOWN], [254, UNKNOWN]]) {
    assert.equal(invoke("decodeTritByte", [b]), want, "byte " + b);
  }
  assert.equal(invoke("k3Unknown", []), UNKNOWN, "UNKNOWN is -128, never 0");
});

test("S6-D2-02 strong Kleene AND: DENY dominates, only ALLOW x ALLOW is ALLOW, else UNKNOWN", () => {
  const T = [ALLOW, DENY, UNKNOWN, 0];
  for (const a of T) for (const b of T) {
    const want = a === DENY || b === DENY ? DENY : a === ALLOW && b === ALLOW ? ALLOW : UNKNOWN;
    assert.equal(invoke("k3And", [a, b]), want, `k3And(${a},${b})`);
  }
});

test("S6-D2-03 fuseAdmit equals the frozen TS rule over every signature/posture/override combo", () => {
  for (const sig of [0, 1, 2, 3, 4]) for (const req of [0, 1]) for (const allow of [0, 1]) {
    const got = invoke("fuseAdmit", args(sig, req, allow, 1));
    assert.equal(got, tsAdmits(sig, req, allow, 1) ? 1 : 0, `sig ${sig} req ${req} allow ${allow}`);
  }
});

test("S6-D2-04 registry: only the exact ALLOW byte admits a VERIFIED package; DENY and UNKNOWN and junk refuse", () => {
  for (const reg of [255, 128, 0, 2, 127, 129, 254]) {
    assert.equal(invoke("fuseAdmit", args(0, 0, 0, reg)), 0, "registry byte " + reg);
  }
  assert.equal(invoke("fuseVerdict", args(0, 0, 0, 255)), DENY);
  assert.equal(invoke("fuseVerdict", args(0, 0, 0, 128)), UNKNOWN);
  assert.equal(invoke("fuseVerdict", args(0, 0, 0, 1)), ALLOW);
});

test("S6-D2-05 the D-2 state: NO_PUBKEY is UNKNOWN (not DENY, not ALLOW) and refuses with reason 2", () => {
  assert.equal(invoke("fuseVerdict", args(2, 0, 0, 1)), UNKNOWN, "unproven signature is UNKNOWN");
  assert.equal(invoke("fuseAdmit", args(2, 0, 0, 1)), 0);
  assert.equal(invoke("fuseReason", args(2, 0, 0, 1)), 2, "reason no-pubkey");
  assert.equal(invoke("fuseReason", args(2, 1, 1, 1)), 7, "posture beats override");
  assert.equal(invoke("fuseVerdict", args(2, 1, 1, 1)), DENY);
  // strong Kleene: a DENY registry turns the UNKNOWN signature into DENY
  assert.equal(invoke("fuseVerdict", args(2, 0, 0, 255)), DENY);
});

test("S6-D2-06 reasons: absent 1, hybrid 3, invalid 4 (beats override), registry deny 5 / unknown 6, admit 0", () => {
  assert.equal(invoke("fuseReason", args(1, 0, 0, 1)), 1);
  assert.equal(invoke("fuseReason", args(3, 0, 0, 1)), 3);
  assert.equal(invoke("fuseReason", args(4, 0, 1, 1)), 4);
  assert.equal(invoke("fuseReason", args(0, 0, 0, 255)), 5);
  assert.equal(invoke("fuseReason", args(0, 0, 0, 7)), 6);
  assert.equal(invoke("fuseReason", args(0, 1, 0, 1)), 0);
});

test("S6-D2-07 foreign input: any non-SafeInteger class tag or out-of-range value is UNKNOWN, reason 11, never admits", () => {
  for (const a of [[1, 0, 0, 0, 0, 0, 0, 1], [0, 0, 3, 0, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 2, 1], [0, 5, 0, 0, 0, 0, 0, 1], [0, 0, 0, 2, 0, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0, 256], [0, 0, 0, 0, 0, 0, 0, -1], [0, 0, 0, 0, 99, 0, 0, 1]]) {
    assert.equal(invoke("fuseVerdict", a), UNKNOWN, "verdict " + a);
    assert.equal(invoke("fuseAdmit", a), 0, "admit " + a);
    assert.equal(invoke("fuseReason", a), 11, "reason " + a);
  }
});

test("S6-D2-08 source hygiene: no null/NaN, UNKNOWN sentinel is -128, gate compares to exact ALLOW only", () => {
  const src = readFileSync(UNIT, "utf8").replace(/\/\/\/.*$/gm, "");
  assert.equal(/\bnull\b|\bNaN\b/.test(src), false);
  assert.match(src, /return -128/);
  const gate = src.slice(src.indexOf("pure flow fuseAdmit"), src.indexOf("pure flow fuseReason"));
  assert.match(gate, /if v == 1 \{\s*return 1\s*\}\s*return 0/);
  assert.equal(/>=|> 0|!= -1/.test(gate), false, "no ordering or not-deny admission in the gate");
});
