// K3-ZZ: merge rehearsal with synthetic temp repos.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import { runMergeRehearsal } from "./k3-merge-rehearsal.mjs";

function git(cwd, args) {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
  return result;
}

function initRepo(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.name", "TritHypha"]);
  git(dir, ["config", "user.email", "github@zerotrustframework.dev"]);
  writeFileSync(join(dir, "a.txt"), "base\n");
  git(dir, ["add", "a.txt"]);
  git(dir, ["commit", "-m", "base"]);
  git(dir, ["checkout", "-b", "topic"]);
  writeFileSync(join(dir, "b.txt"), "topic\n");
  git(dir, ["add", "b.txt"]);
  git(dir, ["commit", "-m", "topic"]);
  git(dir, ["checkout", "main"]);
  writeFileSync(join(dir, "c.txt"), "main\n");
  git(dir, ["add", "c.txt"]);
  git(dir, ["commit", "-m", "main"]);
  git(dir, ["checkout", "topic"]);
  return dir;
}

describe("K3-ZZ merge rehearsal synthetic", () => {
  it("ZZ-R1 injected GREEN post-merge is READY with both merged shas", () => {
    const gal = initRepo("k3zz-gal-");
    const sld = initRepo("k3zz-sld-");
    const work = mkdtempSync(join(tmpdir(), "k3zz-work-"));
    try {
      const report = runMergeRehearsal({
        galerinaSrc: gal,
        slideSrc: sld,
        workDir: work,
        galMainRef: "origin/main",
        slideMainRef: "origin/main",
        galTopicRef: "topic",
        slideTopicRef: "topic",
        runPostMerge() {
          return { verdict: "GREEN", ok: true };
        },
      });
      assert.equal(report.verdict, "READY");
      assert.equal(report.ok, true);
      assert.equal(/^[0-9a-f]{40}$/u.test(report.galerinaMerged), true);
      assert.equal(/^[0-9a-f]{40}$/u.test(report.slideMerged), true);
    } finally {
      rmSync(gal, { recursive: true, force: true });
      rmSync(sld, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("ZZ-R2 injected RED post-merge is NOT_READY", () => {
    const gal = initRepo("k3zz-galr-");
    const sld = initRepo("k3zz-sldr-");
    const work = mkdtempSync(join(tmpdir(), "k3zz-workr-"));
    try {
      const report = runMergeRehearsal({
        galerinaSrc: gal,
        slideSrc: sld,
        workDir: work,
        galMainRef: "origin/main",
        slideMainRef: "origin/main",
        galTopicRef: "topic",
        slideTopicRef: "topic",
        runPostMerge() {
          return { verdict: "RED", ok: false, failingStep: "lock" };
        },
      });
      assert.equal(report.verdict, "NOT_READY");
      assert.equal(report.failingStep, "lock");
    } finally {
      rmSync(gal, { recursive: true, force: true });
      rmSync(sld, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("ZZ-R3 source origin/main SHA is pinned over clone local main", () => {
    const gal = initRepo("k3zz-gal3-");
    const sld = initRepo("k3zz-sld3-");
    const work = mkdtempSync(join(tmpdir(), "k3zz-work3-"));
    try {
      const mainSha = git(gal, ["rev-parse", "main"]).stdout.trim();
      const rootSha = git(gal, ["rev-list", "--max-parents=0", "HEAD"]).stdout.trim();
      git(gal, ["update-ref", "refs/remotes/origin/main", mainSha]);
      git(gal, ["branch", "-f", "main", rootSha]);
      const sMain = git(sld, ["rev-parse", "main"]).stdout.trim();
      const sRoot = git(sld, ["rev-list", "--max-parents=0", "HEAD"]).stdout.trim();
      git(sld, ["update-ref", "refs/remotes/origin/main", sMain]);
      git(sld, ["branch", "-f", "main", sRoot]);
      const report = runMergeRehearsal({
        galerinaSrc: gal,
        slideSrc: sld,
        workDir: work,
        galMainRef: "origin/main",
        slideMainRef: "origin/main",
        galTopicRef: "topic",
        slideTopicRef: "topic",
        runPostMerge({ galerina, slide }) {
          const ok = existsSync(join(galerina, "c.txt")) && existsSync(join(slide, "c.txt"));
          return { verdict: ok ? "GREEN" : "RED", ok };
        },
      });
      assert.equal(report.verdict, "READY");
    } finally {
      rmSync(gal, { recursive: true, force: true });
      rmSync(sld, { recursive: true, force: true });
      rmSync(work, { recursive: true, force: true });
    }
  });
});
