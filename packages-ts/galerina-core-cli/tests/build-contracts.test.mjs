import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BUILD_RESULT_FIELDS,
  BUILD_RUNTIME_TARGETS,
  BUILD_WORKSPACE_INPUT_FIELDS,
  FUNGI_BUILD_001,
  FUNGI_BUILD_002,
  FUNGI_BUILD_003,
  FUNGI_BUILD_004,
  FUNGI_BUILD_005,
  buildWorkspace,
  createBuildResult,
  isBuildRuntimeTarget,
  readBuildResult,
  readBuildWorkspaceInput,
} from "../dist/build.js";

const HASH = "sha256:" + "a".repeat(64);

function artefact(path = "out/runtime-manifest.json") {
  return Object.freeze({
    path,
    kind: "manifest",
    hash: HASH,
    target: "node",
  });
}

describe("build-contracts closed shapes", () => {
  it("exposes closed target vocabulary and field lists", () => {
    assert.deepEqual([...BUILD_RUNTIME_TARGETS], [
      "node",
      "wasm",
      "native",
      "serverless",
      "edge",
      "gpu",
      "photonic",
    ]);
    assert.deepEqual([...BUILD_RESULT_FIELDS], [
      "success",
      "artefacts",
      "diagnostics",
      "manifestPath",
      "duration",
    ]);
    assert.deepEqual([...BUILD_WORKSPACE_INPUT_FIELDS], [
      "workspace",
      "target",
      "strict",
      "profile",
      "outDir",
    ]);
    assert.equal(isBuildRuntimeTarget("node"), true);
    assert.equal(isBuildRuntimeTarget("Node"), false);
    assert.equal(isBuildRuntimeTarget(""), false);
  });

  it("readBuildWorkspaceInput accepts closed input and optional profile", async () => {
    const base = {
      workspace: "apps/demo",
      target: "node",
      strict: true,
      outDir: "dist",
    };
    const a = readBuildWorkspaceInput(base);
    assert.equal(a.ok, true);
    if (!a.ok) return;
    assert.equal(a.value.workspace, "apps/demo");
    assert.equal(a.value.profile, undefined);

    const b = readBuildWorkspaceInput({ ...base, profile: "ci.strict" });
    assert.equal(b.ok, true);
    if (!b.ok) return;
    assert.equal(b.value.profile, "ci.strict");
  });

  it("readBuildWorkspaceInput refuses hostile getters, unknown keys, bad paths, NaN-like domains", () => {
    const getter = {
      workspace: "apps/demo",
      target: "node",
      strict: true,
      outDir: "dist",
    };
    Object.defineProperty(getter, "target", { get: () => "node", enumerable: true });
    const g = readBuildWorkspaceInput(getter);
    assert.equal(g.ok, false);
    if (g.ok) return;
    assert.equal(g.diagnostics[0]?.code, FUNGI_BUILD_001);

    const unk = readBuildWorkspaceInput({
      workspace: "apps/demo",
      target: "node",
      strict: true,
      outDir: "dist",
      extra: 1,
    });
    assert.equal(unk.ok, false);

    const trav = readBuildWorkspaceInput({
      workspace: "../escape",
      target: "node",
      strict: true,
      outDir: "dist",
    });
    assert.equal(trav.ok, false);
    if (!trav.ok) assert.equal(trav.diagnostics[0]?.code, FUNGI_BUILD_003);

    const badTarget = readBuildWorkspaceInput({
      workspace: "apps/demo",
      target: "jvm",
      strict: true,
      outDir: "dist",
    });
    assert.equal(badTarget.ok, false);
    if (!badTarget.ok) assert.equal(badTarget.diagnostics[0]?.code, FUNGI_BUILD_002);

    const badProfile = readBuildWorkspaceInput({
      workspace: "apps/demo",
      target: "node",
      strict: true,
      profile: "Bad Profile",
      outDir: "dist",
    });
    assert.equal(badProfile.ok, false);
  });

  it("createBuildResult / readBuildResult recompute success and refuse NaN duration", () => {
    const ok = createBuildResult({
      success: true,
      artefacts: [artefact()],
      diagnostics: [],
      manifestPath: "out/runtime-manifest.json",
      duration: 12,
    });
    assert.equal(ok.success, true);
    assert.equal(ok.artefacts.length, 1);
    assert.equal(ok.duration, 12);

    const readOk = readBuildResult({
      success: true,
      artefacts: [artefact()],
      diagnostics: [],
      manifestPath: "out/runtime-manifest.json",
      duration: 12,
    });
    assert.equal(readOk.ok, true);

    const nan = readBuildResult({
      success: true,
      artefacts: [],
      diagnostics: [],
      manifestPath: "",
      duration: Number.NaN,
    });
    assert.equal(nan.ok, false);
    if (!nan.ok) assert.equal(nan.diagnostics[0]?.code, FUNGI_BUILD_002);

    const inf = readBuildResult({
      success: true,
      artefacts: [],
      diagnostics: [],
      manifestPath: "",
      duration: Number.POSITIVE_INFINITY,
    });
    assert.equal(inf.ok, false);

    const mismatch = readBuildResult({
      success: true,
      artefacts: [],
      diagnostics: [
        {
          code: FUNGI_BUILD_005,
          severity: "error",
          message: "pipeline",
          field: "pipeline",
        },
      ],
      manifestPath: "",
      duration: 0,
    });
    assert.equal(mismatch.ok, false);
    if (!mismatch.ok) assert.equal(mismatch.diagnostics[0]?.code, FUNGI_BUILD_005);
  });

  it("createBuildResult refuses duplicate artefact paths and nested getters", () => {
    const dup = createBuildResult({
      success: true,
      artefacts: [artefact("a.json"), artefact("a.json")],
      diagnostics: [],
      manifestPath: "",
      duration: 0,
    });
    assert.equal(dup.success, false);
    assert.ok(dup.diagnostics.some((d) => d.code === FUNGI_BUILD_004));

    const hostile = {
      path: "x.json",
      kind: "manifest",
      hash: HASH,
      target: "node",
    };
    Object.defineProperty(hostile, "path", { get: () => "x.json", enumerable: true });
    const bad = createBuildResult({
      success: true,
      artefacts: [hostile],
      diagnostics: [],
      manifestPath: "",
      duration: 0,
    });
    assert.equal(bad.success, false);
    assert.ok(bad.diagnostics.some((d) => d.code === FUNGI_BUILD_004));
  });

  it("buildWorkspace never throws; valid input returns pipeline-not-admitted 005", async () => {
    const refused = await buildWorkspace(null);
    assert.equal(refused.success, false);
    assert.ok(refused.diagnostics.some((d) => d.code === FUNGI_BUILD_001));

    const valid = await buildWorkspace({
      workspace: "apps/demo",
      target: "wasm",
      strict: false,
      outDir: "out",
    });
    assert.equal(valid.success, false);
    assert.equal(valid.artefacts.length, 0);
    assert.equal(valid.diagnostics.length, 1);
    assert.equal(valid.diagnostics[0]?.code, FUNGI_BUILD_005);
    assert.equal(valid.diagnostics[0]?.field, "pipeline");
    assert.match(valid.diagnostics[0]?.message ?? "", /not admitted/);
  });

  it("diagnostics never echo refused path or unknown key names", () => {
    const r = readBuildWorkspaceInput({
      workspace: "../secret/path",
      target: "node",
      strict: true,
      outDir: "dist",
      evilKey: "value",
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      const blob = JSON.stringify(r.diagnostics);
      assert.equal(blob.includes("secret"), false);
      assert.equal(blob.includes("evilKey"), false);
      assert.equal(blob.includes("../"), false);
    }
  });
});
