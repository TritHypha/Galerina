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
const FIXTURE_DIGEST_D = "b0630214072db4e0b41b0cce25fdc28ded527e6d7e2fa8010865f1a09ca1b0c6";
const FIXTURE_GIT_BLOB = "cfd47704b808ff2e39309e4eda0a557729168e9a";
const CAP = 1000000;
const EXPIRY = 20261231;
const EXPIRY_UNIX_S = 1798761600;
const FRAME_HEADER_VERSION = 1;
const FIXTURE_SCHEMA_VERSION = 15;

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
    k3WireAnd,
    k3WireAnd3,
    k3WireGate,
    k3WireNot,
    k3WireOr,
    decodeK3PackageFrame,
    decodeK3PackageGate,
    decodeK3PackageGateResolved,
    resolveK3PackageCarrier,
    carrierArtifactFromSpec,
    k3WireVersionsAgree,
    absentCarrierFallbackReads,
    verifyK3WireVersionCarrier,
    verifyReceiptK3AlertEvidence,
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
  if ((doc.strongKleeneAnd ?? []).length !== 9) {
    refuse("strongKleeneAnd must have 9 rows");
    return;
  }
  for (const [a, b, e] of doc.strongKleeneAnd) {
    if (k3WireAnd(a, b) !== e) {
      refuse(`strongKleeneAnd ${a} ${b}`);
      return;
    }
  }
  if ((doc.strongKleeneOr ?? []).length !== 9) {
    refuse("strongKleeneOr must have 9 rows");
    return;
  }
  for (const [a, b, e] of doc.strongKleeneOr) {
    if (k3WireOr(a, b) !== e) {
      refuse(`strongKleeneOr ${a} ${b}`);
      return;
    }
  }
  if ((doc.strongKleeneNot ?? []).length !== 3) {
    refuse("strongKleeneNot must have 3 rows");
    return;
  }
  for (const [a, e] of doc.strongKleeneNot) {
    if (k3WireNot(a) !== e) {
      refuse(`strongKleeneNot ${a}`);
      return;
    }
  }
  let gateUnknown = false;
  for (const [a, e] of doc.strongKleeneGate ?? []) {
    if (k3WireGate(a) !== e) {
      refuse(`strongKleeneGate ${a}`);
      return;
    }
    if (a === -128 && e === -1) gateUnknown = true;
  }
  if (!gateUnknown) {
    refuse("gate(UNKNOWN) must refuse");
    return;
  }
  if ((doc.strongKleeneDenySticky ?? []).length !== 27) {
    refuse("strongKleeneDenySticky must have 27 rows");
    return;
  }
  const binding = doc.receiptBinding ?? [];
  if (binding.length !== 5) {
    refuse(`receiptBinding must have 5 rows, got ${binding.length}`);
    return;
  }
  const kinds = binding.map((row) => row.kind).join(",");
  if (kinds !== "without-field,with-field,tampered-digest,wrong-schema,wrong-version") {
    refuse(`receiptBinding kinds ${kinds}`);
    return;
  }
  for (const row of binding) {
    const got = verifyReceiptK3AlertEvidence(row.snapshot, row.field);
    const admit = row.expect === "ADMIT";
    if (got.ok !== admit) {
      refuse(`receiptBinding ${row.id} ok=${got.ok} expect ${row.expect}`);
      return;
    }
    if (!admit && row.code && got.code !== row.code) {
      refuse(`receiptBinding ${row.id} code ${got.code} != ${row.code}`);
      return;
    }
  }
  const carriers = doc.wireVersionCarrier ?? [];
  if (carriers.length !== 5) {
    refuse(`wireVersionCarrier must have 5 rows, got ${carriers.length}`);
    return;
  }
  const carrierKinds = carriers.map((row) => row.kind).join(",");
  if (carrierKinds !== "agree,disagree,missing,unknown-version,legacy-bridge") {
    refuse(`wireVersionCarrier kinds ${carrierKinds}`);
    return;
  }
  for (const row of carriers) {
    const got = verifyK3WireVersionCarrier(row.carrier, row.header);
    const admit = row.expect === "ADMIT";
    if (got.ok !== admit) {
      refuse(`wireVersionCarrier ${row.id} ok=${got.ok} expect ${row.expect}`);
      return;
    }
    if (row.code && got.code !== row.code) {
      refuse(`wireVersionCarrier ${row.id} code ${got.code} != ${row.code}`);
      return;
    }
  }
  const artifactFrames = doc.packageArtifactFrames ?? [];
  if (artifactFrames.length !== 5) {
    refuse(`packageArtifactFrames must have 5 rows, got ${artifactFrames.length}`);
    return;
  }
  const artifactKinds = artifactFrames.map((row) => row.kind).join(",");
  if (artifactKinds !== "agree,disagree,missing-carrier,unknown-version,legacy-bridge") {
    refuse(`packageArtifactFrames kinds ${artifactKinds}`);
    return;
  }
  for (const row of artifactFrames) {
    const got = decodeK3PackageFrame(row.artifact, row.frame);
    const admit = row.expect === "ADMIT";
    if (got.ok !== admit) {
      refuse(`packageArtifactFrames ${row.id} ok=${got.ok} expect ${row.expect}`);
      return;
    }
    if (!admit && row.code && got.code !== row.code) {
      refuse(`packageArtifactFrames ${row.id} code ${got.code} != ${row.code}`);
      return;
    }
  }
  const artifactGates = doc.packageArtifactGates ?? [];
  if (artifactGates.length !== 11) {
    refuse(`packageArtifactGates must have 11 rows, got ${artifactGates.length}`);
    return;
  }
  const gateKinds = artifactGates.map((row) => row.kind).join(",");
  if (
    gateKinds
    !== "canonical-allow,canonical-deny,canonical-unknown,canonical-bare0,legacy-allow,legacy-deny,legacy-unknown,legacy-bare0,mismatched,unknown-carrier,absent-fallback"
  ) {
    refuse(`packageArtifactGates kinds ${gateKinds}`);
    return;
  }
  for (const row of artifactGates) {
    const got = row.kind === "mismatched"
      ? decodeK3PackageFrame(row.artifact, row.frame)
      : decodeK3PackageGate(row.artifact, row.value);
    const admit = row.expect === "ADMIT";
    if (got.ok !== admit) {
      refuse(`packageArtifactGates ${row.id} ok=${got.ok} expect ${row.expect}`);
      return;
    }
    if (admit && row.trit !== undefined && got.trit !== row.trit) {
      refuse(`packageArtifactGates ${row.id} trit ${got.trit} != ${row.trit}`);
      return;
    }
    if (!admit && row.code && got.code !== row.code) {
      refuse(`packageArtifactGates ${row.id} code ${got.code} != ${row.code}`);
      return;
    }
  }
  const specRows = doc.descriptorSpecCarriers ?? [];
  if (specRows.length !== 5) {
    refuse(`descriptorSpecCarriers must have 5 rows, got ${specRows.length}`);
    return;
  }
  const specKinds = specRows.map((row) => row.kind).join(",");
  if (
    specKinds
    !== "legacy-bare0-unknown,canonical-bare0-invalid,mismatch-frame-header,unknown-carrier,absent-fallback-once"
  ) {
    refuse(`descriptorSpecCarriers kinds ${specKinds}`);
    return;
  }
  for (const row of specRows) {
    const artifact = carrierArtifactFromSpec(row.spec);
    if (row.kind === "mismatch-frame-header") {
      const got = decodeK3PackageFrame(artifact, row.frame);
      if (got.ok) {
        refuse(`descriptorSpecCarriers ${row.id} expected REFUSE`);
        return;
      }
      if (row.code && got.code !== row.code) {
        refuse(`descriptorSpecCarriers ${row.id} code ${got.code} != ${row.code}`);
        return;
      }
      continue;
    }
    if (row.kind === "absent-fallback-once") {
      const before = absentCarrierFallbackReads();
      const resolved = resolveK3PackageCarrier(artifact);
      for (const value of row.values) {
        const got = decodeK3PackageGateResolved(resolved, value);
        if (!got.ok || (row.trit !== undefined && got.trit !== row.trit)) {
          refuse(`descriptorSpecCarriers ${row.id} value ${value}`);
          return;
        }
      }
      const delta = absentCarrierFallbackReads() - before;
      if (delta !== row.count) {
        refuse(`descriptorSpecCarriers ${row.id} count ${delta} != ${row.count}`);
        return;
      }
      continue;
    }
    const got = decodeK3PackageGate(artifact, row.value);
    const admit = row.expect === "ADMIT";
    if (got.ok !== admit) {
      refuse(`descriptorSpecCarriers ${row.id} ok=${got.ok} expect ${row.expect}`);
      return;
    }
    if (admit && row.trit !== undefined && got.trit !== row.trit) {
      refuse(`descriptorSpecCarriers ${row.id} trit ${got.trit} != ${row.trit}`);
      return;
    }
    if (!admit && row.code && got.code !== row.code) {
      refuse(`descriptorSpecCarriers ${row.id} code ${got.code} != ${row.code}`);
      return;
    }
  }
  const compilerRows = doc.compilerRequestCarriers ?? [];
  if (compilerRows.length !== 5) {
    refuse(`compilerRequestCarriers must have 5 rows, got ${compilerRows.length}`);
    return;
  }
  const compilerKinds = compilerRows.map((row) => row.kind).join(",");
  if (
    compilerKinds
    !== "compiler-absent,compiler-canonical,compiler-unknown,compiler-legacy-bare0,compiler-canonical-bare0"
  ) {
    refuse(`compilerRequestCarriers kinds ${compilerKinds}`);
    return;
  }
  for (const row of compilerRows) {
    const artifact = carrierArtifactFromSpec(row.spec);
    if (row.kind === "compiler-absent") {
      const before = absentCarrierFallbackReads();
      const resolved = resolveK3PackageCarrier(artifact);
      const got = decodeK3PackageGateResolved(resolved, row.value);
      if (!got.ok || (row.trit !== undefined && got.trit !== row.trit)) {
        refuse(`compilerRequestCarriers ${row.id}`);
        return;
      }
      const delta = absentCarrierFallbackReads() - before;
      if (delta !== row.count) {
        refuse(`compilerRequestCarriers ${row.id} count ${delta} != ${row.count}`);
        return;
      }
      continue;
    }
    const got = decodeK3PackageGate(artifact, row.value);
    const admit = row.expect === "ADMIT";
    if (got.ok !== admit) {
      refuse(`compilerRequestCarriers ${row.id} ok=${got.ok} expect ${row.expect}`);
      return;
    }
    if (admit && row.trit !== undefined && got.trit !== row.trit) {
      refuse(`compilerRequestCarriers ${row.id} trit ${got.trit} != ${row.trit}`);
      return;
    }
    if (!admit && row.code && got.code !== row.code) {
      refuse(`compilerRequestCarriers ${row.id} code ${got.code} != ${row.code}`);
      return;
    }
  }
  const loaderRows = doc.loaderCarrierBindings ?? [];
  if (loaderRows.length !== 4) {
    refuse(`loaderCarrierBindings must have 4 rows, got ${loaderRows.length}`);
    return;
  }
  const loaderKinds = loaderRows.map((row) => row.kind).join(",");
  if (loaderKinds !== "match,mismatch,absent-both,tampered") {
    refuse(`loaderCarrierBindings kinds ${loaderKinds}`);
    return;
  }
  for (const row of loaderRows) {
    const agree = k3WireVersionsAgree(row.left, row.right);
    if (agree !== (row.expect === "AGREE")) {
      refuse(`loaderCarrierBindings ${row.id} agree=${agree} expect ${row.expect}`);
      return;
    }
  }
  const stepZRows = doc.stepZDryRun ?? [];
  if (stepZRows.length !== 3) {
    refuse(`stepZDryRun must have 3 rows, got ${stepZRows.length}`);
    return;
  }
  const stepZKinds = stepZRows.map((row) => row.kind).join(",");
  if (stepZKinds !== "bridge-off-legacy-0,fallback-off-absent,canonical-unknown") {
    refuse(`stepZDryRun kinds ${stepZKinds}`);
    return;
  }
  for (const row of stepZRows) {
    const artifact = carrierArtifactFromSpec(row.spec);
    const got = decodeK3PackageGate(artifact, row.value, {
      fallback: row.fallback,
      legacyUnknownZeroBridge: row.legacyUnknownZeroBridge,
    });
    const admit = row.expect === "ADMIT";
    if (got.ok !== admit) {
      refuse(`stepZDryRun ${row.id} ok=${got.ok} expect ${row.expect}`);
      return;
    }
    if (admit && row.trit !== undefined && got.trit !== row.trit) {
      refuse(`stepZDryRun ${row.id} trit ${got.trit} != ${row.trit}`);
      return;
    }
    if (!admit && row.code && got.code !== row.code) {
      refuse(`stepZDryRun ${row.id} code ${got.code} != ${row.code}`);
      return;
    }
  }
  for (const [a, b, c, e] of doc.strongKleeneDenySticky) {
    if (k3WireAnd3(a, b, c) !== e) {
      refuse(`strongKleeneDenySticky ${a} ${b} ${c}`);
      return;
    }
  }
  const kleeneReaders = {
    js: countReaders(join(slideRoot, "src"), ["function k3WireAnd"]),
    rust: countReaders(join(galerinaRoot, "packages-ts/galerina-core-runtime/native/vok-authority/src"), ["fn k3_wire_and"]),
    fungi: countReaders(join(galerinaRoot, "packages-ts/galerina-core-logic/src/self-hosted"), ["pure flow k3WireAnd"]),
  };
  if (kleeneReaders.js["function k3WireAnd"] < 1 || kleeneReaders.rust["fn k3_wire_and"] < 1 || kleeneReaders.fungi["pure flow k3WireAnd"] < 1) {
    refuse(`kleene three-way missing ${JSON.stringify(kleeneReaders)}`);
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
    kleeneThreeWay: true,
    receiptBinding: true,
    wireVersionCarrier: true,
    packageArtifactFrames: true,
    packageArtifactGates: true,
    descriptorSpecCarriers: true,
    compilerRequestCarriers: true,
    loaderCarrierBindings: true,
    stepZDryRun: true,
  })}\n`);
}

main().catch((err) => {
  refuse(err.stack ?? String(err));
});
