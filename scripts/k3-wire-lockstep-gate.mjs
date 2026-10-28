#!/usr/bin/env node
// K3 wire lock-step gate.
// Usage: node scripts/k3-wire-lockstep-gate.mjs --slide-root=PATH
// or set SLIDE_ROOT. N-b: --slide-root=PATH / SLIDE_ROOT is required.
// N-a: k3x UNKNOWN(not invoked) is acceptable; Grok Bot runs K3X.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SEED = 0x4b335701;
const FUZZ_BYTES = 256;
const FUZZ_I32 = 65536;
const FUZZ_FRAMES = 65536;
const FIXTURE_DIGEST_D = "7c9844171b207ac897b2238e58a9c8063a3d67f1c04ef9cb8757469db888cd63";
const FIXTURE_GIT_BLOB = "03232fb0922639c535881a27e55d17d6d62708c3";
const CAP = 1000000;
const EXPIRY = 20261231;
const EXPIRY_UNIX_S = 1798761600;
const FRAME_HEADER_VERSION = 1;
const FIXTURE_SCHEMA_VERSION = 7;

const galerinaRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const galerinaJson = join(
  galerinaRoot,
  "packages-ts/galerina-core-runtime/native/vok-authority/vectors/k3-wire-vectors.json",
);
const galerinaRows = join(
  galerinaRoot,
  "packages-ts/galerina-core-runtime/native/vok-authority/vectors/k3-wire-vectors.rows.txt",
);

