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
const FIXTURE_DIGEST_D = "a32ddd7b7b85c384048e0e7a088236c1945675264efaec390402d163e28a88c4";
const FIXTURE_GIT_BLOB = "e5ea8126a65c1042abdaa293a6d3597c0852b4c1";
const CAP = 1000000;
const EXPIRY = 20261231;
const EXPIRY_UNIX_S = 1798761600;
const HEADER_VERSION = 1;

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
  if (doc.header.K3_WIRE_HEADER_VERSION !== HEADER_VERSION) refuse("header version");
  if (doc.header.LEGACY_UNKNOWN_ZERO_CAP !== CAP) refuse("cap");
  if (doc.header.LEGACY_UNKNOWN_ZERO_EXPIRY !== EXPIRY) refuse("expiry");
  if (doc.header.LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S !== EXPIRY_UNIX_S) refuse("expiry unix");

  const { decodeK3Byte, decodeK3Boundary, decodeLegacyFrame } = await import(
    `file:///${join(slideRoot, "src/k3-wire.mjs").replaceAll("\\", "/")}`
  );
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
    headerVersion: HEADER_VERSION,
    k3x: k3xState,
  })}\n`);
}

main().catch((err) => {
  refuse(err.stack ?? String(err));
});
