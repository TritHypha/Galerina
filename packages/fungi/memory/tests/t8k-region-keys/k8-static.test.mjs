// T8K-K8 static laws and closed code set for region-keys.fungi. Synthetic only. NON_AUTHORIZING.
// Typed UNKNOWN only (no null, no NaN), every match ends in a fail-closed `_ =>` arm, each flow's final
// statement is a fail-closed return, "WebAssembly" spelt out, no master-derivation or persist path.
// The closed return set is enforced on every call by common.mjs grid().
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SRC } from "./harness.mjs";

const FLOWS = ["admitKeySource", "admitKeyId", "requestPersist", "admitStop", "startupKek", "useKey", "unwrapDek"];

test("T8K-K8 a: region-keys.fungi obeys the static memory laws", () => {
  const t = readFileSync(join(SRC, "region-keys.fungi"), "utf8");
  assert.equal(/\bnull\b/.test(t), false, "no null");
  assert.equal(/\bNaN\b/.test(t), false, "no NaN");
  assert.equal(/\bWASM\b|\bWasm\b/.test(t), false, "spell WebAssembly");
  const matches = (t.match(/\bmatch\b/g) || []).length;
  const arms = (t.match(/_\s*=>/g) || []).length;
  assert.ok(arms >= matches, "every match needs a fail-closed _ => arm");
  assert.equal(/\bderive\w*\s*\(/i.test(t), false, "no derivation flow");
});

test("T8K-K8 b: every flow is present and ends in a fail-closed return", () => {
  const t = readFileSync(join(SRC, "region-keys.fungi"), "utf8");
  for (const flow of FLOWS) {
    const at = t.search(new RegExp("flow\\s+" + flow + "\\s*\\("));
    assert.ok(at >= 0, "flow " + flow + " present");
    const rest = t.slice(at + 5);
    const next = rest.search(/\bflow\s+\w+\s*\(/);
    const chunk = next >= 0 ? rest.slice(0, next) : rest;
    const body = chunk.slice(0, chunk.lastIndexOf("}")).trimEnd();
    const last = body.split("\n").pop().trim();
    assert.ok(/^return (finish\(11, true\)|11|106)$/.test(last),
      flow + " must end in a fail-closed return, got: " + last);
  }
});
