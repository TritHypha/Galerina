#!/usr/bin/env node
// Galerina native-provider installation receipt writer (SLIDE TODO L1951/L1955).
//
// Galerina owns prompting and local installation; SLIDE consumes only the
// exact receipt this tool writes (schema
// galerina.native-provider-installation-receipt.v1, verified by SLIDE's
// verifyNativeProviderInstallationReceipt). The tool never prompts: consent
// evidence must already exist as bytes, or a project policy must name exactly
// one provider. CI prompt attempts, broad --yes authority, ambiguity,
// identity disagreement and source-present-only providers refuse and write
// nothing. The receipt is non-authorizing installation evidence.
import { createHash } from "node:crypto";
import { constants, closeSync, existsSync, fstatSync, lstatSync, openSync, readSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RECEIPT_SCHEMA = "galerina.native-provider-installation-receipt.v1";
export const DESCRIPTOR_SCHEMA = "slide.native-provider-descriptor.v1";
export const CONSENT_EVIDENCE_SCHEMA = "galerina.native-provider-consent-evidence.v1";
export const PROJECT_POLICY_SCHEMA = "galerina.native-provider-project-policy.v2";
export const DESCRIPTOR_FILE = "native-provider.descriptor.json";
export const MANIFEST_FILE = "package.fungi.json";
export const INSTALLED_MARKER = ".installed";

const PROVIDER_IDENTITY = /^galerina-[a-z][a-z0-9]{0,9}-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const VERSION = /^(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})$/u;
const MAXIMUM_BYTES = 65_536;
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

function refusal(failureId) {
  return Object.freeze({ verdict: -1, status: "REFUSED", failureId, receiptWritten: false, authorityReleased: false });
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value instanceof Object) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function descriptorDigest(descriptorBytes) {
  return `sha256:${createHash("sha256").update(`${DESCRIPTOR_SCHEMA}\0`, "utf8").update(descriptorBytes).digest("hex")}`;
}

function exactRecord(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseCanonicalRecord(bytes, keys) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAXIMUM_BYTES) return undefined;
  const text = Buffer.from(bytes).toString("utf8");
  const value = JSON.parse(text);
  return exactRecord(value, keys) && canonicalJson(value) === text ? value : undefined;
}

