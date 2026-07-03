// =============================================================================
// Galerina §5a–5d — `.gate` front-end parser (NEW, separate from the `.fungi` parser)
//
// `.gate` is the light-ASCII AI-authoring language (SPEC-gate-language.md v0.4, in the
// ZT-Galerina-GRAPH-ASCII-v2 repo). Both `.fungi` and `.gate` are SOURCE front-ends that lower to
// the ONE in-memory GIR (`.fungi`/`.gate` → GIR → WASM). This module is the `.gate` front-end.
//
// HARD LOCKS honoured here (PROMPT §5a/§4):
//   • This is a NEW parser — it does NOT import, invoke, or modify `parser.ts`/`lexer.ts` (the
//     `.fungi` front-end) in any way. `.gate` recognition lives at the app/CLI layer only.
//   • It returns the SAME `ParseResult { ast, flows, diagnostics }` shape `parseProgram` returns,
//     so the language-agnostic downstream (checkEffects → emitGIR → signed manifest → fuse-loader)
//     is reused UNCHANGED. Sign the GIR, never the source.
//   • FAIL-CLOSED: until the FLOW-graph → GIR lowering lands (next increment), a `.gate` build
//     REFUSES — this parser validates the declarative header, then emits FUNGI-GATELANG-002 (error) and
//     returns ZERO flows, so nothing downstream can mis-lower a partially-understood `.gate` file.
//
// INCREMENT 1 (this file): the declarative header — the mandatory `#gate` pragma, `INTENT`, and
// `EFFECTS { }` block — is parsed and validated; the FLOW graph is recognised but its lowering is
// deferred (fail-closed). INCREMENT 2 will lower the FLOW edges (`[node] -> [node]` with K3 `?`
// guards, `:cut`/`:fu` nodes) into the same AstNode/FlowMeta kinds the `.fungi` parser emits.
// =============================================================================

import type { AstNode, ParseDiagnostic, ParseResult } from "./parser.js";

/** FUNGI-GATELANG-001: the `.gate` declarative header is malformed (missing `#gate` pragma / INTENT / EFFECTS). */
export const FUNGI_GATELANG_001 = {
  code: "FUNGI-GATELANG-001",
  name: "MalformedGateHeader",
  severity: "error" as const,
  message: "A `.gate` file must open with the `#gate` pragma and declare a mandatory INTENT and EFFECTS { } block.",
} as const;

/**
 * FUNGI-GATELANG-002: the `.gate` FLOW graph was recognised but its lowering to GIR is not yet
 * implemented — the build FAILS CLOSED (it never emits a partial/unsigned artifact for a `.gate`
 * source the compiler cannot yet fully lower). Use `.fungi` until the FLOW lowering increment lands.
 */
export const FUNGI_GATELANG_002 = {
  code: "FUNGI-GATELANG-002",
  name: "GateFlowLoweringNotImplemented",
  severity: "error" as const,
  message: "The `.gate` FLOW → GIR lowering is not yet implemented; this build is refused (fail-closed). The declarative header parsed cleanly.",
} as const;

/** Parsed `.gate` declarative header (increment 1). The FLOW graph is lowered in increment 2. */
export interface GateHeader {
  readonly intent: string | null;
  readonly effects: readonly string[];
  readonly effectsDeclared: boolean;
  readonly hasFlow: boolean;
}

const EMPTY_PROGRAM: AstNode = { kind: "program", children: [] };

/** Strip a trailing `# comment` (a `#` that is not the leading `#gate` pragma). Whitespace-insignificant. */
function stripInlineComment(line: string): string {
  // The grammar reserves `#gate` as the first-line pragma; any other `#` starts a comment.
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#gate")) return line;
  const hash = line.indexOf("#");
  return hash >= 0 ? line.slice(0, hash) : line;
}

/**
 * Parse a `.gate` declarative header. Line-oriented, single forward scan, indentation-insignificant
 * (matching SPEC §1). Returns the header plus whether a FLOW section is present.
 */
export function parseGateHeader(source: string): GateHeader {
  let intent: string | null = null;
  const effects: string[] = [];
  let effectsDeclared = false;
  let hasFlow = false;

  for (const raw of source.split(/\r?\n/)) {
    const line = stripInlineComment(raw).trim();
    if (line.length === 0) continue;

    if (intent === null && line.startsWith("INTENT")) {
      // INTENT "quoted string"
      const m = line.match(/^INTENT\s+"([^"]*)"/);
      if (m) intent = m[1] ?? "";
      continue;
    }
    if (line.startsWith("EFFECTS")) {
      // EFFECTS { a.b, c.d }  — empty { } is legal only when there are zero @via edges (checked later).
      effectsDeclared = true;
      const brace = line.match(/\{([^}]*)\}/);
      if (brace) {
        for (const e of (brace[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) effects.push(e);
      }
      continue;
    }
    if (line.startsWith("FLOW")) {
      hasFlow = true;
      break; // header ends at FLOW; the graph (increment 2) follows
    }
  }
  return { intent, effects, effectsDeclared, hasFlow };
}

