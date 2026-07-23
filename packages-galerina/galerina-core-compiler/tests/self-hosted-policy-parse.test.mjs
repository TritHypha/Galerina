// =============================================================================
// (c) token-kind arc — self-hosted parser: `policy` declarations parse VALUE-BASED
// =============================================================================
// Bridge 0090/0086: parser.fungi's policy-branch captured the policy name via `polTok.kind ==
// "Identifier"` (the always-false TokenKind-vs-string compare) → polName stayed "" → the
// `if polName != ""` gate blocked policies.append → EVERY `policy` declaration was dropped
// (`policies count : 0`), and after the (b) underscore fix it dropped SILENTLY (no error). A
// self-hosted parser that cannot parse governance `policy` declarations must never become
// authoritative — this is the owner's "rung 4" precondition on the parser stage flip (0096).
//
// Fix (c): the policy name is the token after `policy` (positional; any non-empty non-brace value);
// each permitted_effects entry is any non-newline non-separator token parsed as a dot-path. Both are
// value-based/positional (like the import-path fix) so they compile IDENTICALLY on both backends —
// R3 byte-parity holds by construction (full suite green with this change).
//
// Acceptance (R&D 0090 probe): `policies count : 1` for a valid `policy` decl, with the name and
// effects captured, and NO spurious newline effect in a multi-line block (a regression caught by the
// pre-commit probe and pinned here).
// =============================================================================

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { parseProgram, resolveSymbols, checkTypes, executeFlow } from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
function load(name) {
  let s = readFileSync(join(__dir, "../src/self-hosted/", name), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const p = parseProgram(s, name);
  resolveSymbols(p.ast); checkTypes(p.ast);
  return p;
}
let lexer, parser;
before(() => { lexer = load("lexer.fungi"); parser = load("parser.fungi"); });

const vStr = (s) => ({ __tag: "string", value: s });
async function parse(source) {
  const lexRes = await executeFlow("tokenize", new Map([["source", vStr(source)]]), lexer.ast);
  let tokensVal = lexRes.value ?? lexRes;
  if (tokensVal.__tag === "ok") tokensVal = tokensVal.value;
  const prRec = (await executeFlow("parseFlows", new Map([["tokens", tokensVal]]), parser.ast)).value;
  const get = (k) => prRec.fields.get(k);
  const pols = get("policies")?.items ?? [];
  return {
    flows: get("flows")?.items?.length ?? 0,
    policies: pols.length,
    errors: (get("errors")?.items ?? []).map((e) => e.value ?? e),
    policy0: pols[0]?.fields
      ? { name: pols[0].fields.get("name")?.value,
          effects: (pols[0].fields.get("permittedEffects")?.items ?? []).map((e) => e.value ?? e) }
      : null,
  };
}

describe("self-hosted parser: `policy` declarations parse (rung-4 acceptance)", () => {
  it("a valid policy decl is COUNTED with its name + effect (0090: policies count : 1)", async () => {
    const r = await parse(`policy NetGuard { permitted_effects { network.outbound } }`);
    assert.equal(r.policies, 1, `expected policies count 1, got ${r.policies} (errors: ${r.errors.join("|")})`);
    assert.deepEqual(r.errors, []);
    assert.equal(r.policy0.name, "NetGuard");
    assert.deepEqual(r.policy0.effects, ["network.outbound"]);
  });

  it("a flow and a policy in one source are BOTH captured", async () => {
    const r = await parse(`pure flow f() -> Int { return 1 }\npolicy NetGuard { permitted_effects { network.outbound } }`);
    assert.equal(r.flows, 1);
    assert.equal(r.policies, 1);
    assert.equal(r.policy0.name, "NetGuard");
  });

  it("multiple comma-separated effects are all captured", async () => {
    const r = await parse(`policy P2 { permitted_effects { network.outbound, storage.read } }`);
    assert.deepEqual(r.policy0.effects, ["network.outbound", "storage.read"]);
  });

  it("★ a MULTI-LINE permitted_effects block captures NO spurious newline effect", async () => {
    const r = await parse(`policy ML {\n  permitted_effects {\n    network.outbound\n    storage.read\n  }\n}`);
    assert.equal(r.policies, 1);
    assert.deepEqual(r.policy0.effects, ["network.outbound", "storage.read"],
      "a newline token must not be captured as an effect");
  });

  it("a source with no policy yields 0 policies (non-vacuity: the counter is real)", async () => {
    const r = await parse(`pure flow f() -> Int { return 1 }`);
    assert.equal(r.policies, 0);
    assert.equal(r.flows, 1);
  });
});
