import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REQUEST_SCHEMA = "slide.lyth-detached-scalar-request.v1";
const OUTPUT_SCHEMA = "slide.lyth-detached-scalar-evidence.v1";
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

function ownRecord(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("request object required");
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) throw new Error("request fields refused");
  return value;
}

function hexDigest(digest) {
  if (typeof digest !== "string" || !DIGEST.test(digest)) throw new Error("digest refused");
  return digest.slice("sha256:".length);
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main() {
  const request = ownRecord(
    JSON.parse(readFileSync(0, "utf8")),
    [
      "schema", "adapterPath", "slideRoot", "physicalReference", "manifest",
      "proofRuleIdentity", "registryClosureIdentity", "platformProfileIdentity",
      "cryptoSuiteIdentity", "publicKeyEpoch", "revocationEpoch",
      "currentPublicKeyEpoch", "currentRevocationEpoch", "currentPolicyIdentity",
      "currentTargetIdentity", "currentPlatformProfileIdentity", "effectClosureIdentity",
    ],
  );
  if (request.schema !== REQUEST_SCHEMA || typeof request.adapterPath !== "string" || typeof request.slideRoot !== "string") {
    throw new Error("Lyth request refused");
  }
  const physicalReference = ownRecord(request.physicalReference, ["schema", "owner", "kind", "digest", "byteLength"]);
  if (
    physicalReference.schema !== "galerina.artifact-reference.v1"
    || physicalReference.owner !== "slide"
    || physicalReference.kind !== "physical-slide"
    || !DIGEST.test(physicalReference.digest)
    || !Number.isSafeInteger(physicalReference.byteLength)
  ) throw new Error("physical reference refused");
  const physicalBytes = Uint8Array.from(await readFile(join(request.slideRoot, "physical-slide", hexDigest(physicalReference.digest))));
  if (
    physicalBytes.byteLength !== physicalReference.byteLength
    || `sha256:${createHash("sha256").update(physicalBytes).digest("hex")}` !== physicalReference.digest
  ) throw new Error("physical bytes do not match reference");
  const { runDetachedScalarAdapter } = await import(pathToFileURL(request.adapterPath).href);
  const evidence = await runDetachedScalarAdapter({
    physicalReference,
    repository: Object.freeze({ read: async () => Uint8Array.from(physicalBytes) }),
    manifest: deepFreeze(request.manifest),
    proofRuleIdentity: request.proofRuleIdentity,
    registryClosureIdentity: request.registryClosureIdentity,
    platformProfileIdentity: request.platformProfileIdentity,
    cryptoSuiteIdentity: request.cryptoSuiteIdentity,
    publicKeyEpoch: request.publicKeyEpoch,
    revocationEpoch: request.revocationEpoch,
    currentPublicKeyEpoch: request.currentPublicKeyEpoch,
    currentRevocationEpoch: request.currentRevocationEpoch,
    currentPolicyIdentity: request.currentPolicyIdentity,
    currentTargetIdentity: request.currentTargetIdentity,
    currentPlatformProfileIdentity: request.currentPlatformProfileIdentity,
    effectClosureIdentity: request.effectClosureIdentity,
    reuseEvidence: Object.freeze({ kind: "ABSENT_PRODUCTION_DFE" }),
  });
  if (evidence.verdict !== "evidence") throw new Error(`Lyth refused: ${evidence.code ?? evidence.reason ?? "unknown"}`);
  process.stdout.write(`${JSON.stringify({ schema: OUTPUT_SCHEMA, evidence, authorityReleased: false })}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${JSON.stringify({ schema: "slide.lyth-detached-scalar-refusal.v1", failureId: error instanceof Error ? error.message : "INTERNAL" })}\n`);
  process.exit(2);
}