// ── FLOW graph (increment 2a) — parse the spatial map into a structured intermediate ────────────
// SPEC §1: `FLOW:` then `entry` (`[id] := IN` — the SOLE source) then `edge`s (`[node] -> [node] [tag]`).
// This captures the governance surface the GIR lowering (2b) needs: the `@via` effect edges (the flow's
// OBSERVED effects), the `[name:cut fu op]` privacy vertices (FUNGI-PRIVACY-002), and the `[name:fu op]`
// dense-compute delegations into `.fungi`. Per §1.1 the marks lower as: `+`→return · `-`→deny · `!`→trap ·
// `?`→K3 match(3 arms) · `✓`/`×`→if/else. (2a parses + structures; 2b builds the AST + lowers to GIR.)

export type GateNodeKind = "sandbox" | "fu" | "cut" | "mark";
export interface GateNode {
  readonly raw: string;      // the bracket body verbatim, e.g. "q:fu dbQuery"
  readonly qname: string;    // the node's name, or the mark glyph
  readonly kind: GateNodeKind;
  readonly op?: string;      // the `fu <ident>` op for :fu / :cut nodes
  readonly label?: string;   // an optional ASCII label on a mark node
}
export type GateTagKind = "guard" | "via" | "bound";
export interface GateTag { readonly kind: GateTagKind; readonly value: string; }
export interface GateEdge {
  readonly src: GateNode;
  readonly dst: GateNode;
  readonly tag?: GateTag;
}
export interface GateFlow {
  readonly entry: string | null;          // the `[id] := IN` source node
  readonly edges: readonly GateEdge[];
  readonly viaEffects: readonly string[]; // `@effect` edges — the flow's OBSERVED effects
  readonly cutNodes: readonly string[];   // `:cut` privacy vertices (FUNGI-PRIVACY-002)
  readonly fuOps: readonly string[];      // `:fu` dense-compute delegations into `.fungi`
}

/** The FROZEN eight control marks (SPEC §1.1) — exact codepoints. */
const GATE_MARKS = new Set(["✓", "×", "?", "!", "+", "-"]); // ✓ × ? ! + -

/** Parse one `[node_body]` bracket body into a structured GateNode (SPEC §1 `node_body`). */
export function parseGateNode(body: string): GateNode {
  const raw = body.trim();
  const first = [...raw][0] ?? "";
  if (GATE_MARKS.has(first)) {
    const label = raw.slice(first.length).trim();
    return label ? { raw, qname: first, kind: "mark", label } : { raw, qname: first, kind: "mark" };
  }
  const cut = raw.match(/^([A-Za-z_]\w*)\s*:\s*cut\s+fu\s+([A-Za-z_]\w*)$/); // `qname:cut fu op`
  if (cut) return { raw, qname: cut[1] ?? raw, kind: "cut", op: cut[2] ?? "" };
  const fu = raw.match(/^([A-Za-z_]\w*)\s*:\s*fu\s+([A-Za-z_]\w*)$/);        // `qname:fu op`
  if (fu) return { raw, qname: fu[1] ?? raw, kind: "fu", op: fu[2] ?? "" };
  return { raw, qname: raw, kind: "sandbox" };                              // plain named node / sandbox
}

/** Parse one edge line `[src] -> [dst] [tag]` into a GateEdge, or null if the line is not an edge. */
export function parseGateEdge(line: string): GateEdge | null {
  const arrow = line.indexOf("->");
  if (arrow < 0) return null;
  const srcBody = line.slice(0, arrow).match(/\[([^\]]*)\]/);
  const rhs = line.slice(arrow + 2);
  const dstBody = rhs.match(/\[([^\]]*)\]/);
  if (!srcBody || !dstBody) return null;
  const src = parseGateNode(srcBody[1] ?? "");
  const dst = parseGateNode(dstBody[1] ?? "");
  const afterDst = rhs.slice((dstBody.index ?? 0) + dstBody[0].length).trim(); // the tag follows the dst node
  let tag: GateTag | undefined;
  if (afterDst.startsWith("@")) tag = { kind: "via", value: afterDst.slice(1).trim() };
  else if (afterDst.startsWith("?")) tag = { kind: "guard", value: afterDst.slice(1).trim() };
  else if (afterDst.startsWith("decreases") || afterDst.startsWith("hops")) tag = { kind: "bound", value: afterDst };
  return tag ? { src, dst, tag } : { src, dst };
}

