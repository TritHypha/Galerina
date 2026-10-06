import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runCli } from "../dist/cli.js";
import {
  parseVerifyArgs,
  runVerifyCommand,
  FUNGI_CLI_VERIFY_001,
  FUNGI_CLI_VERIFY_002,
  FUNGI_CLI_VERIFY_003,
  FUNGI_CLI_VERIFY_004,
  FUNGI_CLI_VERIFY_005,
  VERIFY_EXIT_OK,
  VERIFY_EXIT_USAGE,
  VERIFY_EXIT_RUNTIME,
  VERIFY_EXIT_CAPABILITY,
  VERIFY_EXIT_ARTEFACT,
  VERIFY_EXIT_MANIFEST,
} from "../dist/verify/verify-command.js";
import { VERIFICATION_REPORT_FILE } from "../dist/verify/verify-reporter.js";
import {
  RUNTIME_MANIFEST_SCHEMA,
  RUNTIME_MANIFEST_GOVERNANCE_FLAGS,
} from "../dist/verify/verify-manifest.js";

const digest = (s) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
const art = (path, hash) => ({ path, kind: "manifest", hash, target: "wasm" });

function goodManifest(flow = "pay") {
  const F = RUNTIME_MANIFEST_GOVERNANCE_FLAGS;
  return {
    schemaVersion: RUNTIME_MANIFEST_SCHEMA,
    flow,
    qualifier: "secure",
    requiresAudit: true,
    deniesRemote: false,
    allowedEffects: ["audit.write", "database.write"],
    requiredContext: ["actor"],
    computeTarget: "best",
    governanceFlagsMask: F.RequiresAudit | F.RequiresActor | F.ProductionStrict,
    proofObligations: ["audit_required:" + flow, "invariant_static:" + flow + ":ensure total > 0:statically_verified"],
    policyPurposes: ["billing"],
    verified: true,
    arenaLimitMb: 8,
  };
}

function withTemp(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-vcmd-"));
  return Promise.resolve()
    .then(() => fn(base))
    .finally(() => rmSync(base, { recursive: true, force: true }));
}

describe("parseVerifyArgs", () => {
  it("requires --artefacts and refuses unknown / duplicate / equals-form / positionals", () => {
    assert.equal(parseVerifyArgs([]).ok, false);
    assert.equal(parseVerifyArgs([]).result.error.code, FUNGI_CLI_VERIFY_002);
    assert.equal(parseVerifyArgs(["--nope"]).result.error.code, FUNGI_CLI_VERIFY_001);
    assert.equal(parseVerifyArgs(["pos"]).result.error.code, FUNGI_CLI_VERIFY_001);
    assert.equal(parseVerifyArgs(["--artefacts=x"]).result.error.code, FUNGI_CLI_VERIFY_001);
    assert.equal(parseVerifyArgs(["--artefacts", "a", "--artefacts", "b"]).result.error.code, FUNGI_CLI_VERIFY_001);
    assert.equal(parseVerifyArgs(["--artefacts"]).result.error.code, FUNGI_CLI_VERIFY_001);
    const ok = parseVerifyArgs(["--artefacts", "a.json", "--json", "--strict", "--hash"]);
    assert.equal(ok.ok, true);
    assert.equal(ok.options.artefactsPath, "a.json");
    assert.equal(ok.options.root, ".");
    assert.equal(ok.options.json, true);
    assert.equal(ok.options.strict, true);
    assert.equal(ok.options.hash, true);
  });

  it("admits --policy and --audit as value flags", () => {
    const p = parseVerifyArgs(["--artefacts", "a.json", "--policy", "p.json", "--audit", "audit.json"]);
    assert.equal(p.ok, true);
    assert.equal(p.options.policyPath, "p.json");
    assert.equal(p.options.auditPath, "audit.json");
    const missing = parseVerifyArgs(["--artefacts", "a.json", "--policy"]);
    assert.equal(missing.ok, false);
    assert.equal(missing.result.error.code, FUNGI_CLI_VERIFY_001);
  });
});

