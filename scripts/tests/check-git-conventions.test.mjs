// Tests for scripts/check-git-conventions.mjs (W01 G6; advisory checker, not wired into CI).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { checkBranchName, checkCommitSubject, checkTag, parseArgs, runChecks } from "../check-git-conventions.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", "check-git-conventions.mjs");

describe("checkBranchName", () => {
  it("accepts main and <owner>/<topic>-<yyyymmdd>", () => {
    for (const b of ["main", "grok/core-config-startup-validation-20261005", "codex/rd-1413-kernel-20261004", "alex/fix.typo-20240229"]) {
      assert.equal(checkBranchName(b).ok, true, b);
    }
  });
  it("refuses legacy, uppercase, bad dates and odd sequences", () => {
    for (const b of ["docs/readme-update", "Grok/x-20261005", "grok/x-20261305", "grok/x-20230229", "grok/x_y-20261005", "grok/a..b-20261005", "grok/-x-20261005", "", "dev", "grok/x-2026100"]) {
      assert.equal(checkBranchName(b).ok, false, b);
    }
    assert.equal(checkBranchName(42).ok, false);
  });
});

describe("checkCommitSubject", () => {
  it("accepts Conventional Commits and GitHub merge subjects", () => {
    for (const s of [
      "feat(core-config): W01 G5 startup validation",
      "fix: correct .fungi filename examples",
      "docs(git)!: recut branch policy",
      "Merge pull request #7 from TritHypha/grok/wat-d4-e5-zippair-20261003",
      'Revert "feat: x"',
    ]) assert.equal(checkCommitSubject(s).ok, true, s);
  });
  it("refuses unknown types, missing colon, trailing period, overlong and control chars", () => {
    for (const s of ["update stuff", "feature: x", "feat:x", "feat(Core): x", "fix: done.", `feat: ${"x".repeat(100)}`, "feat: a\tb", ""]) {
      assert.equal(checkCommitSubject(s).ok, false, s);
    }
  });
});

describe("checkTag", () => {
  it("accepts release, deploy and rollback tags", () => {
    for (const t of ["v1.0.0", "v1.0.0-beta.2", "deploy/production/20261005-0415", "rollback/staging/v1.2.3-v1.2.2", "rollback/production/v1.0.0-beta.3-v1.0.0-beta.2"]) {
      assert.equal(checkTag(t).ok, true, t);
    }
  });
  it("refuses malformed tags", () => {
    for (const t of ["1.0.0", "v01.0.0", "v1.0", "v1.0.0-rc.1", "deploy/prod/20261005-0415", "deploy/production/20261005-2460", "deploy/production/20261332-0000", "rollback/production/v1.0.0-v1.0.0", "rollback/production/v1.0.0", "release/v1.0.0"]) {
      assert.equal(checkTag(t).ok, false, t);
    }
  });
});

describe("CLI", () => {
  it("parseArgs refuses unknown args, missing values and bad --max", () => {
    assert.ok("error" in parseArgs([]));
    assert.ok("error" in parseArgs(["--branch"]));
    assert.ok("error" in parseArgs(["--branch", "--subject"]));
    assert.ok("error" in parseArgs(["--max", "0", "--from-git"]));
    assert.ok("error" in parseArgs(["--push"]));
    assert.deepEqual(parseArgs(["--subject", "a", "--subject", "b"]).subjects, ["a", "b"]);
  });

  it("runChecks reports every violation", () => {
    const findings = runChecks({ branch: "docs/x", subjects: ["feat: ok", "bad"], tags: ["v1"] });
    assert.equal(findings.length, 3);
  });

  it("exit codes: 0 valid, 1 violations, 2 usage", () => {
    const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", windowsHide: true });
    assert.equal(run(["--branch", "grok/git-policy-20261005", "--subject", "docs(git): recut policy", "--tag", "v1.0.0"]).status, 0);
    const bad = run(["--branch", "feature/x"]);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /VIOLATION branch feature\/x/);
    assert.equal(run(["--nope"]).status, 2);
  });
});
