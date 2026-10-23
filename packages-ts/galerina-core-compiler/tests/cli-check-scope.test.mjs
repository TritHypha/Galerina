// cli-check-scope.test.mjs — `galerina check` must never report a pass over
// zero files (GD-026).
//
// THE DEFECT, measured before the fix. `ignore` patterns from
// galerina.check.json are applied AFTER file discovery. A pattern broad enough
// to cover every discovered file left the filtered list empty, so the per-file
// loop never ran, the error counter stayed at 0, and the run fell through to
// `PASS: Check passed` with exit 0 — a green byte-identical to a real one,
// produced by checking nothing. A file that exits 1 uncovered exited 0 once an
// `ignore` pattern covered it.
//
// WHY A CONTROL PAIR. Asserting only that the suppressed case refuses would not
// show WHY it refuses — a broken fixture would produce the same exit code. Each
// case below runs the SAME valid source twice, changing ONLY the config, so the
// verdict flipping from pass to refusal can be caused by nothing else.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dirname, "..", "dist", "cli.js");

/** A minimal source the compiler accepts, so any refusal is about SCOPE. */
const VALID_FUNGI = `@version 1
pure flow x() -> Int
contract {
  intent { "ok" }
}
{
  return 1
}
`;

/** Build a throwaway project, run `check` in it, and return stdout + exit code. */
function checkProject(config) {
  const dir = mkdtempSync(join(tmpdir(), "galerina-check-scope-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "unit.fungi"), VALID_FUNGI, "utf8");
    if (config) writeFileSync(join(dir, "galerina.check.json"), JSON.stringify(config, null, 2), "utf8");
    try {
      const stdout = execFileSync(process.execPath, [CLI, "check", "."], { cwd: dir, encoding: "utf8" });
      return { code: 0, stdout };
    } catch (error) {
      return { code: error.status, stdout: (error.stdout ?? "") + (error.stderr ?? "") };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("check: a valid file with no ignore config passes", () => {
  const { code, stdout } = checkProject(null);
  assert.equal(code, 0, `the control must pass, got exit ${code}:\n${stdout}`);
  assert.match(stdout, /PASS: Check passed/, "the control must report a pass");
});

test("check: the pass states how many files it checked", () => {
  // "PASS" alone cannot be told apart from a pass over nothing, by a reader or
  // by a script. The count is part of the verdict.
  const { stdout } = checkProject(null);
  assert.match(stdout, /PASS: Check passed \(1 file\(s\) checked\)/, `pass must state its scope:\n${stdout}`);
});

test("check: REFUSES when ignore patterns suppress every discovered file", () => {
  // Identical source to the control above; only the config differs.
  const { code, stdout } = checkProject({ ignore: ["src/**"] });
  assert.equal(code, 1, `suppressing every file must refuse, got exit ${code}:\n${stdout}`);
  assert.match(stdout, /REFUSED/, "the refusal must say so plainly");
  assert.doesNotMatch(stdout, /PASS: Check passed/, "a check over zero files must never print a pass");
});

test("check: a partial ignore still passes, and reports what it skipped", () => {
  // The refusal must be narrow. Suppressing SOME files is ordinary
  // configuration, not an error — only suppressing ALL of them is the fail-open.
  // Without this, the fix would be indistinguishable from breaking `ignore`.
  const dir = mkdtempSync(join(tmpdir(), "galerina-check-partial-"));
  try {
    mkdirSync(join(dir, "src"));
    mkdirSync(join(dir, "vendor"));
    writeFileSync(join(dir, "src", "unit.fungi"), VALID_FUNGI, "utf8");
    writeFileSync(join(dir, "vendor", "unit.fungi"), VALID_FUNGI, "utf8");
    writeFileSync(join(dir, "galerina.check.json"), JSON.stringify({ ignore: ["vendor/**"] }, null, 2), "utf8");
    const stdout = execFileSync(process.execPath, [CLI, "check", "."], { cwd: dir, encoding: "utf8" });
    assert.match(stdout, /PASS: Check passed/, "a partial ignore must still pass");
    assert.match(stdout, /1 file\(s\) checked, 1 ignored/, `the skipped count must be stated:\n${stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("check: relative target paths match target-relative ignore patterns on Windows", () => {
  const dir = mkdtempSync(join(tmpdir(), "galerina-check-relative-target-"));
  try {
    mkdirSync(join(dir, "examples", "auth-service"), { recursive: true });
    writeFileSync(join(dir, "examples", "auth-service", "unit.fungi"), VALID_FUNGI, "utf8");
    writeFileSync(join(dir, "galerina.check.json"), JSON.stringify({ ignore: ["unit.fungi"] }, null, 2), "utf8");
    let code = 0;
    let stdout = "";
    try {
      stdout = execFileSync(process.execPath, [CLI, "check", "examples/auth-service"], { cwd: dir, encoding: "utf8" });
    } catch (error) {
      code = error.status;
      stdout = (error.stdout ?? "") + (error.stderr ?? "");
    }
    assert.equal(code, 1, `an ignored relative target must refuse consistently, got exit ${code}:\n${stdout}`);
    assert.match(stdout, /REFUSED/, "the zero-file outcome must be explicit");
    assert.doesNotMatch(stdout, /PASS: Check passed/, "a cross-platform path mismatch must not produce a false pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
