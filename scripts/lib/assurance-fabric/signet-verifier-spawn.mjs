import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const VERIFY_SCHEMA = "galerina.signet.verify.v1";

export function hashVerifierPath(verifierPath) {
  return createHash("sha256").update(readFileSync(verifierPath)).digest("hex");
}

export function spawnSignetVerifier({
  verifierPath,
  expectedSha256Hex,
  publicKeyHex,
  statement,
  timeoutMs = 5_000,
}) {
  if (typeof verifierPath !== "string" || verifierPath.length === 0) {
    throw new TypeError("verifierPath is required");
  }
  if (typeof expectedSha256Hex !== "string" || !/^[a-f0-9]{64}$/u.test(expectedSha256Hex)) {
    throw new TypeError("expectedSha256Hex must be 32-byte lowercase hex");
  }
  const actual = hashVerifierPath(verifierPath);
  if (actual !== expectedSha256Hex) {
    return {
      trit: -1,
      reason: "VERIFIER_PIN_MISMATCH",
      authorizing: false,
      status: 2,
    };
  }
  const body = `${JSON.stringify({
    schema: VERIFY_SCHEMA,
    publicKeyHex,
    statement,
  })}\n`;
  const result = spawnSync(verifierPath, [], {
    input: body,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 16_384,
    env: {},
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status === null) {
    return { trit: 0, reason: "VERIFIER_UNAVAILABLE", authorizing: false, status: -1 };
  }
  let parsed;
  try {
    parsed = JSON.parse(String(result.stdout ?? "").trim());
  } catch {
    return { trit: -1, reason: "VERIFIER_MALFORMED_STDOUT", authorizing: false, status: result.status };
  }
  if (parsed?.schema !== "galerina.signet.verdict.v1") {
    return { trit: -1, reason: "VERIFIER_SCHEMA", authorizing: false, status: result.status };
  }
  const trit = parsed.trit;
  if (trit !== -1 && trit !== 0 && trit !== 1) {
    return { trit: -1, reason: "VERIFIER_TRIT", authorizing: false, status: result.status };
  }
  return {
    trit,
    reason: typeof parsed.reason === "string" ? parsed.reason : "UNKNOWN",
    authorizing: false,
    status: result.status,
  };
}
