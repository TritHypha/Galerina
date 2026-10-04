import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// SLIDE registered-consumer evidence for TODO L756 (SLIDE) / RD-0858.
// Registration is non-authorizing; this test only proves that the registered
// digests match the committed artifact bytes and, when a sibling SLIDE
// checkout carries the route, that SLIDE re-admits the same bytes green.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(ROOT, "governance", "slide-registered-consumers.json");
const CONSUMER_KEYS = [
  "consumerId", "artifactDirectory", "sourceFile", "checkedFile", "sourceSha256",
  "checkedArtifactSha256", "runtimeProfile", "flowName", "expectedOutcomes",
  "slideRoute", "conversionScope", "authorityReleased",
];
const SLIDE_ROOT = resolve(ROOT, "..", "SLIDE");
const SLIDE_ROUTE = join(SLIDE_ROOT, "src", "galerina-scalar-requirement-block-route.mjs");

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function registry() {
  return JSON.parse(readFileSync(REGISTRY, "utf8"));
}

function firstStringLiteral(node) {
  if (!(node instanceof Object)) return "";
  if (node.kind === "stringLiteral" && typeof node.value === "string") return JSON.parse(node.value);
  for (const child of Array.isArray(node.children) ? node.children : []) {
    const found = firstStringLiteral(child);
    if (found !== "") return found;
  }
  return "";
}

function armOutcomes(checkedAst) {
  const outcomes = {};
  const names = { deny: "DENY", ambig: "UNKNOWN", if: "ALLOW" };
  const visit = (node) => {
    if (!(node instanceof Object)) return;
    if (node.kind === "checkArm" && Object.hasOwn(names, node.value)) {
      outcomes[names[node.value]] = firstStringLiteral(node);
    }
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(checkedAst);
  return outcomes;
}

describe("SLIDE registered consumers", () => {
  it("is a closed, non-authorizing registration", () => {
    const value = registry();
    assert.equal(value.schema, "galerina.slide-registered-consumers.v1");
    assert.deepEqual(Object.keys(value), ["schema", "note", "consumers"]);
    assert.ok(Array.isArray(value.consumers) && value.consumers.length === 1);
    for (const consumer of value.consumers) {
      assert.deepEqual(Object.keys(consumer), CONSUMER_KEYS);
      assert.equal(consumer.authorityReleased, false);
      assert.equal(consumer.runtimeProfile, "scalar-1");
      assert.equal(consumer.conversionScope, "fixed-scalar-profile-1-artifact-only");
      assert.deepEqual(Object.keys(consumer.slideRoute), ["repository", "module", "receiptSchema", "representationProfile"]);
    }
  });

  it("binds the exact committed artifact bytes and checked metadata", () => {
    for (const consumer of registry().consumers) {
      const directory = join(ROOT, ...consumer.artifactDirectory.split("/"));
      const source = readFileSync(join(directory, consumer.sourceFile));
      const checkedBytes = readFileSync(join(directory, consumer.checkedFile));
      assert.equal(sha256(source), consumer.sourceSha256);
      assert.equal(sha256(checkedBytes), consumer.checkedArtifactSha256);
      const checked = JSON.parse(checkedBytes.toString("utf8"));
      assert.equal(checked.sourceDigest, consumer.sourceSha256);
      assert.equal(checked.runtimeProfile, consumer.runtimeProfile);
      assert.equal(checked.flowName, consumer.flowName);
      assert.deepEqual(armOutcomes(checked.checkedAst), consumer.expectedOutcomes);
    }
  });

  it("is re-admitted green by a sibling SLIDE checkout at the same build point", async (context) => {
    if (!existsSync(SLIDE_ROUTE)) {
      context.skip("sibling SLIDE checkout does not carry the scalar requirement-block route");
      return;
    }
    const route = await import(pathToFileURL(SLIDE_ROUTE).href);
    const { portableVeoReferenceContext } = await import(pathToFileURL(join(SLIDE_ROOT, "src", "portable-veo.mjs")).href);
    for (const consumer of registry().consumers) {
      const directory = join(ROOT, ...consumer.artifactDirectory.split("/"));
      const workDirectory = await mkdtemp(join(tmpdir(), "galerina-slide-consumer-"));
      try {
        const receipt = await route.executeGalerinaScalarRequirementBlockRoute({
          checkedArtifactBytes: Uint8Array.from(readFileSync(join(directory, consumer.checkedFile))),
          sourceBytes: Uint8Array.from(readFileSync(join(directory, consumer.sourceFile))),
          workDirectory,
          context: portableVeoReferenceContext(),
          gates: { identity: 1, provenance: 1, target: 1, effects: 1, policy: 1, revocation: 1, validation: 1, memory: 1 },
          budgets: { steps: 8 },
        });
        assert.equal(receipt.verdict, 1, JSON.stringify(receipt));
        assert.equal(receipt.schema, consumer.slideRoute.receiptSchema);
        assert.equal(receipt.profile.selectedProfileId, consumer.slideRoute.representationProfile);
        assert.equal(receipt.checkedArtifactSha256, consumer.checkedArtifactSha256);
        assert.equal(receipt.galerina.sourceDigest, consumer.sourceSha256);
        assert.deepEqual({ ...receipt.derivation.outcomes }, consumer.expectedOutcomes);
        assert.equal(receipt.authorityReleased, false);
      } finally {
        await rm(workDirectory, { recursive: true, force: true });
      }
    }
  });
});