/**
 * Parse the `FLOW:` section into a structured GateFlow (increment 2a — the graph, not yet the AST).
 * Line-oriented, indentation-insignificant; `[...]` are self-delimiting so line order within FLOW is free.
 */
export function parseGateFlow(source: string): GateFlow {
  let inFlow = false;
  let entry: string | null = null;
  const edges: GateEdge[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = stripInlineComment(raw).trim();
    if (!inFlow) { if (line.startsWith("FLOW")) inFlow = true; continue; }
    if (line.length === 0) continue;
    const ent = line.match(/^\[([A-Za-z_]\w*)\]\s*:=\s*IN$/); // the sole `[id] := IN` source
    if (ent) { if (entry === null) entry = ent[1] ?? null; continue; }
    const edge = parseGateEdge(line);
    if (edge) edges.push(edge);
  }
  const nodes = edges.flatMap((e) => [e.src, e.dst]);
  const dedup = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  return {
    entry,
    edges,
    viaEffects: dedup(edges.filter((e) => e.tag?.kind === "via").map((e) => e.tag?.value ?? "")),
    cutNodes: dedup(nodes.filter((n) => n.kind === "cut").map((n) => n.qname)),
    fuOps: dedup(nodes.filter((n) => n.kind === "fu").map((n) => n.op ?? "")),
  };
}

/**
 * Parse a `.gate` source into a `ParseResult`, matching `parseProgram`'s contract so the
 * language-agnostic pipeline (checkEffects → emitGIR → manifest → fuse) can consume it unchanged.
 *
 * Increment 1: validates the mandatory declarative header (`#gate` pragma + INTENT + EFFECTS), then
 * FAILS CLOSED on the FLOW-graph lowering (FUNGI-GATELANG-002) with ZERO flows — a `.gate` build refuses
 * rather than emit a partially-lowered, would-be-signed artifact. Increment 2 lowers the FLOW.
 */
export function parseGate(source: string, file: string): ParseResult {
  const diagnostics: ParseDiagnostic[] = [];

  // The `#gate` pragma is mandatory and must be the first non-blank line (SPEC §1: `#gate` versions
  // the file and anchors the ASCII-frozen surface). Missing pragma ⇒ not a `.gate` file ⇒ refuse.
  const firstNonBlank = source.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  if (!firstNonBlank.startsWith("#gate")) {
    diagnostics.push({ ...FUNGI_GATELANG_001, message: `${file}: ${FUNGI_GATELANG_001.message} (missing the leading \`#gate\` pragma).` });
    return { ast: EMPTY_PROGRAM, diagnostics, flows: [] };
  }

  const header = parseGateHeader(source);
  if (header.intent === null) {
    diagnostics.push({ ...FUNGI_GATELANG_001, message: `${file}: a \`.gate\` file must declare a mandatory INTENT.` });
  }
  if (!header.effectsDeclared) {
    diagnostics.push({ ...FUNGI_GATELANG_001, message: `${file}: a \`.gate\` file must declare a mandatory EFFECTS { } block.` });
  }

  // FAIL-CLOSED: the FLOW-graph → GIR lowering (2b) is the next increment. Even with a clean header +
  // a fully-parsed FLOW graph (2a), we emit ZERO flows so nothing downstream can mis-lower, and surface
  // FUNGI-GATELANG-002 so the build refuses (never signs a `.gate` artifact the compiler cannot yet
  // fully lower). The parsed graph's governance surface is reported for visibility.
  if (header.intent !== null && header.effectsDeclared) {
    const flow = parseGateFlow(source);
    diagnostics.push({
      ...FUNGI_GATELANG_002,
      message: `${file}: ${FUNGI_GATELANG_002.message} (header OK — intent + ${header.effects.length} declared effect(s); ` +
        `FLOW parsed — entry ${flow.entry ?? "none"}, ${flow.edges.length} edge(s), ${flow.viaEffects.length} @via effect(s), ` +
        `${flow.cutNodes.length} :cut, ${flow.fuOps.length} :fu).`,
    });
  }

  return { ast: EMPTY_PROGRAM, diagnostics, flows: [] };
}