function refuse(message) {
  process.stderr.write(`REFUSED: ${message}\n`);
  process.exitCode = 1;
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function argValue(name) {
  const prefix = `${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : process.env.SLIDE_ROOT ?? "";
}

function xorshift32(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x >>>= 0;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

function toI32(u) {
  return u | 0;
}

function listMjs(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) listMjs(p, acc);
    else if (name.name.endsWith(".mjs") || name.name.endsWith(".js") || name.name.endsWith(".rs") || name.name.endsWith(".fungi")) {
      acc.push(p);
    }
  }
  return acc;
}

function countReaders(root, needles) {
  const found = {};
  for (const needle of needles) found[needle] = 0;
  for (const file of listMjs(root)) {
    const text = readFileSync(file, "utf8");
    for (const needle of needles) {
      if (text.includes(needle)) found[needle] += 1;
    }
  }
  return found;
}

async function main() {
  const slideRoot = argValue("--slide-root");
  if (!slideRoot) {
    refuse("pass --slide-root=... or SLIDE_ROOT");
    return;
  }
  const slideJson = join(slideRoot, "tests/fixtures/k3-wire-vectors.json");
  const slideRows = join(slideRoot, "tests/fixtures/k3-wire-vectors.rows.txt");
  const gJson = readFileSync(galerinaJson);
  const sJson = readFileSync(slideJson);
  const gRows = readFileSync(galerinaRows);
  const sRows = readFileSync(slideRows);
  const gD = sha256Hex(gJson);
  const sD = sha256Hex(sJson);
  if (gD !== FIXTURE_DIGEST_D) {
    refuse(`Galerina fixture sha256 ${gD} != D ${FIXTURE_DIGEST_D}`);
    return;
  }
  if (sD !== FIXTURE_DIGEST_D) {
    refuse(`SLIDE fixture sha256 ${sD} != D ${FIXTURE_DIGEST_D}`);
    return;
  }
  if (Buffer.compare(gJson, sJson) !== 0 || Buffer.compare(gRows, sRows) !== 0) {
    refuse("Galerina and SLIDE fixtures are not byte-identical");
    return;
  }
  const header = gRows.toString("utf8").split("\n")[0];
  if (header !== `sha256=${FIXTURE_DIGEST_D}`) {
    refuse(`rows header ${header}`);
    return;
  }
  const doc = JSON.parse(gJson.toString("utf8"));
  if (doc.header.K3_WIRE_HEADER_VERSION !== FRAME_HEADER_VERSION) refuse("frame header version");
  if (doc.header.FIXTURE_SCHEMA_VERSION !== FIXTURE_SCHEMA_VERSION) refuse("fixture schema version");
  if (doc.header.vectorsVersion !== FIXTURE_SCHEMA_VERSION) refuse("vectorsVersion alias");
  if (doc.header.LEGACY_UNKNOWN_ZERO_CAP !== CAP) refuse("cap");
  if (doc.header.LEGACY_UNKNOWN_ZERO_EXPIRY !== EXPIRY) refuse("expiry");
  if (doc.header.LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S !== EXPIRY_UNIX_S) refuse("expiry unix");

  const {
    decodeK3Byte,
    decodeK3Boundary,
    decodeLegacyFrame,
    k3ParseSerialInstantUnixS,
    k3SerialWindowContains,
    k3UnixSToYmd,
    k3WasiRealtimeNsToUnixS,
    k3AlertEvidence,
  } = await import(
    `file:///${join(slideRoot, "src/k3-wire.mjs").replaceAll("\\", "/")}`
  );
  const pin = k3ParseSerialInstantUnixS("2026-10-27T15:45Z");
  if (pin !== 1793115900) {
    refuse(`serial pin ${pin} != 1793115900`);
    return;
  }
  if (k3ParseSerialInstantUnixS("2026-10-27T15:45:00Z") !== 1793115900) {
    refuse("serial hms pin");
    return;
  }
  if (Number.isFinite(k3ParseSerialInstantUnixS("2026-10-27T15:45:00+00:00"))) {
    refuse("serial offset must fail closed");
    return;
  }
  if (k3SerialWindowContains("2026-10-27T15:45Z", "2026-10-27T15:46Z", 1793115900) !== true) {
    refuse("serial window start inclusive");
    return;
  }
  if (k3SerialWindowContains("2026-10-27T15:45Z", "2026-10-27T15:46Z", 1793115960) !== false) {
    refuse("serial window end exclusive");
    return;
  }
  if (k3WasiRealtimeNsToUnixS(1793059200000000000n) !== 1793059200) {
    refuse("wasi open ns");
    return;
  }
  if (Number.isFinite(k3WasiRealtimeNsToUnixS(9223372036854775808n))) {
    refuse("wasi overflow must fail closed");
    return;
  }
  if (decodeLegacyFrame(1, 1798761599, 0, 1793059200, 0).label !== "UNKNOWN") {
    refuse("frame-epoch last open");
    return;
  }
  if (decodeLegacyFrame(1, 1798761600, 0, 1793059200, 0).label !== "LEGACY_CLOSED") {
    refuse("frame-epoch at expiry");
    return;
  }
  if (decodeLegacyFrame(1, 1793059200, 0, 1793059200, 0, false).label !== "LEGACY_CLOSED") {
    refuse("sunset dry-run bridge=false must close");
    return;
  }
  if (decodeLegacyFrame(1, 1793059200, 0, 1793059200, 0, 2).label !== "LEGACY_CLOSED") {
    refuse("strict bridge=2 must close");
    return;
  }
  if (decodeLegacyFrame(1, 1793059200, 0, 1793059200, 0, -1).label !== "LEGACY_CLOSED") {
    refuse("strict bridge=-1 must close");
    return;
  }
  if (decodeLegacyFrame(1, 1793059200, 0, 1793059200, 0, 1).label !== "LEGACY_CLOSED") {
    refuse("strict bridge number 1 must close");
    return;
  }
  if (decodeLegacyFrame(1, 1793059200, 0, 1793059200, 0, "true").label !== "LEGACY_CLOSED") {
    refuse("strict bridge string true must close");
    return;
  }
  if (decodeLegacyFrame(1, 1793059200, 0, 1793059200, 0, null).label !== "LEGACY_CLOSED") {
    refuse("strict bridge null must close");
    return;
  }
  for (const row of doc.alertEvidence ?? []) {
    const got = k3AlertEvidence({
      tallies: row.tallies,
      recentCount: row.recentCount,
      dropped: row.dropped,
      frameHeaderVersion: row.frameHeaderVersion,
    });
    if (!got.ok || got.record.digest !== row.digest) {
      refuse(`alert evidence digest ${row.id}`);
      return;
    }
  }
  if ((doc.alertEvidence ?? []).length < 4) {
    refuse("alert evidence rows missing");
    return;
  }
  if (k3UnixSToYmd(1798761599) !== 20261231 || k3UnixSToYmd(1798761600) !== 20270101 || k3UnixSToYmd(1793115900) !== 20261027) {
    refuse("display ymd pins");
    return;
  }
  if (Number.isFinite(k3UnixSToYmd(0))) {
    refuse("display ymd out-of-window must fail closed");
    return;
  }
  const unknown = decodeLegacyFrame(99, 0, 0, 1793059200, 0);
  if (unknown.label !== "INVALID") {
    refuse("unknown header version did not fail closed");
    return;
  }

  const galReaders = countReaders(join(galerinaRoot, "packages-ts/galerina-core-logic/src/self-hosted"), ["k3DecodeByte"]);
  const vokReaders = countReaders(join(galerinaRoot, "packages-ts/galerina-core-runtime/native/vok-authority/src"), ["decode_wire_u8"]);
  const slideReaders = countReaders(join(slideRoot, "src"), ["decodeK3Byte"]);
  if (galReaders.k3DecodeByte < 1 || vokReaders.decode_wire_u8 < 1 || slideReaders.decodeK3Byte < 1) {
    refuse(`u8 reader missing gal=${JSON.stringify(galReaders)} vok=${JSON.stringify(vokReaders)} slide=${JSON.stringify(slideReaders)}`);
    return;
  }

  for (let b = 0; b < FUZZ_BYTES; b += 1) decodeK3Byte(b);
  const rand = xorshift32(SEED);
  for (let i = 0; i < FUZZ_I32; i += 1) decodeK3Boundary(toI32(rand()));
  for (let i = 0; i < FUZZ_FRAMES; i += 1) {
    decodeLegacyFrame(toI32(rand()) & 3, toI32(rand()), toI32(rand()), toI32(rand()), rand() % (CAP + 3));
  }
  void SEED;

  const k3x = process.env.K3X_SCRIPT ?? "";
  let k3xState = "UNKNOWN(not invoked)";
  if (k3x && existsSync(k3x)) {
    execFileSync(process.execPath, [k3x], { stdio: "inherit" });
    k3xState = "invoked";
  }

  process.stdout.write(`${JSON.stringify({
    verdict: "LOCKSTEP_GREEN",
    D: FIXTURE_DIGEST_D,
    blob: FIXTURE_GIT_BLOB,
    seed: `0x${SEED.toString(16)}`,
    fuzz: { bytes: FUZZ_BYTES, i32: FUZZ_I32, frames: FUZZ_FRAMES },
    cap: CAP,
    expiry: EXPIRY,
    expiryUnixS: EXPIRY_UNIX_S,
    fixtureSchemaVersion: FIXTURE_SCHEMA_VERSION,
    frameHeaderVersion: FRAME_HEADER_VERSION,
    k3x: k3xState,
    fungiEvidence: "UNKNOWN(fungi-cannot-sha256-alert-evidence)",
  })}\n`);
}

main().catch((err) => {
  refuse(err.stack ?? String(err));
});
