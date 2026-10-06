import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { verifyDeployModuleHashes } from "../dist/deploy/deploy-module-hash.js";
import * as deployBarrel from "../dist/deploy.js";
import {
  parseDeployArgs,
  runDeployCommand,
  FUNGI_CLI_DEPLOY_001,
  FUNGI_CLI_DEPLOY_003,
  DEPLOY_EXIT_OK,
  DEPLOY_EXIT_USAGE_OR_POLICY,
  DEPLOY_EXIT_MANIFEST,
} from "../dist/deploy/deploy-command.js";
import { DEPLOYMENT_REPORT_FILE } from "../dist/deploy/deploy-report.js";
import {
  FUNGI_VERIFY_001,
  FUNGI_VERIFY_002,
  FUNGI_VERIFY_003,
  FUNGI_VERIFY_004,
  FUNGI_VERIFY_005,
} from "../dist/verify.js";

const MANIFEST_HASH = "sha256:" + "ab".repeat(32);
const sha = (text) => "sha256:" + createHash("sha256").update(text).digest("hex");
const art = (path, text, kind = "bundle") => ({ path, kind, hash: sha(text), target: "wasm" });

function withTemp(fn) {
  const base = mkdtempSync(join(tmpdir(), "galerina-dmh-"));
  return Promise.resolve()
    .then(() => fn(base))
    .finally(() => rmSync(base, { recursive: true, force: true }));
}

function seed(base) {
  const root = join(base, "build");
  mkdirSync(join(root, "mod"), { recursive: true });
  writeFileSync(join(root, "mod", "app.wasm"), "module-bytes-v1");
  writeFileSync(join(root, "runtime-manifest.json"), "{\"m\":1}");
  writeFileSync(join(base, "outside.wasm"), "outside");
  return root;
}

function writeInputs(base, artefacts) {
  writeFileSync(join(base, "m.json"), JSON.stringify({ allowedEffects: ["audit.write"], verified: true }));
  writeFileSync(
    join(base, "p.json"),
    JSON.stringify({ allowedEffects: ["audit.write"], allowedTargets: ["wasm"], requireVerified: true }),
  );
  writeFileSync(join(base, "a.json"), typeof artefacts === "string" ? artefacts : JSON.stringify(artefacts));
}

const baseArgs = ["--manifest", "m.json", "--policy", "p.json", "--target", "wasm", "--hash", MANIFEST_HASH, "--dry-run"];

