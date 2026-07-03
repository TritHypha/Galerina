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

  // FAIL-CLOSED: the FLOW-graph → GIR lowering is the next increment. Even with a clean header we
  // emit ZERO flows so nothing downstream can mis-lower, and surface FUNGI-GATELANG-002 so the build
  // refuses (never signs a `.gate` artifact the compiler cannot yet fully lower).
  if (header.intent !== null && header.effectsDeclared) {
    diagnostics.push({
      ...FUNGI_GATELANG_002,
      message: `${file}: ${FUNGI_GATELANG_002.message} (header OK — intent + ${header.effects.length} declared effect(s)${header.hasFlow ? "; FLOW present" : ""}).`,
    });
  }

  return { ast: EMPTY_PROGRAM, diagnostics, flows: [] };
}
