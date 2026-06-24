// =============================================================================
// @logicn/devtools-provenance — Provenance Analyzer
//
// Walks each flow's AST and constructs a data lineage graph:
//   1. Sources  — unsafe let/mut bindings → DataNode{kind:'source', isTrusted:false}
//   2. Transforms — gate/sanitize/hash/encrypt/redact calls → DataNode{kind:'transform'}
//   3. Sinks    — DB writes, AuditLog.write, network egress, response → DataNode{kind:'sink'}
//   4. Edges    — taint propagation and trust-state transitions
//   5. Risk     — flows where tainted data reaches a sink without passing a transform
// =============================================================================

import {
  parseProgram,
  checkValueStates,
  type AstNode,
  type FlowMeta,
} from "@logicn/core-compiler";

import type {
  DataNode,
  DataEdge,
  DataSourceKind,
  DataSinkKind,
  TransformKind,
  ProvenanceGraph,
  ProvenanceOptions,
} from "./types.js";

// ---------------------------------------------------------------------------
// Pattern tables
// ---------------------------------------------------------------------------

/** Prefixes that mark a call as a gate/transform (break the taint chain). */
const GATE_PREFIXES = [
  "validate.",
  "sanitize.",
  "hash.",
  "encrypt.",
  "decrypt.",
  "Crypto.",
  "Hash.",
  "Argon2.",
  "BCrypt.",
  "Password.",
] as const;

/** Exact function names recognised as gate-like transforms. */
const GATE_EXACT = new Set([
  "redact",
  "Jwt.verify",
  "Sql.parameterize",
  "Sql.escape",
  "Html.escapeContent",
  "Html.purify",
  "Url.parseAndAllowlist",
  "Url.encodeComponent",
]);

