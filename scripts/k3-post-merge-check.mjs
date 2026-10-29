#!/usr/bin/env node
// K3-ZY post-merge lock-step runner. Never merges and never flips.
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function argValue(name, argv = process.argv) {
  const prefix = `${name}=`;
  const hit = argv.find((row) => row.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : "";
}

export const POST_MERGE_STEPS = Object.freeze([
  Object.freeze({
    id: "lockstep",
    build(slideRoot) {
      return {
        command: process.execPath,
        args: [join(ROOT, "scripts", "k3-wire-lockstep-gate.mjs"), `--slide-root=${slideRoot}`],
        cwd: ROOT,
      };
    },
  }),
  Object.freeze({
    id: "code-index",
    build() {
      return {
        command: process.execPath,
        args: [join(ROOT, "scripts", "code-index.mjs"), "--check"],
        cwd: ROOT,
      };
    },
  }),
  Object.freeze({
    id: "lock",
    build() {
      return {
        command: process.execPath,
        args: [join(ROOT, "scripts", "flat-package-root-lock.mjs"), "--check"],
        cwd: ROOT,
      };
    },
  }),
  Object.freeze({
    id: "prebuild",
    build() {
      return {
        command: process.execPath,
        args: [join(ROOT, "packages-ts", "galerina-tower-citizen", "tests", "prebuild-k3-strong-kleene-pin.mjs")],
        cwd: ROOT,
      };
    },
  }),
  Object.freeze({
    id: "kleene-pin",
    build() {
      return {
        command: process.execPath,
        args: [
          "--test",
          join(ROOT, "packages-ts", "galerina-tower-citizen", "tests", "k3-strong-kleene-pin.test.mjs"),
        ],
        cwd: ROOT,
      };
    },
  }),
]);

export function defaultRunStep(step) {
  const spec = step.build(step.slideRoot);
  const result = spawnSync(spec.command, spec.args, {
    cwd: spec.cwd,
    encoding: "utf8",
    timeout: 300000,
  });
  return Object.freeze({
    id: step.id,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  });
}

export function runPostMergeCheck({ slideRoot, runStep = defaultRunStep } = {}) {
  if (typeof slideRoot !== "string" || slideRoot === "") {
    return Object.freeze({
      verdict: "RED",
      failingStep: "slide-root",
      ok: false,
      reason: "missing --slide-root",
    });
  }
  const steps = [];
  for (const def of POST_MERGE_STEPS) {
    const step = { ...def, slideRoot: resolve(slideRoot) };
    const got = runStep(step);
    steps.push({ id: def.id, status: got.status });
    if (got.status !== 0) {
      return Object.freeze({
        verdict: "RED",
        failingStep: def.id,
        ok: false,
        steps: Object.freeze(steps),
      });
    }
  }
  return Object.freeze({
    verdict: "GREEN",
    failingStep: null,
    ok: true,
    steps: Object.freeze(steps),
  });
}

const invoked = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  const report = runPostMergeCheck({ slideRoot: argValue("--slide-root") });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok === true ? 0 : 1;
}
