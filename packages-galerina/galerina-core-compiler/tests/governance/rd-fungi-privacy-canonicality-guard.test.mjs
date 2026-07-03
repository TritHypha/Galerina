// =============================================================================================
// CANONICALITY GUARD — the enforced privacy-deny grammar MUST be a superset of the grammar the
// shipped docs/examples/tests actually use. This is the anti-drift mechanism: it fails the moment
// the documented grammar and the enforced grammar diverge again (which is exactly how the bare
// `to response` form silently stopped being enforced while every example kept using it).
//
// TWO invariants, both machine-checked against the SHIPPED corpus + the SHIPPED compiler:
//
//   (1) GRAMMAR COVERAGE (fail-closed): every `deny protected X to <target>` target that appears
//       anywhere in the shipped corpus must be a target the compiler RECOGNISES — either the
//       enforced response surface, or an explicitly-ledgered other-domain sink. An UNRECOGNISED
//       target in shipped docs is drift → RED. (Unknown ⇒ dangerous, never silently "fine".)
//
//   (2) ENFORCEMENT BINDING (non-vacuous): for each distinct RESPONSE-surface spelling that the
//       corpus uses (bare `response`, `response.body`, spaced `response . body`), a flow that
//       leaks a denied field through that spelling MUST raise FUNGI-PRIVACY-001. This binds
//       "documented" to "enforced" — a spelling can't be documented yet unenforced.
//
// Overridable dist:  GAL_DIST=<path to dist/index.js> node --test <this file>
//   pristine prod dist -> invariant (2) bare-spelling case is RED (the live bug)
//   patched dist       -> all GREEN
// Default dist + corpus roots resolve relative to this test file — no machine path.
// =============================================================================================
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const DIST = process.env.GAL_DIST ??
  fileURLToPath(new URL("../../dist/index.js", import.meta.url));
const { parseProgram, checkEffects, verifyGovernance } = await import(pathToFileURL(DIST).href);

const CORPUS_ROOTS = [
  fileURLToPath(new URL("../../../../docs/examples", import.meta.url)), // <repo>/docs/examples
  fileURLToPath(new URL("../../../../examples", import.meta.url)),      // <repo>/examples
  fileURLToPath(new URL("..", import.meta.url)),                        // this package's tests/ (.fungi fixtures)
];

// The enforced surface for FUNGI-PRIVACY-001 is the RESPONSE family. Other sinks are governed
// (or intended to be) by other domains; they are LEDGERED here so a genuinely-new/typo'd target
// stands out. NOTE: `logs`/`audit`/`remote.execution` are ledgered as "other-domain" but their
// privacy-deny enforcement is UNVERIFIED — see the sibling-fail-open item in the handover. This
// ledger is deliberately explicit, not a wildcard.
const RESPONSE_FAMILY = (t) => /^response(\.\w+)*$/.test(t);
const OTHER_DOMAIN_LEDGER = new Set(["logs", "audit", "metrics", "telemetry", "remote.execution", "remote"]);

function walk(dir, out = []) {
  let ents; try { ents = readdirSync(dir); } catch { return out; }
  for (const e of ents) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (e.endsWith(".fungi")) out.push(p);
  }
  return out;
}

// Pull every `deny protected <field> to <target>` occurrence from raw source text (grammar-level,
// so it also covers .fungi embedded inside .mjs test fixtures if pointed there). Normalises the
// spaced dot the parser/author may use.
function denyTargets(text) {
  const re = /deny\s+protected\s+\w+\s+to\s+([a-z][\w]*(?:\s*\.\s*\w+)*)/gi;
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) found.push(m[1].replace(/\s*\.\s*/g, ".").toLowerCase());
  return found;
}

function govOf(source) {
  const parsed = parseProgram(source, "canon.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, "production");
}
const fires = (g) => g.diagnostics.some((d) => d.code === "FUNGI-PRIVACY-001");

const leakFlow = (targetSpelling) =>
`secure flow f(readonly request: Request) -> Result<Summary, String>
contract {
  intent { "x" }
  effects { database.read }
  privacy {
    contains PII
    deny protected Email ${targetSpelling}
  }
}
{
  let email: protected String = validate.email(request.params.e)?
  return Ok({ email: email })
}`;

describe("Canonicality guard: enforced privacy-deny grammar ⊇ documented grammar", () => {
  const files = CORPUS_ROOTS.flatMap((r) => walk(r));

  it("(1) GRAMMAR COVERAGE: every shipped `deny protected X to <target>` target is recognised", () => {
    const unknown = new Map(); // target -> sample file
    for (const f of files) {
      for (const t of denyTargets(readFileSync(f, "utf8"))) {
        if (RESPONSE_FAMILY(t) || OTHER_DOMAIN_LEDGER.has(t)) continue;
        if (!unknown.has(t)) unknown.set(t, f);
      }
    }
    assert.equal(unknown.size, 0,
      `unrecognised privacy-deny target(s) in shipped corpus (grammar drift): ` +
      [...unknown].map(([t, f]) => `"${t}" (${f})`).join("; "));
  });

  it("(2a) ENFORCEMENT BINDING: bare `to response` leak fires FUNGI-PRIVACY-001", () => {
    assert.ok(fires(govOf(leakFlow("to response"))),
      "the documented bare `to response` spelling must enforce (this is the live fail-open on pristine dist)");
  });

  it("(2b) ENFORCEMENT BINDING: `to response.body` leak fires FUNGI-PRIVACY-001", () => {
    assert.ok(fires(govOf(leakFlow("to response.body"))), "the `.body` spelling must enforce");
  });

  it("(2c) ENFORCEMENT BINDING: spaced `to response . body` leak fires FUNGI-PRIVACY-001", () => {
    assert.ok(fires(govOf(leakFlow("to response . body"))), "the spaced-dot spelling must enforce");
  });

  it("(2d) NON-VACUITY: a clean flow (denied field NOT returned) does not fire", () => {
    const clean =
`secure flow f(readonly request: Request) -> Result<Summary, String>
contract { intent { "x" } effects { database.read } privacy { contains PII  deny protected Email to response } }
{ return Ok({ id: request.params.id }) }`;
    assert.ok(!fires(govOf(clean)), "must not fire when nothing leaks (guards against a trivially-true (2a-c))");
  });
});