/** Patterns for sink calls. */
const SINK_PATTERNS: ReadonlyArray<{ pattern: RegExp; sinkKind: DataSinkKind; label: string }> = [
  { pattern: /^AuditLog\.write$/,                         sinkKind: "audit-log",      label: "AuditLog.write" },
  { pattern: /^DB\.(insert|update|delete|write|upsert)$/, sinkKind: "database-write", label: "DB.write" },
  { pattern: /\w*DB\.(insert|update|delete|write|upsert)$/,sinkKind: "database-write",label: "DB.write" },
  { pattern: /^Database\.(query|write|insert|update)$/,   sinkKind: "database-write", label: "Database.write" },
  { pattern: /^http\.(post|put|patch|delete)$/,           sinkKind: "network-egress", label: "http.post" },
  { pattern: /^Http\.(fetch|request|post|put|patch)$/,    sinkKind: "network-egress", label: "Http.request" },
  { pattern: /^Network\.call$/,                           sinkKind: "network-egress", label: "Network.call" },
  { pattern: /^response\.(send|json|write)$/,             sinkKind: "response",       label: "response.send" },
  { pattern: /^Response\.(send|json|write)$/,             sinkKind: "response",       label: "Response.send" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nodeCounter = 0;

function newId(prefix: string): string {
  return `${prefix}-${++_nodeCounter}`;
}

function resolveCallName(node: AstNode): string {
  if (node.kind === "callExpr") {
    if (node.callStyle === "method") {
      // children[0] is receiver, rest are args
      const children = node.children ?? [];
      const receiver = children[0];
      const receiverName = receiver?.value ?? receiver?.children?.[0]?.value ?? "";
      const methodName  = node.value ?? "";
      return receiverName ? `${receiverName}.${methodName}` : methodName;
    }
    return node.value ?? "";
  }
  return node.value ?? "";
}

function isGateCall(callName: string): boolean {
  if (GATE_EXACT.has(callName)) return true;
  return GATE_PREFIXES.some(p => callName.startsWith(p));
}

function classifyTransform(callName: string): TransformKind {
  if (callName.startsWith("validate.") || callName.startsWith("sanitize.")) return "gate";
  if (callName.startsWith("sanitize.")) return "sanitize";
  if (callName.startsWith("hash.") || callName.startsWith("Hash.") || callName.startsWith("BCrypt.") || callName.startsWith("Argon2.")) return "hash";
  if (callName.startsWith("encrypt.") || callName.startsWith("Crypto.") || callName.startsWith("Password.")) return "encrypt";
  if (callName === "redact") return "redact";
  return "gate";
}

function matchSink(callName: string): { sinkKind: DataSinkKind; label: string } | undefined {
  for (const entry of SINK_PATTERNS) {
    if (entry.pattern.test(callName)) {
      return { sinkKind: entry.sinkKind, label: entry.label };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Per-flow provenance extraction
// ---------------------------------------------------------------------------

interface FlowProvenanceResult {
  nodes: DataNode[];
  edges: DataEdge[];
  hasTaintedData: boolean;
  ungatedSinkReached: boolean;
}

/**
 * Walk a flow's body AST and extract source/transform/sink nodes + edges.
 *
 * Algorithm:
 *   - Track unsafe bindings by name → tainted
 *   - Track safe bindings that result from gate calls → trusted
 *   - For each call: classify as gate/sink or pass-through
 *   - Build edges from last-touched node per binding slot
 */
function analyzeFlowAst(
  flowNode: AstNode,
  flowName: string,
  filePath: string,
): FlowProvenanceResult {
  const nodes: DataNode[] = [];
  const edges: DataEdge[] = [];

  // Map binding name → node id of its current state node
  const bindingToNode = new Map<string, string>();
  // Set of unsafe binding names (never cleared — taint is sticky)
  const taintedBindings = new Set<string>();
  // Set of safe (gated) binding names
  const safeBindings = new Set<string>();
  // Last transform node id (used as source for sink edges when no binding info)
  let lastTransformId: string | undefined;
  let hasTaintedData = false;
  let ungatedSinkReached = false;

  function walk(node: AstNode): void {
    if (node.kind === "letDecl" || node.kind === "mutDecl") {
      const bindingName = node.value ?? "";
      const children = node.children ?? [];
      // Determine safety prefix from node text / location context
      // The parser marks unsafe let/mut with a value-state prefix in the children or via flags
      // We detect unsafe by checking if the first token keyword was "unsafe"
      // The parser stores the qualifier prefix (unsafe/safe/protected) in node.value as a prefix
      // or via the declaration kind. We check the node's raw source representation via flags.
      //
      // Strategy: look for child that is a callExpr → gate check.
      // For unsafe detection, the parser includes the modifier in node.value as "<modifier> <name>"
      // or via flags. We use a heuristic: if the binding value starts with "unsafe " we treat it
      // as a source.

      const isUnsafe = bindingName.startsWith("unsafe ") ||
        node.value === "unsafe" ||
        hasUnsafeModifier(node);

      const initExpr = children.find(c =>
        c.kind === "callExpr" || c.kind === "memberExpr" || c.kind === "identifier"
      );

      if (isUnsafe || isUnsafeLetNode(node)) {
        // Source node — tainted input from boundary
        const sourceName = stripUnsafePrefix(bindingName);
        const srcId = newId("src");
        const sourceKind = inferSourceKind(node, sourceName);

        const srcNode: DataNode = {
          id: srcId,
          kind: "source",
          sourceKind,
          label: `unsafe let ${sourceName}`,
          flowName,
          filePath,
          isTrusted: false,
        };
        nodes.push(srcNode);
        taintedBindings.add(sourceName);
        bindingToNode.set(sourceName, srcId);
        hasTaintedData = true;
      } else if (initExpr?.kind === "callExpr") {
        // Check if RHS is a gate call — if so, mark binding as safe
        const callName = resolveCallName(initExpr);
        if (isGateCall(callName)) {
          const txId = newId("tx");
          const transformNode: DataNode = {
            id: txId,
            kind: "transform",
            transformKind: classifyTransform(callName),
            label: `${callName}(...)`,
            flowName,
            filePath,
            isTrusted: true,
          };
          nodes.push(transformNode);
          lastTransformId = txId;

          // Wire edges: find tainted bindings consumed by this call
          const consumed = collectCallArgs(initExpr);
          let sourceLinked = false;
          for (const arg of consumed) {
            const prevId = bindingToNode.get(arg);
            if (prevId !== undefined) {
              edges.push({ from: prevId, to: txId, label: callName });
              sourceLinked = true;
            }
          }
          if (!sourceLinked && lastTransformId !== txId && nodes.length > 1) {
            // fallback: wire from last source
            const lastSrc = [...nodes].reverse().find(n => n.kind === "source");
            if (lastSrc !== undefined) {
              edges.push({ from: lastSrc.id, to: txId, label: callName });
            }
          }

          const cleanName = stripUnsafePrefix(bindingName);
          safeBindings.add(cleanName);
          bindingToNode.set(cleanName, txId);
        }
      }
    }

    if (node.kind === "callExpr") {
      const callName = resolveCallName(node);

      // Detect sink
      const sinkMatch = matchSink(callName);
      if (sinkMatch !== undefined) {
        const sinkId = newId("sink");
        const sinkNode: DataNode = {
          id: sinkId,
          kind: "sink",
          sinkKind: sinkMatch.sinkKind,
          label: sinkMatch.label,
          flowName,
          filePath,
          isTrusted: true, // sinks are not inherently trusted/untrusted; we mark as trusted for display
        };
        nodes.push(sinkNode);

        // Check if any tainted binding reaches this sink ungated
        const args = collectCallArgs(node);
        let reachedByTaint = false;
        let linkedToNode = false;
        for (const arg of args) {
          const prevId = bindingToNode.get(arg);
          if (prevId !== undefined) {
            edges.push({ from: prevId, to: sinkId });
            linkedToNode = true;
            if (taintedBindings.has(arg) && !safeBindings.has(arg)) {
              reachedByTaint = true;
            }
          }
        }
        if (!linkedToNode) {
          // Wire from last transform or last source
          const linkFrom = lastTransformId ?? [...nodes].reverse().find(n => n.id !== sinkId)?.id;
          if (linkFrom !== undefined) {
            edges.push({ from: linkFrom, to: sinkId });
          }
        }

        if (reachedByTaint) {
          ungatedSinkReached = true;
          sinkNode.isTrusted = false;
        }
      } else if (isGateCall(callName)) {
        // Standalone gate call (not assigned to a binding, e.g. redact(...) inside AuditLog.write)
        const txId = newId("tx");
        const transformNode: DataNode = {
          id: txId,
          kind: "transform",
          transformKind: classifyTransform(callName),
          label: `${callName}(...)`,
          flowName,
          filePath,
          isTrusted: true,
        };
        nodes.push(transformNode);

        const consumed = collectCallArgs(node);
        for (const arg of consumed) {
          const prevId = bindingToNode.get(arg);
          if (prevId !== undefined) {
            edges.push({ from: prevId, to: txId, label: callName });
            // Mark arg as safe after redact/gate
            safeBindings.add(arg);
            bindingToNode.set(arg, txId);
          }
        }
        lastTransformId = txId;
      }
    }

    // Recurse into children
    for (const child of node.children ?? []) {
      walk(child);
    }
  }

  walk(flowNode);
  return { nodes, edges, hasTaintedData, ungatedSinkReached };
}

/**
 * Collect argument names (identifiers) from a call expression node.
 * Handles both plain calls and method calls.
 */
function collectCallArgs(node: AstNode): string[] {
  const names: string[] = [];
  const children = node.children ?? [];
  // For method calls, skip children[0] (receiver) — it's not an arg
  const argChildren = node.callStyle === "method" ? children.slice(1) : children;
  for (const child of argChildren) {
    collectIdentifiers(child, names);
  }
  return names;
}

function collectIdentifiers(node: AstNode, out: string[]): void {
  if (node.kind === "identifier" && node.value !== undefined) {
    out.push(node.value);
  }
  for (const child of node.children ?? []) {
    collectIdentifiers(child, out);
  }
}

function hasUnsafeModifier(node: AstNode): boolean {
  // The parser may encode the unsafe modifier as a child with kind "identifier" and value "unsafe"
  // or as part of the node value string.
  if (node.value?.includes("unsafe")) return true;
  const firstChild = (node.children ?? [])[0];
  return firstChild?.kind === "identifier" && firstChild.value === "unsafe";
}

function isUnsafeLetNode(node: AstNode): boolean {
  // Check if any child is a memberExpr referencing request.body.* / request.jsonBody.*
  // as those are implicitly unsafe boundary inputs
  const children = node.children ?? [];
  for (const child of children) {
    if (isBoundaryAccessExpr(child)) return true;
  }
  return false;
}

function isBoundaryAccessExpr(node: AstNode): boolean {
  if (node.kind === "memberExpr") {
    const root = getMemberRoot(node);
    return root === "request" || root === "req" || root === "input" || root === "params";
  }
  return false;
}

function getMemberRoot(node: AstNode): string {
  if (node.kind === "identifier") return node.value ?? "";
  const first = (node.children ?? [])[0];
  if (first !== undefined) return getMemberRoot(first);
  return "";
}

function stripUnsafePrefix(name: string): string {
  return name.replace(/^unsafe\s+/, "").trim();
}

function inferSourceKind(node: AstNode, _bindingName: string): DataSourceKind {
  // Try to infer from RHS expression
  for (const child of node.children ?? []) {
    const text = JSON.stringify(child);
    if (text.includes("request") || text.includes("req")) return "network";
    if (text.includes("Secrets") || text.includes("Secret") || text.includes("env")) return "secret";
    if (text.includes("DB") || text.includes("Database") || text.includes("Db")) return "database";
  }
  return "user-input";
}

// ---------------------------------------------------------------------------
// Source-level unsafe let detection via line scanning
// (supplements AST walk for cases the parser encodes as plain letDecl)
// ---------------------------------------------------------------------------

interface UnsafeLetBinding {
  name: string;
  lineNumber: number;
  rhsText: string;
}

function scanUnsafeLetBindings(source: string): UnsafeLetBinding[] {
  const results: UnsafeLetBinding[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    // Match: unsafe let <name>... = <rhs>
    const m = line.match(/^\s*unsafe\s+(?:let|mut)\s+(\w+)\s*(?::\s*\S+)?\s*=\s*(.*)$/);
    if (m?.[1] !== undefined) {
      results.push({ name: m[1], lineNumber: i + 1, rhsText: m[2] ?? "" });
    }
  }
  return results;
}

interface GateCallSite {
  callName: string;
  lineNumber: number;
  argText: string;
}

function scanGateCalls(source: string): GateCallSite[] {
  const results: GateCallSite[] = [];
  const lines = source.split(/\r?\n/);
  const gateRe = /(?:validate|sanitize|hash|encrypt|redact|Crypto|BCrypt|Argon2|Password|Hash)\.\w+\s*\(([^)]*)\)/g;
  const exactRe = /\bredact\s*\(([^)]*)\)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    let m: RegExpExecArray | null;
    gateRe.lastIndex = 0;
    while ((m = gateRe.exec(line)) !== null) {
      results.push({ callName: m[0].split("(")[0]?.trim() ?? "", lineNumber: i + 1, argText: m[1] ?? "" });
    }
    exactRe.lastIndex = 0;
    while ((m = exactRe.exec(line)) !== null) {
      if (!results.some(r => r.lineNumber === i + 1 && r.callName === "redact")) {
        results.push({ callName: "redact", lineNumber: i + 1, argText: m[1] ?? "" });
      }
    }
  }
  return results;
}

interface SinkCallSite {
  callName: string;
  lineNumber: number;
  sinkKind: DataSinkKind;
  args: string[];
}

// Reserved words and types to exclude from arg extraction
const RESERVED_WORDS = new Set([
  "true", "false", "null", "undefined", "let", "mut", "const", "unsafe", "safe",
  "protected", "return", "if", "else", "for", "while", "match", "case", "event",
  "String", "Int", "Bool", "Float", "Bytes", "Request", "Response", "Result", "Ok",
  "Err", "level", "success", "info",
]);

function extractArgsFromText(argsText: string): string[] {
  // Extract all identifier-like tokens from the args text, excluding reserved words
  const tokens = argsText.match(/\b[a-z][A-Za-z0-9_]*\b/g) ?? [];
  return [...new Set(tokens.filter(t => !RESERVED_WORDS.has(t)))];
}

function scanSinkCalls(source: string): SinkCallSite[] {
  const results: SinkCallSite[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const entry of SINK_PATTERNS) {
      // Check if any call on this line matches the pattern
      const callRe = /(\w+(?:\.\w+)*)\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(line)) !== null) {
        const name = m[1] ?? "";
        if (entry.pattern.test(name)) {
          // Collect args by extracting all identifiers from the argument region
          // We look ahead from the opening '(' to find all identifiers in this line
          const afterCall = line.slice((m.index ?? 0) + m[0].length);
          // For multi-line arg blocks we use the current line; for single-line the full parens content
          const parenEnd = afterCall.indexOf(")");
          const argsText = parenEnd >= 0 ? afterCall.slice(0, parenEnd) : afterCall;
          const args = extractArgsFromText(argsText);
          results.push({
            callName: name,
            lineNumber: i + 1,
            sinkKind: entry.sinkKind,
            args,
          });
        }
      }
    }
  }
  // Deduplicate (same line/callName)
  const seen = new Set<string>();
  return results.filter(r => {
    const key = `${r.lineNumber}:${r.callName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main per-file analysis — source-level + AST-level combined
// ---------------------------------------------------------------------------

export interface FileProvenanceResult {
  nodes: DataNode[];
  edges: DataEdge[];
  flows: string[];
  hasTaintedData: boolean;
  ungatedSinkReached: boolean;
  /**
   * LLN-PROV-001 (AnalyzerBlindOnParseFailure): the source failed to parse
   * (error diagnostics + zero flows + empty AST), so the analyzer was BLIND.
   * A blind analysis is NOT clean — callers must treat this as non-zero/deny,
   * exactly like ungatedSinkReached (NIST SP 800-207 T6, CWE-636).
   */
  analyzerBlind: boolean;
}

/**
 * Determine flow body line range for scoped source scanning.
 * Returns [startLine, endLine] (1-based, inclusive), or [start, Infinity] if endLine unknown.
 *
 * Strategy: use the flow's start line and the next flow's start line (minus 1) as the range.
 * Falls back to EOF for the last flow.
 */
function flowLineRange(
  flows: readonly import("@logicn/core-compiler").FlowMeta[],
  index: number,
  totalLines: number,
): [number, number] {
  const flow = flows[index];
  if (flow === undefined) return [1, totalLines];
  const startLine = flow.location.line;
  const nextFlow = flows[index + 1];
  const endLine = nextFlow !== undefined ? nextFlow.location.line - 1 : totalLines;
  return [startLine, endLine];
}

export function analyzeFile(
  source: string,
  filePath: string,
  options: ProvenanceOptions = {},
): FileProvenanceResult {
  const parsed = parseProgram(source, filePath);
  const allNodes: DataNode[] = [];
  const allEdges: DataEdge[] = [];
  let anyTainted = false;
  let anyUngated = false;
  const flowNames: string[] = [];
  const lines = source.split(/\r?\n/);
  const totalLines = lines.length;

  // LLN-PROV-001: read the parse diagnostics that were previously ignored. If the
  // source did not parse (errors + no flows + empty AST), the analyzer is blind —
  // every downstream "no ungated sink" conclusion is vacuous, not safe.
  const parseErrors = (parsed.diagnostics ?? []).filter(d => d.severity === "error");
  const analyzerBlind =
    parseErrors.length > 0 &&
    parsed.flows.length === 0 &&
    (parsed.ast.children ?? []).length === 0;

  // Use the value-state checker as the AUTHORITATIVE source for ungated-sink detection.
  // LLN-VALUESTATE-003 = unsafe value at governed sink
  // LLN-VALUESTATE-005 = derived unsafe value at sink
  // The compiler already knows which flows are clean vs not.
  const vsResult = checkValueStates(parsed.ast);
  const hasCompilerUngatedDiag = vsResult.diagnostics.some(
    d => d.code === "LLN-VALUESTATE-003" || d.code === "LLN-VALUESTATE-005",
  );

  // Build per-line source text for scoped scanning
  // Source-level scanning: only scan within each flow's line range
  const allUnsafeLets = scanUnsafeLetBindings(source);
  const allGateCalls  = scanGateCalls(source);
  const allSinkCalls  = scanSinkCalls(source);

  // Filter arrays to a given [startLine, endLine] range
  function inRange<T extends { lineNumber: number }>(arr: T[], start: number, end: number): T[] {
    return arr.filter(x => x.lineNumber >= start && x.lineNumber <= end);
  }

  // Process each flow
  const filteredFlows = options.flowFilter !== undefined
    ? parsed.flows.filter(f => f.name === options.flowFilter)
    : parsed.flows;

  for (let fi = 0; fi < filteredFlows.length; fi++) {
    const flow = filteredFlows[fi]!;
    flowNames.push(flow.name);

    // Determine line range for this flow's body
    // We need the index in the original flows array for range calculation
    const origIndex = parsed.flows.findIndex(f => f.name === flow.name && f.location.line === flow.location.line);
    const [startLine, endLine] = flowLineRange(parsed.flows, origIndex, totalLines);

    // Scope scanning to this flow's line range
    const flowUnsafeLets = inRange(allUnsafeLets, startLine, endLine);
    const flowGateCalls  = inRange(allGateCalls,  startLine, endLine);
    const flowSinkCalls  = inRange(allSinkCalls,  startLine, endLine);

    // Build a set of gated binding names within this flow
    const gatedBindings = new Set<string>();
    for (const gate of flowGateCalls) {
      const argNames = gate.argText.split(/[,\s()]+/).filter(s => /^\w+$/.test(s));
      for (const n of argNames) gatedBindings.add(n);
    }

    // Build nodes for this flow
    const flowNodes: DataNode[] = [];
    const flowEdges: DataEdge[] = [];
    let flowTainted = false;
    let flowUngated = false;

    // --- Source nodes ---
    const sourceNodeMap = new Map<string, string>(); // binding name → node id
    for (const ul of flowUnsafeLets) {
      const srcId = newId(`src-${flow.name}`);
      const sourceKind = inferSourceKindFromRhs(ul.rhsText);
      flowNodes.push({
        id: srcId,
        kind: "source",
        sourceKind,
        label: `unsafe let ${ul.name}`,
        flowName: flow.name,
        filePath,
        isTrusted: false,
      });
      sourceNodeMap.set(ul.name, srcId);
      flowTainted = true;
    }

    // --- Transform nodes (gate calls) ---
    const transformNodeMap = new Map<string, string>(); // "callName:lineNumber" → node id
    for (const gc of flowGateCalls) {
      const txId = newId(`tx-${flow.name}`);
      const txNode: DataNode = {
        id: txId,
        kind: "transform",
        transformKind: classifyTransform(gc.callName),
        label: `${gc.callName}(...)`,
        flowName: flow.name,
        filePath,
        isTrusted: true,
      };
      flowNodes.push(txNode);
      transformNodeMap.set(`${gc.callName}:${gc.lineNumber}`, txId);

      // Wire edges from source bindings consumed by this gate
      const argNames = gc.argText.split(/[,\s()]+/).filter(s => /^\w+$/.test(s));
      for (const arg of argNames) {
        const srcId = sourceNodeMap.get(arg);
        if (srcId !== undefined) {
          flowEdges.push({ from: srcId, to: txId, label: gc.callName });
        }
      }
    }

    // --- Sink nodes ---
    for (const sc of flowSinkCalls) {
      const sinkId = newId(`sink-${flow.name}`);

      // Ungated detection: a tainted binding in this flow reaches the sink without a gate.
      // We check both the source-level arg analysis AND the compiler value-state diagnostics.
      const hasUngatedArg = sc.args.some(arg => {
        return sourceNodeMap.has(arg) && !gatedBindings.has(arg);
      });

      // Fail-closed (LLN-PROV-001 / 0098-prov-parsefail): a source-level ungated
      // detection stands on its own. A SILENT compiler (no LLN-VALUESTATE-003/-005)
      // means "could not prove a violation" — NOT "proven clean". Use the compiler
      // diagnostic to ESCALATE (OR), never to SUPPRESS (AND): absence of evidence is
      // not evidence of safety.
      const sinkUngated = hasUngatedArg || hasCompilerUngatedDiag;
      const sinkTrusted = !sinkUngated;

      const sinkNode: DataNode = {
        id: sinkId,
        kind: "sink",
        sinkKind: sc.sinkKind,
        label: sc.callName,
        flowName: flow.name,
        filePath,
        isTrusted: sinkTrusted,
      };
      flowNodes.push(sinkNode);

      // Wire edges
      let linkedSomething = false;
      for (const arg of sc.args) {
        const txId = [...transformNodeMap.entries()]
          .find(([k]) => k.includes(arg))?.[1];
        if (txId !== undefined) {
          flowEdges.push({ from: txId, to: sinkId });
          linkedSomething = true;
        } else {
          const srcId = sourceNodeMap.get(arg);
          if (srcId !== undefined) {
            flowEdges.push({ from: srcId, to: sinkId });
            linkedSomething = true;
          }
        }
      }
      if (!linkedSomething) {
        const lastTx = [...transformNodeMap.values()].at(-1);
        if (lastTx !== undefined) {
          flowEdges.push({ from: lastTx, to: sinkId });
        } else {
          const lastSrc = [...sourceNodeMap.values()].at(-1);
          if (lastSrc !== undefined) {
            flowEdges.push({ from: lastSrc, to: sinkId });
          }
        }
      }

      if (sinkUngated) {
        flowUngated = true;
      }
    }

    // If no explicit nodes found for this flow, add a minimal internal node
    if (flowNodes.length === 0) {
      const internalId = newId(`internal-${flow.name}`);
      flowNodes.push({
        id: internalId,
        kind: "source",
        sourceKind: "internal",
        label: `flow ${flow.name}`,
        flowName: flow.name,
        filePath,
        isTrusted: true,
      });
    }

    allNodes.push(...flowNodes);
    allEdges.push(...flowEdges);
    if (flowTainted) anyTainted = true;
    if (flowUngated) anyUngated = true;
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    flows: flowNames,
    hasTaintedData: anyTainted,
    ungatedSinkReached: anyUngated,
    analyzerBlind,
  };
}

function inferSourceKindFromRhs(rhs: string): DataSourceKind {
  if (/request|req\.|body\.|jsonBody|params|query|headers/.test(rhs)) return "network";
  if (/Secrets?\.|Secret\.env|\.env\b/.test(rhs)) return "secret";
  if (/\bDB\b|\bDatabase\b|\bDb\b/.test(rhs)) return "database";
  if (/user|input|form/.test(rhs)) return "user-input";
  return "user-input";
}

// ---------------------------------------------------------------------------
// Workspace-level aggregation
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

export function collectLlnFiles(dir: string): string[] {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        files.push(...collectLlnFiles(full));
      } else if (extname(entry) === ".lln") {
        files.push(full);
      }
    } catch {
      // skip unreadable
    }
  }
  return files;
}

export function buildProvenanceGraph(
  filePaths: string[],
  options: ProvenanceOptions = {},
): ProvenanceGraph {
  const allNodes: DataNode[] = [];
  const allEdges: DataEdge[] = [];
  let totalFlows = 0;
  let flowsWithTaintedData = 0;
  let flowsWithUngatedSinks = 0;
  const riskFlows: ProvenanceGraph["riskFlows"] = [];

  for (const filePath of filePaths) {
    let source: string;
    try {
      source = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const result = analyzeFile(source, filePath, options);
    allNodes.push(...result.nodes);
    allEdges.push(...result.edges);
    totalFlows += result.flows.length;

    if (result.hasTaintedData) flowsWithTaintedData++;
    if (result.ungatedSinkReached) {
      flowsWithUngatedSinks++;
      // Record risk flows — one per flow name
      for (const flowName of result.flows) {
        if (!riskFlows.some(r => r.flowName === flowName && r.filePath === filePath)) {
          riskFlows.push({
            flowName,
            filePath,
            risk: "high",
            description: `Tainted data from an unsafe binding reaches a governed sink without passing through a gate in flow '${flowName}'.`,
          });
        }
      }
    }

    // LLN-PROV-001: a file the analyzer could not parse is NOT clean. Count it
    // toward the high-risk total (so cli.ts `flowsWithUngatedSinks > 0 ? 2 : 0`
    // returns 2) and record an explicit blind-file risk entry, distinct from an
    // ungated sink but equally "deny".
    if (result.analyzerBlind) {
      flowsWithUngatedSinks++;
      if (!riskFlows.some(r => r.filePath === filePath && r.flowName === "<parse-failure>")) {
        riskFlows.push({
          flowName: "<parse-failure>",
          filePath,
          risk: "high",
          description: `LLN-PROV-001: '${filePath}' failed to parse — the provenance analyzer was BLIND and cannot certify it clean (deny-by-default).`,
        });
      }
    }
  }

  // Count trust boundary crossings: edges where the source node is untrusted and sink is a transform/sink
  const nodeById = new Map(allNodes.map(n => [n.id, n]));
  let trustBoundaryCrossings = 0;
  for (const edge of allEdges) {
    const fromNode = nodeById.get(edge.from);
    const toNode   = nodeById.get(edge.to);
    if (fromNode?.isTrusted === false && toNode?.isTrusted === true) {
      trustBoundaryCrossings++;
    }
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    summary: {
      totalFlows,
      flowsWithTaintedData,
      flowsWithUngatedSinks,
      trustBoundaryCrossings,
    },
    riskFlows,
  };
}
