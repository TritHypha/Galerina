// =============================================================================
// Galerina Phase 28 — Taint Tracking & Sink Safety
//
// Implements Tainted<T> / SafeFor<Context, T> per the OWASP-aligned catalogue.
//
// Spec: ../ZTF-Knowledge-Bases/galerina-taint-catalogue.md
//
// Core principle:  "A value is only clean for the sink it was cleaned for."
//
// A value from an untrusted source (network.inbound, request body, env) is
// Tainted. It cannot reach an injection sink (SQL/HTML/Shell/Path) unless it
// passes through a recognised untaint boundary that produces SafeFor<Context,T>.
// A value made SafeFor<HtmlContent> is still tainted for a SQL sink.
// =============================================================================

import { type AstNode, type FlowMeta, type SourceLocation, type TypeReferenceStructure } from "./parser.js";
import { decodeFlowDecl, decodeFlowPosture } from "./flow-name.js";
import { checkEffects, type EffectCheckResult } from "./effect-checker.js";
import { hashSource } from "./runtime/canonicalHash.js";
import {
  createRequirementValidatorAuthorityRegistry,
  MAX_REQUIREMENT_VALIDATOR_AUTHORITY_BYTES,
  MAX_REQUIREMENT_VALIDATOR_AUTHORITY_ROWS,
  REQUIREMENT_TAINT_CLASSES,
  verifyRequirementValidatorAuthority,
  type RequirementTaintClass,
  type RequirementValidatorAuthorityContext,
  type RequirementValidatorAuthorityRefusalReason,
  type RequirementValidatorAuthorityRegistry,
  type RequirementValidatorAuthorityRow,
} from "./requirement-validator-authority.js";
import {
  FUNGI_REQUIREMENT_004,
  FUNGI_REQUIREMENT_010,
} from "./requirement-diagnostics.js";

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
  // Phase 33: SSRF-checked URL (private-IP block verified).
  // BOB §4.6: Url.parseAndAllowlist appeared twice (SsrfCheckedUrl and SafeUrl). The second
  // entry silently overwrote the first in BOUNDARY_BY_FN because Map construction from an
  // iterable uses last-write-wins. Fix: rename the SSRF-specific gate to Url.parseAndCheckSsrf
  // so both contexts are distinct entries. `Url.parseAndAllowlist` remains as SafeUrl (the
  // broader case); SSRF-specific sinks should call `Url.parseAndCheckSsrf`.
  { fn: "Url.parseAndCheckSsrf",       produces: "SsrfCheckedUrl",  preferred: true },
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
  readonly location?: NonNullable<AstNode["location"]>;
}

/** FUNGI-TAINT-001: Raw tainted value reaches an injection sink. */
export const FUNGI_TAINT_001 = {
  code: "FUNGI-TAINT-001",
  name: "TAINTED_VALUE_AT_INJECTION_SINK",
  severity: "error" as const,
  message: "A tainted (untrusted) value reaches an injection sink without passing through an untaint boundary. Apply the appropriate sanitiser/encoder first.",
} as const;

/** FUNGI-TAINT-002: Unvalidated value at a business-logic sink. */
export const FUNGI_TAINT_002 = {
  code: "FUNGI-TAINT-002",
  name: "UNVALIDATED_VALUE_AT_LOGIC_SINK",
  severity: "warning" as const,
  message: "An unvalidated value reaches a business-logic sink. Validate it first (Validated<T>).",
} as const;

/** FUNGI-TAINT-003: Value cleaned for context A used in a sink expecting context B. */
export const FUNGI_TAINT_003 = {
  code: "FUNGI-TAINT-003",
  name: "WRONG_CONTEXT_UNTAINT",
  severity: "error" as const,
  message: "A value cleaned for one sink context is used in a sink expecting a different context. A value is only clean for the sink it was cleaned for.",
} as const;

/** FUNGI-TAINT-004: Discouraged sanitiser used where a preferred boundary exists. */
export const FUNGI_TAINT_004 = {
  code: "FUNGI-TAINT-004",
  name: "DISCOURAGED_SANITISER",
  severity: "warning" as const,
  message: "Discouraged sanitiser used. OWASP prefers parameterized APIs (Sql.parameterize) and no-shell spawning (Process.spawn) over escaping/quoting.",
} as const;

// ---------------------------------------------------------------------------
// Taint analysis
// ---------------------------------------------------------------------------


/** What a binding currently holds, from a taint perspective. */
type TaintState =
  | { kind: "tainted"; atoms: readonly RequirementTaintClass[] }
  | { kind: "safeFor"; context: SinkContext }
  | { kind: "clean" };

export const REQUIREMENT_TAINT_ATOMS = REQUIREMENT_TAINT_CLASSES;
export type RequirementTaintAtom = RequirementTaintClass;
export const MAX_REQUIREMENT_TAINT_ATOMS = REQUIREMENT_TAINT_CLASSES.length;
export const MAX_REQUIREMENT_VALIDATOR_CHECKED_FLOWS = 256;
export const MAX_REQUIREMENT_VALIDATOR_EFFECT_RESULTS = 4_096;
const MAX_REQUIREMENT_VALIDATOR_INPUT_BYTES = 1_048_576;
export const MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_NODES = 4_096;
export const MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_DEPTH = 128;
export const MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_BYTES = 262_144;
export const MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_PARAMS = 256;
export const MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_EFFECTS = 256;
export const MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_ITEM_BYTES = 32_768;

// v2 binds parser-owned type identity. Old receipts must be re-derived and re-admitted.
const REQUIREMENT_CHECKED_FLOW_DIGEST_DOMAIN = "galerina.requirement-validator.checked-flow.v2";

type CanonicalTypeStructure = readonly ["payload" | "invalid"]
  | readonly ["type", string, boolean, readonly CanonicalTypeStructure[]];

type CanonicalCheckedFlowNode = readonly [
  string,
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
  number | undefined,
  CanonicalTypeStructure | undefined,
  readonly CanonicalCheckedFlowNode[],
];

export interface RequirementValidatorCheckedFlowEvidence {
  readonly localFlowName: string;
  readonly checkedDigest: string;
}

export interface RequirementValidatorInput {
  readonly registry: RequirementValidatorAuthorityRegistry;
  readonly context?: RequirementValidatorAuthorityContext;
  readonly checkedFlows: readonly RequirementValidatorCheckedFlowEvidence[];
  readonly effectResults: readonly EffectCheckResult[];
  readonly flows: readonly FlowMeta[];
}

const EMPTY_REQUIREMENT_VALIDATOR_REGISTRY = createRequirementValidatorAuthorityRegistry([]);

export const EMPTY_REQUIREMENT_VALIDATOR_INPUT: RequirementValidatorInput = Object.freeze({
  registry: EMPTY_REQUIREMENT_VALIDATOR_REGISTRY,
  checkedFlows: Object.freeze([]),
  effectResults: Object.freeze([]),
  flows: Object.freeze([]),
});

const DECLARED_UNTRUSTED = Object.freeze(["declared.untrusted"] as const);

function sourceAtom(name: string, declaredTainted = false): RequirementTaintClass | undefined {
  if (declaredTainted) return "declared.untrusted";
  if (name === "env") return "environment.input";
  if (name === "stdin" || name === "argv" || name === "input") return "process.input";
  if (name === "cookies" || name === "session" || name === "sessionStorage"
    || name === "localStorage" || name === "formData" || name === "searchParams"
    || name === "queryString" || name === "querystring") return "web.storage";
  if (TAINT_SOURCES.has(name)) return "web.request";
  return undefined;
}

export function canonicalRequirementTaintTuple(
  atoms: readonly string[],
): readonly RequirementTaintAtom[] | undefined {
  const allowed = new Set<string>(REQUIREMENT_TAINT_CLASSES);
  if (atoms.some((atom) => !allowed.has(atom))) return undefined;
  const canonical = [...new Set(atoms)].sort();
  if (canonical.length > MAX_REQUIREMENT_TAINT_ATOMS) return undefined;
  return Object.freeze(canonical as RequirementTaintAtom[]);
}

function canonicalAtoms(atoms: readonly RequirementTaintClass[]): readonly RequirementTaintClass[] {
  return canonicalRequirementTaintTuple(atoms) ?? Object.freeze([]);
}

const CHECKED_FLOW_TEXT_ENCODER = new TextEncoder();

function boundedCheckedFlowString(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_ITEM_BYTES
    && CHECKED_FLOW_TEXT_ENCODER.encode(value).byteLength
      <= MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_ITEM_BYTES;
}

interface CheckedFlowCanonicalBudget {
  remaining: number;
}

function spendCheckedFlowCanonicalText(
  budget: CheckedFlowCanonicalBudget,
  text: string,
): boolean {
  if (text.length > budget.remaining) return false;
  const bytes = CHECKED_FLOW_TEXT_ENCODER.encode(text).byteLength;
  if (bytes > budget.remaining) return false;
  budget.remaining -= bytes;
  return true;
}

