#!/usr/bin/env node
// K3-M1 merge-day dry-run: probe backup/readiness/rehearsal, print merge commands. Never merges.
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function argValue(name, argv = process.argv) {
  const prefix = `${name}=`;
  const hit = argv.find((row) => row.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

function lastJson(text) {
  try {
    return JSON.parse((text ?? "").trim().split(/\r?\n/u).filter(Boolean).pop() ?? "{}");
  } catch {
    return null;
  }
}

function stampOut(out) {
  if (typeof out === "string" && out !== "") return out;
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `D:\\Backups\\pre-k3-merge-${day}`;
}

function spawnJson(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: result.status,
    json: lastJson(`${result.stdout ?? ""}\n${result.stderr ?? ""}`),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function mergeDayCommands({ galerina, slide, outDir, galHead, slideHead }) {
  return Object.freeze([
    `node scripts/k3-pre-merge-backup.mjs --out=${outDir} --galerina=${galerina} --slide=${slide}`,
    `git -C ${galerina} checkout main`,
    `git -C ${galerina} merge --no-ff ${galHead} -m "merge grok/k3-frame-epoch-20261028 [skip ci]"`,
    `git -C ${galerina} push origin HEAD:refs/heads/main`,
    `git -C ${slide} checkout main`,
    `git -C ${slide} merge --no-ff ${slideHead} -m "merge grok/slide-k3-frame-epoch-20261028 [skip ci]"`,
    `git -C ${slide} push origin HEAD:refs/heads/main`,
    `node scripts/k3-post-merge-check.mjs --slide-root=${slide}`,
  ]);
}

export function runMergeDay({
  galerina = ROOT,
  slideRoot,
  outDir,
  dryRun = true,
  runBackup,
  runGalReadiness,
  runSlideReadiness,
  runRehearsal,
} = {}) {
  if (dryRun !== true) {
    return Object.freeze({ verdict: "NOT_READY", ok: false, reason: "only --dry-run is authorized" });
  }
  if (typeof slideRoot !== "string" || slideRoot === "") {
    return Object.freeze({ verdict: "NOT_READY", ok: false, reason: "missing --slide-root" });
  }
  const gal = resolve(galerina);
  const slide = resolve(slideRoot);
  const out = stampOut(outDir);
  const backup = typeof runBackup === "function"
    ? runBackup({ galerina: gal, slide, outDir: out })
    : spawnJson(
      process.execPath,
      [join(slide, "scripts", "k3-pre-merge-backup.mjs"), "--dry-run", `--galerina=${gal}`, `--slide=${slide}`],
      slide,
    ).json ?? { ok: false };
  const galReady = typeof runGalReadiness === "function"
    ? runGalReadiness({ galerina: gal })
    : spawnJson(process.execPath, [join(gal, "scripts", "k3-merge-readiness.mjs")], gal).json ?? { ok: false };
  const slideReady = typeof runSlideReadiness === "function"
    ? runSlideReadiness({ slide })
    : spawnJson(process.execPath, [join(slide, "scripts", "k3-merge-readiness.mjs")], slide).json ?? { ok: false };
  const rehearsal = typeof runRehearsal === "function"
    ? runRehearsal({ galerina: gal, slide })
    : spawnJson(
      process.execPath,
      [join(gal, "scripts", "k3-merge-rehearsal.mjs"), `--slide-root=${slide}`],
      gal,
    ).json ?? { ok: false, verdict: "NOT_READY" };
  const galHead = (spawnSync("git", ["rev-parse", "HEAD"], { cwd: gal, encoding: "utf8" }).stdout ?? "").trim();
  const slideHead = (spawnSync("git", ["rev-parse", "HEAD"], { cwd: slide, encoding: "utf8" }).stdout ?? "").trim();
  const commands = mergeDayCommands({
    galerina: gal,
    slide,
    outDir: out,
    galHead,
    slideHead,
  });
  const ready = backup?.ok === true
    && galReady?.ok === true
    && slideReady?.ok === true
    && (rehearsal?.ok === true || rehearsal?.verdict === "READY");
  return Object.freeze({
    verdict: ready ? "READY" : "NOT_READY",
    ok: ready,
    dryRun: true,
    outDir: out,
    backup,
    galMergeReadiness: galReady,
    slideMergeReadiness: slideReady,
    rehearsal,
    commands,
  });
}

const invoked = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  const report = runMergeDay({
    galerina: argValue("--galerina") || ROOT,
    slideRoot: argValue("--slide-root") || argValue("--slide"),
    outDir: argValue("--out"),
    dryRun: process.argv.includes("--dry-run"),
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok === true ? 0 : 1;
}
