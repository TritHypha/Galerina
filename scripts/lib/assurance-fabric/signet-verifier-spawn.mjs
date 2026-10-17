import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { types as utilTypes } from "node:util";

const VERIFY_SCHEMA = "galerina.signet.verify.v1";
const MAX_VERIFY_BYTES = 16_384;
const HEX64 = /^[a-f0-9]{64}$/u;
const HEX128 = /^[a-f0-9]{128}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;

const GRANT_STATEMENT_KEYS = Object.freeze([
  "action",
  "envelopeDigest",
  "epoch",
  "expiryUnixMs",
  "grantId",
  "issuedAtUnixMs",
  "issuerKeyId",
  "kind",
  "profileDigest",
  "schemaVersion",
  "signature",
  "subjectId",
]);
const SEAL_STATEMENT_KEYS = Object.freeze([
  "action",
  "authentication",
  "authorizing",
  "envelopeDigest",
  "epoch",
  "grantId",
  "kind",
  "profileDigest",
  "replayable",
  "schemaVersion",
  "signature",
  "subjectId",
  "terminalOutcome",
]);

let sealedSpawnCount = 0;

export function resetSealedSpawnCount() {
  sealedSpawnCount = 0;
}

export function takeSealedSpawnCount() {
  const n = sealedSpawnCount;
  sealedSpawnCount = 0;
  return n;
}

function refuse(reason, status = 2) {
  return { trit: -1, reason, authorizing: false, status };
}

function exactOrdinary(value, expectedKeys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
      || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) {
    return false;
  }
  const actual = keys.map(String).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    return false;
  }
  return true;
}

export function validateVerifyRequest({ publicKeyHex, statement }) {
  if (typeof publicKeyHex !== "string" || !HEX64.test(publicKeyHex)) {
    return refuse("HEADER_PUBLIC_KEY");
  }
  if (statement === null || typeof statement !== "object") {
    return refuse("HEADER_KEYS");
  }
  const kind = statement.kind;
  if (kind !== "GRANT" && kind !== "WAX_SEAL") {
    return refuse("HEADER_KIND");
  }
  const expected = kind === "GRANT" ? GRANT_STATEMENT_KEYS : SEAL_STATEMENT_KEYS;
  if (!exactOrdinary(statement, expected)) {
    return refuse("HEADER_KEYS");
  }
  if (statement.schemaVersion !== 1) {
    return refuse("HEADER_SCHEMA_VERSION");
  }
  if (typeof statement.signature !== "string" || !HEX128.test(statement.signature)) {
    return refuse("HEADER_SIGNATURE");
  }
  if (typeof statement.grantId !== "string" || !HEX64.test(statement.grantId)) {
    return refuse("HEADER_GRANT_ID");
  }
  if (typeof statement.action !== "string" || statement.action.length === 0) {
    return refuse("HEADER_ACTION");
  }
  if (typeof statement.subjectId !== "string" || statement.subjectId.length === 0) {
    return refuse("HEADER_SUBJECT");
  }
  if (typeof statement.envelopeDigest !== "string" || !SHA256.test(statement.envelopeDigest)) {
    return refuse("HEADER_ENVELOPE_DIGEST");
  }
  if (typeof statement.profileDigest !== "string" || !SHA256.test(statement.profileDigest)) {
    return refuse("HEADER_PROFILE_DIGEST");
  }
  if (!Number.isSafeInteger(statement.epoch) || statement.epoch < 1) {
    return refuse("HEADER_EPOCH");
  }
  if (kind === "GRANT") {
    if (typeof statement.issuerKeyId !== "string" || !SHA256.test(statement.issuerKeyId)) {
      return refuse("HEADER_ISSUER");
    }
    if (!Number.isSafeInteger(statement.expiryUnixMs) || !Number.isSafeInteger(statement.issuedAtUnixMs)) {
      return refuse("HEADER_TIMESTAMP");
    }
  } else {
    if (statement.authorizing !== false || statement.replayable !== false) {
      return refuse("HEADER_SEAL_FLAGS");
    }
    if (statement.authentication !== "AUTHENTICATED_SIGNET") {
      return refuse("HEADER_AUTHENTICATION");
    }
    if (typeof statement.terminalOutcome !== "string" || statement.terminalOutcome.length === 0) {
      return refuse("HEADER_TERMINAL");
    }
  }
  return null;
}

export function hashVerifierPath(verifierPath) {
  return createHash("sha256").update(readFileSync(verifierPath)).digest("hex");
}

