// gate-parser.test.mjs — §5a–5d increment 1: the `.gate` front-end parser.
// Proves (a) the declarative header (#gate / INTENT / EFFECTS) parses, (b) the parser returns the
// SAME ParseResult shape as parseProgram, and (c) it FAILS CLOSED on the not-yet-implemented FLOW
// lowering (FUNGI-GATELANG-002 error + zero flows) so a `.gate` build cannot mis-lower / silently sign.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGate, parseGateHeader, parseGateFlow, parseGateNode, parseGateEdge,
  FUNGI_GATELANG_001, FUNGI_GATELANG_002,
  parseProgram, checkEffects, emitGIR,
} from "../dist/index.js";

const VALID = [
  "@version 1.0.0",
  'INTENT "Return one customer record for an authorised caller; PII is redacted before egress."',
  "EFFECTS { database.read, audit.write }",
  "PRIVACY deny protected CustomerId -> response.body",
  "FLOW:",
  "  [entry] -> [q:fu dbQuery] @database.read",
  "  [q:fu dbQuery] -> [logged:fu audit] @audit.write",
].join("\n");

const codesOf = (r) => r.diagnostics.map((d) => d.code);

test("gate-parser: header parses (intent + declared effects), whitespace/comments insignificant", () => {
  const h = parseGateHeader(VALID + "\n   # a trailing comment line\n");
  assert.equal(h.intent?.startsWith("Return one customer record"), true);
  assert.deepEqual([...h.effects], ["database.read", "audit.write"]);
  assert.equal(h.effectsDeclared, true);
  assert.equal(h.hasFlow, true);
});

test("gate-parser: parseGate returns the parseProgram-compatible ParseResult shape", () => {
  const r = parseGate(VALID, "customer.gate");
  assert.ok(r.ast && typeof r.ast.kind === "string", "has an AstNode root");
  assert.ok(Array.isArray(r.flows), "has flows[]");
  assert.ok(Array.isArray(r.diagnostics), "has diagnostics[]");
});

test("gate-parser: a clean-header .gate LOWERS (1 flow), production gated by FUNGI-GATELANG-002 (error)", () => {
  const r = parseGate(VALID, "customer.gate");
  assert.equal(r.flows.length, 1, "the flow lowers to its capability surface");
  assert.equal(r.flows[0].name, "customer", "flow name = file basename (OD-1 basename identity)");
  assert.equal(r.flows[0].qualifier, "secure");
  assert.deepEqual([...r.flows[0].declaredEffects].sort(), ["audit.write", "database.read"], "EFFECTS{} → declaredEffects");
  assert.ok(codesOf(r).includes(FUNGI_GATELANG_002.code), "production signing gated on the RD-0234c backstop");
  assert.ok(r.diagnostics.some((d) => d.severity === "error"), "the production gate is an error — a prod build refuses to sign");
});

test("gate-parser: missing #gate pragma ⇒ FUNGI-GATELANG-001 (not a .gate file, refuse)", () => {
  const r = parseGate('INTENT "x"\nEFFECTS { }\n', "no-pragma.gate");
  assert.deepEqual(codesOf(r), [FUNGI_GATELANG_001.code]);
  assert.equal(r.flows.length, 0);
});

test("gate-parser: #gate present but INTENT missing ⇒ FUNGI-GATELANG-001", () => {
  const r = parseGate("@version 1.0.0\nEFFECTS { database.read }\nFLOW:\n  [a] -> [b]\n", "no-intent.gate");
  assert.ok(codesOf(r).includes(FUNGI_GATELANG_001.code), "mandatory INTENT missing");
});

test("gate-parser: does NOT touch the .fungi parser — a .fungi source is NOT a valid .gate", () => {
  // A `.fungi` flow has no `#gate` pragma, so parseGate refuses it (the two front-ends are separate).
  const r = parseGate("secure flow main() -> Int contract { effects {} } { return 0 }", "main.fungi");
  assert.deepEqual(codesOf(r), [FUNGI_GATELANG_001.code]);
});

// ── Increment 2a — FLOW-graph parsing (the governance surface for the GIR lowering) ──────────────
const FLOW_GATE = [
  "@version 1.0.0",
  'INTENT "Return one redacted customer record for an authorised caller."',
  "EFFECTS { database.read, audit.write }",
  "PRIVACY deny protected CustomerId -> response.body",
  "FLOW:",
  "  [in] := IN",
  "  [in] -> [q:fu dbQuery] @database.read",
  "  [q:fu dbQuery] -> [safe:cut fu redactPII]   # explicit privacy cut",
  "  [safe:cut fu redactPII] -> [logged:fu audit] @audit.write",
  "  [logged:fu audit] -> [+done]",
].join("\n");

test("parseGateFlow: extracts entry, edges, @via effects, :cut vertices, :fu delegations", () => {
  const f = parseGateFlow(FLOW_GATE);
  assert.equal(f.entry, "in", "the [id] := IN source");
  assert.equal(f.edges.length, 4);
  assert.deepEqual([...f.viaEffects].sort(), ["audit.write", "database.read"], "@via = observed effects");
  assert.deepEqual([...f.cutNodes], ["safe"], "the :cut privacy vertex (FUNGI-PRIVACY-002)");
  assert.deepEqual([...f.fuOps].sort(), ["audit", "dbQuery"], ":fu dense-compute delegations");
});

