// =============================================================================
// Galerina Phase 28 — Taint Tracking & Sink Safety
//
// Implements Tainted<T> / SafeFor<Context, T> per the OWASP-aligned catalogue.
//
// Spec: docs/Knowledge-Bases/galerina-taint-catalogue.md
//
// Core principle:  "A value is only clean for the sink it was cleaned for."
//
// A value from an untrusted source (network.inbound, request body, env) is
// Tainted. It cannot reach an injection sink (SQL/HTML/Shell/Path) unless it
// passes through a recognised untaint boundary that produces SafeFor<Context,T>.
// A value made SafeFor<HtmlContent> is still tainted for a SQL sink.
// =============================================================================

import { type AstNode, type FlowMeta } from "./parser.js";

// ---------------------------------------------------------------------------
// Sink contexts (closed set)
// ---------------------------------------------------------------------------

export type SinkContext =
  | "SqlValue" | "SqlIdentifier" | "NoSqlQuery"
  | "HtmlContent" | "HtmlAttribute" | "PurifiedHtml"
  | "JsString" | "CssValue"
  | "UrlComponent" | "SafeUrl"
  | "ShellArg" | "PathWithin" | "SafeFileName"
  | "LogLine" | "CsvCell" | "XmlText" | "XmlAttribute"
  | "LdapFilter" | "RegexLiteral"
  // Phase 33 additions (Critical — HTTP endpoint attack surface)
  | "HttpHeaderValue"  // for Http.setHeader / Response.header
  | "SsrfCheckedUrl"; // for outbound URLs with private-IP block verified

// ---------------------------------------------------------------------------
// Untaint boundary catalogue — function name → context it produces
// (OWASP-aligned: parameterize/spawn preferred over escape/quote)
// ---------------------------------------------------------------------------

interface UntaintBoundary {
  readonly fn: string;            // e.g. "Sql.parameterize"
  readonly produces: SinkContext;
  readonly preferred: boolean;    // OWASP-preferred (true) vs discouraged fallback (false)
}

export const UNTAINT_BOUNDARIES: readonly UntaintBoundary[] = [
  // Phase 33: HTTP header untaint (Critical — strips CR/LF/null before setHeader)
  { fn: "Http.encodeHeaderValue",      produces: "HttpHeaderValue", preferred: true },
  // Phase 33: SSRF-checked URL (private-IP block verified)
  { fn: "Url.parseAndAllowlist",       produces: "SsrfCheckedUrl",  preferred: true },
  { fn: "Sql.parameterize",            produces: "SqlValue",      preferred: true },
  { fn: "Sql.escape",                  produces: "SqlValue",      preferred: false }, // discouraged
  { fn: "Sql.identifierFromAllowlist", produces: "SqlIdentifier", preferred: true },
  { fn: "NoSql.sanitizeKeys",          produces: "NoSqlQuery",    preferred: true },
  { fn: "Html.escapeContent",          produces: "HtmlContent",   preferred: true },
  { fn: "Html.escapeAttribute",        produces: "HtmlAttribute", preferred: true },
  { fn: "Html.purify",                 produces: "PurifiedHtml",  preferred: true },
  { fn: "Js.escapeString",             produces: "JsString",      preferred: true },
  { fn: "Css.escapeValue",             produces: "CssValue",      preferred: true },
  { fn: "Url.encodeComponent",         produces: "UrlComponent",  preferred: true },
  { fn: "Url.parseAndAllowlist",       produces: "SafeUrl",       preferred: true },
  { fn: "Process.spawn",               produces: "ShellArg",      preferred: true },
  { fn: "Shell.quoteArg",              produces: "ShellArg",      preferred: false }, // discouraged
  { fn: "Path.canonicalizeWithin",     produces: "PathWithin",    preferred: true },
  { fn: "FileName.generateSafe",       produces: "SafeFileName",  preferred: true },
  { fn: "FileName.validateAllowlist",  produces: "SafeFileName",  preferred: true },
  { fn: "Log.escapeLine",              produces: "LogLine",       preferred: true },
  { fn: "Csv.escapeCell",              produces: "CsvCell",       preferred: true },
  { fn: "Xml.escapeText",              produces: "XmlText",       preferred: true },
  { fn: "Xml.escapeAttribute",         produces: "XmlAttribute",  preferred: true },
  { fn: "Ldap.escapeFilter",           produces: "LdapFilter",    preferred: true },
  { fn: "Regex.escapeLiteral",         produces: "RegexLiteral",  preferred: true },
];

