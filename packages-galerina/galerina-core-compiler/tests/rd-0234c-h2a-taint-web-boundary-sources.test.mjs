// =============================================================================================
// RD-0234c H2-a — extend checkTaint's TAINT_SOURCES with clearly-untrusted web-boundary names.
// ---------------------------------------------------------------------------------------------
// THE GAP (RD-0234 audit §2 HIGH / H2): taint is introduced ONLY if a param is named exactly one of
// ten identifiers (request/req/input/params/query/body/headers/env/stdin/argv). Web-boundary values
// carried by a param named `cookies`/`session`/`formData`/`searchParams`/… are untainted-by-absence
// and reach injection sinks clean. Source recognition is a name allowlist, not provenance.
//
// H2-a is the SAFE, denylist-shaped increment (ships like the landed H3-named): add the CLEARLY-
// UNTRUSTED web-boundary names, which are untrusted by provenance, so auto-tainting them is sound.
// The AMBIGUOUS names (url/payload/message/event/data/value/content) are DELIBERATELY EXCLUDED — an
// internally-constructed value of those names would false-fire (RD-0234c §1 refuted-alternative
// proof); the sound fix for those is the owner-gated H2-b `tainted`/`untrusted` param qualifier.
//
// CASE SENSITIVITY: TAINT_SOURCES.has() is case-sensitive (taint-checker.ts:307/321/373 — no
// toLowerCase), so the names must be spelled as developers write them. sessionStorage/localStorage/
// formData/searchParams are the camelCase Web-API spellings; cookies/session are lowercase.
//
// Known residual (documented, NOT a bug): the heuristic taints ANY param with one of these names
// regardless of provenance, so an internally-constructed `formData` would also taint. That is the
// nature of a name-heuristic; the provenance-correct fix is H2-b. This bench pins the ADOPTED
// direction (untrusted names fire) and the ANTI-OVER-BLOCK guard (ambiguous names do not).
// =============================================================================================
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkTaint } from "../dist/index.js";

function taintCodes(src) {
  const prog = parseProgram(src, "test.fungi");
  return checkTaint(prog.ast, prog.flows).map((d) => d.code);
}

// A flow whose SOLE potential taint source is a param named `<paramName>`, flowing straight into a
// SQL injection sink (Database.query). If the param name taints, FUNGI-TAINT-001 fires; if not, [].
const sinkFlow = (paramName) =>
  `secure flow q(${paramName}: String) -> Response contract { effects { database.read } }\n` +
  `{ let r: String = Database.query(${paramName})  return r }`;

// The clearly-untrusted web-boundary names H2-a adds (conventional casing).
const UNTRUSTED = ["cookies", "session", "sessionStorage", "localStorage", "formData", "searchParams", "queryString", "querystring"];
// The ambiguous names H2-a MUST NOT add (would false-fire on internally-constructed values).
const AMBIGUOUS = ["message", "url", "payload", "event", "data", "value", "content"];

describe("RD-0234c H2-a: clearly-untrusted web-boundary param names auto-taint (FUNGI-TAINT-001)", () => {
  for (const name of UNTRUSTED) {
    it(`ADOPTED: \`${name}\` param reaching Database.query FIRES FUNGI-TAINT-001`, () => {
      assert.ok(taintCodes(sinkFlow(name)).includes("FUNGI-TAINT-001"),
        `\`${name}\` must be treated as an untrusted taint source (it carries web-boundary input)`);
    });
  }

  for (const name of AMBIGUOUS) {
    it(`ANTI-OVER-BLOCK: ambiguous \`${name}\` param does NOT auto-taint (excluded from the name list)`, () => {
      assert.deepEqual(taintCodes(sinkFlow(name)), [],
        `\`${name}\` is ambiguous (may be internally constructed) — must NOT auto-taint by name; sound fix is H2-b`);
    });
  }

  it("REGRESSION GUARD: an existing source (`req`) still taints after the set edit", () => {
    assert.ok(taintCodes(sinkFlow("req")).includes("FUNGI-TAINT-001"),
      "extending TAINT_SOURCES must not drop the existing names");
  });

  it("REGRESSION GUARD: a literal at the SQL sink stays clean (no spurious taint)", () => {
    assert.deepEqual(taintCodes(`secure flow q() -> Response contract { effects { database.read } }\n{ let r: String = Database.query("SELECT 1")  return r }`), [],
      "a literal argument must never be tainted");
  });
});
