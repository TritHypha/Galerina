#!/usr/bin/env node
// K3-ZZ merge rehearsal: --no-ff in temp clones only. Never pushes.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function argValue(name, argv = process.argv) {
  const prefix = `${name}=`;
  const hit = argv.find((row) => row.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function git(cwd, args) {
  const result = spawnSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    timeout: 120000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function spawnGitClone(args) {
  const result = spawnSync("git", args, { encoding: "utf8", timeout: 120000 });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.code ?? "",
  };
}

export function cloneInto(src, dest, { spawnClone = spawnGitClone } = {}) {
  mkdirSync(dirname(dest), { recursive: true });
  const local = spawnClone(["clone", "--local", src, dest]);
  if (local.status === 0) return { ...local, mode: "local" };
  try {
    rmSync(dest, { recursive: true, force: true });
  } catch {
    // dest may not exist after a failed --local clone
  }
  const noHard = spawnClone(["clone", "--no-hardlinks", src, dest]);
  return { ...noHard, mode: "no-hardlinks", localStderr: local.stderr };
}

export function unlinkJunctionsUnder(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    let st;
    try {
      st = lstatSync(path);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      try { unlinkSync(path); } catch { /* rmSync still runs */ }
      continue;
    }
    if (st.isDirectory()) unlinkJunctionsUnder(path);
  }
}

export function cleanupWorkDir(dir, { removeFn = rmSync } = {}) {
  if (typeof dir !== "string" || dir === "") {
    return Object.freeze({ cleaned: true, leftoverDir: null, cleanupError: null });
  }
  try {
    unlinkJunctionsUnder(dir);
    removeFn(dir, { recursive: true, force: true });
    return Object.freeze({ cleaned: true, leftoverDir: null, cleanupError: null });
  } catch (error) {
    return Object.freeze({
      cleaned: false,
      leftoverDir: dir,
      cleanupError: error instanceof Error ? error.message : String(error),
    });
  }
}

function resolveSha(cwd, ref) {
  const result = git(cwd, ["rev-parse", ref]);
  const sha = result.stdout.trim();
  if (result.status === 0 && /^[0-9a-f]{40}$/u.test(sha)) return sha;
  return "";
}

function pinOriginMain(cloneDir, sha) {
  if (sha === "") return;
  git(cloneDir, ["update-ref", "refs/remotes/origin/main", sha]);
}

function packageNodeModules(srcRoot) {
  const rels = [];
  if (existsSync(join(srcRoot, "node_modules"))) rels.push("node_modules");
  const pts = join(srcRoot, "packages-ts");
  if (existsSync(pts)) {
    for (const name of readdirSync(pts)) {
      const rel = join("packages-ts", name, "node_modules");
      if (existsSync(join(srcRoot, rel))) rels.push(rel);
    }
  }
  return rels;
}

function junctionIfPresent(srcRoot, cloneDir, rel) {
  const from = join(srcRoot, rel);
  const to = join(cloneDir, rel);
  if (!existsSync(from) || existsSync(to)) return;
  mkdirSync(dirname(to), { recursive: true });
  try {
    symlinkSync(realpathSync(from), to, "junction");
  } catch {
    try {
      symlinkSync(from, to, "dir");
    } catch {
      // Best-effort for gitignored deps. Post-merge stays fail-closed.
    }
  }
}

function extraLinkRels(srcRoot) {
  return [
    ...packageNodeModules(srcRoot),
    join("packages-ts", "galerina-core-compiler", "dist"),
  ].filter((rel) => existsSync(join(srcRoot, rel)));
}

function linkPackageNodeModules(srcRoot, cloneDir) {
  for (const rel of extraLinkRels(srcRoot)) {
    junctionIfPresent(srcRoot, cloneDir, rel);
  }
}

