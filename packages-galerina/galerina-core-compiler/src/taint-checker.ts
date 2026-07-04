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

/** Injection sinks: function name → required SafeFor context.
 *
 * NOTE (C1 / RD-0234c VD-2): this exact-name map is retained (it names the CANONICAL
 * boundary each sink needs, and the sink-canonicality audit extracts its keys) but it is
 * NO LONGER the sole recognizer. It was an EXACT-CASE, name-exact denylist matched only when
 * the receiver's first char was A–Z, so `db.query`, `pg.query`, `knex.raw`, `child_process.exec`
 * and bare `exec(tainted)` all produced ZERO diagnostics and an SQLi/cmd-injection signed clean.
 * Matching is now (b) case-insensitive and (c) shape/pattern-based via `sinkShapeOf` below, and
 * (d) deny-by-default for an unknown sink-SHAPED call carrying a tainted arg. See `sinkRequirementOf`. */
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

/** Case-insensitive view of INJECTION_SINKS — (b) `Database.query` and `db.query` match identically.
 *  A capitalised effect-style receiver and its lowercase instance-var spelling both resolve here. */
const INJECTION_SINKS_LC: ReadonlyMap<string, SinkContext> = new Map(
  [...INJECTION_SINKS].map(([k, v]) => [k.toLowerCase(), v]),
);

// ---------------------------------------------------------------------------
// (c)+(d) Sink SHAPE classifier — recognize a sink by METHOD NAME regardless of
// receiver casing (`db`, `pg`, `knex`, `child_process`, `Database`, `Shell`, …).
//
// This is the fail-open→fail-closed inversion: a tainted value reaching a call whose
// METHOD matches one of these shapes but which is not a known untaint boundary requires
// an untaint boundary (deny-by-default) and emits FUNGI-TAINT-001.
//
// Scope guard (CRITICAL): this MUST stay narrow to genuine injection-sink method families.
// A tainted value flowing into log.info(x) / myHelper(x) / arbitrary non-sink methods must
// NOT flag. Keyed on the METHOD name (the call's `value`), matched case-insensitively, so it is
// receiver-casing-agnostic (db.query ≡ Database.query). Each entry maps to the SafeFor context
// that sink family needs, so a value already SafeFor<that context> passes and a mismatched-context
// value is caught by the existing FUNGI-TAINT-003 path. Scope is justified below the array.
// ---------------------------------------------------------------------------

interface SinkShapePattern {
  readonly re: RegExp;            // matches the METHOD name (case-insensitive)
  readonly context: SinkContext; // the SafeFor context this sink family requires
}

// Deliberately NARROW: only injection-critical method families where a tainted arg on ANY
// receiver is almost always a real vulnerability and a false positive is rare. Generic verbs
// (get/set/send/write/call/run/post/put/open/find/header/render/fetch) are DELIBERATELY EXCLUDED
// from deny-by-default — on an unknown receiver they over-flag (`map.get`, `list.send`, `job.run`,
// `component.render`). Those still fire when they hit a KNOWN INJECTION_SINKS entry (exact/CI);
// broadening deny-by-default to the egress/URL/header/FS families is an H-class hardening tracked
// as a separate follow-on with its own false-positive analysis.
const SINK_SHAPES: readonly SinkShapePattern[] = [
  // SQL family — query/raw/prepare on ANY receiver (db.query, pg.query, knex.raw, store.query).
  { re: /^(query|raw|prepare)$/i,                                 context: "SqlValue" },
  // Command / dynamic-execution family — exec/execute/spawn/system/command/popen/fork/eval.
  { re: /^(exec|execute|spawn|system|command|popen|fork|eval)$/i, context: "ShellArg" },
  // Unambiguous XSS DOM-write family — setHtml/innerHtml (NOT generic "render", often a safe template).
  { re: /^(sethtml|innerhtml|dangerouslysetinnerhtml)$/i,         context: "HtmlContent" },
];

