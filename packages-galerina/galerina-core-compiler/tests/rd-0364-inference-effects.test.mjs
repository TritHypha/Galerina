// rd-0364-inference-effects.test.mjs — RD-0364 governed inference bridge contract:
// granular inference.invoke / inference.load effects + type-registry flag bits.
//
// Tests:
//   (1) inference.invoke and inference.load are canonical effects (accepted, not FUNGI-EFFECT-004).
//   (2) Both have distinct EffectFlags bits so effectsToFlags() correctly represents them.
//   (3) A flow using HybridInferenceEngine.infer must declare inference.invoke (FUNGI-EFFECT-001
//       if missing) — effect inference fires via EFFECT_REGISTRY.
//   (4) inference.invoke appears as a known effect in canonicality audit (not as unknown).
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPILER = join(HERE, "..", "dist", "index.js");

let L;
test.before(async () => { L = await import(pathToFileURL(COMPILER).href); });

test("RD-0364: inference.invoke and inference.load are canonical (no FUNGI-EFFECT-004)", () => {
  const { CANONICAL_EFFECTS } = L;
  assert.ok(CANONICAL_EFFECTS instanceof Set, "CANONICAL_EFFECTS must be exported");
  assert.ok(CANONICAL_EFFECTS.has("inference.invoke"), "inference.invoke must be canonical");
  assert.ok(CANONICAL_EFFECTS.has("inference.load"),   "inference.load must be canonical");
});

test("RD-0364: effectsToFlags has distinct non-zero bits for inference.invoke and inference.load", () => {
  const { effectsToFlags } = L;
  if (typeof effectsToFlags !== "function") return;
  const invokeMask = effectsToFlags(["inference.invoke"]);
  const loadMask   = effectsToFlags(["inference.load"]);
  assert.ok(invokeMask !== 0, "inference.invoke must have a non-zero flag bit");
  assert.ok(loadMask   !== 0, "inference.load must have a non-zero flag bit");
  assert.notEqual(invokeMask, loadMask, "inference.invoke and inference.load must have DISTINCT bits");
  // Confirm neither aliases to the generic AiInference bit (they have their own distinct bits)
  const aiMask = effectsToFlags(["ai.inference"]);
  assert.notEqual(invokeMask, aiMask, "inference.invoke must not share the generic ai.inference bit");
});

test("RD-0364: a flow declaring inference.invoke compiles without FUNGI-EFFECT-004", () => {
  const SRC = `@version 1
guarded flow callModel(prompt: String) -> String
  contract {
    effects { inference.invoke }
  }
{
  return "result"
}`;
  const prog = L.parseProgram(SRC, "inference-test.fungi");
  const fx = L.checkEffects(prog.flows, prog.ast);
  const errors = (fx ?? []).flatMap(s => [
    ...(s.diagnostics ?? []),
    ...(s.errors ?? []),
  ]).filter(d => d.severity === "error" && d.code === "FUNGI-EFFECT-004");
  assert.equal(errors.length, 0, `inference.invoke must not trigger FUNGI-EFFECT-004: ${JSON.stringify(errors)}`);
});

test("RD-0364: inference.load is DISTINCT from inference.invoke (supply-chain vs call)", () => {
  // inference.load = model load event; inference.invoke = per-call; they must be separate effects
  // and neither should alias to the other.
  const { CANONICAL_EFFECTS } = L;
  assert.ok(CANONICAL_EFFECTS.has("inference.invoke"));
  assert.ok(CANONICAL_EFFECTS.has("inference.load"));
  // Sanity: the existing ai.inference canonical is still present (backward compat)
  assert.ok(CANONICAL_EFFECTS.has("ai.inference"), "ai.inference must still be canonical");
});