function nodePathFor(srcRoot) {
  const parts = [];
  for (const rel of packageNodeModules(srcRoot)) {
    const abs = join(srcRoot, rel);
    try {
      parts.push(realpathSync(abs));
    } catch {
      parts.push(abs);
    }
  }
  return parts;
}

function mergeTopicIntoMain(cloneDir, mainRef, topicSha) {
  const mainSha = git(cloneDir, ["rev-parse", mainRef]).stdout.trim();
  const co = git(cloneDir, ["checkout", "-B", "k3-merge-rehearsal-main", mainRef]);
  if (co.status !== 0) {
    return {
      ok: false,
      step: "checkout-main",
      stderr: co.stderr,
      main: mainSha,
      head: topicSha,
      conflictedPaths: [],
    };
  }
  const merge = git(cloneDir, [
    "-c", "user.name=TritHypha",
    "-c", "user.email=github@zerotrustframework.dev",
    "merge", "--no-ff", topicSha, "-m", "k3-merge-rehearsal [skip ci]",
  ]);
  if (merge.status !== 0) {
    const conflictedPaths = git(cloneDir, ["diff", "--name-only", "--diff-filter=U"])
      .stdout.split(/\r?\n/u).map((row) => row.trim()).filter(Boolean);
    git(cloneDir, ["merge", "--abort"]);
    return {
      ok: false,
      step: "merge",
      stderr: merge.stderr,
      main: mainSha,
      head: topicSha,
      conflictedPaths,
    };
  }
  const sha = git(cloneDir, ["rev-parse", "HEAD"]).stdout.trim();
  return { ok: true, sha, main: mainSha, head: topicSha, conflictedPaths: [] };
}