/**
 * (c) Returns the sink family a METHOD name matches by SHAPE, or undefined if the method is not
 * sink-shaped. Keyed on the bare method name (case-insensitive) so it is receiver-casing-agnostic.
 * Deliberately narrow: only genuine injection-sink method families are listed, so non-sink methods
 * (log.info, myHelper, String.trim, …) return undefined and are never deny-by-default flagged.
 */
function sinkShapeOf(method: string): SinkContext | undefined {
  for (const s of SINK_SHAPES) if (s.re.test(method)) return s.context;
  return undefined;
}

/**
 * Resolve the SafeFor context required at a call, combining all three recognizers:
 *   (a exact) INJECTION_SINKS by full `Receiver.method` name,
 *   (b case-insensitive) the lowercased view of the same map,
 *   (c pattern) the sink-SHAPE classifier keyed on the bare method name.
 * Returns the required context and whether the match was an EXACT/known sink (`known`) or an
 * UNKNOWN sink-shaped call (`known:false` → deny-by-default). Undefined = not a sink at all.
 */
function sinkRequirementOf(
  fullName: string | null,
  method: string,
): { context: SinkContext; known: boolean } | undefined {
  if (fullName !== null) {
    const exact = INJECTION_SINKS.get(fullName);
    if (exact !== undefined) return { context: exact, known: true };
    const ci = INJECTION_SINKS_LC.get(fullName.toLowerCase());
    if (ci !== undefined) return { context: ci, known: true };
  }
  // (c)+(d) unknown-but-sink-shaped by method name → deny-by-default.
  const shape = sinkShapeOf(method);
  if (shape !== undefined) return { context: shape, known: false };
  return undefined;
}

