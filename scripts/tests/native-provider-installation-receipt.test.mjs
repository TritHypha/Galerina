import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildNativeProviderInstallationReceipt,
  canonicalJson,
  descriptorDigest,
  runCli,
} from "../native-provider-installation-receipt.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SLIDE_PACKS = resolve(ROOT, "..", "SLIDE", "src", "native-provider-packs.mjs");
const IDENTITY = "galerina-numeric-bigfloat";
const D = (digit) => `sha256:${String(digit).repeat(64)}`;

function descriptor(overrides = {}) {
  return {
    schemaId: "slide.native-provider-descriptor.v1",
    providerIdentity: IDENTITY,
    canonicalPackageIdentity: `@galerina/${IDENTITY}`,
    exactVersion: "1.0.0",
    contentDigest: D(1),
    provenanceDigest: D(2),
    semanticProfileDigest: D(3),
    deterministicMathsProfile: "ieee-binary256-rne",
    capabilities: ["numeric.bigfloat-256"],
    effects: [],
    exports: [{
      operationIdentity: "numeric.bigfloat.add",
      parameterTypeIds: [9, 9],
      resultTypeId: 9,
      determinismProfile: "bit-exact",
      timingProfile: "data-independent",
      effectSet: [],
      resourceCeiling: { steps: 64 },
    }],
    target: {
      architecture: "arm64", osAbi: "linux-gnu", cpuCompatibilityFloor: 1,
      cpuFeatureCeiling: ["neon"], platformProfile: "generic",
    },
    memoryAbi: "slide.flat-memory.v1",
    directDependencies: [],
    revocationIdentity: D(4),
    initialiser: "ABSENT",
    ...overrides,
  };
}

function providerTree({ installed = true, manifestName = `@galerina/${IDENTITY}`, manifestVersion = "1.0.0", folder = IDENTITY, descriptorOverrides = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "galerina-native-provider-"));
  const directory = join(root, folder);
  mkdirSync(directory);
  writeFileSync(join(directory, "package.fungi.json"), `${JSON.stringify({ name: manifestName, version: manifestVersion }, identityReplacer(), 2)}\n`);
  writeFileSync(join(directory, "native-provider.descriptor.json"), canonicalJson(descriptor({ exactVersion: manifestVersion, ...descriptorOverrides })));
  if (installed) writeFileSync(join(directory, ".installed"), "installed by galerina providers add\n");
  return root;
}

function identityReplacer() {
  return (key, value) => value;
}

function evidence(root, { providerIdentity = IDENTITY, exactVersion = "1.0.0", digest } = {}) {
  const descriptorBytes = readFileSync(join(root, providerIdentity, "native-provider.descriptor.json"));
  return Uint8Array.from(Buffer.from(canonicalJson({
    schema: "galerina.native-provider-consent-evidence.v1",
    providerIdentity,
    exactVersion,
    descriptorDigest: digest ?? descriptorDigest(descriptorBytes),
    decision: "allow",
  }), "utf8"));
}
const CONSENT = (root) => ({ mode: "explicit-consent", evidenceBytes: evidence(root) });
const LOCAL = { ci: false, promptAttempted: false, broadYes: false };