describe("verifyDeployModuleHashes", () => {
  it("passes when every module matches its declared sha256 under root", () =>
    withTemp(async (base) => {
      const root = seed(base);
      const r = await verifyDeployModuleHashes(
        [art("mod/app.wasm", "module-bytes-v1"), art("runtime-manifest.json", "{\"m\":1}", "manifest")],
        root,
      );
      assert.deepEqual({ ...r, codes: [...r.codes] }, { ok: true, checked: 2, codes: [] });
      assert.ok(Object.isFrozen(r));
    }));

  it("refuses a one-byte tamper with FUNGI-VERIFY-003", () =>
    withTemp(async (base) => {
      const root = seed(base);
      writeFileSync(join(root, "mod", "app.wasm"), "module-bytes-v2");
      const r = await verifyDeployModuleHashes([art("mod/app.wasm", "module-bytes-v1")], root);
      assert.equal(r.ok, false);
      assert.equal(r.checked, 0);
      assert.deepEqual([...r.codes], [FUNGI_VERIFY_003]);
    }));

  it("refuses a missing file (002), ../ escape and absolute path (004), duplicates and empty sets (005), bad hash (001)", () =>
    withTemp(async (base) => {
      const root = seed(base);
      assert.deepEqual([...(await verifyDeployModuleHashes([art("mod/gone.wasm", "x")], root)).codes], [FUNGI_VERIFY_002]);
      assert.deepEqual([...(await verifyDeployModuleHashes([art("../outside.wasm", "outside")], root)).codes], [FUNGI_VERIFY_004]);
      assert.deepEqual(
        [...(await verifyDeployModuleHashes([art(join(base, "outside.wasm"), "outside")], root)).codes],
        [FUNGI_VERIFY_004],
      );
      const dup = await verifyDeployModuleHashes([art("mod/app.wasm", "module-bytes-v1"), art("mod/app.wasm", "module-bytes-v1")], root);
      assert.equal(dup.ok, false);
      assert.deepEqual([...dup.codes], [FUNGI_VERIFY_005]);
      assert.deepEqual([...(await verifyDeployModuleHashes([], root)).codes], [FUNGI_VERIFY_005]);
      const bad = await verifyDeployModuleHashes([{ path: "mod/app.wasm", kind: "bundle", hash: "sha256:XYZ", target: "wasm" }], root);
      assert.deepEqual([...bad.codes], [FUNGI_VERIFY_001]);
    }));

  it("refuses symlinks that leave the root", { skip: process.platform === "win32" }, () =>
    withTemp(async (base) => {
      const root = seed(base);
      symlinkSync(join(base, "outside.wasm"), join(root, "mod", "link.wasm"));
      const r = await verifyDeployModuleHashes([art("mod/link.wasm", "outside")], root);
      assert.equal(r.ok, false);
      assert.deepEqual([...r.codes], [FUNGI_VERIFY_004]);
    }));

  it("fails closed on hostile or malformed input without throwing", () =>
    withTemp(async (base) => {
      const root = seed(base);
      const getter = { kind: "bundle", hash: sha("module-bytes-v1"), target: "wasm" };
      Object.defineProperty(getter, "path", { enumerable: true, get: () => "mod/app.wasm" });
      const cases = [
        undefined,
        null,
        {},
        "mod/app.wasm",
        [null],
        [{ ...art("mod/app.wasm", "module-bytes-v1"), extra: "secret-key-name" }],
        [getter],
        [{ ...art("mod/app.wasm", "module-bytes-v1"), kind: "binary" }],
      ];
      for (const input of cases) {
        const r = await verifyDeployModuleHashes(input, root);
        assert.equal(r.ok, false);
        assert.equal(r.checked, 0);
        assert.ok(r.codes.length > 0);
        for (const code of r.codes) assert.match(code, /^FUNGI-VERIFY-00[1-5]$/);
        assert.equal(JSON.stringify(r).includes("secret-key-name"), false);
      }
      assert.equal((await verifyDeployModuleHashes([art("mod/app.wasm", "module-bytes-v1")], "")).ok, false);
      assert.equal((await verifyDeployModuleHashes([art("mod/app.wasm", "module-bytes-v1")], 7)).ok, false);
    }));

  it("is re-exported from the deploy barrel", () => {
    assert.equal(deployBarrel.verifyDeployModuleHashes, verifyDeployModuleHashes);
  });
});

