// K3-M1 merge-day dry-run injected runner.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mergeDayCommands, runMergeDay } from "./k3-merge-day.mjs";

describe("K3-M1 merge-day dry-run", () => {
  it("M1-D1 injected READY prints merge-day commands and does not merge", () => {
    const report = runMergeDay({
      galerina: "C:\\injected-gal",
      slideRoot: "C:\\injected-slide",
      outDir: "D:\\Backups\\pre-k3-merge-20261029",
      dryRun: true,
      runBackup() { return { ok: true, dryRun: true }; },
      runGalReadiness() { return { ok: true, conflicted: false }; },
      runSlideReadiness() { return { ok: true, conflicted: false }; },
      runRehearsal() { return { ok: true, verdict: "READY", galerinaMerged: "a".repeat(40), slideMerged: "b".repeat(40) }; },
    });
    assert.equal(report.verdict, "READY");
    assert.equal(report.ok, true);
    assert.equal(report.dryRun, true);
    assert.equal(report.commands[0].includes("k3-pre-merge-backup.mjs"), true);
    assert.equal(report.commands.some((row) => row.includes("merge --no-ff")), true);
    assert.equal(report.commands.some((row) => row.includes("push origin HEAD:refs/heads/main")), true);
    assert.equal(report.commands.at(-1).includes("k3-post-merge-check.mjs"), true);
  });

  it("M1-D2 rehearsal NOT_READY is NOT_READY", () => {
    const report = runMergeDay({
      galerina: "C:\\injected-gal",
      slideRoot: "C:\\injected-slide",
      outDir: "D:\\Backups\\pre-k3-merge-20261029",
      dryRun: true,
      runBackup() { return { ok: true }; },
      runGalReadiness() { return { ok: true }; },
      runSlideReadiness() { return { ok: true }; },
      runRehearsal() { return { ok: false, verdict: "NOT_READY", failingStep: "lock" }; },
    });
    assert.equal(report.verdict, "NOT_READY");
    assert.equal(report.ok, false);
  });

  it("M1-D3 mergeDayCommands lists backup merge push post-merge", () => {
    const cmds = mergeDayCommands({
      galerina: "G",
      slide: "S",
      outDir: "D:\\Backups\\x",
      galHead: "aa",
      slideHead: "bb",
    });
    assert.equal(cmds.length, 8);
    assert.equal(cmds[2].includes("aa"), true);
    assert.equal(cmds[5].includes("bb"), true);
  });
});
