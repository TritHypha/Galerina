import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const worktreeRoot = resolve(packageRoot, "..", "..");
const fixture = fileURLToPath(new URL("./fixtures/detached-scalar/constant-i32.fungi", import.meta.url));
const cli = fileURLToPath(new URL("../dist/detached-scalar-cli.js", import.meta.url));
const slideChild = fileURLToPath(new URL("./helpers/slide-detached-scalar-child.mjs", import.meta.url));
const lythChild = fileURLToPath(new URL("./helpers/lyth-detached-scalar-child.mjs", import.meta.url));
const vokChild = fileURLToPath(new URL("./helpers/vok-detached-scalar-child.mjs", import.meta.url));

function siblingRoot(name, marker) {
  const candidates = [
    resolve(worktreeRoot, "..", name),
    resolve(worktreeRoot, "..", "..", "..", name),
  ];
  const found = candidates.find((candidate) => existsSync(join(candidate, marker)));
  assert.ok(found, `${name} sibling repository is required for the detached constellation`);
  return found;
}

function digest(digit) {
  return `sha256:${digit.repeat(64)}`;
}

function runChild(script, request) {
  const child = runChildResult(script, request);
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.equal(child.stderr, "");
  const lines = child.stdout.trim().split("\n");
  assert.equal(lines.length, 1, child.stdout);
  return JSON.parse(lines[0]);
}

