// S10 composed-route harness (copied from tests/s8-release/harness.mjs at b59ec46e3). The S10 tests are HARD tests:
// red() never downgrades to todo, so a missing closure fails the suite. Suite 48 keeps its own todo harness.
// Synthetic data only. NON_AUTHORIZING. Each red test encodes one R&D verdict and is marked
// expected-red through node:test `todo` so existing suites stay green. Set GALERINA_REDTESTS_STRICT=1
// to run them as hard tests (that is how a SuperGrok brief proves the step closed: every test here
// must pass in strict mode).
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
export const MEM = join(HERE, "..", "..");
export const REPO = join(MEM, "..", "..", "..");
export const SRC = join(MEM, "src");
export const EVIDENCE = join(MEM, "evidence");
export const GALERINA = join(REPO, "galerina.mjs");
export const STRICT = process.env.GALERINA_REDTESTS_STRICT === "1";

// Expected-red marker: { todo } unless strict. Reason text names the step and the verdict.
export function red(step, verdict) {
  void step;
  void verdict;
  return {};
}

export function unitText(name) {
  return readFileSync(join(SRC, name + ".fungi"), "utf8");
}

// Flatten units in order: drop every import line and every unit's @version header except the first.
export function flatten(names) {
  let out = "";
  let i = 0;
  while (i < names.length) {
    let t = unitText(names[i]).split("\n").filter((l) => /^import\s+"/.test(l) === false).join("\n");
    if (i > 0) {
      t = t.replace(/^@version 1\s*$/m, "");
    }
    out = out + t + "\n";
    i = i + 1;
  }
  return out;
}

// Unique work dir and unique unit name per call (no shared fixed build name: X-H1).
export function withUnit(text, fn, cwd) {
  const dir = mkdtempSync(join(tmpdir(), "q48-"));
  const file = join(dir, "q48u" + randomBytes(6).toString("hex") + ".fungi");
  try {
    writeFileSync(file, text);
    return fn(file, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function galerina(args, cwd) {
  const r = spawnSync(process.execPath, [GALERINA, ...args], { encoding: "utf8", cwd: cwd || REPO, timeout: 300000 });
  return { status: r.status, text: (r.stdout || "") + (r.stderr || "") };
}

export function parseValue(text) {
  const m = text.match(/=>\s*(-?\d+)\s*$/m) || text.match(/^(-?\d+)\s*$/m);
  if (!m) {
    return { present: false, value: 0 };
  }
  const v = Number(m[1]);
  return Number.isSafeInteger(v) ? { present: true, value: v } : { present: false, value: 0 };
}

export function invoke(file, flow, args, cwd) {
  const r = galerina(["run", file, "--invoke", flow, ...args.map(String)], cwd || dirname(file));
  return { status: r.status, text: r.text, ...parseValue(r.text) };
}

export function have(cmd) {
  return spawnSync("sh", ["-c", "command -v " + cmd], { encoding: "utf8" }).status === 0;
}

export function evidence(rel) {
  const p = join(EVIDENCE, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

export function readRepo(rel) {
  const p = join(REPO, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}