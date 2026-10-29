/**
 * K3-SH pin: self-hosted lookup/bind parameters must not be named `env`.
 * interpreter.ts resolveCapabilityEffect maps any fullName starting with
 * `env.` to secret.read (0f949c406). That path returns Int 0 and trips
 * ERR_K3_SUBJECT_TYPE at runtime.fungi check_k3.
 * Replay: node --test --test-reporter=tap tests/k3sh-env-rename.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SH = join(dirname(fileURLToPath(import.meta.url)), "../src/self-hosted");

function load(name) {
  return readFileSync(join(SH, name), "utf8").replace(/^\uFEFF/, "");
}

describe("K3-SH env parameter rename", () => {
  it("runtime.fungi envLookup/envBind take bindings and never call env.<method>", () => {
    const src = load("runtime.fungi");
    assert.equal(src.includes("pure flow envLookup(bindings: Array<Binding>, name: String) -> RtValue"), true);
    assert.equal(src.includes("pure flow envBind(bindings: Array<Binding>, name: String, v: RtValue) -> Array<Binding>"), true);
    assert.equal(src.includes("while i < bindings.count()"), true);
    assert.equal(src.includes("let bOpt = bindings.get(i)"), true);
    assert.equal(src.includes("return bindings.append(Binding { name: name, val: v })"), true);
    assert.equal(src.includes("pure flow envLookup(env:"), false);
    assert.equal(src.includes("pure flow envBind(env:"), false);
  });

  it("type-checker.fungi resolveStatic/resolveBitfieldAccess never call env.<member>", () => {
    const src = load("type-checker.fungi");
    assert.equal(src.includes("pure flow resolveStatic(staticEnv: StaticEnv, name: String) -> String"), true);
    assert.equal(src.includes("pure flow resolveBitfieldAccess(bitfieldEnv: BitfieldEnv, register: String, field: String) -> Int"), true);
    assert.equal(src.includes("while i < staticEnv.entries.count()"), true);
    assert.equal(src.includes("let eOpt = staticEnv.entries.get(i)"), true);
    assert.equal(src.includes("while i < bitfieldEnv.entries.count()"), true);
    assert.equal(src.includes("let eOpt = bitfieldEnv.entries.get(i)"), true);
    assert.equal(src.includes("pure flow resolveStatic(env:"), false);
    assert.equal(src.includes("pure flow resolveBitfieldAccess(env:"), false);
  });

  it("self-hosted compiler fungi have no env.<method> receiver after the rename", () => {
    const runtime = load("runtime.fungi");
    const checker = load("type-checker.fungi");
    assert.equal(/\benv\.(count|get|append|entries)\b/.test(runtime), false);
    assert.equal(/\benv\.(count|get|append|entries)\b/.test(checker), false);
  });
});