/** Sources that introduce taint. */
const TAINT_SOURCES = new Set([
  "request", "req", "input", "params", "query", "body", "headers",
  "env", "stdin", "argv",
  // H2-a (RD-0234c): clearly-untrusted web-boundary source names. These carry untrusted input by
  // provenance, so auto-tainting them is sound (a flow passing one to a sink now needs an untaint
  // boundary). Match is case-sensitive (taintOf :307/:321 + checkTaint :373 — no toLowerCase), so
  // these use the conventional casing developers write (the camelCase Web-API spellings for
  // sessionStorage/localStorage/formData/searchParams). AMBIGUOUS names (url/payload/message/event/
  // data/value/content) are DELIBERATELY EXCLUDED — an internally-constructed value of those would
  // false-fire; the sound fix for those is the owner-gated H2-b `tainted`/`untrusted` param qualifier.
  "cookies", "session", "sessionStorage", "localStorage",
  "formData", "searchParams", "queryString", "querystring",
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

/** FUNGI-TAINT-001: Raw tainted value reaches an injection sink. */
export const FUNGI_TAINT_001 = {
  code: "FUNGI-TAINT-001",
  name: "TaintedValueAtInjectionSink",
  severity: "error" as const,
  message: "A tainted (untrusted) value reaches an injection sink without passing through an untaint boundary. Apply the appropriate sanitiser/encoder first.",
} as const;

/** FUNGI-TAINT-002: Unvalidated value at a business-logic sink. */
export const FUNGI_TAINT_002 = {
  code: "FUNGI-TAINT-002",
  name: "UnvalidatedValueAtLogicSink",
  severity: "warning" as const,
  message: "An unvalidated value reaches a business-logic sink. Validate it first (Validated<T>).",
} as const;

/** FUNGI-TAINT-003: Value cleaned for context A used in a sink expecting context B. */
export const FUNGI_TAINT_003 = {
  code: "FUNGI-TAINT-003",
  name: "WrongContextUntaint",
  severity: "error" as const,
  message: "A value cleaned for one sink context is used in a sink expecting a different context. A value is only clean for the sink it was cleaned for.",
} as const;

/** FUNGI-TAINT-004: Discouraged sanitiser used where a preferred boundary exists. */
export const FUNGI_TAINT_004 = {
  code: "FUNGI-TAINT-004",
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
 * Render a receiver EXPRESSION to a dotted name: `db` → "db", `this.db` → "this.db".
 * Returns null for a receiver shape we can't name (e.g. a call result); callers fall back
 * to the bare method name.
 */
function receiverNameOf(recv: AstNode | undefined): string | null {
  if (recv === undefined) return null;
  if (recv.kind === "identifier") return recv.value ?? null;
  if (recv.kind === "memberExpr") {
    const inner = receiverNameOf(recv.children?.[0]);
    const seg = recv.value ?? "";
    return inner !== null ? `${inner}.${seg}` : (seg.length > 0 ? seg : null);
  }
  return null;
}

/**
 * Extract the full callee name from a callExpr / memberExpr node.
 *
 * C1 / RD-0234c fix: the receiver is identified by the parser's `callStyle === "method"` marker
 * (a `receiver.method(args)` call sets it and puts the receiver at children[0]), NOT the old
 * first-char-A–Z heuristic — which mis-named a lowercase-receiver sink `db.query(q)` as the bare
 * `query` (missing the injection sink) AND mis-named a bare call `Foo(Bar)` as `Bar.Foo`.
 *
 * `db.query(userId)` → callStyle "method", children [db, userId] → "db.query".
 * `add(a, b)`        → no callStyle,       children [a, b]       → "add".
 */
function calleeNameOf(node: AstNode): string | null {
  if (node.kind === "callExpr") {
    const method = node.value ?? "";
    if (node.callStyle === "method") {
      const recvName = receiverNameOf(node.children?.[0]);
      if (recvName !== null) return `${recvName}.${method}`;
    }
    return method.length > 0 ? method : null;
  }
  if (node.kind === "memberExpr") {
    const recvName = receiverNameOf(node.children?.[0]);
    const method = node.value ?? "";
    if (recvName !== null) return `${recvName}.${method}`;
  }
  return null;
}

/**
 * Returns the actual argument nodes of a call, excluding a method-call receiver.
 * `db.query(userId)` (callStyle "method"): children = [db, userId] → args = [userId].
 * `add(a, b)`        (bare call):          children = [a, b]        → args = [a, b].
 */
function callArgsOf(node: AstNode): readonly AstNode[] {
  const children = node.children ?? [];
  if (node.callStyle === "method") return children.slice(1); // drop the receiver expression
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

  // Index top-level flow nodes by name once — the per-flow .find scanned all of ast.children (O(flows²)).
  const flowNodeByName = new Map<string, AstNode>();
  for (const c of ast.children ?? []) {
    if (FLOW_KINDS.has(c.kind) && typeof c.value === "string" && !flowNodeByName.has(c.value)) flowNodeByName.set(c.value, c);
  }
  for (const flow of flows) {
    const flowNode = flowNodeByName.get(flow.name);
    if (flowNode === undefined) continue;

    const bindings = new Map<string, TaintState>();

    // Parameters: by default trusted unless DECLARED `tainted` (Phase 28B / RD-0234c H2-b) or named
    // like a taint source. The parser writes qualifiers as a value PREFIX ("tainted data: T",
    // "readonly req: T" — parser.ts parseParams), so the identifier is the LAST word of the head;
    // a bare split(":") would read "tainted data" and silently defeat BOTH carriers. `tainted` is
    // opt-in provenance: a bare param stays trusted (zero over-block on undeclared code).
    for (const p of (flowNode.children ?? []).filter(c => c.kind === "paramDecl")) {
      const head = (((p.value ?? "").split(":")[0]) ?? "").trim();
      const words = head.split(/\s+/);
      const pname = words[words.length - 1] ?? "";
      const declaredTainted = words.slice(0, -1).includes("tainted");
      if (declaredTainted || TAINT_SOURCES.has(pname)) bindings.set(pname, { kind: "tainted" });
    }

    const body = (flowNode.children ?? []).find(c => c.kind === "block"); // perf-allow: loop-array-find — bounded N over a flow node's children (find body block)
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
  // C1 fix: resolve the sink requirement via all three recognizers — (a) exact, (b) case-insensitive,
  // and (c) the sink-SHAPE classifier. `method` is the bare method name (node.value) of a call/member
  // node, used for the shape match. An unknown sink-shaped call (d) resolves with known:false → the
  // tainted-arg branch below still fires (deny-by-default).
  const method = (node.kind === "callExpr" || node.kind === "memberExpr") ? (node.value ?? "") : "";
  const req = sinkRequirementOf(callee, method);
  if (req !== undefined) {
    const requiredContext = req.context;
    const sinkLabel = callee ?? method;
    // Unknown sink-shaped call (pg.query, knex.raw, child_process.exec, bare exec, …): deny-by-default.
    const denyNote = req.known ? "" : " [unknown sink-shaped call — an untaint boundary is required by default]";
    // Check each argument's taint state (excluding a method-call receiver)
    for (const arg of callArgsOf(node)) {
      if (arg.kind === "identifier" && bindings.has(arg.value ?? "")) {
        const state = bindings.get(arg.value ?? "")!;
        if (state.kind === "tainted") {
          diagnostics.push({ ...FUNGI_TAINT_001, flowName,
            message: `Flow '${flowName}': tainted value '${arg.value}' reaches sink '${sinkLabel}'${denyNote} (needs SafeFor<${requiredContext}>). ${FUNGI_TAINT_001.message}` });
        } else if (state.kind === "safeFor" && state.context !== requiredContext) {
          diagnostics.push({ ...FUNGI_TAINT_003, flowName,
            message: `Flow '${flowName}': value '${arg.value}' is SafeFor<${state.context}> but sink '${sinkLabel}' needs SafeFor<${requiredContext}>. ${FUNGI_TAINT_003.message}` });
        }
      } else {
        const t = taintOf(arg, bindings);
        if (t.kind === "tainted") {
          diagnostics.push({ ...FUNGI_TAINT_001, flowName,
            message: `Flow '${flowName}': tainted expression reaches sink '${sinkLabel}'${denyNote}. ${FUNGI_TAINT_001.message}` });
        }
      }
    }
  }
  // Recurse
  for (const child of node.children ?? []) checkSinkCalls(child, bindings, flowName, diagnostics);
}

/** Emit FUNGI-TAINT-004 when a discouraged sanitiser is used. */
function checkDiscouraged(node: AstNode, flowName: string, diagnostics: TaintDiagnostic[]): void {
  const callee = calleeNameOf(node);
  if (callee !== null) {
    const b = BOUNDARY_BY_FN.get(callee);
    if (b !== undefined && !b.preferred) {
      diagnostics.push({ ...FUNGI_TAINT_004, flowName,
        message: `Flow '${flowName}': '${callee}' is discouraged. ${FUNGI_TAINT_004.message}` });
    }
  }
  for (const child of node.children ?? []) checkDiscouraged(child, flowName, diagnostics);
}

/** FUNGI-TAINT-005: Raw tainted value reaches an HTTP header sink (header injection risk). */
export const FUNGI_TAINT_005 = {
  code: "FUNGI-TAINT-005",
  name: "TaintedValueAtHeaderSink",
  severity: "error" as const,
  message: "A tainted value reaches an HTTP header sink. HTTP header injection allows CRLF splitting and policy bypass. Use Http.encodeHeaderValue() to produce SafeFor<HttpHeaderValue>.",
  suggestedFix: "Wrap the value: Http.encodeHeaderValue(taintedValue)",
} as const;

/** FUNGI-TAINT-006: SSRF policy is insufficient (empty or missing blockPrivateIp). */
export const FUNGI_TAINT_006 = {
  code: "FUNGI-TAINT-006",
  name: "SsrfPolicyInsufficient",
  severity: "warning" as const,
  message: "Url.parseAndAllowlist() called without blockPrivateIp: true. An empty or incomplete policy allows SSRF to private IP ranges (RFC 1918, APIPA, loopback). Add blockPrivateIp: true to the policy.",
  suggestedFix: "Url.parseAndAllowlist(url, { blockPrivateIp: true, schemes: [\"https\"] })",
} as const;

/** Taint diagnostic constants for external reference. */
export const TAINT_DIAGNOSTICS = [
  FUNGI_TAINT_001, FUNGI_TAINT_002, FUNGI_TAINT_003, FUNGI_TAINT_004,
  FUNGI_TAINT_005, FUNGI_TAINT_006,
] as const;