describe("runVerifyCommand / galerina verify", () => {
  it("verifies a closed artefact set and returns exit 0", async () => {
    await withTemp(async (base) => {
      mkdirSync(join(base, "build"));
      writeFileSync(join(base, "build", "a.json"), '{"ok":1}');
      const arts = [art("build/a.json", digest('{"ok":1}'))];
      writeFileSync(join(base, "arts.json"), JSON.stringify(arts));
      const result = await runCli(["verify", "--artefacts", "arts.json", "--root", base], base);
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, VERIFY_EXIT_OK);
      assert.equal(JSON.stringify(result).includes(base), false);
    });
  });

  it("returns exit 6 on artefact hash mismatch and never echoes paths", async () => {
    await withTemp(async (base) => {
      mkdirSync(join(base, "build"));
      writeFileSync(join(base, "build", "a.json"), '{"ok":1}');
      writeFileSync(join(base, "arts.json"), JSON.stringify([art("build/a.json", digest("other"))]));
      const result = await runCli(["verify", "--artefacts", "arts.json", "--root", base], base);
      assert.equal(result.ok, false);
      assert.equal(result.code, VERIFY_EXIT_ARTEFACT);
      assert.equal(JSON.stringify(result).includes(base), false);
      assert.equal(JSON.stringify(result).includes("build/a.json"), false);
    });
  });

  it("returns exit 7 when manifests fail after artefacts succeed", async () => {
    await withTemp(async (base) => {
      mkdirSync(join(base, "build"));
      writeFileSync(join(base, "build", "a.json"), '{"ok":1}');
      writeFileSync(join(base, "arts.json"), JSON.stringify([art("build/a.json", digest('{"ok":1}'))]));
      const bad = goodManifest("pay");
      bad.verified = false;
      writeFileSync(join(base, "mans.json"), JSON.stringify([bad]));
      const result = await runCli(
        ["verify", "--artefacts", "arts.json", "--manifest", "mans.json", "--root", base],
        base,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, VERIFY_EXIT_MANIFEST);
      assert.equal(JSON.stringify(result).includes("pay"), false);
    });
  });

  it("accepts a verifying manifest set and can write verification-report.json", async () => {
    await withTemp(async (base) => {
      mkdirSync(join(base, "build"));
      mkdirSync(join(base, "out"));
      writeFileSync(join(base, "build", "a.json"), '{"ok":1}');
      writeFileSync(join(base, "arts.json"), JSON.stringify([art("build/a.json", digest('{"ok":1}'))]));
      writeFileSync(join(base, "mans.json"), JSON.stringify([goodManifest("pay")]));
      const result = await runCli(
        ["verify", "--artefacts", "arts.json", "--manifest", "mans.json", "--report", "out", "--root", base, "--json"],
        base,
      );
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, VERIFY_EXIT_OK);
      assert.ok(existsSync(join(base, "out", VERIFICATION_REPORT_FILE)));
      const report = JSON.parse(readFileSync(join(base, "out", VERIFICATION_REPORT_FILE), "utf8"));
      assert.equal(report.success, true);
      assert.equal(report.manifests.success, true);
      assert.ok(result.details.some((d) => d.includes('"schema"')));
      // exclusive-create: second write refuses
      const again = await runVerifyCommand({
        cwd: base,
        env: "test",
        args: ["--artefacts", "arts.json", "--report", "out", "--root", base],
      });
      assert.equal(again.ok, false);
      assert.equal(again.error.code, FUNGI_CLI_VERIFY_005);
    });
  });

  it("refuses unreadable / non-array artefacts input without echoing the path", async () => {
    await withTemp(async (base) => {
      const missing = await runCli(["verify", "--artefacts", "no-such.json"], base);
      assert.equal(missing.error.code, FUNGI_CLI_VERIFY_003);
      assert.equal(JSON.stringify(missing).includes("no-such"), false);
      writeFileSync(join(base, "obj.json"), "{}");
      const obj = await runCli(["verify", "--artefacts", "obj.json"], base);
      assert.equal(obj.error.code, FUNGI_CLI_VERIFY_003);
      writeFileSync(join(base, "bad.json"), "{");
      const bad = await runCli(["verify", "--artefacts", "bad.json"], base);
      assert.equal(bad.error.code, FUNGI_CLI_VERIFY_003);
    });
  });

  it("refuses hostile extra keys on artefacts via integrity (exit 6) and does not run getters on CLI args path", async () => {
    await withTemp(async (base) => {
      mkdirSync(join(base, "build"));
      writeFileSync(join(base, "build", "a.json"), '{"ok":1}');
      const hostile = { path: "build/a.json", kind: "manifest", hash: digest('{"ok":1}'), target: "wasm", extra: 1 };
      writeFileSync(join(base, "arts.json"), JSON.stringify([hostile]));
      const result = await runCli(["verify", "--artefacts", "arts.json", "--root", base], base);
      assert.equal(result.ok, false);
      assert.equal(result.code, VERIFY_EXIT_ARTEFACT);
    });
  });
});


