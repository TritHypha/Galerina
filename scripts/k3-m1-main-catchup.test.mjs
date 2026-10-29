// K3-M1 N-bo: main catch-up synthetic repos.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import { catchupOne, isGeneratedOnly, runMainCatchup } from "./k3-main-catchup.mjs";

function git(cwd, args) {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  return result;
}

function initBase(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "TritHypha"]);
  git(dir, ["config", "user.email", "github@zerotrustframework.dev"]);
  writeFileSync(join(dir, "a.txt"), "base\n");
  mkdirSync(join(dir, "build", "code-index"), { recursive: true });
  writeFileSync(join(dir, "build", "code-index", "provenance.json"), "{\"v\":1}\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "base"]);
  return dir;
}

describe("K3-M1 main catch-up", () => {
  it("M1-C1 generated-only conflict resolves by regen", () => {
    const dir = initBase("k3m1-c1-");
    try {
      git(dir, ["checkout", "-b", "topic"]);
      writeFileSync(join(dir, "topic.txt"), "topic\n");
      git(dir, ["add", "topic.txt"]);
      git(dir, ["commit", "-m", "topic"]);
      git(dir, ["checkout", "main"]);
      writeFileSync(join(dir, "build", "code-index", "provenance.json"), "{\"v\":2}\n");
      git(dir, ["add", "build/code-index/provenance.json"]);
      git(dir, ["commit", "-m", "main generated"]);
      git(dir, ["checkout", "topic"]);
      writeFileSync(join(dir, "build", "code-index", "provenance.json"), "{\"v\":3}\n");
      git(dir, ["add", "build/code-index/provenance.json"]);
      git(dir, ["commit", "-m", "topic generated"]);
      const report = catchupOne({
        cwd: dir,
        mainRef: "main",
        doFetch: false,
        runRegen(cwd) {
          writeFileSync(join(cwd, "build", "code-index", "provenance.json"), "{\"v\":\"regen\"}\n");
        },
        runLockWrite() { return { status: 0 }; },
        runLockCheck() { return { status: 0 }; },
      });
      assert.equal(report.verdict, "GREEN");
      assert.equal(report.ok, true);
      assert.equal(report.regenerated, true);
      assert.equal(readFileSync(join(dir, "build", "code-index", "provenance.json"), "utf8").includes("regen"), true);
      assert.equal(existsSync(join(dir, "topic.txt")), true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("M1-C2 real conflict refuses and names the path", () => {
    const dir = initBase("k3m1-c2-");
    try {
      git(dir, ["checkout", "-b", "topic"]);
      writeFileSync(join(dir, "a.txt"), "topic\n");
      git(dir, ["add", "a.txt"]);
      git(dir, ["commit", "-m", "topic a"]);
      git(dir, ["checkout", "main"]);
      writeFileSync(join(dir, "a.txt"), "main\n");
      git(dir, ["add", "a.txt"]);
      git(dir, ["commit", "-m", "main a"]);
      git(dir, ["checkout", "topic"]);
      const report = catchupOne({
        cwd: dir,
        mainRef: "main",
        doFetch: false,
        runLockWrite() { return { status: 0 }; },
        runLockCheck() { return { status: 0 }; },
      });
      assert.equal(report.verdict, "RED");
      assert.equal(report.ok, false);
      assert.equal(report.conflictedPaths.includes("a.txt"), true);
      assert.equal(isGeneratedOnly(report.conflictedPaths), false);
      const headFile = readFileSync(join(dir, "a.txt"), "utf8");
      assert.equal(headFile.includes("<<<<<<<"), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("M1-C3 no-op when origin/main is already an ancestor", () => {
    const dir = initBase("k3m1-c3-");
    try {
      git(dir, ["checkout", "-b", "topic"]);
      writeFileSync(join(dir, "topic.txt"), "topic\n");
      git(dir, ["add", "topic.txt"]);
      git(dir, ["commit", "-m", "topic"]);
      const report = catchupOne({
        cwd: dir,
        mainRef: "main",
        doFetch: false,
        runLockWrite() { throw new Error("must not lock"); },
        runLockCheck() { throw new Error("must not lock"); },
      });
      assert.equal(report.verdict, "GREEN");
      assert.equal(report.noop, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("M1-C4 runMainCatchup RED when slide conflicts", () => {
    const gal = initBase("k3m1-c4g-");
    const sld = initBase("k3m1-c4s-");
    try {
      git(gal, ["checkout", "-b", "topic"]);
      git(sld, ["checkout", "-b", "topic"]);
      writeFileSync(join(sld, "a.txt"), "topic\n");
      git(sld, ["add", "a.txt"]);
      git(sld, ["commit", "-m", "topic a"]);
      git(sld, ["checkout", "main"]);
      writeFileSync(join(sld, "a.txt"), "main\n");
      git(sld, ["add", "a.txt"]);
      git(sld, ["commit", "-m", "main a"]);
      git(sld, ["checkout", "topic"]);
      const report = runMainCatchup({
        galerina: gal,
        slideRoot: sld,
        mainRef: "main",
        doFetch: false,
        runLockWrite() { return { status: 0 }; },
        runLockCheck() { return { status: 0 }; },
      });
      assert.equal(report.verdict, "RED");
      assert.equal(report.galerina.noop, true);
      assert.equal(report.slide.conflictedPaths.includes("a.txt"), true);
    } finally {
      rmSync(gal, { recursive: true, force: true });
      rmSync(sld, { recursive: true, force: true });
    }
  });
});