function spendCheckedFlowCanonicalString(
  budget: CheckedFlowCanonicalBudget,
  value: unknown,
): value is string {
  if (!boundedCheckedFlowString(value)) return false;
  return spendCheckedFlowCanonicalText(budget, JSON.stringify(value));
}

function spendCheckedFlowCanonicalOptionalString(
  budget: CheckedFlowCanonicalBudget,
  value: unknown,
): boolean {
  return value === undefined
    ? spendCheckedFlowCanonicalText(budget, "null")
    : spendCheckedFlowCanonicalString(budget, value);
}

/** One indexed, bounded read of caller-owned type evidence; never parse its cooked text. */
function snapshotTypeStructure(
  input: unknown,
  depth: number,
  remainingDepth: number,
  budget: CheckedFlowCanonicalBudget,
  nodeCounter: { value: number },
  maxNodes: number,
): TypeReferenceStructure | undefined {
  if (depth > remainingDepth || ++nodeCounter.value > maxNodes
    || input === null || typeof input !== "object" || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  const kind = record["kind"];
  if (kind === "payload" || kind === "invalid") {
    if (!spendCheckedFlowCanonicalText(budget, `["${kind}"]`)) return undefined;
    return Object.freeze({ kind });
  }
  if (kind !== "type") return undefined;
  const name = record["name"];
  const generic = record["generic"];
  const inputArgs = record["args"];
  if (typeof generic !== "boolean" || !Array.isArray(inputArgs)) return undefined;
  const count = inputArgs.length;
  if (!Number.isSafeInteger(count) || count < 0 || count > maxNodes - nodeCounter.value
    || !spendCheckedFlowCanonicalText(budget, '["type",')
    || !spendCheckedFlowCanonicalString(budget, name)
    || !spendCheckedFlowCanonicalText(budget, generic ? ',true,[' : ',false,[')) return undefined;
  const args: TypeReferenceStructure[] = [];
  for (let index = 0; index < count; index++) {
    if (index > 0 && !spendCheckedFlowCanonicalText(budget, ",")) return undefined;
    const arg = snapshotTypeStructure(inputArgs[index], depth + 1, remainingDepth, budget, nodeCounter, maxNodes);
    if (arg === undefined) return undefined;
    args.push(arg);
  }
  if (!spendCheckedFlowCanonicalText(budget, "]]")) return undefined;
  return Object.freeze({ kind, name, generic, args: Object.freeze(args) });
}

/** Input is the validated frozen copy, not the caller's graph. */
function canonicalTypeStructure(type: TypeReferenceStructure): CanonicalTypeStructure {
  return type.kind === "type"
    ? ["type", type.name, type.generic, type.args.map(canonicalTypeStructure)]
    : [type.kind];
}

function snapshotCheckedFlowCanonicalNode(
  node: AstNode,
  depth: number,
  budget: CheckedFlowCanonicalBudget,
  nodeCounter: { value: number },
): AstNode | undefined {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return undefined;
  const kind = node.kind;
  const value = node.value;
  const callStyle = node.callStyle;
  const typeName = node.typeName;
  const conformsTo = node.conformsTo;
  const flowRef = node.flowRef;
  const claim = node.claim;
  const flags = node.flags;
  const inputTypeStructure = node.typeStructure;
  const inputChildren = node.children;
  if (depth > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_DEPTH
    || ++nodeCounter.value > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_NODES
    || !boundedCheckedFlowString(kind)
    || (callStyle !== undefined && callStyle !== "method")
    || (flags !== undefined && (!Number.isSafeInteger(flags) || flags < 0))
    || (inputChildren !== undefined && !Array.isArray(inputChildren))) return undefined;

  const childCount = inputChildren?.length ?? 0;
  if (!Number.isSafeInteger(childCount) || childCount < 0
    || childCount > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_NODES) return undefined;
  if (!spendCheckedFlowCanonicalText(budget, "[")
    || !spendCheckedFlowCanonicalString(budget, kind)
    || !spendCheckedFlowCanonicalText(budget, ",")
    || !spendCheckedFlowCanonicalOptionalString(budget, value)
    || !spendCheckedFlowCanonicalText(budget, ",")
    || !spendCheckedFlowCanonicalOptionalString(budget, callStyle)
    || !spendCheckedFlowCanonicalText(budget, ",")
    || !spendCheckedFlowCanonicalOptionalString(budget, typeName)
    || !spendCheckedFlowCanonicalText(budget, ",")
    || !spendCheckedFlowCanonicalOptionalString(budget, conformsTo)
    || !spendCheckedFlowCanonicalText(budget, ",")
    || !spendCheckedFlowCanonicalOptionalString(budget, flowRef)
    || !spendCheckedFlowCanonicalText(budget, ",")
    || !spendCheckedFlowCanonicalOptionalString(budget, claim)
    || !spendCheckedFlowCanonicalText(budget, ",")
    || !spendCheckedFlowCanonicalText(budget, flags === undefined
      ? "null"
      : JSON.stringify(flags))
    || !spendCheckedFlowCanonicalText(budget, ",")) return undefined;
  const typeStructure = inputTypeStructure === undefined ? undefined : snapshotTypeStructure(
    inputTypeStructure, 0, Math.min(64, MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_DEPTH - depth),
    budget, nodeCounter, MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_NODES,
  );
  if (inputTypeStructure === undefined
    ? !spendCheckedFlowCanonicalText(budget, "null")
    : typeStructure === undefined) return undefined;
  if (!spendCheckedFlowCanonicalText(budget, ",[")) return undefined;
  const children: AstNode[] = [];
  for (let index = 0; index < childCount; index += 1) {
    if (index > 0 && !spendCheckedFlowCanonicalText(budget, ",")) return undefined;
    const child = snapshotCheckedFlowCanonicalNode(
      inputChildren![index]!,
      depth + 1,
      budget,
      nodeCounter,
    );
    if (child === undefined) return undefined;
    children.push(child);
  }
  if (!spendCheckedFlowCanonicalText(budget, "]]")) return undefined;
  return Object.freeze({
    kind,
    children: Object.freeze(children),
    ...(value === undefined ? {} : { value }),
    ...(callStyle === undefined ? {} : { callStyle }),
    ...(typeName === undefined ? {} : { typeName }),
    ...(conformsTo === undefined ? {} : { conformsTo }),
    ...(flowRef === undefined ? {} : { flowRef }),
    ...(claim === undefined ? {} : { claim }),
    ...(flags === undefined ? {} : { flags }),
    ...(typeStructure === undefined ? {} : { typeStructure }),
  });
}

export interface CheckedFlowSnapshot {
  readonly name: string;
  readonly qualifier: FlowMeta["qualifier"];
  readonly params: readonly string[];
  readonly returnType: string;
  readonly declaredEffects: readonly string[];
  readonly ast: AstNode;
}

interface ValidatedCheckedFlow {
  readonly digest: string;
  readonly snapshot: CheckedFlowSnapshot;
}

export function snapshotCheckedFlow(
  flow: FlowMeta,
  flowNode: AstNode,
): CheckedFlowSnapshot | undefined {
  const name = flow.name;
  const qualifier = flow.qualifier;
  const inputParams = flow.params;
  const returnType = flow.returnType;
  const inputEffects = flow.declaredEffects;
  const decreasesMetric = flow.decreasesMetric;
  if (!boundedCheckedFlowString(name)
    || !["flow", "secure", "pure", "guarded"].includes(qualifier)
    || !Array.isArray(inputParams)
    || !boundedCheckedFlowString(returnType)
    || !Array.isArray(inputEffects)
    // The parser does not preserve decreases in AstNode, so Task 3 cannot prove coherence.
    || decreasesMetric !== undefined) return undefined;

  const paramCount = inputParams.length;
  const effectCount = inputEffects.length;
  if (!Number.isSafeInteger(paramCount) || paramCount < 0
    || paramCount > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_PARAMS
    || !Number.isSafeInteger(effectCount) || effectCount < 0
    || effectCount > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_EFFECTS) return undefined;

  const budget = { remaining: MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_BYTES };
  if (!spendCheckedFlowCanonicalText(budget, "{\"domain\":")
    || !spendCheckedFlowCanonicalString(budget, REQUIREMENT_CHECKED_FLOW_DIGEST_DOMAIN)
    || !spendCheckedFlowCanonicalText(budget, ",\"flow\":[")
    || !spendCheckedFlowCanonicalString(budget, name)
    || !spendCheckedFlowCanonicalText(budget, ",")
    || !spendCheckedFlowCanonicalString(budget, qualifier)
    || !spendCheckedFlowCanonicalText(budget, ",[")) return undefined;

  const params: string[] = [];
  for (let index = 0; index < paramCount; index += 1) {
    const param = inputParams[index];
    if ((index > 0 && !spendCheckedFlowCanonicalText(budget, ","))
      || !spendCheckedFlowCanonicalString(budget, param)) return undefined;
    params.push(param);
  }
  if (!spendCheckedFlowCanonicalText(budget, "],")
    || !spendCheckedFlowCanonicalString(budget, returnType)
    || !spendCheckedFlowCanonicalText(budget, ",[")) return undefined;

  const declaredEffects: string[] = [];
  for (let index = 0; index < effectCount; index += 1) {
    const effect = inputEffects[index];
    if ((index > 0 && !spendCheckedFlowCanonicalText(budget, ","))
      || !spendCheckedFlowCanonicalString(budget, effect)) return undefined;
    declaredEffects.push(effect);
  }
  if (!spendCheckedFlowCanonicalText(budget, "],null],\"ast\":")) return undefined;
  const ast = snapshotCheckedFlowCanonicalNode(flowNode, 1, budget, { value: 0 });
  if (ast === undefined || !spendCheckedFlowCanonicalText(budget, "}")) return undefined;
  return Object.freeze({
    name,
    qualifier,
    params: Object.freeze(params),
    returnType,
    declaredEffects: Object.freeze(declaredEffects),
    ast,
  });
}

interface CheckedFlowAstContract {
  readonly qualifier: FlowMeta["qualifier"];
  readonly params: readonly string[];
  readonly returnType: string;
  readonly declaredEffects: readonly string[];
}

function deriveCheckedFlowAstContract(flowNode: AstNode): CheckedFlowAstContract | undefined {
  const posture = decodeFlowPosture(flowNode);
  if (typeof posture !== "string") return undefined;
  const qualifier: FlowMeta["qualifier"] = posture;

  const children = flowNode.children ?? [];
  const params: string[] = [];
  let returnType: string | undefined;
  let effectsNode: AstNode | undefined;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]!;
    if (child.kind === "paramDecl") {
      if (typeof child.value !== "string") return undefined;
      params.push(child.value);
    } else if (child.kind === "typeRef") {
      if (returnType !== undefined || typeof child.value !== "string") return undefined;
      returnType = child.value;
    } else if (child.kind === "effectsDecl") {
      if (effectsNode !== undefined) return undefined;
      effectsNode = child;
    }
  }
  if (returnType === undefined || params.length > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_PARAMS) {
    return undefined;
  }

  const declaredEffects: string[] = [];
  if (effectsNode !== undefined) {
    for (const child of effectsNode.children ?? []) {
      if (child.kind !== "effectRef" || typeof child.value !== "string") return undefined;
      declaredEffects.push(child.value);
    }
  }
  if (declaredEffects.length === 0) {
    for (const child of children) {
      if (child.kind !== "contractDecl") continue;
      let effectsBlock: AstNode | undefined;
      for (const contractChild of child.children ?? []) {
        if (contractChild.kind === "identifier"
          && (contractChild.value === "effects:block" || contractChild.value === "effects:")) {
          effectsBlock = contractChild;
          break;
        }
      }
      if (effectsBlock === undefined) continue;
      for (const effectChild of effectsBlock.children ?? []) {
        if (effectChild.kind === "identifier" && typeof effectChild.value === "string"
          && effectChild.value.startsWith("effect:")) {
          declaredEffects.push(effectChild.value.slice("effect:".length));
        }
      }
    }
  }
  if (declaredEffects.length > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_EFFECTS) return undefined;
  return { qualifier, params, returnType, declaredEffects };
}

function checkedFlowStringsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function canonicalCheckedFlowNode(node: AstNode): CanonicalCheckedFlowNode {
  const children: CanonicalCheckedFlowNode[] = [];
  for (const child of node.children ?? []) children.push(canonicalCheckedFlowNode(child));
  return [
    node.kind,
    node.value,
    node.callStyle,
    node.typeName,
    node.conformsTo,
    node.flowRef,
    node.claim,
    node.flags,
    node.typeStructure === undefined ? undefined : canonicalTypeStructure(node.typeStructure),
    children,
  ];
}

/**
 * Bind checked-snapshot evidence to one exact validator semantic contract and AST subtree.
 * Source locations and readable presentation are deliberately excluded: moving identical
 * semantics between files cannot mint or invalidate authority. Every compiler-semantic
 * AstNode field and ordered child is included under a domain-separated SHA-256 preimage.
 */
function validateRequirementValidatorCheckedFlow(
  flow: FlowMeta | undefined,
  flowNode: AstNode | undefined,
): ValidatedCheckedFlow | undefined {
  try {
    if (flow === undefined || flow === null || typeof flow !== "object" || Array.isArray(flow)
      || flowNode === undefined || flowNode === null
      || typeof flowNode !== "object" || Array.isArray(flowNode)) return undefined;

    // The original caller-owned graph is read exactly once into this bounded snapshot.
    // All coherence checks and canonicalization below consume only the frozen copy.
    const snapshot = snapshotCheckedFlow(flow, flowNode);
    if (snapshot === undefined) return undefined;
    const decoded = decodeFlowDecl(snapshot.ast);
    if (decoded === undefined || "error" in decoded || decoded.name !== snapshot.name) {
      return undefined;
    }
    const astContract = deriveCheckedFlowAstContract(snapshot.ast);
    if (astContract === undefined
      || astContract.qualifier !== snapshot.qualifier
      || astContract.returnType !== snapshot.returnType
      || !checkedFlowStringsEqual(astContract.params, snapshot.params)
      || !checkedFlowStringsEqual(astContract.declaredEffects, snapshot.declaredEffects)) {
      return undefined;
    }

    const canonical = JSON.stringify({
      domain: REQUIREMENT_CHECKED_FLOW_DIGEST_DOMAIN,
      flow: [
        snapshot.name,
        snapshot.qualifier,
        snapshot.params,
        snapshot.returnType,
        snapshot.declaredEffects,
        null,
      ],
      ast: canonicalCheckedFlowNode(snapshot.ast),
    });
    return Object.freeze({
      digest: hashSource(canonical),
      snapshot,
    });
  } catch {
    return undefined;
  }
}

export function computeRequirementValidatorCheckedFlowDigest(
  flow: FlowMeta | undefined,
  flowNode: AstNode | undefined,
): string | undefined {
  return validateRequirementValidatorCheckedFlow(flow, flowNode)?.digest;
}

const MAX_REQUIREMENT_VALIDATOR_ANALYSIS_FLOWS = 4_096;

function snapshotFlowLocation(
  value: unknown,
  budget?: CheckedFlowCanonicalBudget,
): SourceLocation | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const location = value as SourceLocation;
  // Public parser callers may omit a source filename. The runtime parser then
  // carries an anonymous location even though the structural type requires a
  // string. Preserve that admitted legacy surface as one canonical empty
  // locator instead of discarding the entire AST snapshot.
  const file = typeof location.file === "string" ? location.file : "";
  const line = location.line;
  const column = location.column;
  const offset = location.offset;
  const endLine = location.endLine;
  const endColumn = location.endColumn;
  const endOffset = location.endOffset;
  const length = location.length;
  if (!boundedCheckedFlowString(file)
    || !Number.isSafeInteger(line) || line < 0
    || !Number.isSafeInteger(column) || column < 0
    || [offset, endLine, endColumn, endOffset, length].some((part) =>
      part !== undefined && (!Number.isSafeInteger(part) || part < 0))) return undefined;
  if (budget !== undefined && !spendCheckedFlowCanonicalString(budget, file)) return undefined;
  return Object.freeze({
    file,
    line,
    column,
    ...(offset === undefined ? {} : { offset }),
    ...(endLine === undefined ? {} : { endLine }),
    ...(endColumn === undefined ? {} : { endColumn }),
    ...(endOffset === undefined ? {} : { endOffset }),
    ...(length === undefined ? {} : { length }),
  });
}