test("parseGateNode: recognises sandbox / :fu / :cut / mark node forms", () => {
  assert.equal(parseGateNode("x").kind, "sandbox");
  const fu = parseGateNode("q:fu dbQuery");
  assert.equal(fu.kind, "fu"); assert.equal(fu.op, "dbQuery");
  const cut = parseGateNode("s:cut fu redactPII");
  assert.equal(cut.kind, "cut"); assert.equal(cut.op, "redactPII");
  const mark = parseGateNode("+done");
  assert.equal(mark.kind, "mark"); assert.equal(mark.qname, "+"); assert.equal(mark.label, "done");
});

test("parseGateEdge: parses `[src] -> [dst] @effect` with the via tag", () => {
  const e = parseGateEdge("  [in] -> [q:fu dbQuery] @database.read");
  assert.equal(e.src.qname, "in");
  assert.equal(e.dst.kind, "fu");
  assert.deepEqual(e.tag, { kind: "via", value: "database.read" });
  // a `?` guard tag on an edge
  const g = parseGateEdge("[check] -> [ok] ? isAuthorised");
  assert.deepEqual(g.tag, { kind: "guard", value: "isAuthorised" });
});

test("parseGate: production-gate message reports the parsed FLOW surface; the flow is lowered", () => {
  const r = parseGate(FLOW_GATE, "customer.gate");
  const m = r.diagnostics.find((d) => d.code === FUNGI_GATELANG_002.code)?.message ?? "";
  assert.match(m, /FLOW parsed \(4 edge\(s\), 2 @via, 1 :cut, 2 :fu\)/);
  assert.equal(r.flows.length, 1, "lowered — production is gated by the GATELANG-002 error, not by dropping the flow");
});

// ── Increment 2b — GIR-identity: `.gate` lowers to the SAME signed capability surface as `.fungi` ──
test("2b GIR-identity: a .gate flow lowers to the SAME signed capability surface as the equivalent .fungi", () => {
  const g = parseGate(VALID, "customer.gate");
  const gGir = emitGIR(g.ast, g.flows, checkEffects(g.flows, g.ast));
  const gFlow = gGir.gir.flows[0];

  const fungi = [
    "secure flow customer() -> Response contract { effects { database.read, audit.write } }",
    '{ let r: String = Database.query("x")  return r }',
  ].join("\n");
  const p = parseProgram(fungi, "customer.fungi");
  const pGir = emitGIR(p.ast, p.flows, checkEffects(p.flows, p.ast));
  const pFlow = pGir.gir.flows[0];

  // The SIGNED surface the .lmanifest covers — declared effects, capabilities, mask, qualifier — must match.
  assert.deepEqual([...gFlow.effects.declared].sort(), [...pFlow.effects.declared].sort(), "declared effects");
  assert.deepEqual(
    [...gFlow.capabilities.entries()].sort(),
    [...pFlow.capabilities.entries()].sort(),
    "capabilities (effect → host.* capability id)",
  );
  assert.equal(gFlow.allowedEffectsMask, pFlow.allowedEffectsMask, "allowedEffectsMask");
  assert.equal(gFlow.qualifier, pFlow.qualifier, "both are secure flows");
});

// ── BK-4/A4 + Q1 (owner LOCKED 2026-07-08): `@version 1.0.0` REPLACES `#gate`; read + gated ──
test("gate-parser: the RETIRED `#gate` pragma ⇒ FUNGI-GATELANG-001 refuse with a migration pointer", () => {
  const r = parseGate("#gate 0.3\nINTENT: x\nEFFECTS { database.read }\nFLOW:\n  [a] -> [b]\n", "old.gate");
  assert.equal(r.flows.length, 0);
  assert.ok(r.diagnostics.some((d) => d.code === "FUNGI-GATELANG-001" && /RETIRED/.test(d.message)));
});

test("gate-parser: bare `@version` (no value) ⇒ FUNGI-GATELANG-001 refuse (absent version fails closed)", () => {
  const r = parseGate("@version\nINTENT: x\nEFFECTS { database.read }\nFLOW:\n  [a] -> [b]\n", "bare.gate");
  assert.equal(r.flows.length, 0);
  assert.ok(r.diagnostics.some((d) => d.code === "FUNGI-GATELANG-001" && /MISSING/.test(d.message)));
});

test("gate-parser: a FUTURE `@version 2.0.0` ⇒ FUNGI-GATELANG-001 refuse (unknown version never best-effort parsed)", () => {
  const r = parseGate("@version 2.0.0\nINTENT: x\nEFFECTS { database.read }\nFLOW:\n  [a] -> [b]\n", "future.gate");
  assert.equal(r.flows.length, 0);
  assert.ok(r.diagnostics.some((d) => d.code === "FUNGI-GATELANG-001" && /not supported/.test(d.message)));
});