function readBounded(path) {
  let fd;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.size < 1 || before.size > MAXIMUM_BYTES) return Buffer.alloc(0);
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);
    fd = openSync(path, flags);
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.size < 1 || opened.size > MAXIMUM_BYTES
      || opened.dev !== before.dev || opened.ino !== before.ino) return Buffer.alloc(0);

    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    const after = fstatSync(fd);
    return offset === bytes.length && after.size === opened.size ? bytes : Buffer.alloc(0);
  } catch {
    return Buffer.alloc(0);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Builds the exact canonical receipt bytes for one provider folder.
 * request: { providersRoot, providerIdentity, consent, environment }
 *   consent: { mode: "explicit-consent", evidenceBytes } |
 *            { mode: "project-policy", policyBytes }
 *   environment: { ci, promptAttempted, broadYes }
 * Consent evidence is caller-provided, canonical and artifact-bound; this tool does not authenticate
 * the interactive UI or the policy author. The resulting receipt remains reference-only/non-authorizing.
 */
export function buildNativeProviderInstallationReceipt(request) {
  try {
    if (!(request instanceof Object)) return refusal("GALERINA-NATIVE-RECEIPT-REQUEST");
    const { providersRoot, providerIdentity, consent, environment } = request;
    if (typeof providersRoot !== "string" || typeof providerIdentity !== "string") return refusal("GALERINA-NATIVE-RECEIPT-REQUEST");
    if (!PROVIDER_IDENTITY.test(providerIdentity)) return refusal("GALERINA-NATIVE-RECEIPT-IDENTITY");
    if (!(environment instanceof Object)) return refusal("GALERINA-NATIVE-RECEIPT-ENVIRONMENT");
    if (environment.broadYes !== false) return refusal("GALERINA-NATIVE-RECEIPT-BROAD-YES");
    if (environment.ci === true && environment.promptAttempted !== false) return refusal("GALERINA-NATIVE-RECEIPT-CI-PROMPT");
    if (environment.promptAttempted !== false) return refusal("GALERINA-NATIVE-RECEIPT-PROMPT-IN-TOOL");

    const folder = join(resolve(providersRoot), providerIdentity);
    if (!existsSync(folder) || !lstatSync(folder).isDirectory()) return refusal("GALERINA-NATIVE-RECEIPT-ABSENT");
    const markerPath = join(folder, INSTALLED_MARKER);
    if (!existsSync(markerPath) || readBounded(markerPath).length === 0) return refusal("GALERINA-NATIVE-RECEIPT-SOURCE-PRESENT-NOT-INSTALLED");
    const manifestBytes = readBounded(join(folder, MANIFEST_FILE));
    const descriptorBytes = readBounded(join(folder, DESCRIPTOR_FILE));
    if (manifestBytes.length === 0 || descriptorBytes.length === 0) return refusal("GALERINA-NATIVE-RECEIPT-FILES");
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const descriptorText = descriptorBytes.toString("utf8");
    const descriptor = JSON.parse(descriptorText);
    if (canonicalJson(descriptor) !== descriptorText) return refusal("GALERINA-NATIVE-RECEIPT-DESCRIPTOR-CANONICAL");
    const manifestIdentity = `@galerina/${providerIdentity}`;
    if (
      !(manifest instanceof Object) || manifest.name !== manifestIdentity
      || typeof manifest.version !== "string" || !VERSION.test(manifest.version)
      || descriptor.schemaId !== DESCRIPTOR_SCHEMA
      || descriptor.providerIdentity !== providerIdentity
      || descriptor.canonicalPackageIdentity !== manifestIdentity
      || descriptor.exactVersion !== manifest.version
    ) return refusal("GALERINA-NATIVE-RECEIPT-IDENTITY-DISAGREEMENT");

    const exactDescriptorDigest = descriptorDigest(descriptorBytes);
    if (!(consent instanceof Object)) return refusal("GALERINA-NATIVE-RECEIPT-CONSENT-ABSENT");
    let evidenceDigest = "";
    if (consent.mode === "explicit-consent") {
      const evidence = parseCanonicalRecord(consent.evidenceBytes, ["schema", "providerIdentity", "exactVersion", "descriptorDigest", "decision"]);
      if (!evidence || evidence.schema !== CONSENT_EVIDENCE_SCHEMA || evidence.decision !== "allow" || !DIGEST.test(evidence.descriptorDigest)) {
        return refusal("GALERINA-NATIVE-RECEIPT-CONSENT-ABSENT");
      }
      if (evidence.providerIdentity !== providerIdentity || evidence.exactVersion !== manifest.version || evidence.descriptorDigest !== exactDescriptorDigest) {
        return refusal("GALERINA-NATIVE-RECEIPT-CONSENT-AMBIGUOUS");
      }
      evidenceDigest = sha256(consent.evidenceBytes);
    } else if (consent.mode === "project-policy") {
      const policy = parseCanonicalRecord(consent.policyBytes, ["schema", "providers"]);
      if (
        !policy || policy.schema !== PROJECT_POLICY_SCHEMA || !Array.isArray(policy.providers)
        || policy.providers.length > 256
        || policy.providers.some((entry) => !exactRecord(entry, ["providerIdentity", "exactVersion", "descriptorDigest"])
          || typeof entry.providerIdentity !== "string" || !PROVIDER_IDENTITY.test(entry.providerIdentity)
          || typeof entry.exactVersion !== "string" || !VERSION.test(entry.exactVersion)
          || typeof entry.descriptorDigest !== "string" || !DIGEST.test(entry.descriptorDigest))
      ) {
        return refusal("GALERINA-NATIVE-RECEIPT-POLICY");
      }
      const identities = policy.providers.map((entry) => entry.providerIdentity);
      if (new Set(identities).size !== identities.length) return refusal("GALERINA-NATIVE-RECEIPT-POLICY");
      const approved = policy.providers.some((entry) => entry.providerIdentity === providerIdentity
        && entry.exactVersion === manifest.version && entry.descriptorDigest === exactDescriptorDigest);
      if (!approved) return refusal("GALERINA-NATIVE-RECEIPT-CONSENT-ABSENT");
      evidenceDigest = sha256(consent.policyBytes);
    } else {
      return refusal("GALERINA-NATIVE-RECEIPT-CONSENT-ABSENT");
    }

    const receipt = {
      schema: RECEIPT_SCHEMA,
      providerIdentity,
      folderName: providerIdentity,
      manifestIdentity,
      exactVersion: manifest.version,
      descriptorDigest: exactDescriptorDigest,
      sourceState: "installed",
      authorisation: { mode: consent.mode, evidenceDigest, scope: [providerIdentity] },
      ciPromptAttempted: false,
      broadYes: false,
    };
    const receiptBytes = Uint8Array.from(Buffer.from(canonicalJson(receipt), "utf8"));
    return Object.freeze({
      verdict: 1,
      status: "RECEIPT_BUILT_NON_AUTHORIZING",
      failureId: "NONE",
      receiptBytes,
      descriptorBytes: Uint8Array.from(descriptorBytes),
      receiptDigest: sha256(receiptBytes),
      authorityReleased: false,
    });
  } catch {
    return refusal("GALERINA-NATIVE-RECEIPT-MALFORMED");
  }
}

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : "";
}

export function runCli(argv, env) {
  if (argv.includes("--yes") || argv.includes("-y")) {
    return { code: 2, result: refusal("GALERINA-NATIVE-RECEIPT-BROAD-YES") };
  }
  const mode = argument(argv, "--mode");
  const evidencePath = argument(argv, "--evidence");
  const outPath = argument(argv, "--out");
  if (outPath === "" || evidencePath === "") return { code: 2, result: refusal("GALERINA-NATIVE-RECEIPT-USAGE") };
  const evidenceBytes = Uint8Array.from(readBounded(evidencePath));
  const result = buildNativeProviderInstallationReceipt({
    providersRoot: argument(argv, "--providers-root"),
    providerIdentity: argument(argv, "--provider"),
    consent: mode === "project-policy" ? { mode, policyBytes: evidenceBytes } : { mode, evidenceBytes },
    environment: { ci: typeof env.CI === "string" && env.CI !== "" && env.CI !== "false", promptAttempted: false, broadYes: false },
  });
  if (result.verdict !== 1) return { code: 1, result };
  writeFileSync(outPath, result.receiptBytes, { flag: "wx" });
  return { code: 0, result: { verdict: 1, status: result.status, receiptDigest: result.receiptDigest, authorityReleased: false } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { code, result } = runCli(process.argv.slice(2), process.env);
  process.stdout.write(`${JSON.stringify({ ...result, receiptBytes: "omitted", descriptorBytes: "omitted" })}\n`);
  process.exitCode = code;
}
