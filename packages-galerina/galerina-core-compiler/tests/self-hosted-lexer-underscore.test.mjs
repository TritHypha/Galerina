// =============================================================================
// (b) token-kind arc — self-hosted lexer: underscore is IDENTIFIER-CONTINUATION
// =============================================================================
// Bridge 0093 (ruled by measuring the authoritative .ts lexer, which emits ONE token for
// `permitted_effects`): the self-hosted `lexer.fungi` `scanIdent` continuation was letter/digit
// only, so `permitted_effects` / `conforms_to` lexed as THREE tokens (Identifier "permitted" ·
// Symbol "_" · Keyword "effects"). That made the policy-branch's single-token `pv ==
// "permitted_effects"` check permanently false — a governance-parsing dead path (0090). Fix: the
// scanIdent continuation now also accepts `_`. This pins it so it cannot silently regress.
//
// Parity: this is a SOURCE change to a self-hosted stage, so both the interpreter and its WASM twin
// recompile identically — the P9 R3 byte-parity gates stay green by construction (full suite 4940/0
// with this change). No `kind` comparison involved; value/positional only.
// =============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { parseProgram, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
let SRC = readFileSync(join(__dir, "../src/self-hosted/lexer.fungi"), "utf8");
if (SRC.charCodeAt(0) === 0xFEFF) SRC = SRC.slice(1);
const prog = parseProgram(SRC, "lexer.fungi");

async function tokens(input) {
  const args = new Map([["source", { __tag: "string", value: input }]]);
  const res = await executeFlow("tokenize", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  const items = res?.value?.value?.items ?? [];
  return items
    .map((rec) => ({ kind: rec.fields.get("kind"), value: rec.fields.get("value")?.value ?? "" }))
    .filter((t) => (t.kind?.name ?? t.kind?.value ?? "") !== "Eof");
}

describe("self-hosted lexer: underscore is identifier-continuation", () => {
  it("`permitted_effects` lexes as ONE identifier token (was three)", async () => {
    const t = await tokens("permitted_effects");
    assert.equal(t.length, 1, `expected 1 token, got ${t.length}: ${JSON.stringify(t.map((x) => x.value))}`);
    assert.equal(t[0].value, "permitted_effects");
  });

  it("`conforms_to` lexes as ONE identifier token", async () => {
    const t = await tokens("conforms_to");
    assert.equal(t.length, 1, `expected 1 token, got ${t.length}: ${JSON.stringify(t.map((x) => x.value))}`);
    assert.equal(t[0].value, "conforms_to");
  });

  it("a trailing/embedded underscore stays inside the identifier", async () => {
    const t = await tokens("max_results value_1");
    assert.deepEqual(t.map((x) => x.value), ["max_results", "value_1"]);
  });

  it("control: non-underscore token boundaries are unchanged", async () => {
    const t = await tokens("x + y");
    assert.deepEqual(t.map((x) => x.value), ["x", "+", "y"]);
  });
});
