// MR28: no wall or ambient clock can reach expiry in the .fungi memory tree.
// (1) Source pin: no memory .fungi file calls Clock/Time/Date or declares a
//     clock effect; the expiry gate is a pure flow over caller readings.
// (2) Compiler probe: a pure flow that reads Clock.now() or Time.nowMs() does
//     not run (the WASM lowering refuses). `galerina check` still admits it:
//     finding F1 in evidence/mr28-memory-research/findings.md. That check
//     behaviour is a tripwire below; if it flips, update F1 and this test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  memorySources, wallClockFindings, stripCommentsAndStrings, flowBody,
  runProbe, checkProbe, pureProgram, UNIT,
} from "./mr28-harness.mjs";

test("no memory .fungi source reads a wall clock or declares a clock effect", () => {
  const sources = memorySources();
  assert.ok(sources.length >= 20, "memory src has its .fungi units: " + sources.length);
  const names = sources.map((s) => s.name);
  for (const required of ["secret-arena.fungi", "monotonic-time.fungi", "c-boundary.fungi", "release-commit-point.fungi"]) {
    assert.ok(names.includes(required), required + " present");
  }
  const bad = [];
  for (const s of sources) {
    for (const h of wallClockFindings(s.text)) bad.push(s.name + ":" + h.line + " " + h.kind + " " + h.text);
  }
  assert.deepEqual(bad, [], "wall-clock reads in memory sources");
});

test("every flow in secret-arena.fungi is pure", () => {
  const code = stripCommentsAndStrings(readFileSync(UNIT, "utf8"));
  const flows = code.split("\n").filter((l) => /^\s*(export\s+)?(pure\s+)?flow\s+[A-Za-z_]/.test(l));
  assert.ok(flows.length >= 30, "secret-arena flow count " + flows.length);
  const impure = flows.filter((l) => !/^\s*(export\s+)?pure\s+flow\s/.test(l));
  assert.deepEqual(impure, [], "impure flows");
});

test("applyArenaClock takes the reading as parameters and refuses armed time <= 0", () => {
  const body = flowBody(readFileSync(UNIT, "utf8"), "applyArenaClock");
  assert.ok(body, "applyArenaClock present");
  assert.match(body, /\n\s*clock: Int,/, "clock is a parameter");
  assert.match(body, /\n\s*armedAt: Int,/, "armedAt is a parameter");
  assert.match(body, /\.fungi reads no clock\./, "intent states no clock read");
  assert.match(body, /if armedAt <= 0 \{\n\s*return finish\(11, true\)/, "armed time <= 0 is untrusted");
  assert.match(body, /if clock < 0 \{\n\s*return finish\(11, true\)/, "negative clock is untrusted");
  assert.match(body, /if clock < armedAt \{\n\s*return finish\(22, true\)/, "backwards refuses");
  assert.deepEqual(wallClockFindings(body), [], "gate body has no wall-clock read");
});

test("scanner is not vacuous: it flags wall-clock reads and ignores prose", () => {
  assert.equal(wallClockFindings("  let t: Int = Clock.now()\n").length, 1);
  assert.equal(wallClockFindings("  let t: Float = Time.nowMs()\n").length, 1);
  assert.equal(wallClockFindings("  let t: Int = Date . now ( )\n").length, 1);
  assert.equal(wallClockFindings("effects { clock.read }\n").length, 1);
  assert.equal(wallClockFindings("  // Clock.now() would be wrong here\n").length, 0);
  assert.equal(wallClockFindings("  intent { \"Time.nowMs() is never called\" }\n").length, 0);
  assert.equal(wallClockFindings("  /* Date.now() */ let a: Int = 1\n").length, 0);
  assert.equal(wallClockFindings("  let clockNow: Int = clock\n").length, 0);
});

test("control: a plain pure flow runs through the same probe path", () => {
  const r = runProbe(pureProgram("plain", "  return a + 1", "a: Int"), "plain", [4]);
  assert.equal(r.status, 0, r.text);
  assert.match(r.text, /(^|\n)5\s*$/, "plain returns 5: " + r.text);
});

test("Clock.now() in a pure flow does not run", () => {
  const r = runProbe(pureProgram("readNow", "  let t: Int = Clock.now()\n  return t"), "readNow");
  assert.match(r.text, /FUNGI-WAT-METHOD-001/, r.text);
  assert.doesNotMatch(r.text, /(^|\n)-?\d+\s*$/, "no value produced: " + r.text);
});

test("Time.nowMs() in a pure flow does not run", () => {
  const r = runProbe(pureProgram("readMs", "  let t: Float = Time.nowMs()\n  return 1"), "readMs");
  assert.match(r.text, /FUNGI-WAT-METHOD-001/, r.text);
  assert.doesNotMatch(r.text, /(^|\n)-?\d+\s*$/, "no value produced: " + r.text);
});

test("wall clock fed into an expiry comparison does not run", () => {
  const body = [
    "  let now: Int = Clock.now()",
    "  if now > armedAt + budget - 1 {",
    "    return 147",
    "  }",
    "  return 100",
  ].join("\n");
  const r = runProbe(pureProgram("expiry", body, "armedAt: Int, budget: Int"), "expiry", [1000, 5000]);
  assert.match(r.text, /FUNGI-WAT-METHOD-001/, r.text);
  assert.doesNotMatch(r.text, /(^|\n)1(00|47)\s*$/, "no admit or deadline value: " + r.text);
});

test("tripwire F1: galerina check admits Clock.now() and Time.nowMs() in a pure flow", () => {
  for (const [flow, body] of [
    ["readNow", "  let t: Int = Clock.now()\n  return t"],
    ["readMs", "  let t: Float = Time.nowMs()\n  return 1"],
  ]) {
    const r = checkProbe(pureProgram(flow, body));
    assert.match(r.text, /0 errors/, "F1 still open for " + flow + "; if this now fails, update findings F1: " + r.text);
  }
});