const BOUNDARY_BY_FN = new Map(UNTAINT_BOUNDARIES.map(b => [b.fn, b]));

/** Injection sinks: function name → required SafeFor context. */
export const INJECTION_SINKS: ReadonlyMap<string, SinkContext> = new Map([
  ["Database.query",   "SqlValue"],
  ["Db.query",         "SqlValue"],
  ["Sql.run",          "SqlValue"],
  ["Html.render",      "HtmlContent"],
  ["Dom.setHtml",      "PurifiedHtml"],
  ["Shell.exec",       "ShellArg"],
  ["Process.exec",     "ShellArg"],
  ["File.open",        "PathWithin"],
  ["FileSystem.read",  "PathWithin"],
  ["Ldap.search",      "LdapFilter"],
  // Phase 33: HTTP header injection sinks (Critical — opens with Phase 34 HTTP endpoint)
  ["Http.setHeader",       "HttpHeaderValue"],
  ["Response.setHeader",   "HttpHeaderValue"],
  ["Response.header",      "HttpHeaderValue"],
  // Phase 33: outbound URL sinks (SSRF surface)
  ["Http.fetch",           "SafeUrl"],
  ["Http.request",         "SafeUrl"],
  ["Network.call",         "SafeUrl"],
]);

/** Sources that introduce taint. */
const TAINT_SOURCES = new Set([
  "request", "req", "input", "params", "query", "body", "headers",
  "env", "stdin", "argv",
]);

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export interface TaintDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly flowName?: string;
}

/** SPORE-TAINT-001: Raw tainted value reaches an injection sink. */
export const SPORE_TAINT_001 = {
  code: "SPORE-TAINT-001",
  name: "TaintedValueAtInjectionSink",
  severity: "error" as const,
  message: "A tainted (untrusted) value reaches an injection sink without passing through an untaint boundary. Apply the appropriate sanitiser/encoder first.",
} as const;

/** SPORE-TAINT-002: Unvalidated value at a business-logic sink. */
export const SPORE_TAINT_002 = {
  code: "SPORE-TAINT-002",
  name: "UnvalidatedValueAtLogicSink",
  severity: "warning" as const,
  message: "An unvalidated value reaches a business-logic sink. Validate it first (Validated<T>).",
} as const;

/** SPORE-TAINT-003: Value cleaned for context A used in a sink expecting context B. */
export const SPORE_TAINT_003 = {
  code: "SPORE-TAINT-003",
  name: "WrongContextUntaint",
  severity: "error" as const,
  message: "A value cleaned for one sink context is used in a sink expecting a different context. A value is only clean for the sink it was cleaned for.",
} as const;

/** SPORE-TAINT-004: Discouraged sanitiser used where a preferred boundary exists. */
export const SPORE_TAINT_004 = {
  code: "SPORE-TAINT-004",
  name: "DiscouragedSanitiser",
  severity: "warning" as const,
  message: "Discouraged sanitiser used. OWASP prefers parameterized APIs (Sql.parameterize) and no-shell spawning (Process.spawn) over escaping/quoting.",
} as const;

// ---------------------------------------------------------------------------
// Taint analysis
// ---------------------------------------------------------------------------

const FLOW_KINDS = new Set(["flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl"]);

/** What a binding currently holds, from a taint perspective. */
type TaintState =
  | { kind: "tainted" }
  | { kind: "safeFor"; context: SinkContext }
  | { kind: "clean" };

/**
 * Extract the callee name from a callExpr or memberExpr node.
 *
 * `Database.query(userId)` parses as:
 *   callExpr [query]
 *     identifier [Database]   ← receiver (first child, capitalised = module)
 *     identifier [userId]     ← actual argument(s)
 *
 * Returns e.g. "Sql.parameterize", "Database.query", or a bare flow name.
 */
function calleeNameOf(node: AstNode): string | null {
  if (node.kind === "callExpr") {
    const method = node.value ?? "";
    const first = node.children?.[0];
    // Module-qualified call: first child is a capitalised identifier (receiver)
    if (first?.kind === "identifier" && (first.value?.[0] ?? "") >= "A" && (first.value?.[0] ?? "") <= "Z") {
      return `${first.value}.${method}`;
    }
    return method.length > 0 ? method : null;
  }
  if (node.kind === "memberExpr") {
    const receiver = node.children?.[0];
    const method = node.value ?? "";
    if (receiver?.kind === "identifier") {
      return `${receiver.value}.${method}`;
    }
  }
  return null;
}

