import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runCli } from "../dist/cli.js";
import {
  parseDeployArgs,
  runDeployCommand,
  FUNGI_CLI_DEPLOY_001,
  FUNGI_CLI_DEPLOY_002,
  FUNGI_CLI_DEPLOY_003,
  FUNGI_CLI_DEPLOY_004,
  FUNGI_CLI_DEPLOY_005,
  DEPLOY_EXIT_OK,
  DEPLOY_EXIT_USAGE_OR_POLICY,
  DEPLOY_EXIT_TARGET,
  DEPLOY_EXIT_VALIDATION,
  DEPLOY_EXIT_CAPABILITY,
  DEPLOY_EXIT_VERIFY,
} from "../dist/deploy/deploy-command.js";
import { DEPLOYMENT_REPORT_FILE } from "../dist/deploy/deploy-report.js";
import {
  FUNGI_DEPLOY_003,
  FUNGI_DEPLOY_004,
  FUNGI_DEPLOY_005,
  FUNGI_DEPLOY_008,
  FUNGI_DEPLOY_009,
} from "../dist/deploy/deploy-validator.js";
import { DEPLOY_RUNTIME_SCHEMA } from "../dist/deploy/deploy-runtime.js";
import { CAPABILITY_REPORT_SCHEMA } from "../dist/verify/verify-runtime.js";

const HASH = "sha256:" + "ab".repeat(32);

function goodPolicy(overrides = {}) {
  return {
    allowedEffects: ["audit.write", "database.write"],
    allowedTargets: ["node", "wasm"],
    requireVerified: true,
    ...overrides,
  };
}

function goodManifest(overrides = {}) {
  return {
    allowedEffects: ["audit.write", "database.write"],
    verified: true,
    ...overrides,
  };
}

function withTemp(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-dcmd-"));
  return Promise.resolve()
    .then(() => fn(base))
    .finally(() => rmSync(base, { recursive: true, force: true }));
}

const required = ["--manifest", "m.json", "--policy", "p.json", "--target", "wasm", "--hash", HASH, "--dry-run"];

describe("parseDeployArgs", () => {
  it("requires manifest/policy/target/hash and refuses unknown / duplicate / equals-form / positionals", () => {
    assert.equal(parseDeployArgs([]).ok, false);
    assert.equal(parseDeployArgs([]).result.error.code, FUNGI_CLI_DEPLOY_002);
    assert.equal(parseDeployArgs(["--nope"]).result.error.code, FUNGI_CLI_DEPLOY_001);
    assert.equal(parseDeployArgs(["pos"]).result.error.code, FUNGI_CLI_DEPLOY_001);
    assert.equal(parseDeployArgs(["--manifest=x"]).result.error.code, FUNGI_CLI_DEPLOY_001);
    assert.equal(parseDeployArgs(["--manifest", "a", "--manifest", "b"]).result.error.code, FUNGI_CLI_DEPLOY_001);
    assert.equal(parseDeployArgs(["--manifest"]).result.error.code, FUNGI_CLI_DEPLOY_001);
    const partial = parseDeployArgs(["--manifest", "m.json", "--policy", "p.json", "--target", "wasm"]);
    assert.equal(partial.ok, false);
    assert.equal(partial.result.error.code, FUNGI_CLI_DEPLOY_002);
    const ok = parseDeployArgs([...required, "--json", "--strict"]);
    assert.equal(ok.ok, true);
    assert.equal(ok.options.manifestPath, "m.json");
    assert.equal(ok.options.policyPath, "p.json");
    assert.equal(ok.options.target, "wasm");
    assert.equal(ok.options.manifestHash, HASH);
    assert.equal(ok.options.json, true);
    assert.equal(ok.options.strict, true);
    assert.equal(ok.options.dryRun, true);
  });

  it("admits --audit <file> and --runtime <file>", () => {
    const r = parseDeployArgs([...required, "--audit", "a.json", "--runtime", "r.json"]);
    assert.equal(r.ok, true);
    assert.equal(r.options.auditPath, "a.json");
    assert.equal(r.options.runtimePath, "r.json");
  });

  it("refuses --audit without a value", () => {
    const r = parseDeployArgs([...required, "--audit"]);
    assert.equal(r.ok, false);
    assert.equal(r.result.error.code, FUNGI_CLI_DEPLOY_001);
  });

  it("parses without --dry-run as live (dryRun false)", () => {
    const r = parseDeployArgs(["--manifest", "m.json", "--policy", "p.json", "--target", "wasm", "--hash", HASH]);
    assert.equal(r.ok, true);
    assert.equal(r.options.dryRun, false);
  });
});

