// =============================================================================
// Phase R7A: Stage B Lexer Parity — TypeScript lexer vs lexer.spore
//
// Verifies that the self-hosted lexer (src/self-hosted/lexer.spore) produces
// the same token sequence as the TypeScript reference lexer (lex) for
// real Galerina source.
//
// Test input: "pure flow add(a: Int, b: Int) -> Int { return a }"
//
// Gap reporting strategy:
//   If lexer.spore does not yet match, the test logs the diff and passes with
//   assert.ok(true) so CI does not block.  When full parity is reached, flip
//   the PARITY_ACHIEVED flag to true to convert to hard assertions.
//
// Known gaps at time of writing (see LEXER_PARITY_STATUS.md):
//   1. Multi-char operators: lexer.spore emits Symbol("-") + Symbol(">") where
//      the TS lexer emits operator("->").  Need scanOperator() helper.
//   2. Kind casing: lexer.spore uses PascalCase ("Keyword", "Identifier", …)
//      while the TS lexer uses lowercase ("keyword", "identifier", …).
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
  lex,
  parseProgram,
  resolveSymbols,
  checkTypes,
  executeFlow,
} from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Flip to true once lexer.spore achieves full parity with the TS lexer.
// When true, every comparison becomes a hard assertion.
// ---------------------------------------------------------------------------
const PARITY_ACHIEVED = true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dir = dirname(fileURLToPath(import.meta.url));
const LEXER_PATH = join(__dir, "../../src/self-hosted/lexer.spore");

/** Load and compile lexer.spore, stripping BOM if present. */
function loadSelfHostedLexer() {
  let source = readFileSync(LEXER_PATH, "utf8");
  if (source.charCodeAt(0) === 0xFEFF) source = source.slice(1);
  const parsed = parseProgram(source, "lexer.spore");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  return parsed;
}

/**
 * Run the self-hosted tokenize flow on the given source text.
 * @param {{ ast: unknown }} parsed - result of loadSelfHostedLexer()
 * @param {string} input - Galerina source to tokenize
 * @returns {Promise<Array<{kind: string, value: string}>>}
 */
async function selfHostedTokens(parsed, input) {
  const args = new Map();
  args.set("source", { __tag: "string", value: input });
  const result = await executeFlow("tokenize", args, parsed.ast);

  if (result.value.__tag !== "ok") {
    throw new Error(`lexer.spore tokenize returned non-Ok: ${JSON.stringify(result.value)}`);
  }
  const list = result.value.value;
  if (list.__tag !== "list") {
    throw new Error(`lexer.spore Ok value is not a list: ${list.__tag}`);
  }
  return list.items.map((t) => {
    if (t.__tag !== "record") return { kind: "??", value: "??" };
    const kind = t.fields.get("kind");
    const val = t.fields.get("value");
    const kindStr =
      kind?.__tag === "unresolved"
        ? kind.name
        : kind?.__tag === "string"
          ? kind.value
          : "??";
    const valStr = val?.__tag === "string" ? val.value : "??";
    return { kind: kindStr, value: valStr };
  });
}

/**
 * Normalise a TypeScript-lexer token kind to PascalCase so comparisons
 * can be done in a kind-case-neutral way.
 *
 * TS lexer uses:  keyword | identifier | symbol | operator | number |
 *                 string  | char       | newline | eof
 * lexer.spore uses: Keyword | Identifier | Symbol | Operator | NumberLiteral |
 *                 StringLiteral | CharLiteral | Newline | Eof
 */
function tsPascalKind(kind) {
  const map = {
    keyword: "Keyword",
    identifier: "Identifier",
    symbol: "Symbol",
    operator: "Operator",
    number: "NumberLiteral",
    string: "StringLiteral",
    char: "CharLiteral",
    newline: "Newline",
    eof: "Eof",
    comment: "Comment",
  };
  return map[kind] ?? kind;
}

/**
 * Filter out newline and eof tokens for a fair content comparison.
 */
function significantTokens(toks) {
  return toks.filter((t) => {
    const lc = t.kind.toLowerCase();
    return lc !== "newline" && lc !== "eof";
  });
}

// ---------------------------------------------------------------------------
// The source under test
// ---------------------------------------------------------------------------