function snapshotAnalysisFlow(
  flow: FlowMeta,
  budget?: CheckedFlowCanonicalBudget,
): FlowMeta | undefined {
  if (flow === null || typeof flow !== "object" || Array.isArray(flow)) return undefined;
  const name = flow.name;
  const qualifier = flow.qualifier;
  const inputParams = flow.params;
  const returnType = flow.returnType;
  const inputEffects = flow.declaredEffects;
  const inputLocation = flow.location;
  const decreasesMetric = flow.decreasesMetric;
  if (!boundedCheckedFlowString(name)
    || !["flow", "secure", "pure", "guarded"].includes(qualifier)
    || !Array.isArray(inputParams)
    || !boundedCheckedFlowString(returnType)
    || !Array.isArray(inputEffects)
    || (decreasesMetric !== undefined && !boundedCheckedFlowString(decreasesMetric))) {
    return undefined;
  }
  if (budget !== undefined
    && (!spendCheckedFlowCanonicalString(budget, name)
      || !spendCheckedFlowCanonicalString(budget, qualifier)
      || !spendCheckedFlowCanonicalString(budget, returnType)
      || (decreasesMetric !== undefined
        && !spendCheckedFlowCanonicalString(budget, decreasesMetric)))) return undefined;
  const paramCount = inputParams.length;
  const effectCount = inputEffects.length;
  if (!Number.isSafeInteger(paramCount) || paramCount < 0
    || paramCount > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_PARAMS
    || !Number.isSafeInteger(effectCount) || effectCount < 0
    || effectCount > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_EFFECTS) return undefined;
  const params: string[] = [];
  for (let index = 0; index < paramCount; index += 1) {
    const param = inputParams[index];
    if (!boundedCheckedFlowString(param)
      || (budget !== undefined && !spendCheckedFlowCanonicalString(budget, param))) {
      return undefined;
    }
    params.push(param);
  }
  const declaredEffects: string[] = [];
  for (let index = 0; index < effectCount; index += 1) {
    const effect = inputEffects[index];
    if (!boundedCheckedFlowString(effect)
      || (budget !== undefined && !spendCheckedFlowCanonicalString(budget, effect))) {
      return undefined;
    }
    declaredEffects.push(effect);
  }
  const location = snapshotFlowLocation(inputLocation, budget);
  if (location === undefined) return undefined;
  return Object.freeze({
    name,
    qualifier,
    params: Object.freeze(params),
    returnType,
    declaredEffects: Object.freeze(declaredEffects),
    location,
    ...(decreasesMetric === undefined ? {} : { decreasesMetric }),
  });
}

function snapshotAnalysisFlows(
  flows: readonly FlowMeta[],
  budget?: CheckedFlowCanonicalBudget,
): readonly FlowMeta[] | undefined {
  try {
    if (!Array.isArray(flows)) return undefined;
    const count = flows.length;
    if (!Number.isSafeInteger(count) || count < 0
      || count > MAX_REQUIREMENT_VALIDATOR_ANALYSIS_FLOWS) return undefined;
    const snapshots: FlowMeta[] = [];
    for (let index = 0; index < count; index += 1) {
      const snapshot = snapshotAnalysisFlow(flows[index]!, budget);
      if (snapshot === undefined) return undefined;
      snapshots.push(snapshot);
    }
    return Object.freeze(snapshots);
  } catch {
    return undefined;
  }
}

const REQUIREMENT_VALIDATOR_REFUSAL_REASONS: ReadonlySet<string> = new Set([
  "INVALID_LIMITS",
  "EMPTY_REGISTRY",
  "ROW_LIMIT_EXCEEDED",
  "BYTE_LIMIT_EXCEEDED",
  "MALFORMED_ROW",
  "DUPLICATE_IDENTITY",
  "REGISTRY_REFUSED",
  "TRUST_ANCHOR_INVALID",
  "REGISTRY_DIGEST_MISMATCH",
  "REQUEST_INVALID",
  "EFFECTFUL",
  "NO_MATCH",
  "NOT_YET_VALID",
  "EXPIRED",
]);

function spendRequirementValidatorInputString(
  budget: CheckedFlowCanonicalBudget,
  value: unknown,
): value is string {
  return typeof value === "string"
    && value.length > 0
    && spendCheckedFlowCanonicalString(budget, value);
}

function snapshotRequirementValidatorAuthorityRow(
  value: unknown,
  budget: CheckedFlowCanonicalBudget,
): RequirementValidatorAuthorityRow | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as RequirementValidatorAuthorityRow;
  const authorityVersion = row.authorityVersion;
  const qualifiedFlowIdentity = row.qualifiedFlowIdentity;
  const sourceBuild = row.sourceBuild;
  const inputType = row.inputType;
  const inputTaintClasses = row.taintClasses;
  const outputType = row.outputType;
  const observedEffect = row.observedEffect;
  const checkedProfile = row.checkedProfile;
  const checkedDigest = row.checkedDigest;
  const validFrom = row.validFrom;
  const expiresAt = row.expiresAt;
  if (!Array.isArray(inputTaintClasses)) return undefined;
  const taintCount = inputTaintClasses.length;
  if (!Number.isSafeInteger(taintCount) || taintCount < 0
    || taintCount > REQUIREMENT_TAINT_CLASSES.length
    || !spendRequirementValidatorInputString(budget, authorityVersion)
    || !spendRequirementValidatorInputString(budget, qualifiedFlowIdentity)
    || !spendRequirementValidatorInputString(budget, sourceBuild)
    || !spendRequirementValidatorInputString(budget, inputType)
    || !spendRequirementValidatorInputString(budget, outputType)
    || !spendRequirementValidatorInputString(budget, observedEffect)
    || !spendRequirementValidatorInputString(budget, checkedProfile)
    || !spendRequirementValidatorInputString(budget, checkedDigest)
    || !spendRequirementValidatorInputString(budget, validFrom)
    || !spendRequirementValidatorInputString(budget, expiresAt)) return undefined;
  const taintClasses: RequirementTaintClass[] = [];
  const seenTaintClasses = new Set<string>();
  for (let index = 0; index < taintCount; index += 1) {
    const taintClass = inputTaintClasses[index];
    if (!spendRequirementValidatorInputString(budget, taintClass)
      || seenTaintClasses.has(taintClass)) return undefined;
    seenTaintClasses.add(taintClass);
    taintClasses.push(taintClass as RequirementTaintClass);
  }
  return Object.freeze({
    authorityVersion,
    qualifiedFlowIdentity,
    sourceBuild,
    inputType,
    taintClasses: Object.freeze(taintClasses),
    outputType: outputType as "Verdict",
    observedEffect: observedEffect as "EffectFree",
    checkedProfile,
    checkedDigest,
    validFrom,
    expiresAt,
  });
}

function snapshotRequirementValidatorRegistry(
  value: unknown,
  budget: CheckedFlowCanonicalBudget,
): RequirementValidatorAuthorityRegistry | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const registry = value as RequirementValidatorAuthorityRegistry;
  const state = registry.state;
  if (state === "REFUSED") {
    const reason = registry.reason;
    if (!spendRequirementValidatorInputString(budget, reason)
      || !REQUIREMENT_VALIDATOR_REFUSAL_REASONS.has(reason)) return undefined;
    return Object.freeze({
      state: "REFUSED",
      reason: reason as RequirementValidatorAuthorityRefusalReason,
    });
  }
  if (state !== "STRUCTURALLY_VALID") return undefined;
  const inputRows = registry.rows;
  const suppliedDigest = registry.digest;
  const suppliedCanonicalBytes = registry.canonicalBytes;
  if (!Array.isArray(inputRows)
    || !spendRequirementValidatorInputString(budget, suppliedDigest)
    || !Number.isSafeInteger(suppliedCanonicalBytes)
    || suppliedCanonicalBytes < 0
    || suppliedCanonicalBytes > MAX_REQUIREMENT_VALIDATOR_AUTHORITY_BYTES) return undefined;
  const rowCount = inputRows.length;
  if (!Number.isSafeInteger(rowCount) || rowCount < 1
    || rowCount > MAX_REQUIREMENT_VALIDATOR_AUTHORITY_ROWS) return undefined;
  const rows: RequirementValidatorAuthorityRow[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    const row = snapshotRequirementValidatorAuthorityRow(inputRows[index], budget);
    if (row === undefined) return undefined;
    rows.push(row);
  }
  const reconstructed = createRequirementValidatorAuthorityRegistry(Object.freeze(rows));
  if (reconstructed.state !== "STRUCTURALLY_VALID"
    || reconstructed.digest !== suppliedDigest
    || reconstructed.canonicalBytes !== suppliedCanonicalBytes) return undefined;
  return reconstructed;
}

function snapshotRequirementValidatorContext(
  value: unknown,
  budget: CheckedFlowCanonicalBudget,
): RequirementValidatorAuthorityContext | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const context = value as RequirementValidatorAuthorityContext;
  const expectedRegistryDigest = context.expectedRegistryDigest;
  const canonicalSourceUnitId = context.canonicalSourceUnitId;
  const sourceBuild = context.sourceBuild;
  const checkedProfile = context.checkedProfile;
  const acceptedAuthorityVersion = context.acceptedAuthorityVersion;
  const comparisonTime = context.comparisonTime;
  if (!spendRequirementValidatorInputString(budget, expectedRegistryDigest)
    || !spendRequirementValidatorInputString(budget, canonicalSourceUnitId)
    || !spendRequirementValidatorInputString(budget, sourceBuild)
    || !spendRequirementValidatorInputString(budget, checkedProfile)
    || !spendRequirementValidatorInputString(budget, acceptedAuthorityVersion)
    || !spendRequirementValidatorInputString(budget, comparisonTime)) return undefined;
  return Object.freeze({
    expectedRegistryDigest,
    canonicalSourceUnitId,
    sourceBuild,
    checkedProfile,
    acceptedAuthorityVersion,
    comparisonTime,
  });
}

