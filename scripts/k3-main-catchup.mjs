#!/usr/bin/env node
// K3-M1 N-bo: --no-ff catch-up of origin/main. Never pushes. Never flips.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GENERATED = /^build\/code-index\//u;

function argValue(name, argv = process.argv) {
  const prefix = `${name}=`;
  const hit = argv.find((row) => row.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function git(cwd, args, timeout = 120000) {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    timeout,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.code ?? "",
  };
}

function isTimeout(result) {
  if (result.error === "ETIMEDOUT") return true;
  if (result.status === null && result.error !== "") return true;
  return /ETIMEDOUT/u.test(`${result.stderr}\n${result.stdout}`);
}

export function isGeneratedOnly(paths) {
  const list = Array.isArray(paths) ? paths : [];
  if (list.length === 0) return false;
  return list.every((p) => GENERATED.test(String(p).replaceAll("\\", "/")));
}

function conflictedPaths(cwd) {
  return git(cwd, ["diff", "--name-only", "--diff-filter=U"])
    .stdout.split(/\r?\n/u)
    .map((row) => row.trim())
    .filter(Boolean);
}

function runNode(cwd, relArgs) {
  return spawnSync(process.execPath, relArgs, {
    cwd,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 20 * 1024 * 1024,
  });
}

function defaultRegen(cwd) {
  return runNode(cwd, [join(cwd, "scripts", "code-index.mjs")]);
}

function defaultLockWrite(cwd) {
  const script = join(cwd, "scripts", "flat-package-root-lock.mjs");
  if (!existsSync(script)) return { status: 0, skipped: true, stdout: "", stderr: "" };
  return runNode(cwd, [script, "--write"]);
}

function defaultLockCheck(cwd) {
  const script = join(cwd, "scripts", "flat-package-root-lock.mjs");
  if (!existsSync(script)) return { status: 0, skipped: true, stdout: "", stderr: "" };
  return runNode(cwd, [script, "--check"]);
}

function commitLockIfDirty(cwd) {
  const lockPath = "governance/flat-package-root-lock.json";
  if (!existsSync(join(cwd, lockPath))) return { status: 0, skipped: true };
  git(cwd, ["add", "--", lockPath]);
  const staged = git(cwd, ["diff", "--cached", "--name-only"]).stdout.trim();
  if (staged === "") return { status: 0, skipped: true };
  return git(cwd, [
    "-c", "user.name=TritHypha",
    "-c", "user.email=github@zerotrustframework.dev",
    "commit", "-m", "K3-M1: refresh flat-package-root-lock after origin/main [skip ci]",
  ]);
}

export function catchupOne({
  cwd,
  mainRef = "origin/main",
  doFetch = true,
  runRegen = defaultRegen,
  runLockWrite = defaultLockWrite,
  runLockCheck = defaultLockCheck,
} = {}) {
  if (typeof cwd !== "string" || cwd === "") {
    return Object.freeze({ verdict: "RED", ok: false, reason: "missing cwd" });
  }
  const root = resolve(cwd);
  if (doFetch === true) {
    const fetched = git(root, ["fetch", "origin"]);
    if (isTimeout(fetched)) {
      return Object.freeze({
        verdict: "UNKNOWN",
        ok: false,
        reason: "timeout: fetch",
        head: "",
        main: "",
        conflictedPaths: Object.freeze([]),
      });
    }
  }
  const head = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  const mainRun = git(root, ["rev-parse", mainRef]);
  const main = mainRun.stdout.trim();
  if (mainRun.status !== 0 || !/^[0-9a-f]{40}$/u.test(main)) {
    return Object.freeze({
      verdict: "RED",
      ok: false,
      reason: "missing-main",
      head,
      main: "",
      conflictedPaths: Object.freeze([]),
    });
  }
  const ancestor = git(root, ["merge-base", "--is-ancestor", main, "HEAD"]);
  if (ancestor.status === 0) {
    return Object.freeze({
      verdict: "GREEN",
      ok: true,
      noop: true,
      head,
      main,
      merged: head,
      conflictedPaths: Object.freeze([]),
    });
  }
  const merge = git(root, [
    "-c", "user.name=TritHypha",
    "-c", "user.email=github@zerotrustframework.dev",
    "merge", "--no-ff", main, "-m", `K3-M1: merge origin/main ${main.slice(0, 9)} [skip ci]`,
  ]);
  if (isTimeout(merge)) {
    git(root, ["merge", "--abort"]);
    return Object.freeze({
      verdict: "UNKNOWN",
      ok: false,
      reason: "timeout: merge",
      head,
      main,
      conflictedPaths: Object.freeze([]),
    });
  }
  if (merge.status === 0) {
    const written = runLockWrite(root);
    const lockCommit = commitLockIfDirty(root);
    const checked = runLockCheck(root);
    if ((written.status ?? 1) !== 0 || (lockCommit.status ?? 1) !== 0 || (checked.status ?? 1) !== 0) {
      return Object.freeze({
        verdict: "RED",
        ok: false,
        failingStep: "lock",
        head,
        main,
        merged: git(root, ["rev-parse", "HEAD"]).stdout.trim(),
        conflictedPaths: Object.freeze([]),
      });
    }
    return Object.freeze({
      verdict: "GREEN",
      ok: true,
      noop: false,
      head,
      main,
      merged: git(root, ["rev-parse", "HEAD"]).stdout.trim(),
      conflictedPaths: Object.freeze([]),
    });
  }
  const paths = conflictedPaths(root);
  if (isGeneratedOnly(paths)) {
    runRegen(root);
    git(root, ["add", "--", "build/code-index"]);
    const commit = git(root, [
      "-c", "user.name=TritHypha",
      "-c", "user.email=github@zerotrustframework.dev",
      "commit", "--no-edit", "-m", `K3-M1: merge origin/main ${main.slice(0, 9)} (regen code-index) [skip ci]`,
    ]);
    if (commit.status !== 0) {
      git(root, ["merge", "--abort"]);
      return Object.freeze({
        verdict: "RED",
        ok: false,
        failingStep: "regen-commit",
        head,
        main,
        conflictedPaths: Object.freeze(paths),
        stderr: commit.stderr,
      });
    }
    const written = runLockWrite(root);
    const lockCommit = commitLockIfDirty(root);
    const checked = runLockCheck(root);
    if ((written.status ?? 1) !== 0 || (lockCommit.status ?? 1) !== 0 || (checked.status ?? 1) !== 0) {
      return Object.freeze({
        verdict: "RED",
        ok: false,
        failingStep: "lock",
        head,
        main,
        merged: git(root, ["rev-parse", "HEAD"]).stdout.trim(),
        conflictedPaths: Object.freeze([]),
      });
    }
    return Object.freeze({
      verdict: "GREEN",
      ok: true,
      noop: false,
      regenerated: true,
      head,
      main,
      merged: git(root, ["rev-parse", "HEAD"]).stdout.trim(),
      conflictedPaths: Object.freeze([]),
    });
  }
  git(root, ["merge", "--abort"]);
  return Object.freeze({
    verdict: "RED",
    ok: false,
    failingStep: "conflict",
    head,
    main,
    conflictedPaths: Object.freeze(paths),
    stderr: merge.stderr,
  });
}

export function runMainCatchup({
  galerina = ROOT,
  slideRoot,
  mainRef = "origin/main",
  doFetch = true,
  runRegen,
  runLockWrite,
  runLockCheck,
} = {}) {
  const gal = catchupOne({
    cwd: galerina,
    mainRef,
    doFetch,
    runRegen,
    runLockWrite,
    runLockCheck,
  });
  let slide = null;
  if (typeof slideRoot === "string" && slideRoot !== "") {
    slide = catchupOne({
      cwd: slideRoot,
      mainRef,
      doFetch,
      runRegen,
      runLockWrite,
      runLockCheck,
    });
  }
  const parts = [gal, slide].filter(Boolean);
  const unknown = parts.find((row) => row.verdict === "UNKNOWN");
  if (unknown) {
    return Object.freeze({
      verdict: "UNKNOWN",
      ok: false,
      failingStep: unknown.reason ?? "timeout",
      galerina: gal,
      slide,
    });
  }
  const red = parts.find((row) => row.ok !== true);
  if (red) {
    return Object.freeze({
      verdict: "RED",
      ok: false,
      failingStep: red.failingStep ?? "conflict",
      galerina: gal,
      slide,
    });
  }
  return Object.freeze({
    verdict: "GREEN",
    ok: true,
    failingStep: null,
    galerina: gal,
    slide,
  });
}

const invoked = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  const report = runMainCatchup({
    galerina: argValue("--galerina") || ROOT,
    slideRoot: argValue("--slide-root") || argValue("--slide"),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok === true ? 0 : report.verdict === "UNKNOWN" ? 2 : 1;
}
