/**
 * @galerina/devtools-provenance — 0098-prov-parsefail fail-closed regression tests.
 *
 * Proves:
 *  (Fix A) a source-level ungated sink is flagged even when the value-state
 *          checker is silent — the compiler diagnostic escalates, never suppresses.
 *  (Fix B) a source that fails to parse is `analyzerBlind=true` and reaches a
 *          high-risk aggregate (so the CLI exits 2), instead of reporting clean.
 *  (no regression) a gated flow and the canonical verifyPassword.spore stay clean.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeFile, buildProvenanceGraph } from "../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFY_PASSWORD_PATH = resolve(__dirname, "../../../examples/auth-service/verifyPassword.spore");

// A flow with an unsafe binding flowing straight into a DB sink, ungated.
const UNGATED_FLOW_SRC = `
secure flow unsafeDbWrite(readonly request: Request): Response
{
  contract {
    intent { "Intentionally ungated — for test purposes." }
    effects { database.write network.inbound }
  }

  unsafe let rawName: String = request.body.name
  DB.insert({ name: rawName })
  return { ok: true }
}
`;

// A clearly broken source — must not parse into an auditable program.
const BROKEN_SRC = "@@@ this is not valid galerina %%% {{{ unterminated";

// A properly gated flow (clean) — must stay clean.
const GATED_FLOW_SRC = `
secure flow safeDbWrite(readonly request: Request): Response
{
  contract {
    intent { "Gated DB write." }
    effects { database.write network.inbound }
  }

  unsafe let rawName: String = request.body.name
  let safeName = validate.input(rawName)?
  DB.insert({ name: safeName })
  return { ok: true }
}
`;

// ---------------------------------------------------------------------------
// Fix A — source-level ungated detection is not suppressed by a silent compiler
// ---------------------------------------------------------------------------
describe("0098-prov-parsefail Fix A: source-level ungated sink stands on its own", () => {
  it("an ungated unsafe->DB flow is flagged ungatedSinkReached even if compiler is silent", () => {
    const result = analyzeFile(UNGATED_FLOW_SRC, "ungatedFlow.spore");
    assert.equal(result.ungatedSinkReached, true,
      "an ungated sink must be flagged from the source-level scan alone (OR, not AND)");
    assert.equal(result.analyzerBlind, false, "a parseable source is not blind");
  });
});

// ---------------------------------------------------------------------------
// Fix B — a source that fails to parse is blind, and aggregates to high-risk
// ---------------------------------------------------------------------------
describe("0098-prov-parsefail Fix B: blind analysis denies by default", () => {
  it("a broken source sets analyzerBlind=true", () => {
    const result = analyzeFile(BROKEN_SRC, "broken.spore");
    assert.equal(result.analyzerBlind, true, "an unparseable source must be analyzerBlind");
  });

  it("buildProvenanceGraph counts a blind file toward flowsWithUngatedSinks (CLI exit 2)", () => {
    const dir = mkdtempSync(join(tmpdir(), "prov-blind-"));
    const f = join(dir, "broken.spore");
    writeFileSync(f, BROKEN_SRC, "utf8");

    const graph = buildProvenanceGraph([f]);
    assert.ok(graph.summary.flowsWithUngatedSinks > 0,
      "a blind file must contribute to flowsWithUngatedSinks so the CLI exits 2");
    assert.ok(graph.riskFlows.some(r => r.flowName === "<parse-failure>"),
      "a blind file must produce an explicit SPORE-PROV-001 <parse-failure> risk entry");
  });
});

// ---------------------------------------------------------------------------
// No regression — gated flow and canonical clean example stay clean
// ---------------------------------------------------------------------------
describe("0098-prov-parsefail: clean inputs still pass (no false positive)", () => {
  it("a gated flow is not ungated and not blind", () => {
    const result = analyzeFile(GATED_FLOW_SRC, "safeDbWrite.spore");
    assert.equal(result.ungatedSinkReached, false, "a gated flow must stay clean");
    assert.equal(result.analyzerBlind, false, "a parseable gated flow is not blind");
  });

  it("verifyPassword.spore (canonical clean) has 0 ungated sinks and is not blind", () => {
    const src = readFileSync(VERIFY_PASSWORD_PATH, "utf8");
    const result = analyzeFile(src, VERIFY_PASSWORD_PATH);
    assert.equal(result.analyzerBlind, false, "canonical clean example must parse");
    const graph = buildProvenanceGraph([VERIFY_PASSWORD_PATH]);
    assert.equal(graph.summary.flowsWithUngatedSinks, 0,
      "verifyPassword.spore must remain the canonical clean example (0 ungated sinks)");
  });
});