describe("galerina deploy --artefacts (module-hash gate)", () => {
  it("parses --artefacts / --root and refuses --root alone or twice", () => {
    const ok = parseDeployArgs([...baseArgs, "--artefacts", "a.json", "--root", "build"]);
    assert.equal(ok.ok, true);
    assert.equal(ok.options.artefactsPath, "a.json");
    assert.equal(ok.options.root, "build");
    const plain = parseDeployArgs(baseArgs);
    assert.equal(plain.ok, true);
    assert.equal("artefactsPath" in plain.options, false);
    assert.equal("root" in plain.options, false);
    const rootOnly = parseDeployArgs([...baseArgs, "--root", "build"]);
    assert.equal(rootOnly.ok, false);
    assert.equal(rootOnly.result.error.code, FUNGI_CLI_DEPLOY_001);
    const twice = parseDeployArgs([...baseArgs, "--artefacts", "a.json", "--artefacts", "b.json"]);
    assert.equal(twice.result.error.code, FUNGI_CLI_DEPLOY_001);
    assert.equal(parseDeployArgs([...baseArgs, "--artefacts=a.json"]).result.error.code, FUNGI_CLI_DEPLOY_001);
  });

  it("succeeds when module hashes match and reports the count without paths", () =>
    withTemp(async (base) => {
      seed(base);
      writeInputs(base, [art("mod/app.wasm", "module-bytes-v1")]);
      const r = await runDeployCommand({ cwd: base, env: "test", args: [...baseArgs, "--artefacts", "a.json", "--root", "build"] });
      assert.equal(r.ok, true, JSON.stringify(r));
      assert.equal(r.code, DEPLOY_EXIT_OK);
      assert.ok(r.details.includes("Deploy dry-run: module hashes verified (1 artefact(s))."));
      assert.equal(JSON.stringify(r).includes("app.wasm"), false);
    }));

  it("refuses a tampered module with exit 7, codes only, and writes no report", () =>
    withTemp(async (base) => {
      const root = seed(base);
      writeInputs(base, [art("mod/app.wasm", "module-bytes-v1")]);
      writeFileSync(join(root, "mod", "app.wasm"), "module-bytes-v1!");
      mkdirSync(join(base, "out"));
      const r = await runDeployCommand({
        cwd: base,
        env: "test",
        args: [...baseArgs, "--artefacts", "a.json", "--root", "build", "--report", "out", "--json"],
      });
      assert.equal(r.ok, false);
      assert.equal(r.code, DEPLOY_EXIT_MANIFEST);
      assert.ok(r.details.some((d) => d.includes(FUNGI_VERIFY_003)));
      const text = JSON.stringify(r);
      for (const leak of ["app.wasm", "mod/", base, sha("module-bytes-v1"), "module-bytes"]) {
        assert.equal(text.includes(leak), false, "leaked a path, hash or bytes");
      }
      assert.equal(existsSync(join(base, "out", DEPLOYMENT_REPORT_FILE)), false);
    }));

  it("refuses an escaping or missing module with exit 7", () =>
    withTemp(async (base) => {
      seed(base);
      writeInputs(base, [art("../outside.wasm", "outside"), art("mod/none.wasm", "x")]);
      const r = await runDeployCommand({ cwd: base, env: "test", args: [...baseArgs, "--artefacts", "a.json", "--root", "build"] });
      assert.equal(r.code, DEPLOY_EXIT_MANIFEST);
      const line = r.details.find((d) => d.startsWith("Module-hash codes: "));
      assert.equal(line, `Module-hash codes: ${FUNGI_VERIFY_002}, ${FUNGI_VERIFY_004}`);
      assert.equal(JSON.stringify(r).includes("outside"), false);
    }));

  it("refuses unreadable / non-JSON / non-array / sparse --artefacts input as usage (003)", () =>
    withTemp(async (base) => {
      seed(base);
      writeInputs(base, []);
      const missing = await runDeployCommand({ cwd: base, env: "test", args: [...baseArgs, "--artefacts", "nope.json"] });
      assert.equal(missing.code, DEPLOY_EXIT_USAGE_OR_POLICY);
      assert.equal(missing.error.code, FUNGI_CLI_DEPLOY_003);
      for (const body of ["{not json", "{\"path\":\"x\"}", "[1,,2]"]) {
        writeInputs(base, body);
        const r = await runDeployCommand({ cwd: base, env: "test", args: [...baseArgs, "--artefacts", "a.json"] });
        assert.equal(r.code, DEPLOY_EXIT_USAGE_OR_POLICY);
        assert.equal(r.error.code, FUNGI_CLI_DEPLOY_003);
        assert.equal(JSON.stringify(r).includes("a.json"), false);
      }
    }));

  it("defaults --root to the working directory and refuses an empty set (005)", () =>
    withTemp(async (base) => {
      seed(base);
      writeInputs(base, [art("build/mod/app.wasm", "module-bytes-v1")]);
      const ok = await runDeployCommand({ cwd: base, env: "test", args: [...baseArgs, "--artefacts", "a.json"] });
      assert.equal(ok.code, DEPLOY_EXIT_OK);
      writeInputs(base, []);
      const empty = await runDeployCommand({ cwd: base, env: "test", args: [...baseArgs, "--artefacts", "a.json"] });
      assert.equal(empty.code, DEPLOY_EXIT_MANIFEST);
      assert.ok(empty.details.some((d) => d.includes(FUNGI_VERIFY_005)));
    }));

  it("still refuses without --dry-run even when modules verify (live deploy not in this slice)", () =>
    withTemp(async (base) => {
      seed(base);
      writeInputs(base, [art("mod/app.wasm", "module-bytes-v1")]);
      const args = baseArgs.filter((a) => a !== "--dry-run");
      const r = await runDeployCommand({ cwd: base, env: "test", args: [...args, "--artefacts", "a.json", "--root", "build"] });
      assert.equal(r.ok, false);
      assert.equal(r.code, DEPLOY_EXIT_USAGE_OR_POLICY);
      assert.equal(r.error.code, FUNGI_CLI_DEPLOY_001);
    }));
});
