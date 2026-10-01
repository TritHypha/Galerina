import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FUNGI_VOID,
  PATTERN_CAPABILITY_SCHEMA,
  PATTERN_PROFILE,
  admitPatternCapability,
  buildWATModuleFromGIR,
  callStdlib,
  checkEffects,
  digestPatternSource,
  emitGIR,
  parseProgram,
  renderWAT,
} from "../dist/index.js";

function ctx() {
  return {
    recordEffect: () => {},
    resolveIdentifier: () => undefined,
    callFlow: async () => FUNGI_VOID,
    applyFn: async (_fn, arg) => arg,
  };
}

function compileWAT(src) {
  const parsed = parseProgram(src, "c20.fungi");
  const errs = parsed.diagnostics.filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse: " + errs.map((e) => e.message).join("; "));
  const fx = checkEffects(parsed.flows, parsed.ast);
  const { gir } = emitGIR(parsed.ast, parsed.flows, fx);
  return renderWAT(buildWATModuleFromGIR(gir, undefined, "c20", parsed.ast, true));
}

describe("C20 compile-time PatternCapability", () => {
  it("admits a closed ASCII pattern with a deterministic digest", () => {
    const first = admitPatternCapability("^[a-z]+$");
    const second = admitPatternCapability("^[a-z]+$");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.capability.schema, PATTERN_CAPABILITY_SCHEMA);
    assert.equal(first.capability.patternDigest, digestPatternSource("^[a-z]+$"));
    assert.deepEqual(first.capability.profile, PATTERN_PROFILE);
    assert.equal(first.capability.profile.wordBoundary, "refused");
    assert.equal(first.capability.profile.wat, "trap");
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(first.capability.patternDigest, second.capability.patternDigest);
  });

  it("refuses capturing groups instead of compiling them", () => {
    const numbered = admitPatternCapability("(hello)");
    assert.equal(numbered.ok, false);
    if (numbered.ok) return;
    assert.equal(numbered.code, "FUNGI-PATTERN-002");
    const named = admitPatternCapability("(?<word>hello)");
    assert.equal(named.ok, false);
    const nonCapture = admitPatternCapability("(?:hello)");
    assert.equal(nonCapture.ok, true);
  });

  it("refuses word boundaries instead of silently compiling them", () => {
    const admitted = admitPatternCapability("\\bword\\b");
    assert.equal(admitted.ok, false);
    if (admitted.ok) return;
    assert.match(admitted.message, /\\\\b|word.bound|unsupported|veto|SECURITY/i);
  });

  it("keeps interpreter MATCH/NO_MATCH as Bool and compile veto as err", async () => {
    const hit = await callStdlib(
      "matchesPattern",
      { __tag: "string", value: "hello" },
      [{ __tag: "string", value: "^[a-z]+$" }],
      ctx(),
    );
    assert.equal(hit?.__tag, "bool");
    assert.equal(hit?.value, true);
    const miss = await callStdlib(
      "matchesPattern",
      { __tag: "string", value: "Hello" },
      [{ __tag: "string", value: "^[a-z]+$" }],
      ctx(),
    );
    assert.equal(miss?.__tag, "bool");
    assert.equal(miss?.value, false);
    const veto = await callStdlib(
      "matchesPattern",
      { __tag: "string", value: "word" },
      [{ __tag: "string", value: "\\bword\\b" }],
      ctx(),
    );
    assert.equal(veto?.__tag, "err");
  });

  it("refuses a compile-time literal at WAT emit with FUNGI-WAT-PATTERN-001", () => {
    let thrown = "";
    try {
      compileWAT(`pure flow hasMatch(s: String) -> Bool
contract { effects {} }
{ return s.matchesPattern("^[a-z]+$") }`);
    } catch (e) {
      thrown = String(e && e.message ? e.message : e);
    }
    assert.match(thrown, /FUNGI-WAT-PATTERN-001/);
    assert.match(thrown, /C20: matchesPattern WAT ABI is not admitted/);
    assert.equal(thrown.includes("$matchesPattern"), false);
    assert.equal(thrown.includes("$host___matchesPattern"), false);
  });

  it("refuses a dynamic pattern at WAT emit with FUNGI-WAT-PATTERN-001", () => {
    let thrown = "";
    try {
      compileWAT(`pure flow hasMatch(s: String, p: String) -> Bool
contract { effects {} }
{ return s.matchesPattern(p) }`);
    } catch (e) {
      thrown = String(e && e.message ? e.message : e);
    }
    assert.match(thrown, /FUNGI-WAT-PATTERN-001/);
    assert.match(thrown, /C20: dynamic matchesPattern refused/);
    assert.equal(thrown.includes("$matchesPattern"), false);
  });
});