function snapshotRequirementValidatorCheckedFlows(
  value: unknown,
  budget: CheckedFlowCanonicalBudget,
): readonly RequirementValidatorCheckedFlowEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const count = value.length;
  if (!Number.isSafeInteger(count) || count < 0
    || count > MAX_REQUIREMENT_VALIDATOR_CHECKED_FLOWS) return undefined;
  const checkedFlows: RequirementValidatorCheckedFlowEvidence[] = [];
  const names = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const entry = value[index] as RequirementValidatorCheckedFlowEvidence | undefined;
    if (entry === undefined || entry === null || typeof entry !== "object"
      || Array.isArray(entry)) return undefined;
    const localFlowName = entry.localFlowName;
    const checkedDigest = entry.checkedDigest;
    if (!spendRequirementValidatorInputString(budget, localFlowName)
      || !spendRequirementValidatorInputString(budget, checkedDigest)
      || names.has(localFlowName)) return undefined;
    names.add(localFlowName);
    checkedFlows.push(Object.freeze({ localFlowName, checkedDigest }));
  }
  return Object.freeze(checkedFlows);
}

function snapshotRequirementValidatorEffectResults(
  value: unknown,
  budget: CheckedFlowCanonicalBudget,
): readonly EffectCheckResult[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const count = value.length;
  if (!Number.isSafeInteger(count) || count < 0
    || count > MAX_REQUIREMENT_VALIDATOR_EFFECT_RESULTS) return undefined;
  const results: EffectCheckResult[] = [];
  const names = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const input = value[index] as EffectCheckResult | undefined;
    if (input === undefined || input === null || typeof input !== "object"
      || Array.isArray(input)) return undefined;
    const flowName = input.flowName;
    const qualifier = input.qualifier;
    const inputDeclaredEffects = input.declaredEffects;
    const inputObservedEffects = input.observedEffects;
    const checkerFlags = input.checkerFlags;
    if (!spendRequirementValidatorInputString(budget, flowName)
      || !spendRequirementValidatorInputString(budget, qualifier)
      || !["flow", "secure", "pure", "guarded"].includes(qualifier)
      || !Array.isArray(inputDeclaredEffects)
      || !Array.isArray(inputObservedEffects)
      || !Number.isSafeInteger(checkerFlags) || checkerFlags < 0
      || names.has(flowName)) return undefined;
    const declaredCount = inputDeclaredEffects.length;
    const observedCount = inputObservedEffects.length;
    if (!Number.isSafeInteger(declaredCount) || declaredCount < 0
      || declaredCount > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_EFFECTS
      || !Number.isSafeInteger(observedCount) || observedCount < 0
      || observedCount > MAX_REQUIREMENT_CHECKED_FLOW_DIGEST_EFFECTS) return undefined;
    const declaredEffects: string[] = [];
    const observedEffects: string[] = [];
    const declaredSet = new Set<string>();
    const observedSet = new Set<string>();
    for (let effectIndex = 0; effectIndex < declaredCount; effectIndex += 1) {
      const effect = inputDeclaredEffects[effectIndex];
      if (!spendRequirementValidatorInputString(budget, effect)
        || declaredSet.has(effect)) return undefined;
      declaredSet.add(effect);
      declaredEffects.push(effect);
    }
    for (let effectIndex = 0; effectIndex < observedCount; effectIndex += 1) {
      const effect = inputObservedEffects[effectIndex];
      if (!spendRequirementValidatorInputString(budget, effect)
        || observedSet.has(effect)) return undefined;
      observedSet.add(effect);
      observedEffects.push(effect);
    }
    names.add(flowName);
    results.push(Object.freeze({
      flowName,
      qualifier,
      declaredEffects: Object.freeze(declaredEffects),
      observedEffects: Object.freeze(observedEffects),
      diagnostics: Object.freeze([]),
      checkerFlags,
    }));
  }
  return Object.freeze(results);
}

function snapshotRequirementValidatorInput(
  value: RequirementValidatorInput,
  snapshottedFlows: readonly FlowMeta[] | undefined,
  snapshotFlowsFromInput: boolean,
  budget: CheckedFlowCanonicalBudget,
): RequirementValidatorInput | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const inputRegistry = value.registry;
    const registry = snapshotRequirementValidatorRegistry(inputRegistry, budget);
    const emptyRegistry = registry?.state === "REFUSED"
      && registry.reason === "EMPTY_REGISTRY";
    if (emptyRegistry) {
      const flows = snapshotFlowsFromInput
        ? EMPTY_REQUIREMENT_VALIDATOR_INPUT.flows
        : snapshottedFlows;
      if (flows === undefined) return undefined;
      return Object.freeze({
        registry,
        checkedFlows: EMPTY_REQUIREMENT_VALIDATOR_INPUT.checkedFlows,
        effectResults: EMPTY_REQUIREMENT_VALIDATOR_INPUT.effectResults,
        flows,
      });
    }
    const inputContext = value.context;
    const inputCheckedFlows = value.checkedFlows;
    const inputEffectResults = value.effectResults;
    const inputFlows = snapshotFlowsFromInput ? value.flows : undefined;
    const context = inputContext === undefined
      ? undefined
      : snapshotRequirementValidatorContext(inputContext, budget);
    const checkedFlows = snapshotRequirementValidatorCheckedFlows(inputCheckedFlows, budget);
    const effectResults = snapshotRequirementValidatorEffectResults(inputEffectResults, budget);
    const flows = snapshotFlowsFromInput
      ? snapshotAnalysisFlows(inputFlows!, budget)
      : snapshottedFlows;
    if (registry === undefined
      || (inputContext !== undefined && context === undefined)
      || checkedFlows === undefined || effectResults === undefined || flows === undefined) {
      return undefined;
    }
    return Object.freeze({
      registry,
      ...(context === undefined ? {} : { context }),
      checkedFlows,
      effectResults,
      flows,
    });
  } catch {
    return undefined;
  }
}

const MAX_REQUIREMENT_VALIDATOR_ANALYSIS_AST_NODES = 131_072;
const MAX_REQUIREMENT_VALIDATOR_ANALYSIS_AST_DEPTH = 512;
const MAX_REQUIREMENT_VALIDATOR_ANALYSIS_AST_BYTES = 16_777_216;

interface AnalysisAstSnapshot {
  readonly ast: AstNode;
  readonly originals: ReadonlyMap<AstNode, AstNode>;
}

function snapshotAnalysisAstNode(
  node: AstNode,
  depth: number,
  budget: CheckedFlowCanonicalBudget,
  nodeCounter: { value: number },
  originals: Map<AstNode, AstNode>,
): AstNode | undefined {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return undefined;
  const kind = node.kind;
  const inputLocation = node.location;
  const inputChildren = node.children;
  const value = node.value;
  const readableForm = node.readableForm;
  const callStyle = node.callStyle;
  const typeName = node.typeName;
  const conformsTo = node.conformsTo;
  const flowRef = node.flowRef;
  const claim = node.claim;
  const flags = node.flags;
  const inputTypeStructure = node.typeStructure;
  if (depth > MAX_REQUIREMENT_VALIDATOR_ANALYSIS_AST_DEPTH
    || ++nodeCounter.value > MAX_REQUIREMENT_VALIDATOR_ANALYSIS_AST_NODES
    || !boundedCheckedFlowString(kind)
    || (inputChildren !== undefined && !Array.isArray(inputChildren))
    || (callStyle !== undefined && callStyle !== "method")
    || (flags !== undefined && (!Number.isSafeInteger(flags) || flags < 0))) return undefined;

  const strings = [value, readableForm, typeName, conformsTo, flowRef, claim];
  if (strings.some((field) => field !== undefined && !boundedCheckedFlowString(field))) {
    return undefined;
  }
  if (!spendCheckedFlowCanonicalText(budget, "node")
    || !spendCheckedFlowCanonicalString(budget, kind)) return undefined;
  for (const field of strings) {
    if (!spendCheckedFlowCanonicalOptionalString(budget, field)) return undefined;
  }
  if (!spendCheckedFlowCanonicalOptionalString(budget, callStyle)
    || !spendCheckedFlowCanonicalText(budget, flags === undefined ? "null" : String(flags))) {
    return undefined;
  }
  const typeStructure = inputTypeStructure === undefined ? undefined : snapshotTypeStructure(
    inputTypeStructure, 0, Math.min(64, MAX_REQUIREMENT_VALIDATOR_ANALYSIS_AST_DEPTH - depth),
    budget, nodeCounter, MAX_REQUIREMENT_VALIDATOR_ANALYSIS_AST_NODES,
  );
  if (inputTypeStructure === undefined
    ? !spendCheckedFlowCanonicalText(budget, "null")
    : typeStructure === undefined) return undefined;

  const location = inputLocation === undefined
    ? undefined
    : snapshotFlowLocation(inputLocation);
  if (inputLocation !== undefined && location === undefined) return undefined;
  if (location !== undefined
    && (!spendCheckedFlowCanonicalString(budget, location.file)
      || !spendCheckedFlowCanonicalText(budget, JSON.stringify([
        location.line,
        location.column,
        location.offset ?? null,
        location.endLine ?? null,
        location.endColumn ?? null,
        location.endOffset ?? null,
        location.length ?? null,
      ])))) return undefined;

  const childCount = inputChildren?.length ?? 0;
  if (!Number.isSafeInteger(childCount) || childCount < 0
    || childCount > MAX_REQUIREMENT_VALIDATOR_ANALYSIS_AST_NODES) return undefined;
  const children: AstNode[] = [];
  for (let index = 0; index < childCount; index += 1) {
    const child = snapshotAnalysisAstNode(
      inputChildren![index]!,
      depth + 1,
      budget,
      nodeCounter,
      originals,
    );
    if (child === undefined) return undefined;
    children.push(child);
  }
  const snapshot = Object.freeze({
    kind,
    ...(location === undefined ? {} : { location }),
    children: Object.freeze(children),
    ...(value === undefined ? {} : { value }),
    ...(readableForm === undefined ? {} : { readableForm }),
    ...(typeStructure === undefined ? {} : { typeStructure }),
    ...(callStyle === undefined ? {} : { callStyle }),
    ...(typeName === undefined ? {} : { typeName }),
    ...(conformsTo === undefined ? {} : { conformsTo }),
    ...(flowRef === undefined ? {} : { flowRef }),
    ...(claim === undefined ? {} : { claim }),
    ...(flags === undefined ? {} : { flags }),
  });
  originals.set(snapshot, node);
  return snapshot;
}