function runChildResult(script, request) {
  return spawnSync(process.execPath, [script], {
    input: `${JSON.stringify(request)}\n`,
    encoding: "utf8",
    timeout: 45_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function expectRefusal(script, request) {
  const result = runChildResult(script, request);
  assert.notEqual(result.status, 0, result.stdout);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /refusal|refused|mismatch|digest/iu);
  return result;
}

describe("fresh-process detached scalar constellation", () => {
  it("carries references through Galerina, SLIDE, Lyth, and VOK", async () => {
    const galerinaRoot = await mkdtemp(join(tmpdir(), "galerina-constellation-"));
    const slideRoot = await mkdtemp(join(tmpdir(), "slide-constellation-"));
    const slideRepo = siblingRoot("SLIDE", join("src", "representation-profile-registry.mjs"));
    const lythRepo = siblingRoot("lyth-weaver", join("tools", "adapter", "adapter.ts"));
    try {
      const gal = runChild(cli, {
        schema: "galerina.detached-scalar-request.v1",
        sourcePath: fixture,
        repositoryRoot: galerinaRoot,
        sourceFile: "constant-i32.fungi",
        compilerCommitDigest: digest("f"),
        authorityEpoch: 7,
        authorityContextDigest: digest("e"),
      });
      assert.equal(gal.schema, "galerina.detached-scalar-handoff.v1");
      assert.equal(gal.authorityReleased, false);
      assert.equal(gal.transfer.toOwner, "slide");
      assert.equal(gal.girReference.kind, "canonical-gir");

      const slide = runChild(slideChild, {
        schema: "galerina.slide-detached-scalar-request.v1",
        galerinaRoot,
        slideRoot,
        slideModuleRoot: slideRepo,
        girReference: gal.girReference,
        sourceDigest: gal.sourceReference.digest,
        checkedSnapshotDigest: gal.snapshotReference.digest,
        runIdentity: gal.runIdentity,
        executionPolicyDigest: digest("d"),
        artifactId: "galerina.detached-scalar",
        entryFunctionId: 1,
      });
      assert.equal(slide.schema, "galerina.slide-detached-scalar-handoff.v1");
      assert.equal(slide.manifest.sourceDigest, gal.sourceReference.digest);
      assert.equal(slide.manifest.checkedSnapshotDigest, gal.snapshotReference.digest);
      assert.equal(slide.physicalReference.owner, "slide");
      assert.equal(slide.authorityReleased, false);

      const lyth = runChild(lythChild, {
        schema: "slide.lyth-detached-scalar-request.v1",
        adapterPath: join(lythRepo, "tools", "adapter", "adapter.ts"),
        slideRoot,
        physicalReference: slide.physicalReference,
        manifest: slide.manifest,
        proofRuleIdentity: "rules:detached-scalar-v1",
        registryClosureIdentity: digest("5"),
        platformProfileIdentity: "platform:slide-js-reference",
        cryptoSuiteIdentity: "suite:sha256-v1",
        publicKeyEpoch: "epoch:2026-09",
        revocationEpoch: "rev:0418",
        currentPublicKeyEpoch: "epoch:2026-09",
        currentRevocationEpoch: "rev:0418",
        currentPolicyIdentity: slide.manifest.executionPolicyDigest,
        currentTargetIdentity: `target:${slide.manifest.targetId}`,
        currentPlatformProfileIdentity: "platform:slide-js-reference",
        effectClosureIdentity: digest("6"),
      });
      assert.equal(lyth.schema, "slide.lyth-detached-scalar-evidence.v1");
      assert.equal(lyth.evidence.verdict, "evidence");
      assert.equal(lyth.evidence.reuseDisposition, "FULL_RECOMPUTE_NO_PRODUCTION_DFE");
      assert.equal(lyth.evidence.authorityReleased, false);
      assert.equal(lyth.evidence.structure.workDerivation, "INDEPENDENT_CANONICAL_GIR");
      assert.equal(lyth.evidence.structure.staticAllPathsWorkMaximum, slide.manifest.resourceWorkMaximum);

      const vok = runChild(vokChild, {
        schema: "slide.vok-detached-scalar-request.v1",
        slideRoot,
        slideModuleRoot: slideRepo,
        physicalReference: slide.physicalReference,
        manifest: slide.manifest,
        lythEvidence: lyth.evidence,
        authorityEpoch: 7,
        currentAuthorityEpoch: 7,
      });
      assert.equal(vok.schema, "slide.vok-detached-scalar-receipt.v1");
      assert.equal(vok.status, "SUCCEEDED");
      assert.equal(vok.value, 1);
      assert.equal(vok.failureId, 0);
      assert.equal(vok.authorityReleased, false);
      assert.match(vok.receiptDigest, /^sha256:[0-9a-f]{64}$/u);

      for (const output of [gal, slide, lyth, vok]) {
        const serialized = JSON.stringify(output);
        assert.doesNotMatch(serialized, /sourcePath|repositoryRoot|AstNode|canonicalBytesHex|constant-i32\.fungi/u);
        assert.doesNotMatch(serialized, new RegExp(galerinaRoot.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
        assert.doesNotMatch(serialized, new RegExp(slideRoot.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
      }
    } finally {
      await Promise.all([
        rm(galerinaRoot, { recursive: true, force: true }),
        rm(slideRoot, { recursive: true, force: true }),
      ]);
    }
  });

  it("refuses mutations at each owned reference boundary", async () => {
    const galerinaRoot = await mkdtemp(join(tmpdir(), "galerina-constellation-mutation-"));
    const slideRoot = await mkdtemp(join(tmpdir(), "slide-constellation-mutation-"));
    const slideRepo = siblingRoot("SLIDE", join("src", "representation-profile-registry.mjs"));
    const lythRepo = siblingRoot("lyth-weaver", join("tools", "adapter", "adapter.ts"));
    const galRequest = {
      schema: "galerina.detached-scalar-request.v1",
      sourcePath: fixture,
      repositoryRoot: galerinaRoot,
      sourceFile: "constant-i32.fungi",
      compilerCommitDigest: digest("f"),
      authorityEpoch: 7,
      authorityContextDigest: digest("e"),
    };
    try {
      const gal = runChild(cli, galRequest);
      expectRefusal(cli, { ...galRequest, sourcePath: `${fixture}.missing` });

      const badGirReference = { ...gal.girReference, digest: digest("0") };
      expectRefusal(slideChild, {
        schema: "galerina.slide-detached-scalar-request.v1",
        galerinaRoot,
        slideRoot,
        slideModuleRoot: slideRepo,
        girReference: badGirReference,
        sourceDigest: gal.sourceReference.digest,
        checkedSnapshotDigest: gal.snapshotReference.digest,
        runIdentity: gal.runIdentity,
        executionPolicyDigest: digest("d"),
        artifactId: "galerina.detached-scalar",
        entryFunctionId: 1,
      });

      const slide = runChild(slideChild, {
        schema: "galerina.slide-detached-scalar-request.v1",
        galerinaRoot,
        slideRoot,
        slideModuleRoot: slideRepo,
        girReference: gal.girReference,
        sourceDigest: gal.sourceReference.digest,
        checkedSnapshotDigest: gal.snapshotReference.digest,
        runIdentity: gal.runIdentity,
        executionPolicyDigest: digest("d"),
        artifactId: "galerina.detached-scalar",
        entryFunctionId: 1,
      });

      const lythRequest = {
        schema: "slide.lyth-detached-scalar-request.v1",
        adapterPath: join(lythRepo, "tools", "adapter", "adapter.ts"),
        slideRoot,
        physicalReference: slide.physicalReference,
        manifest: slide.manifest,
        proofRuleIdentity: "rules:detached-scalar-v1",
        registryClosureIdentity: digest("5"),
        platformProfileIdentity: "platform:slide-js-reference",
        cryptoSuiteIdentity: "suite:sha256-v1",
        publicKeyEpoch: "epoch:2026-09",
        revocationEpoch: "rev:0418",
        currentPublicKeyEpoch: "epoch:2026-09",
        currentRevocationEpoch: "rev:0418",
        currentPolicyIdentity: slide.manifest.executionPolicyDigest,
        currentTargetIdentity: `target:${slide.manifest.targetId}`,
        currentPlatformProfileIdentity: "platform:slide-js-reference",
        effectClosureIdentity: digest("6"),
      };
      expectRefusal(lythChild, { ...lythRequest, physicalReference: { ...slide.physicalReference, digest: digest("1") } });
      const lyth = runChild(lythChild, lythRequest);

      const vokRequest = {
        schema: "slide.vok-detached-scalar-request.v1",
        slideRoot,
        slideModuleRoot: slideRepo,
        physicalReference: slide.physicalReference,
        manifest: slide.manifest,
        lythEvidence: lyth.evidence,
        authorityEpoch: 7,
        currentAuthorityEpoch: 7,
      };
      expectRefusal(vokChild, {
        ...vokRequest,
        lythEvidence: { ...lyth.evidence, evidenceDigest: digest("2") },
      });
      expectRefusal(vokChild, { ...vokRequest, currentAuthorityEpoch: 8 });
    } finally {
      await Promise.all([
        rm(galerinaRoot, { recursive: true, force: true }),
        rm(slideRoot, { recursive: true, force: true }),
      ]);
    }
  });
});