// Phase R7A: Stage B parity input — "pure flow add" uses the pure qualifier,
// two typed parameters, the -> return-type arrow, and a return expression.
// This exercises keywords, identifiers, symbols, and the multi-char operator.
const FLOW_GREET_SOURCE = "pure flow add(a: Int, b: Int) -> Int { return a }";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Stage B lexer parity: TS lexer vs lexer.spore", () => {

  // ── 1. TS lexer baseline ─────────────────────────────────────────────────

  it("TS lexer: tokenises FLOW_GREET_SOURCE without diagnostics", () => {
    const result = lex(FLOW_GREET_SOURCE, "parity.spore");
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `TS lexer produced errors: ${errors.map((e) => e.message).join("; ")}`,
    );
  });

  it("TS lexer: produces > 10 tokens for FLOW_GREET_SOURCE", () => {
    const result = lex(FLOW_GREET_SOURCE, "parity.spore");
    // "pure flow add(a: Int, b: Int) -> Int { return a }" yields 18 significant + eof = 19 total
    assert.ok(result.tokens.length > 10, `Expected >10 tokens, got ${result.tokens.length}`);
  });

  it("TS lexer: produces expected token sequence for FLOW_GREET_SOURCE", () => {
    const result = lex(FLOW_GREET_SOURCE, "parity.spore");
    const sig = result.tokens.filter(
      (t) => t.kind !== "eof" && t.kind !== "newline",
    );
    // "pure flow add(a: Int, b: Int) -> Int { return a }"
    const expected = [
      { kind: "keyword",    value: "pure"   },
      { kind: "keyword",    value: "flow"   },
      { kind: "identifier", value: "add"    },
      { kind: "symbol",     value: "("      },
      { kind: "identifier", value: "a"      },
      { kind: "symbol",     value: ":"      },
      { kind: "identifier", value: "Int"    },
      { kind: "symbol",     value: ","      },
      { kind: "identifier", value: "b"      },
      { kind: "symbol",     value: ":"      },
      { kind: "identifier", value: "Int"    },
      { kind: "symbol",     value: ")"      },
      { kind: "operator",   value: "->"     },
      { kind: "identifier", value: "Int"    },
      { kind: "symbol",     value: "{"      },
      { kind: "keyword",    value: "return" },
      { kind: "identifier", value: "a"      },
      { kind: "symbol",     value: "}"      },
    ];
    assert.equal(sig.length, expected.length, `Expected ${expected.length} tokens, got ${sig.length}`);
    for (let i = 0; i < expected.length; i++) {
      assert.equal(sig[i].kind,  expected[i].kind,  `Token[${i}] kind mismatch`);
      assert.equal(sig[i].value, expected[i].value, `Token[${i}] value mismatch`);
    }
  });

  // ── 2. lexer.spore baseline ────────────────────────────────────────────────

  it("lexer.spore: parses with zero errors", () => {
    let source = readFileSync(LEXER_PATH, "utf8");
    if (source.charCodeAt(0) === 0xFEFF) source = source.slice(1);
    const parsed = parseProgram(source, "lexer.spore");
    const errors = parsed.diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      errors.length,
      0,
      `lexer.spore parse errors: ${errors.map((e) => e.message).join("; ")}`,
    );
  });

  it("lexer.spore: tokenize flow executes without runtime errors on FLOW_GREET_SOURCE", async () => {
    const parsed = loadSelfHostedLexer();
    const args = new Map();
    args.set("source", { __tag: "string", value: FLOW_GREET_SOURCE });
    const result = await executeFlow("tokenize", args, parsed.ast);
    const runtimeErrors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(
      runtimeErrors.length,
      0,
      `lexer.spore runtime errors: ${runtimeErrors.map((e) => e.message).join("; ")}`,
    );
    assert.equal(result.value.__tag, "ok", "tokenize should return Ok(...)");
  });

  // ── 3. Parity comparison ─────────────────────────────────────────────────

  it("parity: both lexers produce the same number of significant tokens", async () => {
    const parsed = loadSelfHostedLexer();

    const tsResult  = lex(FLOW_GREET_SOURCE, "parity.spore");
    const tsSig     = significantTokens(tsResult.tokens.map((t) => ({ kind: t.kind, value: t.value })));
    const llnTokens = await selfHostedTokens(parsed, FLOW_GREET_SOURCE);
    const llnSig    = significantTokens(llnTokens);

    const msg = `TypeScript lexer: ${tsSig.length} tokens, lexer.spore: ${llnSig.length} tokens`;
    console.log(`  [parity] ${msg}`);

    if (PARITY_ACHIEVED) {
      assert.equal(llnSig.length, tsSig.length, msg);
    } else {
      // Report gap without failing
      if (llnSig.length !== tsSig.length) {
        console.log(`  [parity] GAP — token counts differ. ${msg}`);
        console.log("  [parity] TS tokens:  ", tsSig.map((t) => `${t.kind}:${JSON.stringify(t.value)}`).join(", "));
        console.log("  [parity] spore tokens: ", llnSig.map((t) => `${t.kind}:${JSON.stringify(t.value)}`).join(", "));
      }
      assert.ok(true, "Parity check (informational only — PARITY_ACHIEVED=false)");
    }
  });

  it("parity: token kinds match at each position (normalised to PascalCase)", async () => {
    const parsed = loadSelfHostedLexer();

    const tsResult  = lex(FLOW_GREET_SOURCE, "parity.spore");
    const tsSig     = significantTokens(tsResult.tokens.map((t) => ({ kind: t.kind, value: t.value })));
    const llnTokens = await selfHostedTokens(parsed, FLOW_GREET_SOURCE);
    const llnSig    = significantTokens(llnTokens);

    const minLen = Math.min(tsSig.length, llnSig.length);
    const mismatches = [];
    for (let i = 0; i < minLen; i++) {
      const tsKind  = tsPascalKind(tsSig[i].kind);
      const llnKind = llnSig[i].kind;
      if (tsKind !== llnKind) {
        mismatches.push(`[${i}] TS=${tsKind} spore=${llnKind} (value=${JSON.stringify(tsSig[i].value)})`);
      }
    }

    if (mismatches.length > 0) {
      console.log(`  [parity] Kind mismatches (${mismatches.length}): ${mismatches.join("; ")}`);
    } else if (tsSig.length === llnSig.length) {
      console.log("  [parity] All kind positions match!");
    }

    if (PARITY_ACHIEVED) {
      assert.equal(mismatches.length, 0, `Kind mismatches: ${mismatches.join("; ")}`);
    } else {
      assert.ok(true, "Kind parity (informational only — PARITY_ACHIEVED=false)");
    }
  });

  it("parity: token values match at each position", async () => {
    const parsed = loadSelfHostedLexer();

    const tsResult  = lex(FLOW_GREET_SOURCE, "parity.spore");
    const tsSig     = significantTokens(tsResult.tokens.map((t) => ({ kind: t.kind, value: t.value })));
    const llnTokens = await selfHostedTokens(parsed, FLOW_GREET_SOURCE);
    const llnSig    = significantTokens(llnTokens);

    const minLen = Math.min(tsSig.length, llnSig.length);
    const mismatches = [];
    for (let i = 0; i < minLen; i++) {
      if (tsSig[i].value !== llnSig[i].value) {
        mismatches.push(
          `[${i}] TS=${JSON.stringify(tsSig[i].value)} spore=${JSON.stringify(llnSig[i].value)}`,
        );
      }
    }

    if (mismatches.length > 0) {
      console.log(`  [parity] Value mismatches (${mismatches.length}): ${mismatches.join("; ")}`);
    } else if (tsSig.length === llnSig.length) {
      console.log("  [parity] All value positions match!");
    }

    if (PARITY_ACHIEVED) {
      assert.equal(mismatches.length, 0, `Value mismatches: ${mismatches.join("; ")}`);
    } else {
      assert.ok(true, "Value parity (informational only — PARITY_ACHIEVED=false)");
    }
  });

  // ── 4. Detailed gap report ───────────────────────────────────────────────

  it("parity: print full side-by-side comparison", async () => {
    const parsed = loadSelfHostedLexer();

    const tsResult  = lex(FLOW_GREET_SOURCE, "parity.spore");
    const tsSig     = tsResult.tokens.map((t) => ({ kind: t.kind, value: t.value }));
    const llnTokens = await selfHostedTokens(parsed, FLOW_GREET_SOURCE);

    console.log("\n  [parity] Side-by-side token comparison:");
    console.log("  [parity] Source:", JSON.stringify(FLOW_GREET_SOURCE));
    console.log("  [parity] idx | TS lexer              | lexer.spore             | match?");
    console.log("  [parity] ----+----------------------+----------------------+-------");

    const maxLen = Math.max(tsSig.length, llnTokens.length);
    let matchCount = 0;
    let mismatchCount = 0;

    for (let i = 0; i < maxLen; i++) {
      const ts  = tsSig[i]    ? `${tsSig[i].kind}:${JSON.stringify(tsSig[i].value)}`.padEnd(22) : "(missing)".padEnd(22);
      const spore = llnTokens[i] ? `${llnTokens[i].kind}:${JSON.stringify(llnTokens[i].value)}`.padEnd(22) : "(missing)".padEnd(22);
      const tsKind  = tsSig[i]    ? tsPascalKind(tsSig[i].kind) : null;
      const llnKind = llnTokens[i] ? llnTokens[i].kind          : null;
      const tsVal   = tsSig[i]    ? tsSig[i].value    : null;
      const llnVal  = llnTokens[i] ? llnTokens[i].value : null;
      const match   = tsKind === llnKind && tsVal === llnVal ? "OK" : "GAP";
      if (match === "OK") matchCount++; else mismatchCount++;
      console.log(`  [parity] ${String(i).padStart(3)} | ${ts}| ${spore}| ${match}`);
    }

    console.log(`\n  [parity] Summary: ${matchCount} matches, ${mismatchCount} mismatches out of ${maxLen} total positions`);

    // Always passes — this is an informational test
    assert.ok(true, "Side-by-side comparison complete");
  });
});