export function runMergeRehearsal({
  galerinaSrc,
  slideSrc,
  workDir,
  galMainRef = "origin/main",
  slideMainRef = "origin/main",
  galTopicRef = "HEAD",
  slideTopicRef = "HEAD",
  runPostMerge,
} = {}) {
  if (typeof galerinaSrc !== "string" || galerinaSrc === "") {
    return Object.freeze({ verdict: "NOT_READY", failingStep: "galerina-src", ok: false });
  }
  if (typeof slideSrc !== "string" || slideSrc === "") {
    return Object.freeze({ verdict: "NOT_READY", failingStep: "slide-src", ok: false });
  }
  const dest = workDir === undefined || workDir === ""
    ? mkdtempSync(join(tmpdir(), "k3-merge-rehearsal-"))
    : resolve(workDir);
  mkdirSync(dest, { recursive: true });
  const galClone = join(dest, "galerina");
  const slideClone = join(dest, "slide");
  const galTopic = git(galerinaSrc, ["rev-parse", galTopicRef]).stdout.trim();
  const slideTopic = git(slideSrc, ["rev-parse", slideTopicRef]).stdout.trim();
  const galMainSha = resolveSha(galerinaSrc, galMainRef);
  const slideMainSha = resolveSha(slideSrc, slideMainRef);
  const galCl = cloneInto(galerinaSrc, galClone);
  if (galCl.status !== 0) {
    return Object.freeze({ verdict: "NOT_READY", failingStep: "clone-galerina", ok: false, stderr: galCl.stderr });
  }
  const slideCl = cloneInto(slideSrc, slideClone);
  if (slideCl.status !== 0) {
    return Object.freeze({ verdict: "NOT_READY", failingStep: "clone-slide", ok: false, stderr: slideCl.stderr });
  }
  // clone --local maps origin/main to the source local main, which can lag GitHub.
  pinOriginMain(galClone, galMainSha);
  pinOriginMain(slideClone, slideMainSha);
  const galMerge = mergeTopicIntoMain(galClone, galMainSha || galMainRef, galTopic);
  if (galMerge.ok !== true) {
    return Object.freeze({
      verdict: "NOT_READY",
      failingStep: `galerina-${galMerge.step}`,
      ok: false,
      stderr: galMerge.stderr,
      conflictedPaths: Object.freeze(galMerge.conflictedPaths ?? []),
      main: galMerge.main ?? galMainSha,
      head: galMerge.head ?? galTopic,
    });
  }
  const slideMerge = mergeTopicIntoMain(slideClone, slideMainSha || slideMainRef, slideTopic);
  if (slideMerge.ok !== true) {
    return Object.freeze({
      verdict: "NOT_READY",
      failingStep: `slide-${slideMerge.step}`,
      ok: false,
      stderr: slideMerge.stderr,
      conflictedPaths: Object.freeze(slideMerge.conflictedPaths ?? []),
      main: slideMerge.main ?? slideMainSha,
      head: slideMerge.head ?? slideTopic,
    });
  }
  // Checkout/merge would drop a pre-merge junction. Link gitignored node_modules after HEAD is merged.
  linkPackageNodeModules(galerinaSrc, galClone);
  linkPackageNodeModules(slideSrc, slideClone);
  git(galClone, ["status"]);
  git(slideClone, ["status"]);
  let post;
  if (typeof runPostMerge === "function") {
    post = runPostMerge({ galerina: galClone, slide: slideClone });
  } else {
    const nodePath = [...nodePathFor(galerinaSrc), ...nodePathFor(slideSrc), process.env.NODE_PATH]
      .filter((p) => typeof p === "string" && p !== "")
      .join(delimiter);
    const spawned = spawnSync(
      process.execPath,
      [join(galClone, "scripts", "k3-post-merge-check.mjs"), `--slide-root=${slideClone}`],
      {
        cwd: galClone,
        encoding: "utf8",
        timeout: 600000,
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, NODE_PATH: nodePath },
      },
    );
    const timedOut = spawned.error?.code === "ETIMEDOUT"
      || spawned.status === null
      || /ETIMEDOUT/u.test(`${spawned.stderr ?? ""}\n${spawned.stdout ?? ""}`);
    if (timedOut) {
      post = {
        verdict: "UNKNOWN",
        ok: false,
        failingStep: "post-merge",
        reason: "timeout: post-merge",
        status: spawned.status,
      };
    } else {
      try {
        post = JSON.parse((spawned.stdout ?? "").trim().split(/\r?\n/u).filter(Boolean).pop() ?? "{}");
      } catch {
        post = { verdict: "RED", ok: false, failingStep: "post-merge-parse", status: spawned.status };
      }
      if (spawned.status !== 0 && post.ok !== false) {
        post = { verdict: "RED", ok: false, failingStep: post.failingStep ?? "post-merge", status: spawned.status };
      }
    }
  }
  const ready = post?.ok === true || post?.verdict === "GREEN";
  const unknown = post?.verdict === "UNKNOWN";
  return Object.freeze({
    verdict: ready ? "READY" : unknown ? "UNKNOWN" : "NOT_READY",
    ok: ready,
    failingStep: ready ? null : (post?.failingStep ?? "post-merge"),
    reason: unknown ? (post?.reason ?? "timeout: post-merge") : undefined,
    galerinaMerged: galMerge.sha,
    slideMerged: slideMerge.sha,
    workDir: dest,
    post,
  });
}

const invoked = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  const keep = process.argv.includes("--keep");
  const report = runMergeRehearsal({
    galerinaSrc: argValue("--galerina") || ROOT,
    slideSrc: argValue("--slide-root") || argValue("--slide"),
    workDir: argValue("--work-dir") || undefined,
  });
  let leftoverDir = null;
  let cleanupError = null;
  if (keep !== true && report.workDir) {
    const cleaned = cleanupWorkDir(report.workDir);
    if (cleaned.cleaned !== true) {
      leftoverDir = cleaned.leftoverDir;
      cleanupError = cleaned.cleanupError;
    }
  }
  const out = leftoverDir
    ? { ...report, leftoverDir, cleanupError }
    : report;
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exitCode = report.ok === true ? 0 : report.verdict === "UNKNOWN" ? 2 : 1;
}