function snapshotAnalysisAst(ast: AstNode): AnalysisAstSnapshot | undefined {
  try {
    const originals = new Map<AstNode, AstNode>();
    const snapshot = snapshotAnalysisAstNode(
      ast,
      1,
      { remaining: MAX_REQUIREMENT_VALIDATOR_ANALYSIS_AST_BYTES },
      { value: 0 },
      originals,
    );
    if (snapshot === undefined) return undefined;
    return Object.freeze({ ast: snapshot, originals });
  } catch {
    return undefined;
  }
}

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
function taintOf(
  expr: AstNode,
  bindings: Map<string, TaintState>,
  insideRequirement = false,
): TaintState {
  switch (expr.kind) {
    case "identifier": {
      const name = expr.value ?? "";
      const bound = bindings.get(name);
      if (bound !== undefined) return bound;
      // direct taint source
      const atom = sourceAtom(name);
      if (atom !== undefined) return { kind: "tainted", atoms: Object.freeze([atom]) };
      // literals / unknown → clean
      return { kind: "clean" };
    }
    case "stringLiteral": {
      // A plain string literal is clean, BUT an interpolated string (e.g.
      // `"SELECT * FROM t WHERE id=${req.body.id}"`) propagates taint from
      // any ${...} hole that names a tainted binding.  The lexer keeps the
      // entire interpolated string as a single token whose `.value` contains
      // the raw source text including the `${...}` markers — same convention
      // used by value-state-checker.ts `interpolatedNames()`.
      const raw = expr.value ?? "";
      if (raw.includes("${")) {
        const holes = /\$\{([^}]*)\}/g;
        let m: RegExpExecArray | null;
        while ((m = holes.exec(raw)) !== null) {
          const ids = (m[1] ?? "").match(/[A-Za-z_]\w*/g) ?? [];
          for (const id of ids) {
            const bound = bindings.get(id);
            if (bound?.kind === "tainted") return bound;
            const atom = sourceAtom(id);
            if (atom !== undefined) return { kind: "tainted", atoms: Object.freeze([atom]) };
          }
        }
      }
      return { kind: "clean" };
    }
    case "numberLiteral":
    case "boolLiteral":
      return { kind: "clean" }; // numeric / bool literals are never tainted

    case "memberExpr": {
      // request.body, req.params → tainted
      const receiver = expr.children?.[0];
      if (receiver?.kind === "identifier") {
        const bound = bindings.get(receiver.value ?? "");
        if (bound?.kind === "tainted") return bound;
        if (TAINT_SOURCES.has(receiver.value ?? "")) {
          const atom = sourceAtom(receiver.value ?? "");
          return { kind: "tainted", atoms: Object.freeze([atom ?? "web.request"]) };
        }
      }
      // untaint boundary call as member? handled in callExpr
      return taintPropagate(expr, bindings, insideRequirement);
    }

    case "callExpr": {
      const callee = calleeNameOf(expr);
      if (callee !== null) {
        const boundary = BOUNDARY_BY_FN.get(callee);
        if (boundary !== undefined && !insideRequirement) {
          return { kind: "safeFor", context: boundary.produces };
        }
      }
      return taintPropagate(expr, bindings, insideRequirement);
    }

    case "binaryExpr":
      return taintPropagate(expr, bindings, insideRequirement);

    default:
      return taintPropagate(expr, bindings, insideRequirement);
  }
}

/** If any sub-expression is tainted, the result is tainted (taint propagates through ops). */
function taintPropagate(
  expr: AstNode,
  bindings: Map<string, TaintState>,
  insideRequirement = false,
): TaintState {
  const atoms: RequirementTaintClass[] = [];
  for (const child of expr.children ?? []) {
    const t = taintOf(child, bindings, insideRequirement);
    if (t.kind === "tainted") atoms.push(...t.atoms);
  }
  if (atoms.length > 0) return { kind: "tainted", atoms: canonicalAtoms(atoms) };
  return { kind: "clean" };
}

export interface RequirementTaintAnalysis {
  readonly diagnostics: readonly TaintDiagnostic[];
  readonly matchedValidatorCalls: ReadonlySet<AstNode>;
}

function requirementDiagnostic(
  definition: typeof FUNGI_REQUIREMENT_004 | typeof FUNGI_REQUIREMENT_010,
  flowName: string,
  constraint: AstNode,
): TaintDiagnostic {
  return {
    code: definition.code,
    name: definition.name,
    severity: definition.severity,
    message: definition.message,
    flowName,
    ...(constraint.location === undefined ? {} : { location: constraint.location }),
  };
}