/**
 * Returns the actual argument nodes of a callExpr, excluding the module receiver.
 * For `Database.query(userId)`: children = [Database, userId] → args = [userId].
 * For `add(a, b)`: children = [a, b] → args = [a, b].
 */
function callArgsOf(node: AstNode): readonly AstNode[] {
  const children = node.children ?? [];
  const first = children[0];
  // If first child is a capitalised identifier (module receiver), skip it
  if (first?.kind === "identifier" && (first.value?.[0] ?? "") >= "A" && (first.value?.[0] ?? "") <= "Z") {
    return children.slice(1);
  }
  return children;
}

/** Determine the taint state produced by an expression. */
function taintOf(expr: AstNode, bindings: Map<string, TaintState>): TaintState {
  switch (expr.kind) {
    case "identifier": {
      const name = expr.value ?? "";
      // direct taint source
      if (TAINT_SOURCES.has(name)) return { kind: "tainted" };
      const bound = bindings.get(name);
      if (bound !== undefined) return bound;
      // literals / unknown → clean
      return { kind: "clean" };
    }
    case "stringLiteral":
    case "numberLiteral":
    case "boolLiteral":
      return { kind: "clean" }; // literals are never tainted

    case "memberExpr": {
      // request.body, req.params → tainted
      const receiver = expr.children?.[0];
      if (receiver?.kind === "identifier" && TAINT_SOURCES.has(receiver.value ?? "")) {
        return { kind: "tainted" };
      }
      // untaint boundary call as member? handled in callExpr
      return taintPropagate(expr, bindings);
    }

    case "callExpr": {
      const callee = calleeNameOf(expr);
      if (callee !== null) {
        const boundary = BOUNDARY_BY_FN.get(callee);
        if (boundary !== undefined) {
          return { kind: "safeFor", context: boundary.produces };
        }
      }
      return taintPropagate(expr, bindings);
    }

    case "binaryExpr":
      return taintPropagate(expr, bindings);

    default:
      return taintPropagate(expr, bindings);
  }
}

/** If any sub-expression is tainted, the result is tainted (taint propagates through ops). */
function taintPropagate(expr: AstNode, bindings: Map<string, TaintState>): TaintState {
  for (const child of expr.children ?? []) {
    const t = taintOf(child, bindings);
    if (t.kind === "tainted") return { kind: "tainted" };
  }
  return { kind: "clean" };
}

/**
 * Phase 28: Check a program for taint violations.
 * Tracks tainted values flowing from sources into injection sinks.
 */
export function checkTaint(ast: AstNode, flows: readonly FlowMeta[]): TaintDiagnostic[] {
  const diagnostics: TaintDiagnostic[] = [];

  for (const flow of flows) {
    const flowNode = (ast.children ?? []).find(c => FLOW_KINDS.has(c.kind) && c.value === flow.name);
    if (flowNode === undefined) continue;

    const bindings = new Map<string, TaintState>();

    // Parameters: by default trusted unless named like a taint source.
    // (Phase 28B will read `tainted` qualifier from param declarations.)
    for (const p of (flowNode.children ?? []).filter(c => c.kind === "paramDecl")) {
      const pname = ((p.value ?? "").split(":")[0] ?? "").trim();
      if (TAINT_SOURCES.has(pname)) bindings.set(pname, { kind: "tainted" });
    }

    const body = (flowNode.children ?? []).find(c => c.kind === "block");
    if (body === undefined) continue;

    walkBody(body, bindings, flow.name, diagnostics);
  }

  return diagnostics;
}

function walkBody(
  block: AstNode,
  bindings: Map<string, TaintState>,
  flowName: string,
  diagnostics: TaintDiagnostic[],
): void {
  for (const stmt of block.children ?? []) {
    switch (stmt.kind) {
      case "letDecl":
      case "mutDecl": {
        const rawName = stmt.value ?? "";
        const varName = (rawName.split(":")[0] ?? rawName).trim();
        const init = stmt.children?.[0];
        if (init !== undefined) {
          checkDiscouraged(init, flowName, diagnostics);
          // A sink call can appear inside a let initializer: let r = Database.query(x)
          checkSinkCalls(init, bindings, flowName, diagnostics);
          bindings.set(varName, taintOf(init, bindings));
        }
        break;
      }
      case "assignStmt": {
        const varName = (stmt.value ?? "").trim();
        const expr = stmt.children?.[0];
        if (expr !== undefined) {
          checkDiscouraged(expr, flowName, diagnostics);
          checkSinkCalls(expr, bindings, flowName, diagnostics);
          bindings.set(varName, taintOf(expr, bindings));
        }
        break;
      }
      case "returnStmt":
      case "callExpr": {
        checkSinkCalls(stmt, bindings, flowName, diagnostics);
        break;
      }
      case "ifStmt":
      case "whileStmt": {
        // recurse into nested blocks
        for (const child of stmt.children ?? []) {
          if (child.kind === "block") walkBody(child, bindings, flowName, diagnostics);
          else if (child.kind === "ifStmt") walkBody({ kind: "block", children: [child] } as AstNode, bindings, flowName, diagnostics);
        }
        break;
      }
      default:
        checkSinkCalls(stmt, bindings, flowName, diagnostics);
        break;
    }
  }
}