export function loadPinnedVerifierBytes(verifierPath, expectedSha256Hex) {
  if (typeof verifierPath !== "string" || verifierPath.length === 0) {
    throw new TypeError("verifierPath is required");
  }
  if (typeof expectedSha256Hex !== "string" || !HEX64.test(expectedSha256Hex)) {
    throw new TypeError("expectedSha256Hex must be 32-byte lowercase hex");
  }
  const bytes = readFileSync(verifierPath);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256Hex) {
    return { ok: false, result: refuse("VERIFIER_PIN_MISMATCH", 2) };
  }
  return { ok: true, bytes };
}

function defaultSealedExecPath() {
  if (typeof process.env.GATE1_SEALED_EXEC === "string" && process.env.GATE1_SEALED_EXEC.length > 0) {
    return process.env.GATE1_SEALED_EXEC;
  }
  return join(dirname(fileURLToPath(import.meta.url)), "signet-verifier", "target", "release", "signet-sealed-exec");
}

function parseChildResult(result) {
  if (result.error || result.status === null) {
    return { trit: 0, reason: "VERIFIER_UNAVAILABLE", authorizing: false, status: -1 };
  }
  if (result.status === 3) {
    return refuse("VERIFIER_PIN_MISMATCH", 3);
  }
  if (result.status === 2 || result.status === 4) {
    return { trit: 0, reason: "VERIFIER_UNAVAILABLE", authorizing: false, status: result.status };
  }
  let parsed;
  try {
    parsed = JSON.parse(String(result.stdout ?? "").trim());
  } catch {
    return refuse("VERIFIER_MALFORMED_STDOUT", result.status);
  }
  if (parsed?.schema !== "galerina.signet.verdict.v1") {
    return refuse("VERIFIER_SCHEMA", result.status);
  }
  const trit = parsed.trit;
  if (trit !== -1 && trit !== 0 && trit !== 1) {
    return refuse("VERIFIER_TRIT", result.status);
  }
  return {
    trit,
    reason: typeof parsed.reason === "string" ? parsed.reason : "UNKNOWN",
    authorizing: false,
    status: result.status,
  };
}

export function execPinnedVerifierBytes(bytes, {
  expectedSha256Hex,
  verifierPath,
  helperPath,
  input,
  timeoutMs = 5_000,
} = {}) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError("pinned verifier bytes are required");
  }
  if (typeof expectedSha256Hex !== "string" || !HEX64.test(expectedSha256Hex)) {
    throw new TypeError("expectedSha256Hex must be 32-byte lowercase hex");
  }
  const helper = typeof helperPath === "string" && helperPath.length > 0
    ? helperPath
    : defaultSealedExecPath();
  if (!existsSync(helper)) {
    return { trit: 0, reason: "VERIFIER_UNAVAILABLE", authorizing: false, status: -1 };
  }
  const dir = mkdtempSync(join(tmpdir(), "signet-pin-"));
  const blob = join(dir, "bytes");
  writeFileSync(blob, bytes);
  const fd = openSync(blob, "r");
  unlinkSync(blob);
  try {
    sealedSpawnCount += 1;
    /* GATE1_SEALED_EXEC */
    const result = spawnSync(helper, [expectedSha256Hex], {
      input,
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: MAX_VERIFY_BYTES,
      env: {},
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe", fd],
    });
    void verifierPath;
    return parseChildResult(result);
  } finally {
    closeSync(fd);
    rmSync(dir, { recursive: true, force: true });
  }
}

export function spawnSignetVerifier({
  verifierPath,
  expectedSha256Hex,
  publicKeyHex,
  statement,
  timeoutMs = 5_000,
}) {
  const body = `${JSON.stringify({
    schema: VERIFY_SCHEMA,
    publicKeyHex,
    statement,
  })}\n`;
  if (Buffer.byteLength(body, "utf8") > MAX_VERIFY_BYTES) {
    return refuse("HEADER_TOO_LARGE");
  }
  let header = null;
  header = validateVerifyRequest({ publicKeyHex, statement }); /* GATE1_GUARD_HEADER */
  if (header !== null) return header; /* GATE1_GUARD_HEADER */
  const loaded = loadPinnedVerifierBytes(verifierPath, expectedSha256Hex);
  if (!loaded.ok) {
    return loaded.result;
  }
  /* GATE1_SEALED_EXEC */
  return execPinnedVerifierBytes(loaded.bytes, {
    expectedSha256Hex,
    verifierPath,
    input: body,
    timeoutMs,
  });
}
