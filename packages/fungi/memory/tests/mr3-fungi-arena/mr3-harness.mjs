// MR3 harness: flatten secret-arena.fungi with its imports into one temp
// file and invoke a single flow through galerina.mjs. Mirrors the 37-u3
// harness (no TS involved: this pins the .fungi target directly).
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { uniqueFungiFile } from "../_harness/unique-build-name.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
export const REPO = join(MEM, "..", "..", "..");
const BOUNDARY = join(MEM, "src", "c-boundary.fungi");
const RCP = join(MEM, "src", "release-commit-point.fungi");
const PORT = join(MEM, "src", "secret-arena-custodian-port.fungi");
export const UNIT = join(MEM, "src", "secret-arena.fungi");
const GALERINA = join(REPO, "galerina.mjs");
const CB_IMPORT = "\nimport \"./c-boundary.fungi\"\n";
const RCP_IMPORT = "\nimport \"./release-commit-point.fungi\"\n";
const PORT_IMPORT = "\nimport \"./secret-arena-custodian-port.fungi\"\n";

function stripVersion(src) {
  const marker = "@version 1";
  const first = src.indexOf(marker);
  assert.notEqual(first, -1, "version marker");
  return src.slice(first + marker.length);
}

function splitOnce(src, needle, label) {
  const parts = src.split(needle);
  assert.equal(parts.length, 2, label + " import line must occur once");
  return parts[0] + "\n" + parts[1];
}

function flatten(unitSource) {
  const boundary = readFileSync(BOUNDARY, "utf8");
  const rcp = readFileSync(RCP, "utf8");
  const port = readFileSync(PORT, "utf8");
  let rest = unitSource;
  rest = splitOnce(rest, CB_IMPORT, "c-boundary");
  rest = splitOnce(rest, RCP_IMPORT, "release-commit-point");
  rest = splitOnce(rest, PORT_IMPORT, "custodian-port");
  rest = stripVersion(rest);
  const dir = mkdtempSync(join(tmpdir(), "mr3-flat-"));
  const file = uniqueFungiFile(dir);
  writeFileSync(file, boundary + "\n" + stripVersion(rcp) + "\n" + stripVersion(splitOnce(port, CB_IMPORT, "port c-boundary")) + "\n" + rest);
  return { dir, file };
}

function invokeFile(file, flow, args) {
  const argv = [GALERINA, "run", file, "--invoke", flow, ...args.map(String)];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", cwd: REPO, timeout: 120000 });
  const text = (r.stdout || "") + (r.stderr || "");
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/(-?\d+)\s*$/);
  if (!m) return { status: r.status, text, present: false, value: 0 };
  const value = Number(m[1]);
  if (!Number.isSafeInteger(value)) return { status: r.status, text, present: false, value: 0 };
  return { status: r.status, text, present: true, value };
}

let override = null;

export function runFlow(flow, args) {
  const src = override ?? readFileSync(UNIT, "utf8");
  const flat = flatten(src);
  try {
    return invokeFile(flat.file, flow, args);
  } finally {
    rmSync(flat.dir, { recursive: true, force: true });
  }
}

export function expectPacked(r, expected, label) {
  assert.equal(r.status, 0, label + " status " + r.text);
  assert.equal(r.present, true, label + " value absent " + r.text);
  assert.equal(r.value, expected, label + " " + r.text);
}

export function withMutant(needle, next, label, fn) {
  const original = readFileSync(UNIT, "utf8");
  const before = createHash("sha256").update(original, "utf8").digest("hex");
  const parts = original.split(needle);
  assert.equal(parts.length, 2, label + " needle must occur once");
  override = parts[0] + next + parts[1];
  try {
    return fn();
  } finally {
    override = null;
    const after = createHash("sha256").update(readFileSync(UNIT, "utf8"), "utf8").digest("hex");
    assert.equal(after, before, "tracked unit sha256 unchanged");
  }
}

// Defaults are a clean, well-formed reply; each test overrides one field.
export function has(o = {}) {
  return runFlow("arenaHas", [0, o.stateToken ?? 0, 0, o.statusToken ?? 0, 0, o.dataLen ?? 1, 0, o.dataByte ?? 1]);
}

export function status(o = {}) {
  return runFlow("arenaStatus", [0, o.stateToken ?? 0, 0, o.statusToken ?? 0, 0, o.dataLen ?? 1, 0, o.dataByte ?? 0]);
}

export function epoch(o = {}) {
  return runFlow("arenaEpoch", [0, o.stateToken ?? 0, 0, o.statusToken ?? 0, 0, o.dataLen ?? 8, 0, o.epochValue ?? 1, 0, o.lastEpoch ?? 1, 0, o.fenceEpoch ?? 2]);
}

export function putExact(o = {}) {
  return runFlow("arenaPutExact", [
    0, o.stateToken ?? 0, 0, o.nameLen ?? 1, 0, o.valueLen ?? 1, 0, o.maxFrame ?? 64,
    0, o.highBit ?? 0, 0, o.statusToken ?? 0, 0, o.wipeToken ?? 0,
    o.replyLenClass ?? 0, o.replyLen ?? 0, o.replyWipeClass ?? 0, o.replyWipeToken ?? 0,
  ]);
}

export function stateAfter(op, state, packed) {
  return runFlow("arenaStateAfter", [op, state, packed]);
}

export function leaseOpen(o = {}) {
  return runFlow("arenaLeaseOpen", [0, o.stateToken ?? 0, o.liveClass ?? 0, o.liveCount ?? 0]);
}

export function leaseClose(o = {}) {
  return runFlow("arenaLeaseClose", [o.liveClass ?? 0, o.liveCount ?? 1]);
}

export const OP = Object.freeze({ has: 0, status: 1, epoch: 2, use: 3, put: 4, dispose: 5, lease: 6 });
export const ST = Object.freeze({ active: 0, quarantined: 1, disposed: 2, partial: 3 });
