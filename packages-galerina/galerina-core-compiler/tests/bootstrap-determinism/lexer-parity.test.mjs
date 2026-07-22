// =============================================================================
// bootstrap-determinism/lexer-parity.test.mjs
//
// REFRAMED 2026-07-23 (R&D #0050 §3): the old `PARITY_ACHIEVED = true` framing
// claimed the self-hosted lexer matches the TypeScript reference lexer token-for-
// token. It does NOT. Measured over a real corpus the two diverge in two
// SYSTEMATIC, BY-DESIGN classes (a functional-not-byte-identical relationship —
// see the RD-0528 I-1 evidence pack); the single-input test only passed because
// that one input dodged both classes. This test now asserts what is actually
// TRUE — the self-hosted lexer's own DOCUMENTED conventions, on inputs that
// EXERCISE the divergences, plus run-to-run determinism. There is no TS-parity
// claim to keep false.
//
// The two documented divergences from the TS lexer (intentional — the self-hosted
// compiler defines its own IR):
//   1. Single-char operators (`=`, `+`, …) are kind `Symbol`, not `Operator`
//      (self-hosted `scanOperator` promotes only TWO-char operators).
//   2. String / char literals carry the UNQUOTED content as their value
//      (`"hi"` -> `hi`), where the TS lexer keeps the raw quoted text.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { parseProgram, resolveSymbols, checkTypes, executeFlow } from "../../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const LEXER_PATH = join(__dir, "../../src/self-hosted/lexer.fungi");

/** Load and compile lexer.fungi, stripping BOM if present. */
function loadSelfHostedLexer() {
  let source = readFileSync(LEXER_PATH, "utf8");
  if (source.charCodeAt(0) === 0xFEFF) source = source.slice(1);
  const parsed = parseProgram(source, "lexer.fungi");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  return parsed;
}

/** Run the self-hosted tokenize flow; returns [{kind, value}]. */
async function selfHostedTokens(parsed, input) {
  const args = new Map();
  args.set("source", { __tag: "string", value: input });
  const result = await executeFlow("tokenize", args, parsed.ast);
  if (result.value.__tag !== "ok") {
    throw new Error(`lexer.fungi tokenize returned non-Ok: ${JSON.stringify(result.value)}`);
  }
  const list = result.value.value;
  if (list.__tag !== "list") {
    throw new Error(`lexer.fungi Ok value is not a list: ${list.__tag}`);
  }
  return list.items.map((t) => {
    if (t.__tag !== "record") return { kind: "??", value: "??" };
    const kind = t.fields.get("kind");
    const val = t.fields.get("value");
    const kindStr =
      kind?.__tag === "unresolved" ? kind.name
        : kind?.__tag === "string" ? kind.value : "??";
    const valStr = val?.__tag === "string" ? val.value : "??";
    return { kind: kindStr, value: valStr };
  });
}

/** first token whose value === `value` */
const tokenOf = (toks, value) => toks.find((t) => t.value === value);

let parsed;
before(() => { parsed = loadSelfHostedLexer(); });

describe("lexer.fungi — documented conventions on divergence-class inputs (R&D #0050 §3)", () => {
  it("single-char operators are kind `Symbol`; two-char operators are `Operator`", async () => {
    // The divergence class the old parity test dodged: TS emits `Operator` for a
    // single `=`/`+`; the self-hosted lexer emits `Symbol` (only 2-char promote).
    const cases = [
      { src: "let x = 1", value: "=", kind: "Symbol" },
      { src: "x + y", value: "+", kind: "Symbol" },
      { src: "a != b", value: "!=", kind: "Operator" }, // 2-char → Operator (both agree)
      { src: "x >= 10", value: ">=", kind: "Operator" },
    ];
    for (const c of cases) {
      const t = tokenOf(await selfHostedTokens(parsed, c.src), c.value);
      assert.ok(t, `expected a token '${c.value}' in ${JSON.stringify(c.src)}`);
      assert.equal(t.kind, c.kind, `'${c.value}' should be kind ${c.kind}, got ${t.kind}`);
    }
  });

  it("string literals carry the UNQUOTED content as their value", async () => {
    const s = (await selfHostedTokens(parsed, `x = "hi"`)).find((t) => t.kind === "StringLiteral");
    assert.ok(s, "expected a StringLiteral token");
    assert.equal(s.value, "hi", `string value should be unquoted, got ${JSON.stringify(s.value)}`);
  });

  it("char literals carry the UNQUOTED content as their value", async () => {
    const c = (await selfHostedTokens(parsed, `c = 'a'`)).find((t) => t.kind === "CharLiteral");
    assert.ok(c, "expected a CharLiteral token");
    assert.equal(c.value, "a", `char value should be unquoted, got ${JSON.stringify(c.value)}`);
  });
});

describe("lexer.fungi — run-to-run determinism", () => {
  it("tokenizing the same source twice yields an identical token stream", async () => {
    const src = `pure flow add(a: Int, b: Int) -> Int { let x = "hi"\nreturn a }`;
    const a = await selfHostedTokens(parsed, src);
    const b = await selfHostedTokens(parsed, src);
    assert.deepEqual(a, b, "tokenize is not deterministic run-to-run");
  });

  it("determinism holds across the divergence-class corpus", async () => {
    for (const src of [`let x = 1`, `x + y`, `c = 'a'`, `msg = "hello world"`, `a != b && c`]) {
      const a = await selfHostedTokens(parsed, src);
      const b = await selfHostedTokens(parsed, src);
      assert.deepEqual(a, b, `non-deterministic for ${JSON.stringify(src)}`);
    }
  });
});