describe("runDeployCommand / galerina deploy", () => {
  it("live without required flags refuses 002 without echoing paths", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "m.json"), JSON.stringify(goodManifest()));
      writeFileSync(join(dir, "p.json"), JSON.stringify(goodPolicy()));
      const result = await runCli(
        ["deploy", "--manifest", "m.json", "--policy", "p.json", "--target", "wasm", "--hash", HASH],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, DEPLOY_EXIT_USAGE_OR_POLICY);
      assert.equal(result.error.code, FUNGI_CLI_DEPLOY_002);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("succeeds on closed policy/manifest dry-run and can write deployment-report.json", async () => {
    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      writeFileSync(join(dir, "m.json"), JSON.stringify(goodManifest()));
      writeFileSync(join(dir, "p.json"), JSON.stringify(goodPolicy()));
      const result = await runCli(
        [
          "deploy",
          "--manifest",
          "m.json",
          "--policy",
          "p.json",
          "--target",
          "wasm",
          "--hash",
          HASH,
          "--dry-run",
          "--report",
          "out",
          "--json",
        ],
        dir,
      );
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, DEPLOY_EXIT_OK);
      assert.ok(existsSync(join(dir, "out", DEPLOYMENT_REPORT_FILE)));
      const report = JSON.parse(readFileSync(join(dir, "out", DEPLOYMENT_REPORT_FILE), "utf8"));
      assert.equal(report.success, true);
      assert.equal(report.dryRun, true);
      assert.equal(report.target, "wasm");
      assert.equal(report.manifestHash, HASH);
      assert.ok(result.details.some((d) => d.includes('"schema"')));
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("returns exit 2 on policy effect denial without echoing effect names", async () => {
    await withTemp(async (dir) => {
      writeFileSync(
        join(dir, "m.json"),
        JSON.stringify(goodManifest({ allowedEffects: ["audit.write", "network.fetch"] })),
      );
      writeFileSync(join(dir, "p.json"), JSON.stringify(goodPolicy()));
      const result = await runCli(
        ["deploy", "--manifest", "m.json", "--policy", "p.json", "--target", "wasm", "--hash", HASH, "--dry-run"],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, DEPLOY_EXIT_USAGE_OR_POLICY);
      assert.equal(JSON.stringify(result).includes("network.fetch"), false);
      assert.equal(JSON.stringify(result).includes(FUNGI_DEPLOY_003), false);
    });
  });

  it("returns exit 3 on target incompatibility", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "m.json"), JSON.stringify(goodManifest()));
      writeFileSync(join(dir, "p.json"), JSON.stringify(goodPolicy({ allowedTargets: ["node"] })));
      const result = await runCli(
        ["deploy", "--manifest", "m.json", "--policy", "p.json", "--target", "wasm", "--hash", HASH, "--dry-run"],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, DEPLOY_EXIT_TARGET);
      assert.equal(JSON.stringify(result).includes("wasm"), false);
      void FUNGI_DEPLOY_004;
    });
  });

  it("returns exit 6 when verified gate fails", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "m.json"), JSON.stringify(goodManifest({ verified: false })));
      writeFileSync(join(dir, "p.json"), JSON.stringify(goodPolicy()));
      const result = await runCli(
        ["deploy", "--manifest", "m.json", "--policy", "p.json", "--target", "wasm", "--hash", HASH, "--dry-run"],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, DEPLOY_EXIT_VERIFY);
      void FUNGI_DEPLOY_005;
    });
  });

  it("returns exit 4 on shape validation failure and never echoes unknown keys", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "m.json"), JSON.stringify({ allowedEffects: ["audit.write"], verified: true, extra: 1 }));
      writeFileSync(join(dir, "p.json"), JSON.stringify(goodPolicy()));
      const result = await runCli(
        ["deploy", "--manifest", "m.json", "--policy", "p.json", "--target", "wasm", "--hash", HASH, "--dry-run"],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, DEPLOY_EXIT_VALIDATION);
      assert.equal(JSON.stringify(result).includes("extra"), false);
    });
  });

  it("refuses unreadable input without echoing the path", async () => {
    await withTemp(async (dir) => {
      writeFileSync(join(dir, "p.json"), JSON.stringify(goodPolicy()));
      const result = await runCli(
        [
          "deploy",
          "--manifest",
          "missing-m.json",
          "--policy",
          "p.json",
          "--target",
          "wasm",
          "--hash",
          HASH,
          "--dry-run",
        ],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.error.code, FUNGI_CLI_DEPLOY_003);
      assert.equal(JSON.stringify(result).includes("missing-m.json"), false);
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("refuses second --report write as exclusive-create (005)", async () => {
    await withTemp(async (dir) => {
      mkdirSync(join(dir, "out"));
      writeFileSync(join(dir, "m.json"), JSON.stringify(goodManifest()));
      writeFileSync(join(dir, "p.json"), JSON.stringify(goodPolicy()));
      const args = [
        "deploy",
        "--manifest",
        "m.json",
        "--policy",
        "p.json",
        "--target",
        "wasm",
        "--hash",
        HASH,
        "--dry-run",
        "--report",
        "out",
      ];
      const first = await runCli(args, dir);
      assert.equal(first.ok, true, first.message);
      const second = await runCli(args, dir);
      assert.equal(second.ok, false);
      assert.equal(second.error.code, FUNGI_CLI_DEPLOY_005);
      assert.equal(JSON.stringify(second).includes(dir), false);
    });
  });

  it("keeps FUNGI-CLI-DEPLOY-004 reserved after --audit admission", () => {
    assert.equal(FUNGI_CLI_DEPLOY_004, "FUNGI-CLI-DEPLOY-004");
  });
});

const sha = (text) => "sha256:" + createHash("sha256").update(text).digest("hex");

function goodRuntime(overrides = {}) {
  return {
    schema: DEPLOY_RUNTIME_SCHEMA,
    profile: "workspace.default",
    target: "wasm",
    effects: ["audit.write"],
    capabilities: ["db.read"],
    ...overrides,
  };
}

function goodCapability(overrides = {}) {
  return {
    schema: CAPABILITY_REPORT_SCHEMA,
    generatedAt: "2026-10-05T12:00:00.000Z",
    capabilities: [{ capability: "db.read", allowed: 2, denied: 0 }],
    deniedCapabilities: [],
    policyIds: ["policy.default"],
    rejectedIndices: [],
    rejectedCodes: [],
    truncated: false,
    complete: true,
    ...overrides,
  };
}

function seedLive(dir) {
  mkdirSync(join(dir, "build", "mod"), { recursive: true });
  mkdirSync(join(dir, "out"));
  writeFileSync(join(dir, "build", "mod", "app.wasm"), "module-bytes-v1");
  writeFileSync(join(dir, "m.json"), JSON.stringify(goodManifest({ allowedEffects: ["audit.write"] })));
  writeFileSync(
    join(dir, "p.json"),
    JSON.stringify({ allowedEffects: ["audit.write"], allowedTargets: ["wasm"], requireVerified: true }),
  );
  writeFileSync(
    join(dir, "a.json"),
    JSON.stringify([{ path: "mod/app.wasm", kind: "bundle", hash: sha("module-bytes-v1"), target: "wasm" }]),
  );
  writeFileSync(join(dir, "r.json"), JSON.stringify(goodRuntime()));
  writeFileSync(join(dir, "c.json"), JSON.stringify(goodCapability()));
}

describe("galerina deploy live local receipt", () => {
  it("succeeds with artefacts/runtime/audit/report and writes dryRun:false", async () => {
    await withTemp(async (dir) => {
      seedLive(dir);
      const result = await runCli(
        [
          "deploy",
          "--manifest",
          "m.json",
          "--policy",
          "p.json",
          "--target",
          "wasm",
          "--hash",
          HASH,
          "--artefacts",
          "a.json",
          "--root",
          "build",
          "--runtime",
          "r.json",
          "--audit",
          "c.json",
          "--report",
          "out",
        ],
        dir,
      );
      assert.equal(result.ok, true, result.message);
      assert.equal(result.code, DEPLOY_EXIT_OK);
      assert.equal(result.message.includes("dry-run"), false);
      const report = JSON.parse(readFileSync(join(dir, "out", DEPLOYMENT_REPORT_FILE), "utf8"));
      assert.equal(report.success, true);
      assert.equal(report.dryRun, false);
      assert.ok(report.limitations.some((l) => l.includes("no remote host")));
      assert.equal(JSON.stringify(result).includes(dir), false);
    });
  });

  it("refuses denied capabilities at exit 5 without echoing names", async () => {
    await withTemp(async (dir) => {
      seedLive(dir);
      writeFileSync(
        join(dir, "c.json"),
        JSON.stringify(
          goodCapability({
            capabilities: [
              { capability: "db.read", allowed: 1, denied: 0 },
              { capability: "net.http", allowed: 0, denied: 1 },
            ],
            deniedCapabilities: ["net.http"],
          }),
        ),
      );
      const result = await runCli(
        [
          "deploy",
          "--manifest",
          "m.json",
          "--policy",
          "p.json",
          "--target",
          "wasm",
          "--hash",
          HASH,
          "--artefacts",
          "a.json",
          "--root",
          "build",
          "--runtime",
          "r.json",
          "--audit",
          "c.json",
          "--report",
          "out",
        ],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, DEPLOY_EXIT_CAPABILITY);
      assert.equal(JSON.stringify(result).includes("net.http"), false);
      void FUNGI_DEPLOY_009;
    });
  });

  it("refuses runtime target mismatch at exit 3 without echoing the token", async () => {
    await withTemp(async (dir) => {
      seedLive(dir);
      writeFileSync(join(dir, "r.json"), JSON.stringify(goodRuntime({ target: "node" })));
      const result = await runCli(
        [
          "deploy",
          "--manifest",
          "m.json",
          "--policy",
          "p.json",
          "--target",
          "wasm",
          "--hash",
          HASH,
          "--artefacts",
          "a.json",
          "--root",
          "build",
          "--runtime",
          "r.json",
          "--audit",
          "c.json",
          "--report",
          "out",
        ],
        dir,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, DEPLOY_EXIT_TARGET);
      assert.equal(JSON.stringify(result).includes("node"), false);
      void FUNGI_DEPLOY_008;
    });
  });
});