describe("Galerina native-provider installation receipts (SLIDE L1951/L1955)", () => {
  it("writes the exact canonical receipt SLIDE expects for explicit consent and project policy", () => {
    const root = providerTree();
    try {
      const built = buildNativeProviderInstallationReceipt({ providersRoot: root, providerIdentity: IDENTITY, consent: CONSENT(root), environment: LOCAL });
      assert.equal(built.verdict, 1, JSON.stringify(built));
      const receipt = JSON.parse(Buffer.from(built.receiptBytes).toString("utf8"));
      assert.equal(canonicalJson(receipt), Buffer.from(built.receiptBytes).toString("utf8"));
      assert.equal(receipt.schema, "galerina.native-provider-installation-receipt.v1");
      assert.equal(receipt.folderName, IDENTITY);
      assert.equal(receipt.manifestIdentity, `@galerina/${IDENTITY}`);
      assert.deepEqual(receipt.authorisation.scope, [IDENTITY]);
      assert.equal(receipt.ciPromptAttempted, false);
      assert.equal(receipt.broadYes, false);
      assert.equal(built.authorityReleased, false);
      const policy = Uint8Array.from(Buffer.from(canonicalJson({
        schema: "galerina.native-provider-project-policy.v2",
        providers: [{ providerIdentity: IDENTITY, exactVersion: "1.0.0", descriptorDigest: descriptorDigest(readFileSync(join(root, IDENTITY, "native-provider.descriptor.json"))) }],
      }), "utf8"));
      const viaPolicy = buildNativeProviderInstallationReceipt({ providersRoot: root, providerIdentity: IDENTITY, consent: { mode: "project-policy", policyBytes: policy }, environment: { ...LOCAL, ci: true } });
      assert.equal(viaPolicy.verdict, 1, JSON.stringify(viaPolicy));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses absent consent, ambiguity, CI prompts, broad yes, disagreement and source-present providers", () => {
    const root = providerTree();
    const cases = [
      ["no consent", { consent: { mode: "none" } }, "GALERINA-NATIVE-RECEIPT-CONSENT-ABSENT"],
      ["empty evidence", { consent: { mode: "explicit-consent", evidenceBytes: new Uint8Array(0) } }, "GALERINA-NATIVE-RECEIPT-CONSENT-ABSENT"],
      ["unstructured evidence mentioning the provider", { consent: { mode: "explicit-consent", evidenceBytes: Uint8Array.from(Buffer.from(`approved ${IDENTITY}`, "utf8")) } }, "GALERINA-NATIVE-RECEIPT-MALFORMED"],
      ["evidence bound to another provider", { consent: { mode: "explicit-consent", evidenceBytes: Uint8Array.from(Buffer.from(canonicalJson({ schema: "galerina.native-provider-consent-evidence.v1", providerIdentity: "galerina-time-calendar", exactVersion: "1.0.0", descriptorDigest: D(1), decision: "allow" }), "utf8")) } }, "GALERINA-NATIVE-RECEIPT-CONSENT-AMBIGUOUS"],
      ["evidence bound to another version", { consent: { mode: "explicit-consent", evidenceBytes: Uint8Array.from(Buffer.from(canonicalJson({ schema: "galerina.native-provider-consent-evidence.v1", providerIdentity: IDENTITY, exactVersion: "1.0.1", descriptorDigest: D(1), decision: "allow" }), "utf8")) } }, "GALERINA-NATIVE-RECEIPT-CONSENT-AMBIGUOUS"],
      ["policy binds a different version or digest", { consent: { mode: "project-policy", policyBytes: Uint8Array.from(Buffer.from(canonicalJson({ schema: "galerina.native-provider-project-policy.v2", providers: [{ providerIdentity: IDENTITY, exactVersion: "1.0.1", descriptorDigest: D(5) }] }), "utf8")) } }, "GALERINA-NATIVE-RECEIPT-CONSENT-ABSENT"],
      ["policy omits provider", { consent: { mode: "project-policy", policyBytes: Uint8Array.from(Buffer.from(canonicalJson({ schema: "galerina.native-provider-project-policy.v2", providers: [] }), "utf8")) } }, "GALERINA-NATIVE-RECEIPT-CONSENT-ABSENT"],
      ["legacy project-policy v1 does not masquerade as v2", { consent: { mode: "project-policy", policyBytes: Uint8Array.from(Buffer.from(canonicalJson({ schema: "galerina.native-provider-project-policy.v1", allowedProviders: [IDENTITY] }), "utf8")) } }, "GALERINA-NATIVE-RECEIPT-POLICY"],
      ["ci prompt", { environment: { ci: true, promptAttempted: true, broadYes: false } }, "GALERINA-NATIVE-RECEIPT-CI-PROMPT"],
      ["broad yes", { environment: { ci: false, promptAttempted: false, broadYes: true } }, "GALERINA-NATIVE-RECEIPT-BROAD-YES"],
      ["non-canonical identity", { providerIdentity: "numeric-bigfloat" }, "GALERINA-NATIVE-RECEIPT-IDENTITY"],
    ];
    try {
      for (const [label, overrides, failureId] of cases) {
        const result = buildNativeProviderInstallationReceipt({ providersRoot: root, providerIdentity: IDENTITY, consent: CONSENT(root), environment: LOCAL, ...overrides });
        assert.equal(result.verdict, -1, label);
        assert.equal(result.failureId, failureId, label);
        assert.equal(result.receiptWritten, false, label);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    for (const [label, tree, failureId] of [
      ["source-present", { installed: false }, "GALERINA-NATIVE-RECEIPT-SOURCE-PRESENT-NOT-INSTALLED"],
      ["manifest mismatch", { manifestName: "@galerina/numeric-bigfloat" }, "GALERINA-NATIVE-RECEIPT-IDENTITY-DISAGREEMENT"],
      ["descriptor mismatch", { descriptorOverrides: { exactVersion: "1.0.1" } }, "GALERINA-NATIVE-RECEIPT-IDENTITY-DISAGREEMENT"],
    ]) {
      const root2 = providerTree(tree);
      try {
        const result = buildNativeProviderInstallationReceipt({ providersRoot: root2, providerIdentity: IDENTITY, consent: CONSENT(root2), environment: LOCAL });
        assert.equal(result.failureId, failureId, label);
      } finally {
        rmSync(root2, { recursive: true, force: true });
      }
    }
  });

  it("CLI refuses --yes and writes the receipt exclusively", () => {
    const root = providerTree();
    try {
      const evidence = join(root, "consent.txt");
      writeFileSync(evidence, CONSENT(root).evidenceBytes);
      const out = join(root, "receipt.json");
      const base = ["--providers-root", root, "--provider", IDENTITY, "--mode", "explicit-consent", "--evidence", evidence, "--out", out];
      assert.equal(runCli([...base, "--yes"], {}).code, 2);
      assert.equal(existsSync(out), false);
      const oversizedEvidence = join(root, "oversized-consent.txt");
      writeFileSync(oversizedEvidence, Buffer.alloc(65_537, 0x20));
      const oversizedOut = join(root, "oversized-receipt.json");
      const oversizedArgs = [...base];
      oversizedArgs[oversizedArgs.indexOf(evidence)] = oversizedEvidence;
      oversizedArgs[oversizedArgs.indexOf(out)] = oversizedOut;
      assert.equal(runCli(oversizedArgs, {}).code, 1);
      assert.equal(existsSync(oversizedOut), false);
      assert.equal(runCli(base, {}).code, 0);
      assert.ok(readFileSync(out).length > 0);
      assert.throws(() => runCli(base, {}));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is accepted by a sibling SLIDE native-provider verifier when present", async (context) => {
    if (!existsSync(SLIDE_PACKS)) {
      context.skip("sibling SLIDE checkout does not carry src/native-provider-packs.mjs");
      return;
    }
    const slide = await import(pathToFileURL(SLIDE_PACKS).href);
    const root = providerTree();
    try {
      const built = buildNativeProviderInstallationReceipt({ providersRoot: root, providerIdentity: IDENTITY, consent: CONSENT(root), environment: LOCAL });
      const inspected = slide.inspectNativeProviderDescriptor(built.descriptorBytes);
      assert.equal(inspected.verdict, 1, JSON.stringify(inspected));
      const verified = slide.verifyNativeProviderInstallationReceipt(built.receiptBytes, inspected);
      assert.equal(verified.verdict, 1, JSON.stringify(verified));
      assert.equal(verified.authorityReleased, false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