/** Walk an expression tree looking for injection-sink calls with tainted args. */
function checkSinkCalls(
  node: AstNode,
  bindings: Map<string, TaintState>,
  flowName: string,
  diagnostics: TaintDiagnostic[],
): void {
  const callee = calleeNameOf(node);
  if (callee !== null) {
    const requiredContext = INJECTION_SINKS.get(callee);
    if (requiredContext !== undefined) {
      // Check each argument's taint state (excluding the module receiver)
      for (const arg of callArgsOf(node)) {
        if (arg.kind === "identifier" && bindings.has(arg.value ?? "")) {
          const state = bindings.get(arg.value ?? "")!;
          if (state.kind === "tainted") {
            diagnostics.push({ ...SPORE_TAINT_001, flowName,
              message: `Flow '${flowName}': tainted value '${arg.value}' reaches sink '${callee}' (needs SafeFor<${requiredContext}>). ${SPORE_TAINT_001.message}` });
          } else if (state.kind === "safeFor" && state.context !== requiredContext) {
            diagnostics.push({ ...SPORE_TAINT_003, flowName,
              message: `Flow '${flowName}': value '${arg.value}' is SafeFor<${state.context}> but sink '${callee}' needs SafeFor<${requiredContext}>. ${SPORE_TAINT_003.message}` });
          }
        } else {
          const t = taintOf(arg, bindings);
          if (t.kind === "tainted") {
            diagnostics.push({ ...SPORE_TAINT_001, flowName,
              message: `Flow '${flowName}': tainted expression reaches sink '${callee}'. ${SPORE_TAINT_001.message}` });
          }
        }
      }
    }
  }
  // Recurse
  for (const child of node.children ?? []) checkSinkCalls(child, bindings, flowName, diagnostics);
}

/** Emit SPORE-TAINT-004 when a discouraged sanitiser is used. */
function checkDiscouraged(node: AstNode, flowName: string, diagnostics: TaintDiagnostic[]): void {
  const callee = calleeNameOf(node);
  if (callee !== null) {
    const b = BOUNDARY_BY_FN.get(callee);
    if (b !== undefined && !b.preferred) {
      diagnostics.push({ ...SPORE_TAINT_004, flowName,
        message: `Flow '${flowName}': '${callee}' is discouraged. ${SPORE_TAINT_004.message}` });
    }
  }
  for (const child of node.children ?? []) checkDiscouraged(child, flowName, diagnostics);
}

/** SPORE-TAINT-005: Raw tainted value reaches an HTTP header sink (header injection risk). */
export const SPORE_TAINT_005 = {
  code: "SPORE-TAINT-005",
  name: "TaintedValueAtHeaderSink",
  severity: "error" as const,
  message: "A tainted value reaches an HTTP header sink. HTTP header injection allows CRLF splitting and policy bypass. Use Http.encodeHeaderValue() to produce SafeFor<HttpHeaderValue>.",
  suggestedFix: "Wrap the value: Http.encodeHeaderValue(taintedValue)",
} as const;

/** SPORE-TAINT-006: SSRF policy is insufficient (empty or missing blockPrivateIp). */
export const SPORE_TAINT_006 = {
  code: "SPORE-TAINT-006",
  name: "SsrfPolicyInsufficient",
  severity: "warning" as const,
  message: "Url.parseAndAllowlist() called without blockPrivateIp: true. An empty or incomplete policy allows SSRF to private IP ranges (RFC 1918, APIPA, loopback). Add blockPrivateIp: true to the policy.",
  suggestedFix: "Url.parseAndAllowlist(url, { blockPrivateIp: true, schemes: [\"https\"] })",
} as const;

/** Taint diagnostic constants for external reference. */
export const TAINT_DIAGNOSTICS = [
  SPORE_TAINT_001, SPORE_TAINT_002, SPORE_TAINT_003, SPORE_TAINT_004,
  SPORE_TAINT_005, SPORE_TAINT_006,
] as const;