function collectImportBindings(ast: AstNode): ReadonlySet<string> {
  const out = new Set<string>();
  const visit = (node: AstNode): void => {
    if (node.kind.toLowerCase().includes("import")) {
      for (const candidate of [node.value, ...(node.children ?? []).map((child) => child.value)]) {
        for (const name of candidate?.match(/[A-Za-z_]\w*/g) ?? []) out.add(name);
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(ast);
  return out;
}

function paramType(param: string | undefined): string {
  if (param === undefined) return "";
  const colon = param.indexOf(":");
  return colon < 0 ? "" : param.slice(colon + 1).trim();
}

function candidateValidatorCalls(node: AstNode, bindings: Map<string, TaintState>): AstNode[] {
  if (node.kind !== "callExpr" || node.callStyle === "method") return [];
  const args = callArgsOf(node);
  return args.some((arg) => taintOf(arg, bindings, true).kind === "tainted") ? [node] : [];
}

function joinTaintStates(left: TaintState, right: TaintState): TaintState {
  const atoms: RequirementTaintClass[] = [];
  if (left.kind === "tainted") atoms.push(...left.atoms);
  if (right.kind === "tainted") atoms.push(...right.atoms);
  if (atoms.length > 0) return { kind: "tainted", atoms: canonicalAtoms(atoms) };
  if (left.kind === "safeFor" && right.kind === "safeFor" && left.context === right.context) {
    return left;
  }
  return { kind: "clean" };
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

const EMPTY_REQUIREMENT_ANALYSIS_AST: AstNode = Object.freeze({
  kind: "program",
  children: Object.freeze([]),
});
const EMPTY_REQUIREMENT_ANALYSIS_FLOWS: readonly FlowMeta[] = Object.freeze([]);

function analyzeRequirementTaintFromSnapshot(
  snapshottedAst: AnalysisAstSnapshot | undefined,
  snapshottedFlows: readonly FlowMeta[] | undefined,
  validatorInput: RequirementValidatorInput | undefined,
  preserveOriginalCallIdentity: boolean,
): RequirementTaintAnalysis {
  const diagnostics: TaintDiagnostic[] = [];
  const matchedValidatorCalls = new Set<AstNode>();
  const astSnapshotFailed = snapshottedAst === undefined;
  const analysisAst = snapshottedAst?.ast ?? EMPTY_REQUIREMENT_ANALYSIS_AST;
  const imports = collectImportBindings(analysisAst);
  // Authority-relevant AST and metadata are copied once into bounded immutable
  // records. Candidate selection, Task-2 effect closure, digest validation and
  // Task-1 verification all consume this same view; caller-owned inputs are not
  // reread after the snapshot boundary.
  const flowSnapshotFailed = snapshottedFlows === undefined;
  const analysisFlows = snapshottedFlows ?? EMPTY_REQUIREMENT_ANALYSIS_FLOWS;
  if (validatorInput === undefined) {
    diagnostics.push(requirementDiagnostic(
      FUNGI_REQUIREMENT_010,
      "<analysis>",
      Object.freeze({ kind: "program" }),
    ));
    return Object.freeze({
      diagnostics: Object.freeze(diagnostics),
      matchedValidatorCalls,
    });
  }
  const registryAbsentAtBoundary = validatorInput.registry.state === "REFUSED"
    && validatorInput.registry.reason === "EMPTY_REGISTRY";
  if (astSnapshotFailed || (flowSnapshotFailed && !registryAbsentAtBoundary)) {
    diagnostics.push(requirementDiagnostic(
      FUNGI_REQUIREMENT_010,
      "<analysis>",
      Object.freeze({ kind: "program" }),
    ));
    return Object.freeze({
      diagnostics: Object.freeze(diagnostics),
      matchedValidatorCalls,
    });
  }
  const flowNodes = new Map<string, AstNode[]>();
  for (const child of analysisAst.children ?? []) {
    const decoded = decodeFlowDecl(child);
    if (decoded === undefined || "error" in decoded || decoded.name === "") continue;
    const occurrences = flowNodes.get(decoded.name) ?? [];
    occurrences.push(child);
    flowNodes.set(decoded.name, occurrences);
  }

  const checkedByName = new Map<string, RequirementValidatorCheckedFlowEvidence[]>();
  for (const checked of validatorInput.checkedFlows) {
    const occurrences = checkedByName.get(checked.localFlowName) ?? [];
    occurrences.push(checked);
    checkedByName.set(checked.localFlowName, occurrences);
  }
  const effectsByName = new Map<string, EffectCheckResult[]>();
  for (const result of validatorInput.effectResults) {
    const occurrences = effectsByName.get(result.flowName) ?? [];
    occurrences.push(result);
    effectsByName.set(result.flowName, occurrences);
  }
  const actualEffectResults = checkEffects(analysisFlows, analysisAst);
  const actualEffectsByName = new Map<string, EffectCheckResult[]>();
  for (const result of actualEffectResults) {
    const occurrences = actualEffectsByName.get(result.flowName) ?? [];
    occurrences.push(result);
    actualEffectsByName.set(result.flowName, occurrences);
  }

  const inspectConstraint = (
    constraint: AstNode,
    bindings: Map<string, TaintState>,
    shadowed: ReadonlySet<string>,
    flowName: string,
  ): void => {
    const expression = constraint.children?.[0];
    if (expression === undefined) return;
    const state = taintOf(expression, bindings, true);
    if (state.kind !== "tainted") return;

    const candidates = candidateValidatorCalls(expression, bindings);
    if (candidates.length !== 1) {
      diagnostics.push(requirementDiagnostic(FUNGI_REQUIREMENT_004, flowName, constraint));
      return;
    }
    const call = candidates[0]!;
    const localName = call.value ?? "";
    const targetFlows = analysisFlows.filter((flow) => flow.name === localName);
    const targetNodes = flowNodes.get(localName) ?? [];
    const checked = checkedByName.get(localName) ?? [];
    const effects = effectsByName.get(localName) ?? [];
    const actualEffects = actualEffectsByName.get(localName) ?? [];
    const registryAbsent = validatorInput.registry.state === "REFUSED"
      && validatorInput.registry.reason === "EMPTY_REGISTRY";

    if ((flowSnapshotFailed || astSnapshotFailed) && !registryAbsent) {
      diagnostics.push(requirementDiagnostic(FUNGI_REQUIREMENT_010, flowName, constraint));
      return;
    }
    if (registryAbsent || imports.has(localName) || shadowed.has(localName)
      || targetFlows.length !== 1 || targetNodes.length !== 1) {
      diagnostics.push(requirementDiagnostic(FUNGI_REQUIREMENT_004, flowName, constraint));
      return;
    }
    if (validatorInput.context === undefined || checked.length !== 1 || effects.length !== 1
      || actualEffects.length !== 1) {
      diagnostics.push(requirementDiagnostic(FUNGI_REQUIREMENT_010, flowName, constraint));
      return;
    }

    const target = targetFlows[0]!;
    const validatedCheckedFlow = validateRequirementValidatorCheckedFlow(
      target,
      targetNodes[0]!,
    );
    if (validatedCheckedFlow === undefined
      || checked[0]!.checkedDigest !== validatedCheckedFlow.digest) {
      diagnostics.push(requirementDiagnostic(FUNGI_REQUIREMENT_010, flowName, constraint));
      return;
    }
    const suppliedEffect = effects[0]!;
    const actualEffect = actualEffects[0]!;
    if (suppliedEffect.qualifier !== actualEffect.qualifier
      || suppliedEffect.checkerFlags !== actualEffect.checkerFlags
      || !sameOrderedStrings(suppliedEffect.declaredEffects, actualEffect.declaredEffects)
      || !sameOrderedStrings(suppliedEffect.observedEffects, actualEffect.observedEffects)) {
      diagnostics.push(requirementDiagnostic(FUNGI_REQUIREMENT_010, flowName, constraint));
      return;
    }
    const checkedSnapshot = validatedCheckedFlow.snapshot;
    if (validatorInput.registry.state === "STRUCTURALLY_VALID") {
      const qualifiedIdentity = `${validatorInput.context.canonicalSourceUnitId}::${checkedSnapshot.name}`;
      if (!validatorInput.registry.rows.some((row) => row.qualifiedFlowIdentity === qualifiedIdentity)) {
        diagnostics.push(requirementDiagnostic(FUNGI_REQUIREMENT_004, flowName, constraint));
        return;
      }
    }
    const result = verifyRequirementValidatorAuthority(
      validatorInput.registry,
      {
        localFlowName: checkedSnapshot.name,
        inputType: paramType(checkedSnapshot.params[0]),
        taintClasses: state.atoms,
        outputType: checkedSnapshot.returnType,
        observedEffects: actualEffect.observedEffects,
        checkedDigest: validatedCheckedFlow.digest,
      },
      validatorInput.context,
    );
    if (result.state === "MATCHED") {
      matchedValidatorCalls.add(preserveOriginalCallIdentity
        ? (snapshottedAst?.originals.get(call) ?? call)
        : call);
      return;
    }
    diagnostics.push(requirementDiagnostic(FUNGI_REQUIREMENT_010, flowName, constraint));
  };

  const inspectNode = (
    node: AstNode,
    bindings: Map<string, TaintState>,
    shadowed: ReadonlySet<string>,
    flowName: string,
  ): void => {
    if (node.kind === "requirementConstraint") {
      inspectConstraint(node, bindings, shadowed, flowName);
      return;
    }
    for (const child of node.children ?? []) {
      if (child.kind !== "block") inspectNode(child, bindings, shadowed, flowName);
    }
  };

  const walkRequirementBody = (
    block: AstNode,
    bindings: Map<string, TaintState>,
    shadowed: Set<string>,
    flowName: string,
    joinableBindings?: ReadonlySet<string>,
  ): ReadonlySet<string> => {
    const localDeclarations = new Set<string>();
    const changedOuterBindings = new Set<string>();

    const walkChildBlocks = (node: AstNode, joinsParent: boolean): void => {
      for (const child of node.children ?? []) {
        if (child.kind === "block") {
          const childBindings = new Map(bindings);
          const changedByChild = walkRequirementBody(
            child,
            childBindings,
            new Set(shadowed),
            flowName,
            new Set(bindings.keys()),
          );
          if (!joinsParent) continue;
          for (const name of changedByChild) {
            const current = bindings.get(name);
            const branch = childBindings.get(name);
            if (current === undefined || branch === undefined) continue;
            bindings.set(name, joinTaintStates(current, branch));
            if (joinableBindings?.has(name) === true && !localDeclarations.has(name)) {
              changedOuterBindings.add(name);
            }
          }
          continue;
        }
        walkChildBlocks(child, joinsParent && child.kind !== "fnDecl");
      }
    };

    for (const stmt of block.children ?? []) {
      inspectNode(stmt, bindings, shadowed, flowName);
      if (stmt.kind === "letDecl" || stmt.kind === "mutDecl" || stmt.kind === "assignStmt") {
        const raw = stmt.value ?? "";
        const name = ((raw.split(":")[0] ?? raw).trim().split(/\s+/).at(-1)) ?? "";
        const init = stmt.children?.[0];
        if (name !== "") {
          if (stmt.kind !== "assignStmt") localDeclarations.add(name);
          shadowed.add(name);
          bindings.set(name, init === undefined ? { kind: "clean" } : taintOf(init, bindings));
          if (stmt.kind === "assignStmt" && joinableBindings?.has(name) === true
            && !localDeclarations.has(name)) {
            changedOuterBindings.add(name);
          }
        }
      }
      if (stmt.kind === "fnDecl" && stmt.value !== undefined) {
        localDeclarations.add(stmt.value);
        shadowed.add(stmt.value);
      }
      walkChildBlocks(stmt, stmt.kind !== "fnDecl");
    }
    return changedOuterBindings;
  };

  const walkFlowNode = (node: AstNode, flowName: string): void => {
    const bindings = new Map<string, TaintState>();
    const shadowed = new Set<string>();
    for (const param of (node.children ?? []).filter((child) => child.kind === "paramDecl")) {
      const head = ((param.value ?? "").split(":")[0] ?? "").trim();
      const words = head.split(/\s+/);
      const name = words.at(-1) ?? "";
      const atom = sourceAtom(name, words.slice(0, -1).includes("tainted"));
      if (name !== "") shadowed.add(name);
      bindings.set(name, atom === undefined
        ? { kind: "clean" }
        : { kind: "tainted", atoms: Object.freeze([atom]) });
    }
    const body = (node.children ?? []).find((child) => child.kind === "block");
    if (body !== undefined) walkRequirementBody(body, bindings, shadowed, flowName);
  };

  if (analysisFlows.length === 0) {
    // Public default callers may hold a parsed AST without retaining ParseResult.flows.
    // Walk those parser-proven flow nodes for raw 004 diagnostics only. Authority still
    // resolves exclusively through the caller-supplied FlowMeta/evidence arrays above.
    for (const [flowName, nodes] of flowNodes) {
      for (const node of nodes) walkFlowNode(node, flowName);
    }
  } else {
    for (const flow of analysisFlows) {
      const nodes = flowNodes.get(flow.name) ?? [];
      const exactNodes = nodes.filter((candidate) =>
        candidate.location?.file === flow.location?.file
        && candidate.location?.offset === flow.location?.offset);
      const node = exactNodes.length === 1
        ? exactNodes[0]
        : (nodes.length === 1 ? nodes[0] : undefined);
      if (node !== undefined) walkFlowNode(node, flow.name);
    }
  }

  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    matchedValidatorCalls,
  });
}

interface RequirementTaintSnapshotResult {
  readonly ast: AstNode;
  readonly flows: readonly FlowMeta[];
  readonly analysis: RequirementTaintAnalysis;
}

function analyzeRequirementTaintWithSnapshot(
  ast: AstNode,
  flows: readonly FlowMeta[],
  validatorInput: RequirementValidatorInput,
  preserveOriginalCallIdentity: boolean,
  useValidatorInputFlows = false,
): RequirementTaintSnapshotResult {
  const astSnapshot = snapshotAnalysisAst(ast);
  const validatorInputBudget: CheckedFlowCanonicalBudget = {
    remaining: MAX_REQUIREMENT_VALIDATOR_INPUT_BYTES,
  };
  const explicitFlowSnapshot = useValidatorInputFlows
    ? undefined
    : snapshotAnalysisFlows(flows, validatorInputBudget);
  const validatorInputSnapshot = snapshotRequirementValidatorInput(
    validatorInput,
    explicitFlowSnapshot,
    useValidatorInputFlows,
    validatorInputBudget,
  );
  const flowSnapshot = validatorInputSnapshot?.flows;
  const analysis = analyzeRequirementTaintFromSnapshot(
    astSnapshot,
    flowSnapshot,
    validatorInputSnapshot,
    preserveOriginalCallIdentity,
  );
  return Object.freeze({
    ast: astSnapshot?.ast ?? EMPTY_REQUIREMENT_ANALYSIS_AST,
    flows: flowSnapshot ?? EMPTY_REQUIREMENT_ANALYSIS_FLOWS,
    analysis,
  });
}

export function analyzeRequirementTaint(
  ast: AstNode,
  flows: readonly FlowMeta[],
  validatorInput: RequirementValidatorInput = EMPTY_REQUIREMENT_VALIDATOR_INPUT,
): RequirementTaintAnalysis {
  return analyzeRequirementTaintWithSnapshot(
    ast,
    flows,
    validatorInput,
    true,
  ).analysis;
}

/** @internal One immutable AST view shared by requirement and value-state analysis. */
export function analyzeRequirementTaintForValueState(
  ast: AstNode,
  flows: readonly FlowMeta[],
  validatorInput: RequirementValidatorInput = EMPTY_REQUIREMENT_VALIDATOR_INPUT,
): { readonly ast: AstNode; readonly analysis: RequirementTaintAnalysis } {
  const snapshot = analyzeRequirementTaintWithSnapshot(
    ast,
    flows,
    validatorInput,
    false,
    true,
  );
  return Object.freeze({
    ast: snapshot.ast,
    analysis: snapshot.analysis,
  });
}

export function requirementAuthorityDiagnosticKey(
  diagnostic: Pick<TaintDiagnostic, "code" | "flowName" | "location">,
): string | undefined {
  if (diagnostic.code !== FUNGI_REQUIREMENT_004.code
    && diagnostic.code !== FUNGI_REQUIREMENT_010.code) return undefined;
  return `${diagnostic.code}|${diagnostic.flowName ?? ""}|${diagnostic.location?.file ?? ""}|${diagnostic.location?.offset ?? -1}`;
}

/**
 * Phase 28: Check a program for taint violations.
 * Tracks tainted values flowing from sources into injection sinks.
 */
export function checkTaint(
  ast: AstNode,
  flows: readonly FlowMeta[],
  validatorInput: RequirementValidatorInput = EMPTY_REQUIREMENT_VALIDATOR_INPUT,
): TaintDiagnostic[] {
  const {
    ast: analysisAst,
    flows: analysisFlows,
    analysis: requirementAnalysis,
  } = analyzeRequirementTaintWithSnapshot(ast, flows, validatorInput, false);
  const diagnostics: TaintDiagnostic[] = [
    ...requirementAnalysis.diagnostics,
  ];

  // Index top-level flow nodes by name once — the per-flow .find scanned all of ast.children (O(flows²)).
  //
  // Keyed by the DECODED name, over all FIVE tiers. A local four-kind set here
  // omitted `governedFlowDecl`, and the key was `c.value` — which for a governed
  // flow is the encoded `governed:<floor>:<name>`. Either fault alone makes the
  // lookup below miss and `continue`, so a governed flow was skipped entirely: a
  // tainted value reaching an injection sink signed CLEAN at the highest
  // governance tier. Both close through the one decoder (flow-name.ts).
  const flowNodeByName = new Map<string, AstNode>();
  for (const c of analysisAst.children ?? []) {
    const decoded = decodeFlowDecl(c);
    if (decoded === undefined || "error" in decoded || decoded.name === "") continue;
    if (!flowNodeByName.has(decoded.name)) flowNodeByName.set(decoded.name, c);
  }
  for (const flow of analysisFlows) {
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
      const atom = sourceAtom(pname, declaredTainted);
      if (atom !== undefined) bindings.set(pname, {
        kind: "tainted",
        atoms: declaredTainted ? DECLARED_UNTRUSTED : Object.freeze([atom]),
      });
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
  name: "TAINTED_VALUE_AT_HEADER_SINK",
  severity: "error" as const,
  message: "A tainted value reaches an HTTP header sink. HTTP header injection allows CRLF splitting and policy bypass. Use Http.encodeHeaderValue() to produce SafeFor<HttpHeaderValue>.",
  suggestedFix: "Wrap the value: Http.encodeHeaderValue(taintedValue)",
} as const;

/** FUNGI-TAINT-006: SSRF policy is insufficient (empty or missing blockPrivateIp). */
export const FUNGI_TAINT_006 = {
  code: "FUNGI-TAINT-006",
  name: "SSRF_POLICY_INSUFFICIENT",
  severity: "warning" as const,
  message: "Url.parseAndAllowlist() called without blockPrivateIp: true. An empty or incomplete policy allows SSRF to private IP ranges (RFC 1918, APIPA, loopback). Add blockPrivateIp: true to the policy.",
  suggestedFix: "Url.parseAndAllowlist(url, { blockPrivateIp: true, schemes: [\"https\"] })",
} as const;

/** Taint diagnostic constants for external reference. */
export const TAINT_DIAGNOSTICS = [
  FUNGI_TAINT_001, FUNGI_TAINT_002, FUNGI_TAINT_003, FUNGI_TAINT_004,
  FUNGI_TAINT_005, FUNGI_TAINT_006,
] as const;