describe("verify --audit / --policy", () => {
  const zeroCats = () => ({ effect: 0, capability: 0, boundary: 0, secret: 0, network: 0, policy: 0, denial: 0, proof: 0 });
  const zeroStatus = () => ({ allowed: 0, denied: 0, warning: 0, error: 0, executed: 0, verified: 0 });
  function goodAudit() {
    return {
      schema: "galerina.report.audit.v1",
      generatedAt: "2026-10-05T12:00:00.000Z",
      eventCount: 1,
      byCategory: { ...zeroCats(), effect: 1 },
      byStatus: { ...zeroStatus(), allowed: 1 },
      rejectedLines: [],
      rejectedCodes: [],
      truncated: false,
      complete: true,
    };
  }
  function goodCapability() {
    return {
      schema: "galerina.report.capability.v1",
      generatedAt: "2026-10-05T12:00:00.000Z",
      capabilities: [{ capability: "db.read", allowed: 1, denied: 0 }],
      deniedCapabilities: [],
      policyIds: [],
      rejectedIndices: [],
      rejectedCodes: [],
      truncated: false,
      complete: true,
    };
  }

  it("verifies with --audit and --policy and returns exit 0", async () => {
    await withTemp(async (base) => {
      mkdirSync(join(base, "build"));
      writeFileSync(join(base, "build", "a.json"), '{"ok":1}');
      writeFileSync(join(base, "arts.json"), JSON.stringify([art("build/a.json", digest('{"ok":1}'))]));
      writeFileSync(join(base, "audit.json"), JSON.stringify(goodAudit()));
      writeFileSync(join(base, "policy.json"), JSON.stringify(goodCapability()));
      const result = await runCli([
        "verify", "--artefacts", "arts.json", "--root", base,
        "--audit", "audit.json", "--policy", "policy.json",
      ], base);
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, VERIFY_EXIT_OK);
      assert.equal(JSON.stringify(result).includes(base), false);
    });
  });

  it("audit report failure returns exit 3", async () => {
    await withTemp(async (base) => {
      mkdirSync(join(base, "build"));
      writeFileSync(join(base, "build", "a.json"), '{"ok":1}');
      writeFileSync(join(base, "arts.json"), JSON.stringify([art("build/a.json", digest('{"ok":1}'))]));
      writeFileSync(join(base, "audit.json"), JSON.stringify({
        ...goodAudit(),
        complete: false,
        rejectedLines: [1],
        rejectedCodes: ["FUNGI-REPORT-002"],
      }));
      const result = await runCli(["verify", "--artefacts", "arts.json", "--root", base, "--audit", "audit.json"], base);
      assert.equal(result.ok, false);
      assert.equal(result.code, VERIFY_EXIT_RUNTIME);
    });
  });

  it("capability report failure returns exit 5", async () => {
    await withTemp(async (base) => {
      mkdirSync(join(base, "build"));
      writeFileSync(join(base, "build", "a.json"), '{"ok":1}');
      writeFileSync(join(base, "arts.json"), JSON.stringify([art("build/a.json", digest('{"ok":1}'))]));
      writeFileSync(join(base, "policy.json"), JSON.stringify({
        ...goodCapability(),
        deniedCapabilities: ["missing.cap"],
      }));
      const result = await runCli(["verify", "--artefacts", "arts.json", "--root", base, "--policy", "policy.json"], base);
      assert.equal(result.ok, false);
      assert.equal(result.code, VERIFY_EXIT_CAPABILITY);
    });
  });
});
