// =============================================================================
// Galerina Phase 6 — Value-State Checker
//
// Enforces value-state annotation rules on the parsed AST.
// Runs after the parser, before the effect checker.
//
// Spec: ../ZTF-Knowledge-Bases/value-state-checker.md
//
// Implemented rules:
//   Rule 1/3 — unsafe bindings cannot reach governed sinks
//              (FUNGI-VALUESTATE-003: UnsafeValueReachedGovernedSink)
//   Rule 2   — safe mut requires a recognised gate function
//              (FUNGI-VALUESTATE-001: UnsafeToSafeTransitionDenied)
//   Rule 2B  — safe mut inside if/else where one branch has a gate and
//              the other doesn't
//              (FUNGI-VALUESTATE-002: UnsafeConditionalUpgrade)
//   Rule 4   — SecureString cannot use == or be passed to log functions
//              (FUNGI-SECRET-001: SecretValueLogged)
//              (FUNGI-SECRET-002: SecretComparisonDenied)
//              (FUNGI-SECRET-003: SecretSerializationDenied)
//              Extended: SecureString in AuditLog.write or record literal at sink
//   Rule 5   — protected value passed to AuditLog.write without redact()
//              (FUNGI-VALUESTATE-006: ProtectedValueAtAuditLog)
//              (distinct from FUNGI-VALUESTATE-003 for unsafe-at-sink)
//   Phase 8B — String taint propagation
//              (FUNGI-VALUESTATE-004: TaintedValuePropagation)
//   Phase 11B.1 — Two-hop taint propagation
//              (FUNGI-VALUESTATE-005: DerivedUnsafeValueAtSink)
//   Phase 11B.2 — User-defined gate functions
//              Functions whose names start with recognised gate prefixes
//              (validate*, sanitize*, check*, verify*, parse*, decode*)
//              automatically break the taint chain, just like stdlib gates.
//   Cross-conditional taint — unsafe bindings used as if-condition values
//              do NOT clear taint; taint propagates into both branches.
// =============================================================================

import { type AstNode, type SourceLocation } from "./parser.js";
import { decodeFlowDecl } from "./flow-name.js"; // Q2: governed-aware shadow-floor scan
import { buildModuleAliasMap } from "./effect-checker.js"; // C1: resolve `let x = Module` aliases at sinks
import { numericBaseType, BACKEND_UNLOWERABLE_SCALAR } from "./numeric-lowering.js";
import {
  analyzeRequirementTaintForValueState,
  EMPTY_REQUIREMENT_VALIDATOR_INPUT,
  type RequirementValidatorInput,
} from "./taint-checker.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A secondary source location that gives context for a diagnostic.
 * Used for Rust-style "declared here... used here" error messages.
 */
export interface DiagnosticRelatedLocation {
  readonly message: string;
  readonly location: SourceLocation;
}

export interface ValueStateDiagnostic {
  readonly code: string;
  readonly name: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly location?: SourceLocation;
  readonly suggestedFix?: string;
  /** Machine-applicable fix — the exact Galerina snippet to insert/replace, without prose. */
  readonly suggestedCode?: string;
  /** Rust-style: secondary locations (e.g. where unsafe value was declared). */
  readonly relatedLocations?: readonly DiagnosticRelatedLocation[];
  /** Elm-style: why this is a problem. */
  readonly why?: string;
  /** Elm-style: what goes wrong if ignored. */
  readonly risk?: string;
}

export interface ValueStateCheckResult {
  readonly diagnostics: readonly ValueStateDiagnostic[];
}

// ---------------------------------------------------------------------------
// Diagnostic factory
//
// Branches explicitly on location to satisfy exactOptionalPropertyTypes.
// ---------------------------------------------------------------------------

function makeVSDiag(
  code: string,
  name: string,
  message: string,
  location: SourceLocation | undefined,
  suggestedFix: string,
  suggestedCode?: string,
  opts?: {
    relatedLocations?: readonly DiagnosticRelatedLocation[];
    why?: string;
    risk?: string;
  },
): ValueStateDiagnostic {
  const sc   = suggestedCode !== undefined ? { suggestedCode } : {};
  const rel  = opts?.relatedLocations !== undefined ? { relatedLocations: opts.relatedLocations } : {};
  const why  = opts?.why  !== undefined ? { why:  opts.why  } : {};
  const risk = opts?.risk !== undefined ? { risk: opts.risk } : {};
  const extras = { ...sc, ...rel, ...why, ...risk };
  if (location !== undefined) {
    return { code, name, severity: "error", message, location, suggestedFix, ...extras };
  }
  return { code, name, severity: "error", message, suggestedFix, ...extras };
}

// ---------------------------------------------------------------------------
// NET-NEW 0111 — affine consume-once + monotone Raw→Verified→Authorized→Sealed passport typestate.
// Lifts the rd-0087 proven abstract invariant into the SHIPPED source checker. Pure compile-time
// type-system analysis (Binary/digital — touches no crypto byte; governs WHO may use a sealed value,
// it never performs the seal). FUNGI-AFFINE-001 (consume-once / CWE-664) + FUNGI-PASSPORT-002 (stage-skip /
// CWE-696). Deny-by-default: an unknown/un-gated Passport is Raw=0 (the most restricted stage).
// ---------------------------------------------------------------------------
export const PassportStage = { Raw: 0, Verified: 1, Authorized: 2, Sealed: 3 } as const;
type PassportStageV = 0 | 1 | 2 | 3;
// A gate-call prefix → the stage it PRODUCES on a Passport-typed value.
const PASSPORT_GATE_STAGE: ReadonlyArray<readonly [RegExp, PassportStageV]> = [
  [/^verify(\.|$)/i, 1], [/^authorize(\.|$)/i, 2], [/^seal(\.|$)/i, 3],
];
// An authority sink → the MINIMUM passport stage it REQUIRES (ordered ladder; extends SINK_REQUIREMENTS).
function requiredPassportStage(fullCallName: string): PassportStageV | undefined {
  if (/^response\.body$/.test(fullCallName)) return 2;   // Authorized
  if (/^database\.write$/.test(fullCallName)) return 2;  // Authorized
  if (/^AuditLog\.write$/.test(fullCallName)) return 3;  // Sealed
  return undefined;
}

// ---------------------------------------------------------------------------
// ValueStateFlags — internal bitset for fast value-state checks
//
// Downstream passes (SemanticGraph, ExecutionPlanner, Backend) can use bit
// operations instead of string comparisons:
//   if (flags & ValueStateFlags.Unsafe && !(flags & ValueStateFlags.Safe)) → error
//
// These flags describe how trusted the data is (value-state).
// Protected/Redacted/Secret describe sensitivity (privacy qualifier).
// Both can apply to the same binding.
//
// Usage: assign flags during binding analysis; check at sink sites.
// Phase 19: BindingInfo gains a `flags` field replacing string safetyPrefix.
// ---------------------------------------------------------------------------

export const ValueStateFlags = {
  None:      0,
  Unsafe:    1 << 0,  // from request.body / params — untrusted boundary input
  Safe:      1 << 1,  // after a recognised gate function
  Validated: 1 << 2,  // explicitly validated — subset of Safe
  Tainted:   1 << 3,  // derived from Unsafe via non-gate expression
  Protected: 1 << 4,  // protected qualifier — may be used internally, not raw
  Redacted:  1 << 5,  // redacted qualifier — may be logged/audited, not reversed
  Secret:    1 << 6,  // SecureString — approved operations only
  ReadOnly:  1 << 7,  // readonly binding — APU shared-memory candidate
} as const;
export type ValueStateFlagsMask = number;

// ---------------------------------------------------------------------------
// SinkRequirement — structured requirement per governed sink
//
// Each governed sink declares what value-state its arguments must have.
// This is the authoritative machine-readable sink registry. Diagnostics,
// AI tooling, and the SemanticGraph all consume this directly.
//
// Canonical source: ../ZTF-Knowledge-Bases/stdlib-gates.yaml §sinks
// When adding a sink, update stdlib-gates.yaml first, then mirror here.
// ---------------------------------------------------------------------------

export interface SinkRequirement {
  /** Minimum required state: any value that does NOT satisfy this is a violation. */
  readonly requiredState: "safe" | "validated" | "redacted" | "nonPII";
  /** Human-readable policy note for diagnostics and AI tools. */
  readonly policyNote: string;
  /** Matching strategy: exact full name, or pattern (checked separately). */
  readonly match: "exact" | "pattern";
}

/**
 * Named sink requirements — exact-match entries only.
 * Pattern-matched sinks (wildcards like *DB.write) are handled by isGovernedSink().
 * Use getSinkRequirement() to query both.
 */
export const SINK_REQUIREMENTS: ReadonlyMap<string, SinkRequirement> = new Map<string, SinkRequirement>([
  ["AuditLog.write",     { requiredState: "redacted",  policyNote: "Audit logs must not contain raw PII. Use redact() before logging.", match: "exact" }],
  ["database.write",     { requiredState: "validated", policyNote: "All database writes require validated data.", match: "exact" }],
  ["network.outbound",   { requiredState: "validated", policyNote: "Network output must be validated before transmission.", match: "exact" }],
  ["response.body",      { requiredState: "safe",      policyNote: "API response bodies must use safe, validated values.", match: "exact" }],
  ["log.write",          { requiredState: "redacted",  policyNote: "Log writes must not include secrets or raw PII.", match: "exact" }],
  ["ai.remoteInference", { requiredState: "validated", policyNote: "AI calls must use validated, governed inputs.", match: "exact" }],
  ["shell.exec",         { requiredState: "validated", policyNote: "Shell commands must use validated arguments to prevent injection.", match: "exact" }],
  ["FileSystem.write",   { requiredState: "safe",      policyNote: "Filesystem writes require safe values.", match: "exact" }],
]);

// VD-1 (RD-0234) case-drift fail-open: the exact-match keys above are a mix of effect-style
// (shell.exec, database.write) and module-style (AuditLog.write) casings, so `Shell.exec(x)`
// slipped past `shell.exec` and a tainted arg reached the sink unguarded while `shell.exec(x)`
// fired. A case-insensitive fallback (below, in getSinkRequirement) matches BOTH forms.
const SINK_REQUIREMENTS_LC: ReadonlyMap<string, SinkRequirement> = new Map(
  [...SINK_REQUIREMENTS].map(([k, v]) => [k.toLowerCase(), v]),
);

/**
 * Returns the SinkRequirement for a given call name, or undefined if not a
 * governed sink. Checks exact-match registry first, then falls back to pattern
 * matching for wildcard sinks (e.g. *DB.insert).
 */
export function getSinkRequirement(fullCallName: string): SinkRequirement | undefined {
  const exact = SINK_REQUIREMENTS.get(fullCallName);
  if (exact !== undefined) return exact;

  // VD-1 (RD-0234): case-drift fail-open — match the exact-list case-insensitively so a
  // capitalised receiver (`Shell.exec`, `Database.write`, `Network.outbound`) is governed
  // identically to its effect-style spelling. This is a strict superset (only ADDS matches).
  const ci = SINK_REQUIREMENTS_LC.get(fullCallName.toLowerCase());
  if (ci !== undefined) return ci;

  // Pattern-matched sinks — require validated state.
  // audit-sink-canonicality gap (RD-0234b tooling): the `\w*DB\.` receiver required a name ENDING
  // in "DB", so the plain `database.insert/update/delete` module verbs slipped through governed only
  // for the exact `database.write` key. Broadened to the `database` spelling too (still a superset).
  if (/(?:\w*DB|[Dd]atabase)\.(insert|update\w*|delete|write|query|find|select\w*)$/.test(fullCallName)) {
    return { requiredState: "validated", policyNote: "Database operations require validated data.", match: "pattern" };
  }
  if (/^https?\.(post|put|patch|delete)$/.test(fullCallName)) {
    return { requiredState: "validated", policyNote: "HTTP write methods require validated data.", match: "pattern" };
  }
  if (/^EmailService\.(send\w*|deliver)$/.test(fullCallName)) {
    return { requiredState: "validated", policyNote: "Email sends require validated data.", match: "pattern" };
  }
  if (/\w+Payment\.(charge|process|submit)$/.test(fullCallName)) {
    return { requiredState: "validated", policyNote: "Payment operations require validated data.", match: "pattern" };
  }
  if (/\w*Model\.(run|infer|predict|generate|complete|classify|classifyWithKey|embed|score)$/i.test(fullCallName)) {
    return { requiredState: "validated", policyNote: "AI model calls require validated, governed inputs.", match: "pattern" };
  }
  if (/^fs\.write\w*$/.test(fullCallName)) {
    return { requiredState: "safe", policyNote: "Filesystem writes require safe values.", match: "pattern" };
  }
  // audit-sink-canonicality gap (RD-0234b tooling): `File.write*` module write methods were ungoverned
  // (only `FileSystem.write` / `fs.write*` were). A filesystem write of unsafe data is a sink.
  if (/^File\.write\w*$/.test(fullCallName)) {
    return { requiredState: "safe", policyNote: "Filesystem writes require safe values.", match: "pattern" };
  }
  // audit-sink-canonicality gap: the `audit.write` short-form (vs the `AuditLog.write` exact key).
  if (/^audit\.(write|log)$/.test(fullCallName)) {
    return { requiredState: "redacted", policyNote: "Audit writes must not contain raw PII. Use redact() before logging.", match: "pattern" };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Governed sinks
//
// Calls whose arguments must not be unsafe bindings.
// Matched on the reconstructed full call name (receiver.method or method).
//
// Canonical registry (source of truth):
//   ../ZTF-Knowledge-Bases/stdlib-gates.yaml  §sinks
//
// When adding a new sink, update stdlib-gates.yaml first, then mirror here.
// ---------------------------------------------------------------------------

function isGovernedSink(node: AstNode, aliasMap?: ReadonlyMap<string, string>): boolean {
  const methodName = node.value ?? "";
  const receiver = node.children?.[0];
  const receiverName =
    receiver?.kind === "identifier" ? (aliasMap?.get(receiver.value ?? "") ?? receiver.value ?? "")
    : receiver?.kind === "memberExpr" ? getNodeName(receiver, aliasMap)
    : "";
  const fullName =
    receiverName !== "" ? `${receiverName}.${methodName}` : methodName;

  // Database patterns: *DB.insert / update / delete / write / query / find / select
  if (/\w*DB\.(insert|update\w*|delete|write|query|find|select\w*)$/.test(fullName)) return true;
  // Audit log
  if (fullName === "AuditLog.write") return true;
  // Shell and filesystem
  if (/^(shell\.exec|FileSystem\.write|fs\.write\w*)$/.test(fullName)) return true;
  // HTTP write methods — unsafe data must not cross network boundary unvalidated
  if (/^https?\.(post|put|patch|delete)$/.test(fullName)) return true;
  // Email / payment sinks
  if (/^EmailService\.(send\w*|deliver)$/.test(fullName)) return true;
  if (/\w+Payment\.(charge|process|submit)$/.test(fullName)) return true;

  // Single source of truth (audit VSC-001): any sink in the SINK_REQUIREMENTS registry —
  // exact OR pattern — is governed. This keeps isGovernedSink a strict SUPERSET so the two
  // registries can't silently diverge. Previously response.body / ai.remoteInference /
  // network.outbound / log.write / bare database.write / http(s).get were enforced by NEITHER
  // path, so unsafe/tainted values escaped the trust boundary with no diagnostic.
  if (getSinkRequirement(fullName) !== undefined) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Log / print functions
//
// Calls whose arguments must not include SecureString bindings.
//
// Canonical registry (source of truth):
//   ../ZTF-Knowledge-Bases/stdlib-gates.yaml  §sinks  (log_receiver, print_output)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Serialization functions
//
// Calls whose arguments must not include SecureString bindings.
// Serializing a secret value would expose it in the output stream.
// ---------------------------------------------------------------------------

/** Last dotted-path segment of a call's receiver (handles `identifier` AND `memberExpr`),
 *  lowercased — so both `http.post` and `client.http.post` resolve the receiver to "http".
 *  VSC-003: a memberExpr receiver must NOT bypass the sink/source recognizers (it did before,
 *  because they all bailed on `receiver.kind !== "identifier"` — a silent fail-open). */
function receiverSegment(node: AstNode): string {
  const receiver = node.children?.[0];
  if (receiver === undefined) return "";
  const name = receiver.kind === "identifier" ? (receiver.value ?? "") : getNodeName(receiver);
  const seg = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
  return seg.toLowerCase();
}

function isSerializationCall(node: AstNode): boolean {
  const methodName = node.value ?? "";
  if (methodName === "serialize" || methodName === "stringify") return true;
  // VSC-003: handle memberExpr receivers (e.g. app.json.encode), not just bare identifiers.
  const seg = receiverSegment(node);
  const fullName = seg !== "" ? `${seg}.${methodName}` : methodName;
  return /^(json\.encode|json\.stringify|toml\.encode|xml\.encode|serialize)$/.test(fullName);
}

/** Authority handles may move between runtime operations but never become persisted data. */
function isAuthorityPersistenceCall(
  node: AstNode,
  aliasMap?: ReadonlyMap<string, string>,
): boolean {
  if (isSerializationCall(node)) return true;
  const fullName = buildFullCallName(node, aliasMap).toLowerCase();
  return (
    /^(?:database|\w*db)\.(?:insert|update\w*|delete|write|upsert|add|index)$/.test(fullName) ||
    /^(?:vault|cache|atlas|graph)\.(?:write|store|put|set|insert|upsert|add|index)$/.test(fullName) ||
    /^(?:auditlog|audit|log)\.(?:write|log|append)$/.test(fullName) ||
    /^(?:filesystem|file|fs)\.write\w*$/.test(fullName)
  );
}

function isLogCall(node: AstNode): boolean {
  const methodName = node.value ?? "";
  // Standalone: print(...)
  if (methodName === "print") return true;
  // Method: log.* / Logger.* / console.* — incl. memberExpr receivers (obj.log.info) (VSC-003).
  const seg = receiverSegment(node);
  return seg === "log" || seg === "logger" || seg === "console";
}

// H3 (RD-0234c) SAFELIST INVERSION — deny-by-default. The previous receiver DENYLIST (Slack/S3/Kafka/…)
// admitted any UNKNOWN receiver: a raw SecureString handed to an unlisted egress service signed clean
// (CWE-183 fail-open). The sound fix is a SAFELIST — a raw secret/protected value handed to an egress-shaped
// method is a potential exfiltration path on ANY receiver EXCEPT the known ON-HOST secret-handling primitives
// below (crypto/custody/redaction, where a raw secret legitimately lives without leaving the host). An unknown
// receiver is now treated as egress (fail-closed). This only affects values that are STILL raw-secret/protected
// at the call site — a redacted/sealed value is not a raw secret, so it is unaffected.
const EGRESS_SAFE_RECEIVERS = new Set([
  "crypto", "cipher", "hash", "hmac", "signer", "verifier", "kdf", "mac", "digest",
  "vault", "keystore", "keyring", "hsm", "kms", "secretmanager", "secretstore",
  "sealer", "secretbox", "redactor", "redact", "auditlog",
]);
// Egress-shaped method verbs (transmit/persist off-host). A read-only getter (get/list/describe/read) is NOT.
const EGRESS_METHOD_VERB = /^(send|post|put|publish|push|notify|dispatch|deliver|upload|charge|emit|track|capture|submit|forward|index|write|append|enqueue|produce|ingest|report|export|sync|store)/i;

// Network / egress sinks — a raw secret transmitted off-host is an exfiltration path.
// Recognised: http.* / https.* / net.* / socket.* / ws.* / websocket.* method calls,
// standalone fetch(...), email/EmailService.send, and (H3) the named external egress services above.
function isNetworkSink(node: AstNode): boolean {
  const methodName = node.value ?? "";
  if (methodName === "fetch") return true;
  // VSC-003: resolve the receiver via its last path segment so a memberExpr receiver
  // (e.g. client.http.post) is recognised, not just a bare identifier (was a fail-open).
  const r = receiverSegment(node);
  if (r === "") return false;
  if (r === "http" || r === "https" || r === "net" || r === "socket" || r === "ws" || r === "websocket") return true;
  if ((r === "email" || r === "emailservice") && methodName === "send") return true;
  // Class C (RD-0234b): prelude egress SERVICES also ship data off-host — a raw vault
  // SecureString handed to NotificationService.send / PaymentService.charge is an
  // exfiltration path the receiver hand-list previously omitted (so it signed clean).
  if (r === "notificationservice" && /^(send|push|notify|dispatch|deliver)/.test(methodName)) return true;
  if (r === "paymentservice" && /^(charge|process|submit|send|authorize|capture)/.test(methodName)) return true;
  // Egress beyond raw network transport: the HTTP response body leaves the trust
  // boundary; remote inference ships the payload to a third-party model; a vector
  // store persists the (invertible) embedding. All are exfiltration paths.
  if (r === "response" && methodName === "body") return true;
  if (r === "ai" && (methodName === "remoteInference" || methodName === "remote" || methodName === "infer")) return true;
  // audit-sink-canonicality gap (RD-0234b tooling): a `Model.run`/`Model.infer`/`Model.predict` call
  // ships the payload to a model (a third-party egress), like ai.remoteInference — was ungoverned.
  // Named model values (ClassifierModel, EmbeddingModel, local aliases ending
  // in "Model") are still model boundaries. Matching only the literal receiver
  // `Model` let SecureString arguments bypass the egress gate.
  if (/vectordb$/.test(r) && /^(write|insert|upsert|add|index)$/.test(methodName)) return true;
  // H3 (RD-0234c SAFELIST inversion): a raw secret handed to ANY receiver via an egress-shaped method is a
  // potential off-host exfiltration path — deny by default. Only the known ON-HOST secret-handling primitives
  // (EGRESS_SAFE_RECEIVERS) are exempt. This closes the denylist gap where an UNKNOWN egress service admitted.
  if (EGRESS_METHOD_VERB.test(methodName) && !EGRESS_SAFE_RECEIVERS.has(r)) return true;
  return false;
}

// A named model is a governed inference boundary, but it is not necessarily a
// network boundary: compute-target policy may keep it local. Keep model
// recognition separate from isNetworkSink so local model pipelines do not
// falsely report network egress while raw credentials remain forbidden in any
// model context/state.
function isModelSink(node: AstNode): boolean {
  const methodName = node.value ?? "";
  const r = receiverSegment(node);
  return r.endsWith("model")
    && /^(run|infer|predict|generate|complete|classify|classifyWithKey|embed|score)$/i.test(methodName);
}

// ---------------------------------------------------------------------------
// Governance qualifier helpers
//
// Used for FUNGI-VALUESTATE-006 / FUNGI-VALUESTATE-007 boundary checks.
// ---------------------------------------------------------------------------

/**
 * Returns true when the AST node produces a protected value.
 *
 * Mirrors the type-checker's inferType protected-value inference:
 *   protect(x)                              → "protected X"
 *   validate.email(x) [receiver=validate]   → "protected Email"
 *   method.startsWith("validate.")          → "protected String" (qualified method name)
 *
 * Note: validate.sanitize(x), validate.text(x) etc. have unqualified method names
 * ("sanitize", "text") so they do NOT produce a protected type and must not fire
 * this check.
 *
 * Also: errorPropagation (?) wrapping any of the above is unwrapped.
 */
function isProtectedValueExpression(node: AstNode): boolean {
  // Unwrap errorPropagation (?)
  if (node.kind === "errorPropagation") {
    const inner = node.children?.[0];
    return inner !== undefined && isProtectedValueExpression(inner);
  }
  if (node.kind !== "callExpr") return false;
  const methodName = node.value ?? "";
  // protect(x) → protected X
  if (methodName === "protect") return true;
  // validate.email(x) — method is "email", receiver is identifier "validate"
  // or method starts with "validate." (fully-qualified method name)
  const receiver = node.children?.[0];
  const receiverIsValidateNamespace =
    receiver?.kind === "identifier" && receiver.value === "validate";
  if (receiverIsValidateNamespace && methodName === "email") return true;
  // Fully-qualified validate method names (method itself starts with "validate.")
  if (methodName.startsWith("validate.")) return true;
  return false;
}

const SECRET_NS = new Set(["secret", "secrets", "vault", "kms", "env"]);
const SECRET_ACCESSORS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["secret", new Set(["get", "read"])],
  ["secrets", new Set(["get"])],
  ["vault", new Set(["get", "read"])],
  ["kms", new Set(["decrypt"])],
  ["env", new Set(["get", "secret"])],
]);

/**
 * Source-only receiver classification (DESIGN-02 / Q1b).
 * Sinks keep using `receiverSegment`. This function never returns null/undefined/NaN.
 * `callStyle === "method"` → method receiver (today).
 * `callStyle === undefined` → plain call; children[0] is an argument, not a namespace accessor.
 * anything else → Unclassified (today's receiverSegment, fail closed).
 */
type SourceReceiver =
  | { readonly tag: "Receiver"; readonly seg: string }
  | { readonly tag: "PlainCall" }
  | { readonly tag: "Unclassified" };

function sourceLastSegment(node: AstNode, aliasMap?: ReadonlyMap<string, string>): string {
  let receiver = node.children?.[0];
  while (receiver?.kind === "errorPropagation") {
    receiver = receiver.children?.[0];
  }
  if (receiver === undefined) return "";
  const name = receiver.kind === "identifier" ? (aliasMap?.get(receiver.value ?? "") ?? receiver.value ?? "")
    : getNodeName(receiver, aliasMap);
  const seg = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : name;
  return seg.toLowerCase();
}

function sourceReceiverSegment(node: AstNode, aliasMap?: ReadonlyMap<string, string>): SourceReceiver {
  const style: string | undefined = node.callStyle;
  if (style === "method") {
    return { tag: "Receiver", seg: sourceLastSegment(node, aliasMap) };
  }
  if (style === undefined) {
    return { tag: "PlainCall" };
  }
  return { tag: "Unclassified" };
}

/**
 * Returns true when the node reads a value out of a `secrets {}`-declared credential —
 * a secret SOURCE. A binding initialised from such a source is treated as a secret
 * (SecureString-equivalent), so the existing FUNGI-SECRET-001 (logging) and FUNGI-SECRET-003
 * (serialization) sink guards fire if that binding ever reaches a log / serialize / audit
 * sink. Recognised accessors (receiver namespace . method):
 *   secret.get / secret.read / vault.read / vault.get / kms.decrypt / secrets.get / Env.get / env.secret  (any case)
 */
function sourceReceiverRoot(node: AstNode): string | undefined {
  let receiver = node.children?.[0];
  while (receiver?.kind === "errorPropagation") receiver = receiver.children?.[0];
  while (receiver?.kind === "memberExpr") receiver = receiver.children?.[0];
  return receiver?.kind === "identifier" ? receiver.value : undefined;
}

function isSecretSourceExpression(
  node: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
  aliasMap: ReadonlyMap<string, string>,
): boolean {
  if (node.kind === "errorPropagation") {
    const inner = node.children?.[0];
    return inner !== undefined && isSecretSourceExpression(inner, lookupBinding, aliasMap);
  }
  if (node.kind !== "callExpr") return false;
  const root = sourceReceiverRoot(node);
  if (root !== undefined && lookupBinding(root) !== undefined && !aliasMap.has(root)) return false;
  const classified = sourceReceiverSegment(node, aliasMap);
  const receiver = classified.tag === "Receiver"
    ? classified.seg
    : classified.tag === "Unclassified"
      ? sourceLastSegment(node, aliasMap)
      : "";
  return receiver !== ""
    && (SECRET_ACCESSORS.get(receiver)?.has((node.value ?? "").toLowerCase()) ?? false);
}

/**
 * Returns true when the AST node is a `redact(...)` call expression (or wrapped in ?).
 * Assigning redact(x) to a plain binding is a FUNGI-VALUESTATE-007 violation.
 */
function isRedactCall(
  node: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
): boolean {
  // Unwrap errorPropagation (?)
  if (node.kind === "errorPropagation") {
    const inner = node.children?.[0];
    return inner !== undefined && isRedactCall(inner, lookupBinding);
  }
  return node.kind === "callExpr" && node.callStyle === undefined
    && node.value === "redact" && lookupBinding("redact") === undefined;
}

/**
 * Recognise only the compiler-provided constant-time comparison, never a same-named
 * method or a locally rebound prelude value. A declassifier is an authority boundary:
 * spelling alone must not clear secret provenance.
 */
function isConstantTimeEqualsCall(
  node: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
): boolean {
  if (node.kind === "errorPropagation") {
    const inner = node.children?.[0];
    return inner !== undefined && isConstantTimeEqualsCall(inner, lookupBinding);
  }
  if (!(node.kind === "callExpr" && node.value === "constantTimeEquals")) return false;
  if (node.callStyle === "method") {
    const receiver = node.children?.[0];
    return receiver?.kind === "identifier"
      && receiver.value === "Crypto"
      && lookupBinding("Crypto") === undefined;
  }
  // The legacy prelude spelling remains valid only while it resolves to the prelude,
  // rather than a local value with the same name.
  return node.callStyle === undefined && lookupBinding("constantTimeEquals") === undefined;
}

/**
 * Extract every identifier referenced inside `${...}` interpolation holes of a string
 * literal. The lexer keeps an interpolated string as a single token (e.g. `"tok=${k}"`),
 * so without this the dataflow walkers can't see `k`. Conservative/fail-closed: returns
 * ALL identifiers in each hole (a method name that isn't a binding simply resolves to
 * undefined). Closes the interpolation laundering path for secrets/embeddings/taint.
 */
function interpolatedNames(node: AstNode): string[] {
  if (node.kind !== "stringLiteral" || typeof node.value !== "string") return [];
  const out: string[] = [];
  const holes = /\$\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = holes.exec(node.value)) !== null) {
    const ids = (m[1] ?? "").match(/[A-Za-z_]\w*/g);
    if (ids) out.push(...ids);
  }
  return out;
}

/**
 * Returns true when `node` reads from — OR is DERIVED from — a `secrets {}` credential.
 * This is the propagating form of isSecretSourceExpression: a secret carried through a
 * transform (slice, concat, member access, record field, a non-redacting call/helper)
 * is STILL secret. The ONLY declassifier is redact() (irreversible) — a parsed, decoded,
 * validated, or otherwise transformed secret remains a secret for sink purposes.
 *
 * Closes the FUNGI-SECRET-002 derived-secret fail-open: previously only a binding whose
 * init was a DIRECT secret accessor got tagged SecureString, so `let p = key.slice(0,5)`
 * (or `key + x`, or `{ tok: key }`) laundered the credential past the egress guard.
 * Tagging derived bindings here also hardens FUNGI-SECRET-001 (logging) and FUNGI-SECRET-003
 * (serialization), which key on the same SecureString tag.
 */
function derivesFromSecret(
  node: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
  aliasMap: ReadonlyMap<string, string> = new Map(),
): boolean {
  // redact(...) is the sole declassifier to a SAFE placeholder — it breaks the chain.
  if (isRedactCall(node, lookupBinding)) return false;
  // Only the compiler-provided Crypto operation (or unshadowed legacy prelude alias)
  // declassifies its public Bool outcome. Same-spelled user methods/locals stay secret.
  if (isConstantTimeEqualsCall(node, lookupBinding)) return false;
  // A direct secret accessor (secret.get / vault.read / kms.decrypt / secrets.get), incl. `?`.
  if (isSecretSourceExpression(node, lookupBinding, aliasMap)) return true;

  switch (node.kind) {
    case "identifier": {
      const name = node.value ?? "";
      const binding = lookupBinding(name);
      if (binding?.typeName === "SecureString") return true;
      // Constraint 3: a secret-namespace identifier with no local/param binding is a namespace escape.
      if (binding === undefined && SECRET_NS.has(name.toLowerCase())) return true;
      return false;
    }
    case "memberExpr": {
      const receiver = node.children?.[0];
      return receiver !== undefined && derivesFromSecret(receiver, lookupBinding, aliasMap);
    }
    case "callExpr": {
      // Record literal "#record" AND spread/update "#record-update" (`{ ...base, tok: k }`):
      // each child is a field (value = child[0]) or a #spread (source = child[0]).
      if (node.value === "#record" || node.value === "#record-update") {
        return (node.children ?? []).some((field) => {
          const value = field.children?.[0] ?? field;
          return derivesFromSecret(value, lookupBinding, aliasMap);
        });
      }
      // Any non-redacting call carrying a secret through receiver or args stays secret
      // (NOTE: unlike the taint chain, validate/parse/decode do NOT declassify a secret).
      const children = node.children ?? [];
      const root = sourceReceiverRoot(node);
      const receiverIsNamespaceOnly = node.callStyle === "method"
        && root !== undefined
        && lookupBinding(root) === undefined
        && SECRET_NS.has(sourceLastSegment(node, aliasMap));
      return children.some((child, index) =>
        !(index === 0 && receiverIsNamespaceOnly)
        && derivesFromSecret(child, lookupBinding, aliasMap));
    }
    case "stringLiteral":
      // Interpolated secret: `"Authorization: ${key}"` keeps the secret.
      return interpolatedNames(node).some(
        (n) => lookupBinding(n)?.typeName === "SecureString",
      );
    case "numberLiteral":
    case "boolLiteral":
    case "charLiteral":
      // These parser-known leaves carry no secret-capable children.
      return false;
    case "matchExpr": {
      const [subject, ...arms] = node.children ?? [];
      const subjectIsSecret =
        subject !== undefined && derivesFromSecret(subject, lookupBinding, aliasMap);
      const subjectControlsDispatch = subjectIsSecret && arms.some((arm) =>
        arm.kind === "matchArm" && arm.value !== "__guard__" && !isCatchAllMatchArm(arm),
      );
      if (subjectControlsDispatch) return true;
      return arms.some((arm) => {
        if (arm.kind !== "matchArm") return false;
        const children = arm.children ?? [];
        const guard = arm.value === "__guard__" ? children[0] : undefined;
        if (guard !== undefined && derivesFromSecret(guard, lookupBinding, aliasMap)) return true;
        const body = [...children].reverse().find((child) => child.kind !== "identifier");
        if (body === undefined) return false;
        const armLookup = (name: string): BindingInfo | undefined => {
          const isPatternBinding = arm.value !== "__guard__" &&
            children.slice(0, -1).some((child) => child.kind === "identifier" && child.value === name);
          if (isPatternBinding) {
            return {
              ...(lookupBinding(name) ?? { name, safetyPrefix: undefined, typeName: "" }),
              typeName: subjectIsSecret ? "SecureString" : "",
            };
          }
          return lookupBinding(name);
        };
        return derivesFromMatchArmResult(body, armLookup, aliasMap);
      });
    }
    case "binaryExpr": {
      const [left] = node.children ?? [];
      const skipsRight = left?.kind === "boolLiteral" &&
        (((node.value === "&&" || node.value === "and") && left.value === "false") ||
         ((node.value === "||" || node.value === "or") && left.value === "true"));
      return skipsRight
        ? left !== undefined && derivesFromSecret(left, lookupBinding, aliasMap)
        : (node.children ?? []).some((child) => derivesFromSecret(child, lookupBinding, aliasMap));
    }
    case "unaryExpr":
    case "listLiteral":
    case "k3FoldExpr":
    case "errorPropagation":
    case "checkExpr":
    case "prefilterExpr":
    case "requirementExpr":
    case "requirementConstraint":
    case "typedContentBlockExpr":
    case "forEachStmt":
    case "block":
      return (node.children ?? []).some((child) => derivesFromSecret(child, lookupBinding, aliasMap));
    case "fnDecl":
      // A nested function body is not executed merely because its declaration
      // occurs inside an expression block.
      return false;
    default:
      // A future AST kind has no reviewed secrecy semantics. Treat it as secret
      // until its exact semantics are classified above; child traversal alone
      // cannot prove an unknown node public (it may encode control or hidden data).
      return true;
  }
}

/** Existing expression and value-wrapper kinds admitted by secret logging traversal. */
const REVIEWED_SECRET_SINK_AST_KINDS: ReadonlySet<string> = new Set([
  "identifier", "memberExpr", "callExpr", "stringLiteral", "numberLiteral", "boolLiteral", "charLiteral",
  "unaryExpr", "binaryExpr", "listLiteral", "k3FoldExpr", "errorPropagation", "matchExpr", "matchArm",
  "checkExpr", "checkArm", "prefilterExpr", "prefilterArm", "requirementExpr", "requirementConstraint",
  "typedContentBlockExpr", "block",
]);

function isReviewedSecretSinkAstKind(kind: string): boolean {
  return REVIEWED_SECRET_SINK_AST_KINDS.has(kind);
}

/** Return only operands that can execute under a statically known short-circuit. */
function evaluatedExpressionChildren(node: AstNode): readonly AstNode[] {
  const children = node.children ?? [];
  if (node.kind !== "binaryExpr") return children;
  const left = children[0];
  if (left?.kind !== "boolLiteral") return children;
  const skipsRight =
    ((node.value === "&&" || node.value === "and") && left.value === "false") ||
    ((node.value === "||" || node.value === "or") && left.value === "true");
  return skipsRight ? [left] : children;
}

/** Read only values that can leave a match-arm body, not arbitrary local expressions. */
function derivesFromMatchArmResult(
  node: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
  aliasMap: ReadonlyMap<string, string> = new Map(),
): boolean {
  if (node.kind === "returnStmt") {
    const value = node.children?.[0];
    return value !== undefined && derivesFromSecret(value, lookupBinding, aliasMap);
  }
  if (node.kind === "block" && node.value === "(expr)") {
    const value = node.children?.[0];
    return value !== undefined && derivesFromSecret(value, lookupBinding, aliasMap);
  }
  if (node.kind === "block") {
    const locals = new Map<string, BindingInfo>();
    type ArmOutcome = {
      readonly secretResult: boolean;
      readonly continues: boolean;
      readonly mayTerminate: boolean;
      readonly writes: ReadonlySet<string>;
      readonly secretContinuation?: boolean;
    };
    const lookupIn = (state: ReadonlyMap<string, BindingInfo>, name: string): BindingInfo | undefined =>
      state.get(name) ?? lookupBinding(name);

    const visitBlock = (block: AstNode, state: Map<string, BindingInfo>): ArmOutcome => {
      let secretResult = false;
      let secretContinuation = false;
      let mayTerminate = false;
      const writes = new Set<string>();
      const declaredHere = new Set<string>();
      for (const candidate of block.children ?? []) {
        if (candidate.kind === "flowDecl" || candidate.kind === "secureFlowDecl" ||
            candidate.kind === "pureFlowDecl" || candidate.kind === "guardedFlowDecl" ||
            candidate.kind === "governedFlowDecl") continue;

        if (candidate.kind === "letDecl" || candidate.kind === "readonlyDecl" || candidate.kind === "mutDecl") {
          const info = parseBindingValue(candidate.value ?? "");
          const init = candidate.children?.[0];
          const initIsSecret = init !== undefined &&
            derivesFromSecret(init, (name) => lookupIn(state, name), aliasMap);
          const initOutcome = init === undefined
            ? { secretResult: false, continues: true, mayTerminate: false, writes: new Set<string>() }
            : visitExpressionEffects(init, state);
          mayTerminate ||= initOutcome.mayTerminate;
          for (const name of initOutcome.writes) {
            if (!declaredHere.has(name)) writes.add(name);
          }
          if (!initOutcome.continues) {
            secretResult ||= initOutcome.secretResult;
            secretContinuation ||= initOutcome.secretContinuation ?? false;
            return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
          }
          secretContinuation ||= initOutcome.secretContinuation ?? false;
          secretResult ||= initOutcome.secretContinuation ?? false;
          const isSecret = initIsSecret || initOutcome.secretResult;
          state.set(info.name, {
            ...info,
            typeName: isSecret ? "SecureString" : info.typeName,
            ...(candidate.location !== undefined ? { declaredAt: candidate.location } : {}),
          });
          declaredHere.add(info.name);
          continue;
        }

        if (candidate.kind === "assignStmt") {
          const target = candidate.value ?? "";
          const existing = lookupIn(state, target);
          const rhs = candidate.children?.[0];
          if (target !== "" && existing !== undefined && rhs !== undefined) {
            const rhsIsSecret = derivesFromSecret(rhs, (name) => lookupIn(state, name), aliasMap);
            const rhsOutcome = visitExpressionEffects(rhs, state);
            mayTerminate ||= rhsOutcome.mayTerminate;
            for (const name of rhsOutcome.writes) {
              if (!declaredHere.has(name)) writes.add(name);
            }
            if (!rhsOutcome.continues) {
              secretResult ||= rhsOutcome.secretResult;
              secretContinuation ||= rhsOutcome.secretContinuation ?? false;
              return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
            }
            secretContinuation ||= rhsOutcome.secretContinuation ?? false;
            secretResult ||= rhsOutcome.secretContinuation ?? false;
            const isSecret = rhsIsSecret || rhsOutcome.secretResult;
            state.set(target, {
              ...existing,
              typeName: isSecret ? "SecureString"
                : existing.typeName === "SecureString" ? "" : existing.typeName,
            });
            // A write to a binding declared in this lexical block is local to
            // the block, even if it shadows an outer binding with the same
            // spelling. Only writes to bindings visible on block entry may be
            // exported to the enclosing match-arm join.
            if (!declaredHere.has(target)) writes.add(target);
          }
          continue;
        }

        if (candidate.kind === "returnStmt") {
          const value = candidate.children?.[0];
          secretResult ||= value !== undefined && derivesFromSecret(value, (name) => lookupIn(state, name), aliasMap);
          return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
        }

        if (candidate.kind === "faultStmt") {
          return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
        }

        if (candidate.kind === "ifStmt") {
          const [condition, thenBlock, elseBlock] = candidate.children ?? [];
          const conditionIsSecretBeforeEvaluation = condition !== undefined &&
            derivesFromSecret(condition, (name) => lookupIn(state, name), aliasMap);
          const conditionOutcome = condition === undefined
            ? { secretResult: false, continues: true, mayTerminate: false, writes: new Set<string>() }
            : visitExpressionEffects(condition, state);
          mayTerminate ||= conditionOutcome.mayTerminate;
          for (const name of conditionOutcome.writes) {
            if (!declaredHere.has(name)) writes.add(name);
          }
          if (!conditionOutcome.continues) {
            secretResult ||= conditionOutcome.secretResult;
            secretContinuation ||= conditionOutcome.secretContinuation ?? false;
            return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
          }
          secretContinuation ||= conditionOutcome.secretContinuation ?? false;
          secretResult ||= conditionOutcome.secretContinuation ?? false;
          const conditionIsSecret = conditionIsSecretBeforeEvaluation || conditionOutcome.secretResult;
          const conditionLiteral = condition?.kind === "boolLiteral" ? condition.value : undefined;
          const thenFeasible = conditionLiteral !== "false";
          const elseFeasible = conditionLiteral !== "true";
          const incoming = new Map(state);
          const thenState = new Map(incoming);
          const thenOutcome = !thenFeasible
            ? { secretResult: false, continues: false, mayTerminate: false, writes: new Set<string>() }
            : thenBlock?.kind === "block"
              ? visitBlock(thenBlock, thenState)
              : thenBlock === undefined
                ? { secretResult: false, continues: true, mayTerminate: false, writes: new Set<string>() }
                : visitNode(thenBlock, thenState);
          const elseState = new Map(incoming);
          const elseOutcome = !elseFeasible
            ? { secretResult: false, continues: false, mayTerminate: false, writes: new Set<string>() }
            : elseBlock?.kind === "block"
              ? visitBlock(elseBlock, elseState)
              : elseBlock === undefined
                ? { secretResult: false, continues: true, mayTerminate: false, writes: new Set<string>() }
                : visitNode(elseBlock, elseState);
          mayTerminate ||= (thenFeasible && thenOutcome.mayTerminate) || (elseFeasible && elseOutcome.mayTerminate);

          secretResult ||= (thenFeasible && thenOutcome.secretResult) || (elseFeasible && elseOutcome.secretResult);
          if (thenFeasible) secretContinuation ||= thenOutcome.secretContinuation ?? false;
          if (elseFeasible) secretContinuation ||= elseOutcome.secretContinuation ?? false;
          if (conditionIsSecret && thenFeasible && elseFeasible && thenOutcome.continues !== elseOutcome.continues) {
            // Returning on only one secret-controlled path makes the match
            // result/control outcome depend on the secret predicate.
            secretResult = true;
            secretContinuation = true;
          }
          if (conditionIsSecret && thenFeasible && elseFeasible && !thenOutcome.continues && !elseOutcome.continues &&
              (containsReturnStatement(thenBlock) || containsReturnStatement(elseBlock))) {
            const thenLiteral = thenBlock === undefined ? undefined : directLiteralReturnSignature(thenBlock);
            const elseLiteral = elseBlock === undefined ? undefined : directLiteralReturnSignature(elseBlock);
            // Two terminal returns can still expose a secret-dependent value
            // even though neither path reaches a later statement. Prove the
            // result is independent only for the same direct primitive literal;
            // unknown expressions, mixed returns/faults, and different literals
            // remain confidential.
            if (thenLiteral === undefined || thenLiteral !== elseLiteral) secretResult = true;
          }

          const reachableStates = [
            ...(thenFeasible && thenOutcome.continues ? [{ state: thenState, outcome: thenOutcome }] : []),
            ...(elseFeasible && elseOutcome.continues ? [{ state: elseState, outcome: elseOutcome }] : []),
          ];
          if (reachableStates.length === 0) {
            return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
          }

          // Join branch assignments, not declarations: a nested block may
          // legally shadow an outer binding, but its declaration must not
          // escape that lexical scope or overwrite the enclosing value.
          const assignedNames = new Set<string>(incoming.keys());
          for (const outcome of reachableStates) {
            for (const name of outcome.outcome.writes) assignedNames.add(name);
          }
          for (const name of assignedNames) {
            const original = incoming.get(name) ?? lookupBinding(name);
            if (original === undefined) continue;
            const infos = reachableStates.map(({ state: branchState, outcome }) =>
              outcome.writes.has(name) ? branchState.get(name) ?? original : original);
            const isSecret = infos.some((info) => info.typeName === "SecureString");
            const secretControlledWrite = conditionIsSecret && reachableStates.some(({ outcome }) =>
              outcome.writes.has(name));
            state.set(name, {
              ...original,
              typeName: isSecret || secretControlledWrite ? "SecureString"
                : original.typeName === "SecureString" ? "" : original.typeName,
            });
            if (!declaredHere.has(name) && reachableStates.some(({ outcome }) => outcome.writes.has(name))) {
              writes.add(name);
            }
          }
          continue;
        }

        if (candidate.kind === "whileStmt") {
          const [condition, body] = candidate.children ?? [];
          const incoming = new Map(state);
          let headState = new Map(incoming);
          let loopContinues = true;
          const loopExitStates: Map<string, BindingInfo>[] = [];
          const loopStateKey = (current: ReadonlyMap<string, BindingInfo>): string =>
            JSON.stringify([...current.entries()]);
          const maxIterations = Math.max(2, incoming.size * 4 + 4);

          for (let iteration = 0; iteration < maxIterations; iteration++) {
            const iterationHeadState = new Map(headState);
            const conditionIsSecretBeforeEvaluation = condition !== undefined &&
              derivesFromSecret(condition, (name) => lookupIn(headState, name), aliasMap);
            const conditionOutcome = condition === undefined
              ? { secretResult: false, continues: true, mayTerminate: false, writes: new Set<string>() }
              : visitExpressionEffects(condition, headState);
            mayTerminate ||= conditionOutcome.mayTerminate;
            const conditionIsSecret = conditionIsSecretBeforeEvaluation || conditionOutcome.secretResult ||
              (conditionOutcome.secretContinuation ?? false);
            for (const name of conditionOutcome.writes) {
              if (!declaredHere.has(name)) writes.add(name);
            }
            secretContinuation ||= conditionOutcome.secretContinuation ?? false;
            secretResult ||= conditionOutcome.secretResult || (conditionOutcome.secretContinuation ?? false);
            if (!conditionOutcome.continues) {
              secretResult ||= conditionOutcome.secretResult;
              loopContinues = false;
              break;
            }
            // A normal while exit is observed after the final condition
            // evaluation, not at the pre-loop state or after a body pass.
            // Keep each feasible condition-exit snapshot while finding the
            // loop-head fixed point so overwrites in the condition can clear
            // stale incoming taint on every exit path.
            loopExitStates.push(new Map(headState));
            if (condition?.kind === "boolLiteral" && condition.value === "false") break;
            const bodyState = new Map(headState);
            const bodyOutcome = body?.kind === "block"
              ? visitBlock(body, bodyState)
              : body === undefined
                ? { secretResult: false, continues: true, mayTerminate: false, writes: new Set<string>() }
                : visitNode(body, bodyState);
            mayTerminate ||= bodyOutcome.mayTerminate;
            secretResult ||= bodyOutcome.secretResult;
            secretContinuation ||= bodyOutcome.secretContinuation ?? false;
            if (conditionIsSecret && !bodyOutcome.continues) {
              // A secret-dependent return from the loop changes whether the
              // enclosing match arm reaches its trailing result expression.
              secretResult = true;
              secretContinuation = true;
            }

            // A returning body has no backedge, so its assignments cannot
            // become the state of another iteration or the trailing result.
            if (!bodyOutcome.continues) break;

            const assignedNames = new Set<string>(incoming.keys());
            for (const name of conditionOutcome.writes) assignedNames.add(name);
            for (const name of bodyOutcome.writes) assignedNames.add(name);
            const nextHeadState = new Map(headState);
            for (const name of assignedNames) {
              const original = incoming.get(name) ?? lookupBinding(name);
              if (original === undefined) continue;
              const headInfo = headState.get(name) ?? original;
              const bodyInfo = bodyOutcome.writes.has(name)
                ? bodyState.get(name) ?? headInfo
                : headInfo;
              const isSecret = [original, headInfo, bodyInfo]
                .some((info) => info.typeName === "SecureString");
              const secretControlledWrite = conditionIsSecret && bodyOutcome.writes.has(name);
              nextHeadState.set(name, {
                ...original,
                typeName: isSecret || secretControlledWrite ? "SecureString"
                  : original.typeName === "SecureString" ? "" : original.typeName,
              });
              if (!declaredHere.has(name) && bodyOutcome.writes.has(name)) writes.add(name);
            }

            const stable = loopStateKey(iterationHeadState) === loopStateKey(nextHeadState);
            headState = nextHeadState;
            if (stable) break;
            if (iteration === maxIterations - 1) {
              throw new Error("match-arm while analysis did not converge within its finite state bound");
            }
          }

          const loopExitState = new Map(incoming);
          const exitNames = new Set<string>(incoming.keys());
          for (const exitState of loopExitStates) {
            for (const name of exitState.keys()) exitNames.add(name);
          }
          for (const name of exitNames) {
            const original = incoming.get(name) ?? lookupBinding(name);
            if (original === undefined) continue;
            const isSecret = loopExitStates.some((exitState) =>
              (exitState.get(name) ?? original).typeName === "SecureString");
            loopExitState.set(name, {
              ...original,
              typeName: isSecret ? "SecureString"
                : original.typeName === "SecureString" ? "" : original.typeName,
            });
          }
          state.clear();
          for (const [name, info] of loopExitState) state.set(name, info);
          if (!loopContinues) {
            return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
          }
          continue;
        }

        if (candidate.kind === "matchExpr") {
          const [subject, ...arms] = candidate.children ?? [];
          const incoming = new Map(state);
          const lookupState = (name: string) => lookupIn(incoming, name);
          const subjectIsSecret = subject !== undefined &&
            derivesFromSecret(subject, lookupState, aliasMap);
          const subjectState = new Map(incoming);
          const subjectOutcome = subject === undefined
            ? { secretResult: true, continues: true, mayTerminate: false, writes: new Set<string>() }
            : visitExpressionEffects(subject, subjectState);
          mayTerminate ||= subjectOutcome.mayTerminate;
          if (!subjectOutcome.continues) {
            secretResult ||= subjectOutcome.secretResult;
            secretContinuation ||= subjectOutcome.secretContinuation ?? false;
            return {
              secretResult,
              continues: false,
              mayTerminate: true,
              writes: new Set([...writes, ...subjectOutcome.writes]),
              secretContinuation,
            };
          }
          secretContinuation ||= subjectOutcome.secretContinuation ?? false;
          secretResult ||= subjectOutcome.secretContinuation ?? false;
          const reachable: Array<{
            readonly state: Map<string, BindingInfo>;
            readonly outcome: ArmOutcome;
            readonly secretControl: boolean;
            readonly shadowedNames: ReadonlySet<string>;
            readonly outerState: Map<string, BindingInfo>;
            readonly outerWrites: ReadonlySet<string>;
            readonly controlledWrites: ReadonlySet<string>;
          }> = [];
          let hasReachableFallthrough = true;
          let fallthroughState = new Map(subjectState);
          let fallthroughWrites = new Set(subjectOutcome.writes);
          let fallthroughControlledWrites = new Set<string>();
          let priorFallthroughSecret = false;

          for (const arm of arms) {
            if (arm.kind !== "matchArm") {
              // An unrecognized arm shape cannot prove that the match preserves
              // the incoming confidentiality state.
              secretResult = true;
              continue;
            }
            const armChildren = arm.children ?? [];
            const guard = arm.value === "__guard__" ? armChildren[0] : undefined;
            const body = [...armChildren].reverse().find((child) => child.kind !== "identifier");
            if (body === undefined) {
              secretResult = true;
              continue;
            }
            const isCatchAll = isCatchAllMatchArm(arm) && guard === undefined;
            const armIncoming = new Map(fallthroughState);
            const guardState = new Map(armIncoming);
            const guardOutcome = guard === undefined
              ? { secretResult: false, continues: true, mayTerminate: false, writes: new Set<string>() }
              : visitExpressionEffects(guard, guardState);
            mayTerminate ||= guardOutcome.mayTerminate;
            secretContinuation ||= guardOutcome.secretContinuation ?? false;
            secretResult ||= guardOutcome.secretContinuation ?? false;
            const guardIsSecret = guard !== undefined &&
              derivesFromSecret(guard, (name) => lookupIn(guardState, name), aliasMap);
            const patternControlsSelection = subjectIsSecret && arm.value !== "__guard__" &&
              !isCatchAllMatchArm(arm);
            const armSecretControl = priorFallthroughSecret || patternControlsSelection || guardIsSecret;
            if (!guardOutcome.continues) {
              // Evaluating a terminating guard returns/faults from the enclosing
              // flow. Its arm body and every later arm are unreachable on this path.
              secretResult ||= guardOutcome.secretResult;
              reachable.push({
                state: guardState,
                outcome: {
                  secretResult: guardOutcome.secretResult,
                  continues: false,
                  mayTerminate: true,
                  writes: new Set([...fallthroughWrites, ...guardOutcome.writes]),
                  secretContinuation: guardOutcome.secretContinuation ?? false,
                },
                secretControl: armSecretControl,
                shadowedNames: new Set<string>(),
                outerState: guardState,
                outerWrites: new Set([...fallthroughWrites, ...guardOutcome.writes]),
                controlledWrites: new Set(fallthroughControlledWrites),
              });
              // No evaluation path reaches a later arm after a terminating
              // guard; continuing the source-order loop would invent one.
              hasReachableFallthrough = false;
              break;
            }
            const armState = new Map(guardState);
            const shadowedNames = new Set<string>();
            if (arm.value !== "__guard__") {
              for (const pattern of armChildren.slice(0, -1)) {
                if (pattern.kind !== "identifier" || pattern.value === undefined) continue;
                shadowedNames.add(pattern.value);
                armState.set(pattern.value, {
                  ...(lookupIn(incoming, pattern.value) ?? {
                    name: pattern.value,
                    safetyPrefix: undefined,
                    typeName: "",
                  }),
                  typeName: subjectIsSecret ? "SecureString" : "",
                });
              }
            }
            const outcome = body.kind === "block"
              ? visitBlock(body, armState)
              : visitNode(body, armState);
            mayTerminate ||= outcome.mayTerminate;
            secretResult ||= outcome.secretResult || guardOutcome.secretResult;
            // A secret-controlled arm that terminates while another feasible
            // path continues changes whether the enclosing expression reaches
            // its value. Keep that control dependence even when the next arm
            // writes only a public constant.
            const armWrites = new Set([
              ...fallthroughWrites,
              ...guardOutcome.writes,
              ...outcome.writes,
            ]);
            reachable.push({
              state: armState,
              outcome: {
                ...outcome,
                secretResult: outcome.secretResult || guardOutcome.secretResult,
                secretContinuation: (outcome.secretContinuation ?? false) || (guardOutcome.secretContinuation ?? false),
                writes: armWrites,
              },
              secretControl: armSecretControl,
              shadowedNames,
              outerState: guardState,
              outerWrites: new Set([...fallthroughWrites, ...guardOutcome.writes]),
              controlledWrites: new Set([
                ...fallthroughControlledWrites,
                ...(priorFallthroughSecret ? guardOutcome.writes : []),
                ...(armSecretControl ? outcome.writes : []),
              ]),
            });

            const fallthroughPaths: Array<{
              readonly state: Map<string, BindingInfo>;
              readonly secretControl: boolean;
              readonly writes: ReadonlySet<string>;
              readonly controlledWrites: ReadonlySet<string>;
            }> = [];
            if (guard === undefined && !isCatchAllMatchArm(arm)) {
              // Pattern miss skips the guard and preserves the pre-arm state.
              fallthroughPaths.push({
                state: armIncoming,
                secretControl: priorFallthroughSecret || patternControlsSelection,
                writes: new Set(fallthroughWrites),
                controlledWrites: new Set(fallthroughControlledWrites),
              });
            }
            if (guard !== undefined && guardOutcome.continues) {
              // A failed guard still ran, so its side effects flow to later
              // arms. Pattern and guard outcomes can both select that path.
              fallthroughPaths.push({
                state: guardState,
                secretControl: priorFallthroughSecret || patternControlsSelection || guardIsSecret,
                writes: new Set([...fallthroughWrites, ...guardOutcome.writes]),
                controlledWrites: new Set([
                  ...fallthroughControlledWrites,
                  ...(priorFallthroughSecret ? guardOutcome.writes : []),
                ]),
              });
            }
            if (fallthroughPaths.length > 0) {
              const nextState = new Map(armIncoming);
              const names = new Set<string>(armIncoming.keys());
              for (const path of fallthroughPaths) {
                for (const name of path.writes) names.add(name);
              }
              for (const name of names) {
                const original = armIncoming.get(name) ?? lookupBinding(name);
                if (original === undefined) continue;
                const infos = fallthroughPaths.map(({ state: pathState, writes: pathWrites }) =>
                  pathWrites.has(name) ? pathState.get(name) ?? original : original);
                const secretValue = infos.some((info) => info.typeName === "SecureString");
                const secretControlledWrite = fallthroughPaths.some(({ controlledWrites }) =>
                  controlledWrites.has(name));
                nextState.set(name, {
                  ...original,
                  typeName: secretValue || secretControlledWrite ? "SecureString"
                    : original.typeName === "SecureString" ? "" : original.typeName,
                });
              }
              fallthroughState = nextState;
              fallthroughWrites = new Set(fallthroughPaths.flatMap(({ writes: pathWrites }) =>
                [...pathWrites]));
              fallthroughControlledWrites = new Set(fallthroughPaths.flatMap(({ controlledWrites }) =>
                [...controlledWrites]));
              priorFallthroughSecret ||= fallthroughPaths.some(({ secretControl }) => secretControl);
            }

            if (isCatchAll) {
              hasReachableFallthrough = false;
              break;
            }
          }

          // A non-exhaustive or guarded match can fall through without taking
          // an arm. Retain the source-ordered fallthrough state as a real path.
          if (hasReachableFallthrough) {
            reachable.push({
              state: new Map(fallthroughState),
              outcome: { secretResult: false, continues: true, mayTerminate: false, writes: new Set(fallthroughWrites) },
              secretControl: priorFallthroughSecret,
              shadowedNames: new Set<string>(),
              outerState: new Map(fallthroughState),
              outerWrites: new Set(fallthroughWrites),
              controlledWrites: new Set(fallthroughControlledWrites),
            });
          }

          const continuingFlags = new Set(reachable.map(({ outcome }) => outcome.continues));
          if (continuingFlags.size > 1 && reachable.some(({ secretControl }) => secretControl)) {
            secretResult = true;
            secretContinuation = true;
          }
          secretContinuation ||= reachable.some(({ outcome }) => outcome.secretContinuation ?? false);
          secretResult ||= reachable.some(({ outcome }) => outcome.secretContinuation ?? false);
          const continuing = reachable.filter(({ outcome }) => outcome.continues);
          if (continuing.length === 0) {
            return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
          }
          secretContinuation ||= continuing.some(({ outcome }) => outcome.secretContinuation ?? false);
          secretResult ||= continuing.some(({ outcome }) => outcome.secretContinuation ?? false);
          const assignedNames = new Set<string>(incoming.keys());
          for (const { outcome, shadowedNames, outerWrites } of continuing) {
            for (const name of outcome.writes) {
              if (!shadowedNames.has(name) || outerWrites.has(name)) assignedNames.add(name);
            }
          }
          for (const name of assignedNames) {
            const original = incoming.get(name) ?? lookupBinding(name);
            if (original === undefined) continue;
            const infos = continuing.map(({ state: armState, outcome, shadowedNames, outerState, outerWrites }) => {
              if (shadowedNames.has(name)) {
                return outerWrites.has(name) ? outerState.get(name) ?? original : original;
              }
              return outcome.writes.has(name) ? armState.get(name) ?? original : original;
            });
            const isSecret = infos.some((info) => info.typeName === "SecureString");
            const secretControlledWrite = continuing.some(({ controlledWrites, shadowedNames, outerWrites }) =>
              controlledWrites.has(name) && (!shadowedNames.has(name) || outerWrites.has(name)));
            state.set(name, {
              ...original,
              typeName: isSecret || secretControlledWrite ? "SecureString"
                : original.typeName === "SecureString" ? "" : original.typeName,
            });
            if (!declaredHere.has(name) && continuing.some(({ outcome, shadowedNames, outerWrites }) =>
              outcome.writes.has(name) && (!shadowedNames.has(name) || outerWrites.has(name)))) {
              writes.add(name);
            }
          }
          continue;
        }

        if (candidate.kind === "block") {
          const nestedState = new Map(state);
          const nestedOutcome = visitBlock(candidate, nestedState);
          secretResult ||= nestedOutcome.secretResult;
          secretContinuation ||= nestedOutcome.secretContinuation ?? false;
          secretResult ||= nestedOutcome.secretContinuation ?? false;
          // Preserve writes to enclosing bindings, but do not export nested
          // declarations introduced by the lexical block.
          for (const name of nestedOutcome.writes) {
            const updated = nestedState.get(name);
            if (updated !== undefined) {
              state.set(name, updated);
              writes.add(name);
            }
          }
          mayTerminate ||= nestedOutcome.mayTerminate;
          if (!nestedOutcome.continues) {
            return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
          }
          continue;
        }

        const expressionOutcome = visitExpressionEffects(candidate, state);
        mayTerminate ||= expressionOutcome.mayTerminate;
        secretResult ||= expressionOutcome.secretResult || (expressionOutcome.secretContinuation ?? false);
        secretContinuation ||= expressionOutcome.secretContinuation ?? false;
        for (const name of expressionOutcome.writes) {
          if (!declaredHere.has(name)) writes.add(name);
        }
        if (!expressionOutcome.continues) {
          return { secretResult, continues: false, mayTerminate: true, writes, secretContinuation };
        }
      }
      return { secretResult, continues: true, mayTerminate, writes, secretContinuation };
    };

    const visitNode = (candidate: AstNode, state: Map<string, BindingInfo>): ArmOutcome => {
      if (candidate.kind === "block") return visitBlock(candidate, state);
      return visitExpressionEffects(candidate, state);
    };

    const visitExpressionEffects = (candidate: AstNode, state: Map<string, BindingInfo>): ArmOutcome => {
      if (candidate.kind === "block") return visitBlock(candidate, state);
      if (candidate.kind === "fnDecl") {
        return { secretResult: false, continues: true, mayTerminate: false, writes: new Set<string>() };
      }
      const lookupState = (name: string) => state.get(name) ?? lookupBinding(name);
      if (isRedactCall(candidate, lookupState) || isConstantTimeEqualsCall(candidate, lookupState)) {
        const writes = new Set<string>();
        let secretContinuation = false;
        let mayTerminate = false;
        for (const child of candidate.children ?? []) {
          const childOutcome = visitExpressionEffects(child, state);
          mayTerminate ||= childOutcome.mayTerminate;
          secretContinuation ||= childOutcome.secretContinuation ?? false;
          for (const name of childOutcome.writes) writes.add(name);
          if (!childOutcome.continues) {
            return { secretResult: false, continues: false, mayTerminate: true, writes, secretContinuation };
          }
        }
        // Authorized declassification applies to the call result, not to any
        // independently observed side effects while evaluating its arguments.
        return { secretResult: false, continues: true, mayTerminate, writes, secretContinuation };
      }
      if (candidate.kind === "matchExpr") {
        // Reuse the statement transfer by evaluating the expression in a
        // one-node block; its path-sensitive writes are observable to a guard.
        return visitBlock({ kind: "block", children: [candidate] }, state);
      }
      if (candidate.kind === "binaryExpr" &&
          (candidate.value === "&&" || candidate.value === "and" ||
           candidate.value === "||" || candidate.value === "or")) {
        const [left, right] = candidate.children ?? [];
        if (left !== undefined && right !== undefined) {
          const incoming = new Map(state);
          const leftIsSecret = derivesFromSecret(left, (name) => lookupIn(incoming, name), aliasMap);
          const leftOutcome = visitExpressionEffects(left, state);
          if (!leftOutcome.continues) {
            return {
              secretResult: leftOutcome.secretResult,
              continues: false,
              mayTerminate: true,
              writes: leftOutcome.writes,
              secretContinuation: leftOutcome.secretContinuation ?? false,
            };
          }
          // The left predicate can become secret during its own ordered effects
          // (for example, a nested match writes a secret before a later operand
          // reads that binding). That evaluated secrecy also controls whether
          // this operator reaches its RHS.
          const leftControlsRight = leftIsSecret || leftOutcome.secretResult ||
            (leftOutcome.secretContinuation ?? false);

          const leftLiteral = left.kind === "boolLiteral" ? left.value : undefined;
          const skipsRight = ((candidate.value === "&&" || candidate.value === "and") && leftLiteral === "false") ||
            ((candidate.value === "||" || candidate.value === "or") && leftLiteral === "true");
          if (skipsRight) {
            // The result is the public short-circuit literal. Do not recurse
            // into an operand that the language runtime will not evaluate.
            return {
              secretResult: derivesFromMatchArmResult(left, (name) => lookupIn(state, name), aliasMap),
              continues: true,
              mayTerminate: leftOutcome.mayTerminate,
              writes: leftOutcome.writes,
              secretContinuation: leftOutcome.secretContinuation ?? false,
            };
          }

          const alwaysEvaluatesRight =
            ((candidate.value === "&&" || candidate.value === "and") && leftLiteral === "true") ||
            ((candidate.value === "||" || candidate.value === "or") && leftLiteral === "false");
          if (alwaysEvaluatesRight) {
            const rightIsSecret = derivesFromMatchArmResult(right, (name) => lookupIn(state, name), aliasMap);
            const rightOutcome = visitExpressionEffects(right, state);
            return {
              secretResult: rightIsSecret || rightOutcome.secretResult,
              continues: rightOutcome.continues,
              mayTerminate: leftOutcome.mayTerminate || rightOutcome.mayTerminate,
              writes: new Set([...leftOutcome.writes, ...rightOutcome.writes]),
              secretContinuation: (leftOutcome.secretContinuation ?? false) ||
                (rightOutcome.secretContinuation ?? false),
            };
          }

          // With a nonliteral left operand, both paths are feasible: the
          // operator may skip the RHS, or evaluate it. Analyze RHS effects in
          // an isolated state so its writes do not erase the skipped path.
          const skippedState = new Map(state);
          const evaluatedState = new Map(skippedState);
          const rightOutcome = visitExpressionEffects(right, evaluatedState);
          const writes = new Set(leftOutcome.writes);
          const secretContinuation = (leftOutcome.secretContinuation ?? false) ||
            (rightOutcome.secretContinuation ?? false) || (leftControlsRight && rightOutcome.mayTerminate);
          if (rightOutcome.continues) {
            for (const name of rightOutcome.writes) writes.add(name);
            const names = new Set([...skippedState.keys(), ...rightOutcome.writes]);
            for (const name of names) {
              const original = skippedState.get(name) ?? lookupBinding(name);
              if (original === undefined) continue;
              const skippedInfo = skippedState.get(name) ?? original;
              const evaluatedInfo = rightOutcome.writes.has(name)
                ? evaluatedState.get(name) ?? original
                : skippedInfo;
              const secretControlledWrite = leftControlsRight && rightOutcome.writes.has(name);
              state.set(name, {
                ...original,
                typeName: skippedInfo.typeName === "SecureString" || evaluatedInfo.typeName === "SecureString" ||
                  secretControlledWrite ? "SecureString"
                  : original.typeName === "SecureString" ? "" : original.typeName,
              });
            }
          } else {
            state.clear();
            for (const [name, info] of skippedState) state.set(name, info);
          }
          return {
            secretResult: leftIsSecret || leftOutcome.secretResult || rightOutcome.secretResult,
            continues: true, // the short-circuit path always remains feasible
            mayTerminate: leftOutcome.mayTerminate || rightOutcome.mayTerminate,
            writes,
            secretContinuation,
          };
        }
      }
      let secretResult = derivesFromMatchArmResult(candidate, (name) =>
        state.get(name) ?? lookupBinding(name), aliasMap);
      const writes = new Set<string>();
      let secretContinuation = false;
      let mayTerminate = false;
      let childrenContinue = true;
      const children = candidate.children ?? [];
      for (let index = 0; index < children.length; index++) {
        const child = children[index];
        if (child === undefined) continue;
        if (!childrenContinue) break;
        const childOutcome = visitExpressionEffects(child, state);
        mayTerminate ||= childOutcome.mayTerminate;
        secretResult ||= childOutcome.secretResult;
        secretContinuation ||= childOutcome.secretContinuation ?? false;
        for (const name of childOutcome.writes) writes.add(name);
        childrenContinue = childOutcome.continues;
      }
      return {
        secretResult,
        continues: childrenContinue && candidate.kind !== "returnStmt" && candidate.kind !== "faultStmt",
        mayTerminate: mayTerminate || candidate.kind === "returnStmt" || candidate.kind === "faultStmt",
        writes,
        secretContinuation,
      };
    };

    // A match arm's block is executed in its own scope. Resolve nested branch
    // states as well as source-order declarations so a declassified reassignment
    // is joined across all reachable paths before the arm's return is classified.
    return visitBlock(node, locals).secretResult;
  }
  return derivesFromSecret(node, lookupBinding, aliasMap);
}

/** True when executing this statement cannot reach the next statement in its block. */
function isCatchAllMatchArm(node: AstNode): boolean {
  return node.kind === "matchArm" && (node.value === "_" || node.value === "else");
}

/** A declared SecureString component preserves the confidentiality label at return. */
function returnTypePreservesSecretLabel(typeName: string | undefined): boolean {
  return typeName !== undefined && /\bSecureString\b/.test(typeName);
}

function directLiteralReturnSignature(node: AstNode): string | undefined {
  const returned = node.kind === "returnStmt"
    ? node
    : node.kind === "block" && node.children?.length === 1 && node.children[0]?.kind === "returnStmt"
      ? node.children[0]
      : undefined;
  const value = returned?.children?.[0];
  if (value === undefined || ![
    "boolLiteral",
    "charLiteral",
    "floatLiteral",
    "intLiteral",
    "numberLiteral",
    "stringLiteral",
  ].includes(value.kind)) return undefined;
  return JSON.stringify([value.kind, value.value]);
}

function containsReturnStatement(node: AstNode | undefined): boolean {
  if (node === undefined) return false;
  if (node.kind === "returnStmt") return true;
  if (node.kind === "flowDecl" || node.kind === "secureFlowDecl" || node.kind === "pureFlowDecl" ||
      node.kind === "guardedFlowDecl" || node.kind === "governedFlowDecl") return false;
  return (node.children ?? []).some(containsReturnStatement);
}

function containsTerminalExitStatement(node: AstNode | undefined): boolean {
  if (node === undefined) return false;
  if (node.kind === "returnStmt" || node.kind === "faultStmt") return true;
  if (node.kind === "flowDecl" || node.kind === "secureFlowDecl" || node.kind === "pureFlowDecl" ||
      node.kind === "guardedFlowDecl" || node.kind === "governedFlowDecl" || node.kind === "fnDecl") return false;
  if (node.kind === "ifStmt") {
    const [condition, thenBlock, elseBlock] = node.children ?? [];
    if (containsTerminalExitStatement(condition)) return true;
    if (condition?.kind === "boolLiteral") {
      return condition.value === "true"
        ? containsTerminalExitStatement(thenBlock)
        : containsTerminalExitStatement(elseBlock);
    }
    return containsTerminalExitStatement(thenBlock) || containsTerminalExitStatement(elseBlock);
  }
  if (node.kind === "whileStmt") {
    const [condition, body] = node.children ?? [];
    if (containsTerminalExitStatement(condition)) return true;
    if (condition?.kind === "boolLiteral" && condition.value === "false") return false;
    return containsTerminalExitStatement(body);
  }
  if (node.kind === "block") {
    for (const child of node.children ?? []) {
      if (containsTerminalExitStatement(child)) return true;
      if (definitelyTerminates(child)) return false;
    }
    return false;
  }
  return (node.children ?? []).some(containsTerminalExitStatement);
}

function definitelyTerminates(node: AstNode): boolean {
  if (node.kind === "returnStmt" || node.kind === "faultStmt") return true;
  if (node.kind === "block") {
    return (node.children ?? []).some(definitelyTerminates);
  }
  if (node.kind === "ifStmt") {
    const [, thenBlock, elseBlock] = node.children ?? [];
    return thenBlock !== undefined && elseBlock !== undefined &&
      definitelyTerminates(thenBlock) && definitelyTerminates(elseBlock);
  }
  if (node.kind === "matchExpr") {
    const arms = (node.children ?? []).slice(1);
    if (arms.length === 0 || !arms.some(isCatchAllMatchArm)) {
      return false;
    }
    return arms.every((arm) => {
      if (arm.kind !== "matchArm") return false;
      // A guarded arm can still be terminal: when an unguarded wildcard is
      // present and every arm body terminates, guard fallthrough cannot reach
      // the following statement either.
      const body = [...(arm.children ?? [])].reverse().find((child) => child.kind !== "identifier");
      return body !== undefined && definitelyTerminates(body);
    });
  }
  if (node.kind === "checkExpr" || node.kind === "prefilterExpr") {
    const arms = (node.children ?? []).slice(1);
    const armKind = node.kind === "checkExpr" ? "checkArm" : "prefilterArm";
    const required = node.kind === "checkExpr" ? ["if", "deny", "ambig"] : ["deny", "maybe"];
    if (arms.length === 0 || arms.some((arm) => arm.kind !== armKind)) return false;
    const byLabel = new Map(arms.map((arm) => [arm.value ?? "", arm]));
    return required.every((label) => {
      const arm = byLabel.get(label);
      const body = arm?.children?.[0];
      return body !== undefined && definitelyTerminates(body);
    });
  }
  return false;
}

// ---------------------------------------------------------------------------
// U2/#204 — semantic-embedding confidentiality (FUNGI-PRIVACY-002)
//
// A semantic embedding vector can be inverted back to its source text
// (embedding-inversion / vec2text recovers ~90%+), so a CLEARTEXT embedding
// crossing a trust boundary is a confidentiality leak equivalent to leaking the
// text. We model the same source→derive→sink dataflow as secrets, with seal()/
// encrypt() (engine-side AEAD, govern-don't-absorb) as the sole declassifier.
// ---------------------------------------------------------------------------

/** A type annotation that denotes a semantic embedding vector. */
function isEmbeddingTypeName(typeName: string | undefined): boolean {
  return typeName === "Embedding" || typeName === "EmbeddingResult";
}

/**
 * Returns true when `node` reads a semantic embedding from a model — the embedding
 * SOURCE. Keyed on the REAL shipped symbols (the EmbeddingModel value from
 * @galerina/ai-types, canonical call `EmbeddingModel.run(...)`), the common
 * embed / embedQuery / embedDocuments method names, AND any receiver whose name
 * contains "embed" (case-insensitive) — so a constructed instance var like
 * `embeddingModel.run(req)` or `myEmbedder.infer(x)` is recognized, not just the
 * exact-case type value. Unwraps `?`.
 */
function isEmbeddingSourceExpression(node: AstNode): boolean {
  if (node.kind === "errorPropagation") {
    const inner = node.children?.[0];
    return inner !== undefined && isEmbeddingSourceExpression(inner);
  }
  if (node.kind !== "callExpr") return false;
  const method = (node.value ?? "").toLowerCase();
  if (method === "embed" || method === "embedquery" || method === "embeddocuments") return true;
  const receiver = node.children?.[0];
  if (receiver?.kind === "identifier" && /embed/i.test(receiver.value ?? "")) return true;
  return false;
}

/** seal(...) / encrypt(...) — the sole declassifier for an embedding (incl. `?`). */
function isSealCall(
  node: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
): boolean {
  if (node.kind === "errorPropagation") {
    const inner = node.children?.[0];
    return inner !== undefined && isSealCall(inner, lookupBinding);
  }
  return node.kind === "callExpr" && node.callStyle === undefined
    && (node.value === "seal" || node.value === "encrypt")
    && lookupBinding(node.value) === undefined;
}

/** Only the authenticated-envelope primitive may carry protected data over network egress. */
function isAuthenticatedSealCall(
  node: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
): boolean {
  if (node.kind === "errorPropagation") {
    const inner = node.children?.[0];
    return inner !== undefined && isAuthenticatedSealCall(inner, lookupBinding);
  }
  return node.kind === "callExpr" && node.callStyle === undefined
    && node.value === "seal" && lookupBinding("seal") === undefined;
}

/**
 * Propagating form of isEmbeddingSourceExpression: a cleartext embedding carried
 * through slice/concat/normalize/reshape/member/record/non-sealing call STAYS a
 * cleartext embedding (this is what holds the line against vec2text laundering).
 * The ONLY declassifier is seal()/encrypt() — mirrors derivesFromSecret's redact().
 */
function derivesFromEmbedding(
  node: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
): boolean {
  if (isSealCall(node, lookupBinding)) return false;
  if (isEmbeddingSourceExpression(node)) return true;

  switch (node.kind) {
    case "identifier": {
      const binding = lookupBinding(node.value ?? "");
      return binding?.embeddingDerived === true;
    }
    case "memberExpr": {
      const receiver = node.children?.[0];
      return receiver !== undefined && derivesFromEmbedding(receiver, lookupBinding);
    }
    case "callExpr": {
      // "#record" literal AND "#record-update" spread (`{ ...base, v: e }`).
      if (node.value === "#record" || node.value === "#record-update") {
        return (node.children ?? []).some((field) => {
          const value = field.children?.[0] ?? field;
          return derivesFromEmbedding(value, lookupBinding);
        });
      }
      return (node.children ?? []).some((child) => derivesFromEmbedding(child, lookupBinding));
    }
    case "stringLiteral":
      // Interpolated embedding: `"vec=${e}"` keeps the embedding cleartext.
      return interpolatedNames(node).some(
        (n) => lookupBinding(n)?.embeddingDerived === true,
      );
    case "binaryExpr":
    case "listLiteral":
    case "errorPropagation":
      return (node.children ?? []).some((child) => derivesFromEmbedding(child, lookupBinding));
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Gate function recognition
//
// The right-hand side of `safe mut name = gate(name)?` must match one of these.
//
// Canonical registry (source of truth):
//   ../ZTF-Knowledge-Bases/stdlib-gates.yaml  §gates
//
// Phase 6 uses prefix-based matching. Phase 7+ should load from the registry.
// When adding a new gate, update stdlib-gates.yaml first, then mirror here.
// ---------------------------------------------------------------------------

const GATE_PREFIXES = [
  "validate.",
  "sanitize.",
  "json.decode",
  "toml.decode",
  "parse.",
  "constantTimeEquals",
  "redact",
] as const;

// ---------------------------------------------------------------------------
// Phase 11B.2 — User-defined gate function prefixes
//
// Functions whose names start with any of these prefixes are automatically
// treated as gate functions that break the taint chain. This covers the common
// naming conventions for validation helpers (validateAge, sanitizeHtml, etc.)
// without requiring explicit @gate annotations in the AST.
// ---------------------------------------------------------------------------

const USER_GATE_NAME_PREFIXES = [
  "validate",
  "sanitize",
  "check",
  "verify",
  "parse",
  "decode",
] as const;

/**
 * Phase 11B.2: Walk the AST and collect user-defined gate function names.
 *
 * A function is a user gate if its unqualified name starts with one of the
 * recognised gate name prefixes (validate*, sanitize*, check*, verify*,
 * parse*, decode*). This mirrors the stdlib gate convention and requires no
 * additional annotation syntax.
 *
 * In addition to name-prefix matching, the set contains ALL fnDecl names that
 * appear at the top level of the program so that call-site checks can find
 * them by simple Set lookup.
 */
function collectUserGates(ast: AstNode): Set<string> {
  const gates = new Set<string>();

  function walk(node: AstNode): void {
    if (node.kind === "fnDecl") {
      const fnName = node.value ?? "";
      if (
        fnName !== "" &&
        USER_GATE_NAME_PREFIXES.some((prefix) => fnName.startsWith(prefix))
      ) {
        gates.add(fnName);
      }
    }
    for (const child of node.children ?? []) walk(child);
  }

  walk(ast);
  return gates;
}

function isGateCallName(fullName: string, userGates?: ReadonlySet<string>): boolean {
  if (GATE_PREFIXES.some((prefix) => fullName.startsWith(prefix))) return true;
  // Phase 11B.2: user-defined gate by name prefix (e.g. validateAge)
  if (USER_GATE_NAME_PREFIXES.some((prefix) => fullName.startsWith(prefix))) return true;
  // Phase 11B.2: user-defined gate by explicit registry
  if (userGates !== undefined && userGates.has(fullName)) return true;
  return false;
}

/**
 * Phase 4.3: Walk the AST and collect user-defined flow names.
 * All five declaration kinds, including governedFlowDecl via decodeFlowDecl.
 * Used for inter-flow call-site taint warnings.
 */
function collectUserFlows(ast: AstNode): Set<string> {
  const flows = new Set<string>();

  function walk(node: AstNode): void {
    const decoded = decodeFlowDecl(node);
    if (decoded !== undefined && !("error" in decoded) && decoded.name !== "") {
      flows.add(decoded.name);
    }
    for (const child of node.children ?? []) walk(child);
  }

  walk(ast);
  return flows;
}

// ---------------------------------------------------------------------------
// AST name reconstruction helpers
// ---------------------------------------------------------------------------

function getNodeName(node: AstNode, aliasMap?: ReadonlyMap<string, string>): string {
  if (node.kind === "identifier") {
    const name = node.value ?? "";
    // C1: resolve a module alias at the receiver leaf (`let x = AuditLog; x.write` → `AuditLog.write`)
    // so an aliased call is matched against the governed-sink registry instead of being missed.
    return aliasMap?.get(name) ?? name;
  }
  if (node.kind === "memberExpr") {
    const parent = node.children?.[0];
    const parentName = parent !== undefined ? getNodeName(parent, aliasMap) : "";
    const memberName = node.value ?? "";
    return parentName !== "" ? `${parentName}.${memberName}` : memberName;
  }
  return "";
}

function buildFullCallName(node: AstNode, aliasMap?: ReadonlyMap<string, string>): string {
  const methodName = node.value ?? "";
  const receiver = node.children?.[0];
  if (receiver === undefined) return methodName;
  const receiverName = getNodeName(receiver, aliasMap);
  return receiverName !== "" ? `${receiverName}.${methodName}` : methodName;
}

// ---------------------------------------------------------------------------
// Binding value parser
//
// Parses the encoded `value` field of letDecl / mutDecl AST nodes.
// Format: [safetyPrefix " "] name [":" " " typeName [...postfixQualifiers]]
// ---------------------------------------------------------------------------

// `boundary-untrusted` (R&D 0093, the "34B hole"): a BARE param at a posture-gated
// entry boundary (secure/guarded flow). It behaves EXACTLY like `undefined` (trusted)
// at every existing site — all of which test `=== "unsafe"`/`"safe"` — so it is inert
// for VS-001/002/004/005/006/007; it fires ONLY FUNGI-VALUESTATE-008 at a governed sink.
interface BindingInfo {
  readonly name: string;
  readonly safetyPrefix: "unsafe" | "safe" | "boundary-untrusted" | undefined;
  readonly typeName: string;
  /** Location where this binding was declared — used for Rust-style related diagnostics. */
  readonly declaredAt?: SourceLocation;
  /**
   * Phase 11B.1 — Two-hop taint propagation.
   * True when this binding was derived from an unsafe or tainted binding via
   * a non-gate expression (e.g. rawQuery.trim()). Such bindings emit
   * FUNGI-VALUESTATE-005 when they reach governed sinks.
   */
  readonly tainted?: boolean;
  /** The original unsafe binding name this taint was derived from (for diagnostics). */
  readonly taintSource?: string;
  /**
   * U2/#204 — SemanticVector confidentiality (FUNGI-PRIVACY-002).
   * True when this binding holds, or is DERIVED from, a semantic embedding vector
   * (EmbeddingModel.run/.embed, or an Embedding/EmbeddingResult-typed binding) and has
   * NOT been sealed/encrypted. A cleartext embedding is inversion-bearing (vec2text), so
   * it must not cross a trust boundary in cleartext; reaching a network sink emits
   * FUNGI-PRIVACY-002. seal()/encrypt() is the sole declassifier. Propagates like `tainted`.
   */
  readonly embeddingDerived?: boolean;
  /** NET-NEW 0111: current passport typestate stage (Raw=0..Sealed=3) for a Passport-typed value. */
  readonly passportStage?: PassportStageV;
  /** RD-0659: exact named Authority<Tag> alias carried by this binding. */
  readonly authorityType?: string;
  /** NET-NEW 0111: affine — true once this passport has been consumed at an authority sink. */
  readonly consumed?: boolean;
  /** NET-NEW 0111: where it was first consumed (Rust-style related location). */
  readonly consumedAt?: SourceLocation;
}

/** Collect named aliases whose direct RHS is Authority<Tag>. */
function collectAuthorityTypes(ast: AstNode): ReadonlySet<string> {
  const authorityTypes = new Set<string>();

  const visit = (node: AstNode): void => {
    if (node.kind === "typeDecl" && node.value !== undefined) {
      const rhs = node.children?.[0];
      if (rhs?.kind === "typeRef" && /^Authority\s*</.test(rhs.value ?? "")) {
        authorityTypes.add(node.value.trim());
      }
    }
    for (const child of node.children ?? []) visit(child);
  };

  visit(ast);
  return authorityTypes;
}

function parseBindingValue(value: string): BindingInfo {
  let rest = value.trim();
  let safetyPrefix: "unsafe" | "safe" | undefined;

  if (rest.startsWith("unsafe ")) {
    safetyPrefix = "unsafe";
    rest = rest.slice("unsafe ".length).trim();
  } else if (rest.startsWith("safe ")) {
    safetyPrefix = "safe";
    rest = rest.slice("safe ".length).trim();
  }

  // rest = "name: Type [qualifiers]" or "name"
  const colonIdx = rest.indexOf(":");
  if (colonIdx === -1) {
    return { safetyPrefix, name: rest.trim(), typeName: "" };
  }

  const name = rest.slice(0, colonIdx).trim();
  const typeSection = rest.slice(colonIdx + 1).trim();
  // Base type name is the first space-delimited or angle-bracket-delimited token
  const baseName = typeSection.split(/[<\s]/)[0] ?? typeSection;

  return { safetyPrefix, name, typeName: baseName };
}

// ---------------------------------------------------------------------------
// Phase 4: Source-from origin taint map
//
// Maps recognised `source_from` origin prefixes to taint status.
// "tainted" origins produce bindings equivalent to `unsafe let`.
// "clean" origins produce plain (untainted) bindings.
// ---------------------------------------------------------------------------

const SOURCE_FROM_TAINTED_PREFIXES = [
  "Network.",
  "External.",
] as const;

const SOURCE_FROM_CLEAN_PREFIXES = [
  "InternalService.",
  "Config.",
] as const;

const SOURCE_FROM_TAINTED_EXACT = new Set([
  "Network.ClientSocket",
  "Network.HttpRequest",
  "Network.WebSocket",
]);

const SOURCE_FROM_CLEAN_EXACT = new Set([
  "Database.PrimaryKey",
]);

/**
 * Returns true if a `source_from` origin string denotes an untrusted source
 * (equivalent to `unsafe let` taint).
 *
 * FAIL-CLOSED (#153): an unknown / unrecognised origin is treated as TAINTED.
 * Only an origin that is explicitly allow-listed as clean (exact or prefix)
 * is trusted. This makes the taint-origin classifier deny-by-default: a
 * developer who introduces a new data source must register it as clean
 * before its values may flow into an injection sink unsanitised. The old
 * behaviour ("only flag what is known-bad") let any unregistered origin —
 * including a freshly-added external boundary — silently bypass taint
 * tracking.
 */
function isUntrustedSourceFromOrigin(origin: string): boolean {
  // An empty / absent origin carries no provenance evidence → tainted.
  if (origin.trim() === "") return true;
  // Explicit allow-list wins (exact match) so a clean leaf under an otherwise
  // tainted prefix can still be trusted.
  if (SOURCE_FROM_CLEAN_EXACT.has(origin)) return false;
  if (SOURCE_FROM_TAINTED_EXACT.has(origin)) return true;
  // Prefix matching — Network.* and External.* are tainted
  if (SOURCE_FROM_TAINTED_PREFIXES.some((p) => origin.startsWith(p))) return true;
  // InternalService.* and Config.* are clean
  if (SOURCE_FROM_CLEAN_PREFIXES.some((p) => origin.startsWith(p))) return false;
  // Unknown origins: FAIL CLOSED — treat as tainted (deny-by-default).
  return true;
}

// ---------------------------------------------------------------------------
// Phase 11B.1 — Taint expression analysis
//
// Determines whether an expression tree is derived from an unsafe or
// tainted binding. Validation / redaction calls break the taint chain.
// ---------------------------------------------------------------------------

/**
 * Returns true if `expr` references an unsafe or tainted binding anywhere in
 * its tree, UNLESS the expression is a recognised validation/redaction gate
 * (which breaks the taint chain).
 *
 * Phase 11B.2: accepts an optional `userGates` set so that user-defined gate
 * functions also break the taint chain.
 */
function isTaintedExpression(
  expr: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
  userGates?: ReadonlySet<string>,
): boolean {
  if (expr.kind === "identifier" && expr.value) {
    const binding = lookupBinding(expr.value);
    if (binding === undefined) return false;
    return binding.safetyPrefix === "unsafe" || (binding.tainted === true);
  }

  if (expr.kind === "memberExpr") {
    const receiver = expr.children?.[0];
    return receiver !== undefined && isTaintedExpression(receiver, lookupBinding, userGates);
  }

  // Phase 4.1: list/array literals — tainted if any element is tainted
  if (expr.kind === "listLiteral") {
    return (expr.children ?? []).some((element) =>
      isTaintedExpression(element, lookupBinding, userGates),
    );
  }

  if (expr.kind === "callExpr") {
    // Reconstruct the full qualified call name (e.g. "validate.searchQuery")
    // by combining the receiver identifier/memberExpr name with the method name.
    const fullCallName = buildFullCallName(expr);
    const methodNameOnly = expr.value ?? "";
    // Gate calls break the taint chain — validate.*, sanitize.*, redact*, etc.
    // Phase 11B.2: also check user-defined gates.
    // Also check the unqualified method name because buildFullCallName may incorrectly
    // treat the first argument as the receiver for standalone function calls like
    // validateAge(rawAge) → builds "rawAge.validateAge" instead of just "validateAge".
    if (isGateCallName(fullCallName, userGates) || isGateCallName(methodNameOnly, userGates)) return false;

    // Record literals parse as callExpr "#record" whose children are field-name
    // identifiers, each holding the field VALUE as its own child. A tainted field
    // value must keep the record tainted — otherwise `let m = { id: unsafeInput }`
    // followed by a sink call on `m` silently launders the taint (injection path).
    // Recurse on each field's value via isTaintedExpression so gate calls are honored.
    if (expr.value === "#record") {
      return (expr.children ?? []).some((field) => {
        const valueNode = field.children?.[0];
        return valueNode !== undefined && isTaintedExpression(valueNode, lookupBinding, userGates);
      });
    }

    // Phase 4.1: append(list, value) — if any non-receiver arg is tainted, result is tainted
    if (methodNameOnly === "append") {
      const args = expr.children?.slice(1) ?? [];
      // Also handle method-style call: receiver.append(taintedArg)
      // receiver is children[0] — only check args for taint in append
      if (args.some((a) => isTaintedExpression(a, lookupBinding, userGates))) return true;
      // Also check if this is standalone append(list, taintedVal) — all children are args
      const allArgs = expr.children ?? [];
      if (allArgs.some((a) => isTaintedExpression(a, lookupBinding, userGates))) return true;
      return false;
    }

    // For non-gate calls, check whether the receiver binding is itself tainted/unsafe,
    // OR whether any of the call arguments are tainted.
    // Note: the first child is the receiver (could be a namespace identifier or binding).
    const firstChild = expr.children?.[0];
    const args = expr.children?.slice(1) ?? [];

    // Check if receiver is a tainted/unsafe BINDING (not a namespace like "UsersDB")
    const receiverIsTainted =
      firstChild !== undefined &&
      firstChild.kind === "identifier" &&
      (() => {
        const b = lookupBinding(firstChild.value ?? "");
        return b?.safetyPrefix === "unsafe" || b?.tainted === true;
      })();

    // Also recurse into memberExpr receivers (e.g. obj.prop.method())
    const receiverMemberTainted =
      firstChild !== undefined &&
      firstChild.kind === "memberExpr" &&
      isTaintedExpression(firstChild, lookupBinding, userGates);

    const argsTainted = args.some((a) => isTaintedExpression(a, lookupBinding, userGates));
    return receiverIsTainted || receiverMemberTainted || argsTainted;
  }

  if (expr.kind === "binaryExpr") {
    const [left, right] = expr.children ?? [];
    return (
      (left !== undefined && isTaintedExpression(left, lookupBinding, userGates)) ||
      (right !== undefined && isTaintedExpression(right, lookupBinding, userGates))
    );
  }

  // errorPropagation (?) — the wrapped expression might be tainted
  if (expr.kind === "errorPropagation") {
    const inner = expr.children?.[0];
    return inner !== undefined && isTaintedExpression(inner, lookupBinding, userGates);
  }

  return false;
}

/**
 * Walks an expression tree to find the name of the first unsafe or tainted
 * binding identifier it references. Used for building diagnostic messages.
 */
function findTaintSourceName(
  expr: AstNode,
  lookupBinding: (name: string) => BindingInfo | undefined,
): string | undefined {
  if (expr.kind === "identifier" && expr.value) {
    const binding = lookupBinding(expr.value);
    if (binding?.safetyPrefix === "unsafe") return binding.name;
    if (binding?.tainted === true) return binding.taintSource ?? binding.name;
  }
  for (const child of expr.children ?? []) {
    const found = findTaintSourceName(child, lookupBinding);
    if (found !== undefined) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Value-state checker implementation
// ---------------------------------------------------------------------------

class ValueStateChecker {
  private readonly diagnostics: ValueStateDiagnostic[] = [];
  // Binding scope stack — innermost scope is last
  private readonly scopes: Array<Map<string, BindingInfo>> = [];
  // Phase 11B.2: user-defined gate function names (collected from fnDecl nodes)
  private readonly userGates: ReadonlySet<string>;
  // Phase 4.3: user-defined flow names (collected from *flowDecl nodes)
  private readonly userFlows: ReadonlySet<string>;
  // RD-0659: opt-in aliases backed by Authority<Tag>.
  private readonly authorityTypes: ReadonlySet<string>;
  // R&D 0093: the flow-kind currently being walked, so registerParamBinding knows whether
  // a bare param sits at a posture-gated entry boundary (secure/guarded → boundary-untrusted).
  private currentFlowKind: string | undefined;
  // Preserve secret provenance across returns by comparing the expression with
  // the enclosing flow's declared result type.
  private currentFlowReturnType: string | undefined;
  // C1: per-flow `let x = Module` alias map, set on flow entry; resolves an aliased sink receiver
  // (`x.write` → `AuditLog.write`) so the taint/sink gates aren't smuggled past by a rename.
  private moduleAliases: ReadonlyMap<string, string> = new Map();
  // R&D 0093 stage-2: production/deterministic builds escalate FUNGI-VALUESTATE-008 to error.
  private readonly mode: "production" | "development";
  // RD-0858: name-based gates are never declassifiers while traversing a
  // requirement constraint. Only shared exact Task-1/Task-2 matches discharge.
  private insideRequirementConstraint = false;
  // Confidentiality of writes depends on the active control predicates, not only on
  // the explicit RHS value. Incremented while visiting secret-selected branches.
  private secretControlDepth = 0;
  private readonly matchedRequirementValidators: ReadonlySet<AstNode>;

  constructor(
    userGates: ReadonlySet<string> = new Set(),
    userFlows: ReadonlySet<string> = new Set(),
    authorityTypes: ReadonlySet<string> = new Set(),
    mode: "production" | "development" = "development",
    matchedRequirementValidators: ReadonlySet<AstNode> = new Set(),
  ) {
    this.userGates = userGates;
    this.userFlows = userFlows;
    this.authorityTypes = authorityTypes;
    this.mode = mode;
    this.matchedRequirementValidators = matchedRequirementValidators;
  }

  check(ast: AstNode): void {
    this.pushScope();
    this.walkNode(ast);
    this.popScope();
  }

  getResult(): ValueStateCheckResult {
    return { diagnostics: [...this.diagnostics] };
  }

  // ── Scope management ─────────────────────────────────────────────────────

  private pushScope(): void {
    this.scopes.push(new Map());
  }

  private popScope(): void {
    this.scopes.pop();
  }

  private currentScope(): Map<string, BindingInfo> {
    return this.scopes[this.scopes.length - 1] ?? new Map();
  }

  private lookupBinding(name: string): BindingInfo | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const info = this.scopes[i]!.get(name);
      if (info !== undefined) return info;
    }
    return undefined;
  }

  private registerBinding(info: BindingInfo): void {
    this.currentScope().set(info.name, info);
  }

  /**
   * Update an existing binding in the nearest scope where it is defined.
   * Used to re-derive a binding's value-state flags (e.g. on reassignment / derivation).
   */
  private updateBinding(name: string, patch: Partial<BindingInfo>): void {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const scope = this.scopes[i]!;
      const existing = scope.get(name);
      if (existing !== undefined) {
        scope.set(name, { ...existing, ...patch });
        return;
      }
    }
  }

  private snapshotScopes(): Array<Map<string, BindingInfo>> {
    return this.scopes.map((scope) => new Map(scope));
  }

  private restoreScopes(snapshot: Array<Map<string, BindingInfo>>): void {
    this.scopes.splice(0, this.scopes.length, ...snapshot.map((scope) => new Map(scope)));
  }

  private joinSecretStates(
    baseline: Array<Map<string, BindingInfo>>,
    outcomes: Array<Array<Map<string, BindingInfo>>>,
    includeAffineConsumption = true,
  ): void {
    for (let scopeIndex = 0; scopeIndex < baseline.length; scopeIndex++) {
      const scope = baseline[scopeIndex]!;
      for (const [name, original] of scope) {
        const branchBindings = outcomes
          .map((outcome) => outcome[scopeIndex]?.get(name))
          .filter((binding): binding is BindingInfo => binding !== undefined);
        const current = this.scopes[scopeIndex]?.get(name);
        if (current === undefined || branchBindings.length === 0) continue;

        const tainted = branchBindings.some((binding) => binding.tainted === true);
        const consumed = includeAffineConsumption
          ? branchBindings.some((binding) => binding.consumed === true)
          : original.consumed === true;
        const consumedAt = consumed
          ? (includeAffineConsumption
            ? branchBindings.find((binding) => binding.consumedAt !== undefined)?.consumedAt
            : original.consumedAt)
          : undefined;
        const taintSource = branchBindings.find((binding) => binding.taintSource !== undefined)?.taintSource;
        let typeName = current.typeName;
        if (branchBindings.some((binding) => binding.typeName === "SecureString")) {
          typeName = "SecureString";
        } else if (original.typeName === "SecureString") {
          // Declassification can clear a previously-secret mutable only when every
          // reachable arm clears it. If arms disagree on the remaining type, retain
          // the baseline marker conservatively.
          const resultingTypes = new Set(branchBindings.map((binding) => binding.typeName));
          if (resultingTypes.size === 1) {
            typeName = branchBindings[0]!.typeName;
          }
        }
        const {
          taintSource: _previousTaintSource,
          consumedAt: _previousConsumedAt,
          ...base
        } = current;
        const joined: BindingInfo = {
          ...base,
          typeName,
          tainted,
          embeddingDerived: branchBindings.some((binding) => binding.embeddingDerived === true),
          consumed,
          ...(tainted && taintSource !== undefined ? { taintSource } : {}),
          ...(consumed && consumedAt !== undefined ? { consumedAt } : {}),
        };
        this.scopes[scopeIndex]!.set(name, joined);
      }
    }
  }

  private walkUnderSecretControl(node: AstNode, secretControlled: boolean): void {
    if (secretControlled) this.secretControlDepth++;
    try {
      this.walkNode(node);
    } finally {
      if (secretControlled) this.secretControlDepth--;
    }
  }

  /** Move one authority binding. Unknown/non-authority names are inert. */
  private consumeAuthorityBinding(name: string, at: SourceLocation | undefined): void {
    const binding = this.lookupBinding(name);
    if (binding?.authorityType === undefined) return;
    if (binding.consumed === true) {
      this.diagnostics.push(makeVSDiag(
        "FUNGI-AFFINE-002",
        "AUTHORITY_CONSUMED_TWICE",
        `Authority value '${binding.name}' of type '${binding.authorityType}' was already transferred and cannot be used again.`,
        at,
        `Use the value produced by the first transfer, or obtain a fresh '${binding.authorityType}' from its runtime mint.`,
        undefined,
        binding.consumedAt !== undefined
          ? { relatedLocations: [{ message: "first transferred here", location: binding.consumedAt }] }
          : undefined,
      ));
      return;
    }
    this.updateBinding(
      name,
      at !== undefined ? { consumed: true, consumedAt: at } : { consumed: true },
    );
  }

  /** Collect direct call arguments, recursing through data wrappers but not nested calls. */
  private collectAuthorityArguments(node: AstNode): AstNode[] {
    const authorityArguments: AstNode[] = [];
    const collect = (candidate: AstNode): void => {
      if (candidate.kind === "callExpr") return;
      if (candidate.kind === "identifier" && (candidate.children ?? []).length === 0) {
        if (this.lookupBinding(candidate.value ?? "")?.authorityType !== undefined) {
          authorityArguments.push(candidate);
        }
        return;
      }
      for (const child of candidate.children ?? []) collect(child);
    };
    for (const child of node.children ?? []) collect(child);
    return authorityArguments;
  }

  private emitAuthorityContainment(
    authorityIdentifiers: readonly AstNode[],
    location: SourceLocation | undefined,
  ): void {
    for (const identifier of authorityIdentifiers) {
      const binding = this.lookupBinding(identifier.value ?? "");
      this.diagnostics.push(makeVSDiag(
        "FUNGI-AFFINE-004",
        "AUTHORITY_CONTAINMENT_FORBIDDEN",
        `Authority value '${binding?.name ?? identifier.value ?? "?"}' cannot be nested in an ordinary record, list, or payload.`,
        location,
        "Transfer the authority as a direct argument or return value; put only non-authorizing identity and evidence in data containers.",
        undefined,
        binding?.declaredAt !== undefined
          ? { relatedLocations: [{ message: "authority declared here", location: binding.declaredAt }] }
          : undefined,
      ));
    }
  }

  // ── AST walker ───────────────────────────────────────────────────────────

  private walkNode(node: AstNode): void {
    switch (node.kind) {
      case "program":
        this.walkChildren(node);
        break;

      case "flowDecl":
      case "secureFlowDecl":
      case "pureFlowDecl":
      // #0093 / guarded-flow fail-open fix: `guardedFlowDecl` was omitted here, so
      // guarded-flow params were NEVER registered as value-state bindings — a
      // tainted/untrusted-origin param reaching a governed sink emitted ZERO
      // diagnostics (FUNGI-VALUESTATE-003/004/005 all silent) for the whole tier.
      // Every sibling pass (runtime, effect-checker, taint-checker) already
      // enumerates guardedFlowDecl; the value-state checker was the lone omission.
      // R&D 0120: `governedFlowDecl` (a `governed floor_N flow …` Tower-floor entry, parser.ts:947)
      // was the SAME omission — value-state had ZERO references to it, so a governed flow's tainted
      // params reached governed sinks with no FUNGI-VALUESTATE-003/004/005 (the 0093 fail-open class).
      // A governed flow IS a posture-gated boundary, so it registers params + is treated like secure/guarded.
      case "governedFlowDecl":
      case "guardedFlowDecl": {
        this.pushScope();
        const prevFlowKind = this.currentFlowKind;
        const prevFlowReturnType = this.currentFlowReturnType;
        const prevAliases = this.moduleAliases;
        const prevSecretControlDepth = this.secretControlDepth;
        this.secretControlDepth = 0;
        try {
          this.currentFlowKind = node.kind; // R&D 0093: posture context for registerParamBinding
          this.currentFlowReturnType = (node.children ?? []).find((child) => child.kind === "typeRef")?.value;
          this.moduleAliases = buildModuleAliasMap(node); // C1: flow-scoped `let x = Module` aliases
          // Register parameter bindings so SecureString params are tracked
          for (const child of node.children ?? []) {
            if (child.kind === "paramDecl") {
              this.registerParamBinding(child);
            }
          }
          this.walkChildren(node);
        } finally {
          this.secretControlDepth = prevSecretControlDepth;
          this.moduleAliases = prevAliases;
          this.currentFlowReturnType = prevFlowReturnType;
          this.currentFlowKind = prevFlowKind;
          this.popScope();
        }
        break;
      }

      case "block": {
        const inheritedSecretControlDepth = this.secretControlDepth;
        this.pushScope();
        let resultingSecretControlDepth = inheritedSecretControlDepth;
        try {
          for (const child of node.children ?? []) {
            this.walkNode(child);
          }
        } finally {
          resultingSecretControlDepth = this.secretControlDepth;
          this.secretControlDepth = inheritedSecretControlDepth;
          this.popScope();
        }
        // A nested conditional may return on a secret-dependent path while
        // allowing its enclosing block to continue on the other path. That
        // continuation dependency survives the nested lexical scope and must
        // remain visible to statements after the block.
        if (!definitelyTerminates(node)) {
          this.secretControlDepth = Math.max(inheritedSecretControlDepth, resultingSecretControlDepth);
        }
        break;
      }

      case "requirementConstraint": {
        const previous = this.insideRequirementConstraint;
        this.insideRequirementConstraint = true;
        this.walkChildren(node);
        this.insideRequirementConstraint = previous;
        break;
      }

      case "letDecl":
        this.handleLetDecl(node);
        break;

      case "readonlyDecl":
        // Immutable locals carry the same confidentiality and binding-identity
        // facts as `let`; omitting them makes a readonly shadow look intrinsic.
        this.handleLetDecl(node);
        break;

      case "recordDecl": {
        for (const field of node.children ?? []) {
          if (field.kind !== "paramDecl") continue;
          const fieldType = String(field.value ?? "").split(":").slice(1).join(":").trim();
          if (!this.authorityTypes.has(fieldType)) continue;
          this.diagnostics.push(makeVSDiag(
            "FUNGI-AFFINE-004",
            "AUTHORITY_CONTAINMENT_FORBIDDEN",
            `Record '${node.value ?? "?"}' cannot contain authority field '${field.value ?? "?"}'.`,
            field.location ?? node.location,
            "Store a non-authorizing identity or evidence reference instead; pass live authority separately.",
          ));
        }
        this.walkChildren(node);
        break;
      }

      case "mutDecl":
        this.handleMutDecl(node);
        break;

      case "assignStmt":
        this.handleAssignStmt(node);
        break;

      case "returnStmt": {
        const returned = node.children?.[0];
        if (
          returned !== undefined
          && this.currentFlowKind !== undefined
          && !returnTypePreservesSecretLabel(this.currentFlowReturnType)
          && derivesFromSecret(returned, (name) => this.lookupBinding(name), this.moduleAliases)
        ) {
          const returnType = this.currentFlowReturnType ?? "an unqualified result";
          this.diagnostics.push({
            code: "FUNGI-SECRET-006",
            name: "SECRET_CROSSES_FLOW_BOUNDARY",
            severity: this.mode === "production" ? "error" : "warning",
            message: `A secret-derived value is returned as '${returnType}', which does not preserve the SecureString confidentiality label. Preserve a secret-bearing result type or explicitly redact before returning.`,
            ...(node.location !== undefined ? { location: node.location } : {}),
            suggestedFix: "Return SecureString (or a result type containing it), or explicitly redact the value before return.",
            why: "A return boundary with an ordinary result type would erase the compiler's secret provenance for callers.",
            risk: "A caller may treat returned secret bytes as an ordinary value and pass them to an unguarded sink.",
          });
        }
        if (returned?.kind === "identifier") {
          this.consumeAuthorityBinding(returned.value ?? "", node.location);
        }
        this.walkChildren(node);
        break;
      }

      case "trapDecl":
        // VSC-002 (owner decision A, 2026-06-16): `trap` does NOT declassify — it is a runtime
        // guard/invariant with no value-state effect. Declassification requires an explicit
        // validate.* / sanitize.* / redact() gate (the only fail-closed contract).
        break;

      case "callExpr":
        this.handleCallExpr(node);
        // Walk children to catch nested governed-sink / log calls
        this.walkChildren(node);
        break;

      case "binaryExpr":
        this.handleBinaryExpr(node);
        for (const child of evaluatedExpressionChildren(node)) this.walkNode(child);
        break;

      case "matchExpr":
        this.handleMatchExpr(node);
        break;

      case "checkExpr":
      case "prefilterExpr":
        this.handleVerdictBranchExpr(node);
        break;

      case "ifStmt":
        this.handleIfStmt(node);
        break;

      case "whileStmt":
        this.handleWhileStmt(node);
        break;

      default:
        this.walkChildren(node);
        break;
    }
  }

  /**
   * Handle if/else statements:
   *
   * 1. Task 1 (VALUESTATE-002): detect when one branch uses `safe mut` with a
   *    gate and the other uses `safe mut` without a gate — UnsafeConditionalUpgrade.
   *
   * 2. Task 2 (cross-conditional taint): if the condition references an unsafe
   *    binding via a non-gate expression, taint propagates into both branches
   *    regardless (only gate calls in the RHS of a binding clear taint).
   */
  private handleIfStmt(node: AstNode): void {
    const [_condition, thenBlock, elseBlock] = node.children ?? [];
    const secretCondition =
      _condition !== undefined && derivesFromSecret(_condition, (name) => this.lookupBinding(name), this.moduleAliases);

    // Walk the condition expression first (does NOT clear taint).
    if (_condition !== undefined) {
      this.walkNode(_condition);

      // FUNGI-SECRET-004 — secret-dependent branch = timing side-channel (CWE-208): the arm taken (and thus
      // observable execution time) depends on secret material. constantTimeEquals()/redact() are the
      // sanctioned declassifiers (already exempt in derivesFromSecret), so the canonical secure comparison
      // is NOT flagged. Advisory WARNING (not mode-gated to error): unlike secret EGRESS, secret BRANCHING
      // is sometimes benign (provably balanced arms), so this surfaces the pattern for review rather than
      // blocking. (RD-0130 #3 constant-time lint; the honest scope of "side-channel resistance".)
      if (secretCondition) {
        this.diagnostics.push({
          code: "FUNGI-SECRET-004",
          name: "SECRET_DEPENDENT_BRANCH",
          severity: "warning",
          message: `This 'if' branches on a secret-derived value, so the arm taken — and thus the flow's observable execution time — depends on secret material (timing side-channel, CWE-208).`,
          ...(_condition.location !== undefined ? { location: _condition.location } : {}),
          suggestedFix: `Compare secrets with Crypto.constantTimeEquals(...), redact(...) before branching, or confirm both arms are constant-time.`,
          why: `Branch selection on secret material makes the observable timing data-dependent; an attacker who can measure latency can recover bits of the secret.`,
          risk: `Timing analysis of the two arms can leak the secret (the classic case: early-return on the first mismatching byte of a comparison).`,
        });
      }
    }

    // Walk then/else branches and collect safe-mut declarations from each.
    if (thenBlock !== undefined && elseBlock !== undefined) {
      // Collect safe-mut declarations in then-branch
      const thenSafeMuts = this.collectSafeMutDecls(thenBlock);
      // Collect safe-mut declarations in else-branch
      const elseSafeMuts = this.collectSafeMutDecls(elseBlock);

      // Check for asymmetric gate usage (VALUESTATE-002).
      for (const [name, thenHasGate] of thenSafeMuts) {
        const elseHasGate = elseSafeMuts.get(name);
        if (elseHasGate !== undefined) {
          // Same name appears in both branches as safe mut.
          if (thenHasGate && !elseHasGate) {
            // then-branch has gate, else doesn't
            this.diagnostics.push(makeVSDiag(
              "FUNGI-VALUESTATE-002",
              "UNSAFE_CONDITIONAL_UPGRADE",
              `'safe mut ${name}' is used in both branches of an if/else, but only the 'if' branch uses a recognised gate. Both branches must validate before upgrading to safe.`,
              elseBlock.location,
              `Add a gate in the else branch: safe mut ${name} = validate.${name}(${name})?`,
              `safe mut ${name} = validate.${name}(${name})?`,
            ));
          } else if (!thenHasGate && elseHasGate) {
            // else-branch has gate, then doesn't
            this.diagnostics.push(makeVSDiag(
              "FUNGI-VALUESTATE-002",
              "UNSAFE_CONDITIONAL_UPGRADE",
              `'safe mut ${name}' is used in both branches of an if/else, but only the 'else' branch uses a recognised gate. Both branches must validate before upgrading to safe.`,
              thenBlock.location,
              `Add a gate in the if branch: safe mut ${name} = validate.${name}(${name})?`,
              `safe mut ${name} = validate.${name}(${name})?`,
            ));
          }
        }
      }
    }

    // Each arm starts from the same incoming state. Join secret confidentiality
    // after both arms so visitation order cannot erase a secret on the other path.
    const baseline = this.snapshotScopes();
    const baselineSecretControlDepth = this.secretControlDepth;
    const outcomes: Array<Array<Map<string, BindingInfo>>> = [];
    const continuingControlDepths: number[] = [];
    const thenTerminates = thenBlock !== undefined && definitelyTerminates(thenBlock);
    const elseTerminates = elseBlock !== undefined && definitelyTerminates(elseBlock);
    if (thenBlock !== undefined) {
      this.restoreScopes(baseline);
      this.secretControlDepth = baselineSecretControlDepth;
      this.walkUnderSecretControl(thenBlock, secretCondition);
      if (!thenTerminates) {
        outcomes.push(this.snapshotScopes());
        continuingControlDepths.push(this.secretControlDepth);
      }
    } else {
      outcomes.push(this.snapshotScopes());
      continuingControlDepths.push(baselineSecretControlDepth);
    }
    this.restoreScopes(baseline);
    this.secretControlDepth = baselineSecretControlDepth;
    if (elseBlock !== undefined) {
      this.walkUnderSecretControl(elseBlock, secretCondition);
      if (!elseTerminates) {
        outcomes.push(this.snapshotScopes());
        continuingControlDepths.push(this.secretControlDepth);
      }
    } else {
      // The condition may be false, in which case the incoming value survives.
      outcomes.push(baseline);
      continuingControlDepths.push(baselineSecretControlDepth);
    }
    this.restoreScopes(baseline);
    if (outcomes.length > 0) this.joinSecretStates(baseline, outcomes);
    this.secretControlDepth = continuingControlDepths.length === 0
      ? baselineSecretControlDepth
      : Math.max(...continuingControlDepths);

    // If one secret-controlled arm exits and the other continues, reaching the
    // next statement itself reveals which predicate outcome occurred. Keep that
    // implicit-flow label through the remainder of the enclosing block.
    if (secretCondition && thenTerminates !== elseTerminates) {
      this.secretControlDepth = Math.max(
        this.secretControlDepth,
        baselineSecretControlDepth + 1,
      );
    }
  }

  /** Track secret-dependent loop entry/exit, body effects, and later-iteration state. */
  private handleWhileStmt(node: AstNode): void {
    const [condition, body] = node.children ?? [];
    if (condition === undefined || body === undefined) {
      this.walkChildren(node);
      return;
    }

    const baseline = this.snapshotScopes();
    const baselineSecretControlDepth = this.secretControlDepth;
    const diagnosticStart = this.diagnostics.length;
    const loopDiagnostics = new Map<string, ValueStateDiagnostic>();
    const rememberDiagnostics = (): void => {
      for (const diagnostic of this.diagnostics.splice(diagnosticStart)) {
        loopDiagnostics.set(JSON.stringify(diagnostic), diagnostic);
      }
    };
    const stateKey = (scopes: Array<Map<string, BindingInfo>>, depth: number): string =>
      JSON.stringify([scopes.map((scope) => [...scope.entries()]), depth]);

    let headScopes = baseline;
    let headSecretControlDepth = baselineSecretControlDepth;
    let warnedForSecretCondition = false;
    const maxIterations = Math.max(2, baseline.reduce((count, scope) => count + scope.size, 0) * 4 + 4);

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      this.restoreScopes(headScopes);
      this.secretControlDepth = headSecretControlDepth;
      const secretCondition = derivesFromSecret(condition, (name) => this.lookupBinding(name), this.moduleAliases);
      this.walkNode(condition);
      const conditionOutcome = this.snapshotScopes();
      if (secretCondition && !warnedForSecretCondition) {
        warnedForSecretCondition = true;
        this.diagnostics.push({
          code: "FUNGI-SECRET-004",
          name: "SECRET_DEPENDENT_BRANCH",
          severity: "warning",
          message: "This 'while' loop continues according to a secret-derived value, so its body execution count and observable timing depend on secret material (timing side-channel, CWE-208).",
          ...(condition.location !== undefined ? { location: condition.location } : {}),
          suggestedFix: "Use a public loop bound or a reviewed constant-time primitive for secret processing.",
          why: "A secret-dependent loop condition can reveal information through iteration count, early exit, or loop-body effects.",
          risk: "Timing analysis of loop duration can disclose secret-dependent state.",
        });
      }

      this.walkUnderSecretControl(body, secretCondition);
      rememberDiagnostics();

      let nextHeadScopes = baseline;
      const bodyTerminates = definitelyTerminates(body);
      const bodyOutcome = this.snapshotScopes();
      const bodySecretControlDepth = this.secretControlDepth;
      // Secret control is a finite lattice fact, not a nesting counter across
      // iterations. Saturating its continuation label at baseline+1 guarantees
      // the loop-head state can converge instead of growing once per pass.
      let nextHeadSecretControlDepth =
        secretCondition || bodySecretControlDepth > baselineSecretControlDepth
          ? baselineSecretControlDepth + 1
          : baselineSecretControlDepth;
      // Only a body with a reachable backedge can transfer its ownership/value
      // state to another iteration. A returning body can still make reaching
      // the continuation secret-dependent, but its consumed authority and writes
      // do not reach that continuation.
      this.restoreScopes(baseline);
      if (bodyTerminates && secretCondition) {
        // A condition-side affine transfer reaches the false exit. A
        // secret-controlled terminating body contributes taint/control facts,
        // but its consumed authority and writes do not reach the continuation.
        this.joinSecretStates(baseline, [conditionOutcome]);
        const conditionJoined = this.snapshotScopes();
        this.restoreScopes(conditionJoined);
        this.joinSecretStates(conditionJoined, [bodyOutcome], false);
      } else {
        this.joinSecretStates(
          baseline,
          bodyTerminates ? [conditionOutcome] : [conditionOutcome, bodyOutcome],
        );
      }
      nextHeadScopes = this.snapshotScopes();

      const stable = stateKey(headScopes, headSecretControlDepth) ===
        stateKey(nextHeadScopes, nextHeadSecretControlDepth);
      headScopes = nextHeadScopes;
      headSecretControlDepth = nextHeadSecretControlDepth;
      // A terminating body has no backedge. Replaying the condition would
      // invent another affine use that cannot occur at runtime.
      if (bodyTerminates || stable) break;
      if (iteration === maxIterations - 1) {
        // The transfer operates over finite, monotone binding facts (taint,
        // embedding derivation, and affine consumption) and a saturated control
        // label. Never publish a capped, non-fixed-point state if that invariant
        // is violated by a future checker change.
        throw new Error("value-state while analysis did not converge within its finite state bound");
      }
    }

    this.restoreScopes(headScopes);
    this.secretControlDepth = headSecretControlDepth;
    this.diagnostics.push(...loopDiagnostics.values());
  }

  private handleMatchExpr(node: AstNode): void {
    const [subject, ...arms] = node.children ?? [];
    if (subject !== undefined) this.walkNode(subject);
    const subjectIsSecret =
      subject !== undefined && derivesFromSecret(subject, (name) => this.lookupBinding(name), this.moduleAliases);
    const baseline = this.snapshotScopes();
    const baselineSecretControlDepth = this.secretControlDepth;
    const outcomes: Array<Array<Map<string, BindingInfo>>> = [];
    const continuingControlDepths: number[] = [];
    const hasWildcard = arms.some(isCatchAllMatchArm);
    let fallthroughScopes = baseline;
    let priorGuardIsSecret = false;
    let priorSubjectPatternIsSecret = false;
    let hasSecretTerminatingPath = false;
    let secretControlLocation: SourceLocation | undefined;

    for (const arm of arms) {
      this.restoreScopes(fallthroughScopes);
      this.secretControlDepth = baselineSecretControlDepth;
      if (arm.kind !== "matchArm") {
        const secretControlled = priorSubjectPatternIsSecret || priorGuardIsSecret;
        const terminates = definitelyTerminates(arm);
        try {
          this.walkUnderSecretControl(arm, secretControlled);
          if ((terminates || containsTerminalExitStatement(arm)) && secretControlled) {
            hasSecretTerminatingPath = true;
          }
          if (!terminates) {
            outcomes.push(this.snapshotScopes());
            continuingControlDepths.push(this.secretControlDepth);
          }
        } finally {
          this.secretControlDepth = baselineSecretControlDepth;
        }
        continue;
      }

      const armBaselineSecretControlDepth = baselineSecretControlDepth;
      let armTerminates = false;
      let armControlDepth = baselineSecretControlDepth;
      let armGuardFallthrough = fallthroughScopes;
      try {
        this.pushScope();
        const children = arm.children ?? [];
        const guard = arm.value === "__guard__" ? children[0] : undefined;
        const body = [...children].reverse().find((child) => child.kind !== "identifier");
        if (arm.value !== "__guard__") {
          for (const child of children.slice(0, -1)) {
            if (child.kind === "identifier") {
              const name = child.value ?? "";
              if (name !== "") {
                this.registerBinding({
                  name,
                  safetyPrefix: undefined,
                  typeName: subjectIsSecret ? "SecureString" : "",
                  ...(child.location !== undefined ? { declaredAt: child.location } : {}),
                });
              }
            }
          }
        }
        if (guard !== undefined) {
          this.walkNode(guard);
          // A false guard reaches the next arm after its effects. Pattern
          // bindings belong only to this arm and must not escape into that path.
          armGuardFallthrough = this.snapshotScopes().slice(0, -1);
        }
        const guardIsSecret =
          guard !== undefined && derivesFromSecret(guard, (name) => this.lookupBinding(name), this.moduleAliases);
        const subjectPatternIsSecret = subjectIsSecret
          && arm.value !== "__guard__"
          && !isCatchAllMatchArm(arm);
        const secretControlled =
          subjectPatternIsSecret || priorSubjectPatternIsSecret || priorGuardIsSecret || guardIsSecret;
        if (secretControlled && secretControlLocation === undefined) {
          secretControlLocation = guard?.location
            ?? (subjectPatternIsSecret ? subject?.location : undefined)
            ?? arm.location;
        }
        armTerminates = body !== undefined && definitelyTerminates(body);
        if (body !== undefined) {
          // Ordered guards make every later arm depend on earlier guard failures.
          // Preserve that control label through fallback arms, not just the arm
          // whose guard directly reads the secret.
          this.walkUnderSecretControl(body, secretControlled);
        }
        armControlDepth = this.secretControlDepth;
        if ((armTerminates || containsTerminalExitStatement(body)) && secretControlled) {
          hasSecretTerminatingPath = true;
        }
        priorSubjectPatternIsSecret ||= subjectPatternIsSecret;
        priorGuardIsSecret ||= guardIsSecret;
      } finally {
        this.popScope();
        this.secretControlDepth = armBaselineSecretControlDepth;
      }
      if (!armTerminates) {
        outcomes.push(this.snapshotScopes());
        continuingControlDepths.push(armControlDepth);
      }
      fallthroughScopes = armGuardFallthrough;
    }

    if (secretControlLocation !== undefined) {
      this.diagnostics.push({
        code: "FUNGI-SECRET-004",
        name: "SECRET_DEPENDENT_BRANCH",
        severity: "warning",
        message: "This match selects an arm using a secret-derived pattern or guard, so the selected path and observable execution time may depend on secret material (timing side-channel, CWE-208).",
        location: secretControlLocation,
        suggestedFix: "Compare secrets with Crypto.constantTimeEquals(...), or review whether every match arm is observationally equivalent.",
        why: "Dispatch on secret material can make execution paths observable and disclose information through timing or other side channels.",
        risk: "Timing analysis of distinguishable match arms can leak information about the secret.",
      });
    }

    if (!hasWildcard) {
      outcomes.unshift(fallthroughScopes);
      continuingControlDepths.push(baselineSecretControlDepth);
    }
    this.restoreScopes(baseline);
    this.joinSecretStates(baseline, outcomes);
    this.secretControlDepth = continuingControlDepths.length === 0
      ? baselineSecretControlDepth
      : Math.max(...continuingControlDepths);
    if (hasSecretTerminatingPath && continuingControlDepths.length > 0) {
      this.secretControlDepth = Math.max(
        this.secretControlDepth,
        baselineSecretControlDepth + 1,
      );
    }
  }

  /** Forks and joins the statement arms of check/prefilter under their Verdict selector. */
  private handleVerdictBranchExpr(node: AstNode): void {
    const [subject, ...arms] = node.children ?? [];
    if (subject !== undefined) this.walkNode(subject);
    const secretSubject =
      subject !== undefined && derivesFromSecret(subject, (name) => this.lookupBinding(name), this.moduleAliases);
    const baseline = this.snapshotScopes();
    const baselineSecretControlDepth = this.secretControlDepth;
    const outcomes: Array<Array<Map<string, BindingInfo>>> = [];
    const continuingControlDepths: number[] = [];
    const armKind = node.kind === "checkExpr" ? "checkArm" : "prefilterArm";
    const required = node.kind === "checkExpr"
      ? ["if", "deny", "ambig"]
      : ["deny", "maybe"];
    const seen = new Set<string>();
    let hasSecretTerminatingPath = false;

    for (const arm of arms) {
      this.restoreScopes(baseline);
      this.secretControlDepth = baselineSecretControlDepth;
      let terminates = false;
      if (arm.kind !== armKind) {
        terminates = definitelyTerminates(arm);
        this.walkUnderSecretControl(arm, secretSubject);
      } else {
        seen.add(arm.value ?? "");
        const body = arm.children?.[0];
        terminates = body !== undefined && definitelyTerminates(body);
        if (body !== undefined) this.walkUnderSecretControl(body, secretSubject);
      }
      if (terminates && secretSubject) hasSecretTerminatingPath = true;
      if (!terminates) {
        outcomes.push(this.snapshotScopes());
        continuingControlDepths.push(this.secretControlDepth);
      }
      this.secretControlDepth = baselineSecretControlDepth;
    }

    // A malformed or not-yet-exhaustive tree retains the incoming path; the
    // parser/governance check reports the shape error independently.
    if (required.some((label) => !seen.has(label))) {
      outcomes.push(baseline);
      continuingControlDepths.push(baselineSecretControlDepth);
    }
    this.restoreScopes(baseline);
    this.joinSecretStates(baseline, outcomes);
    this.secretControlDepth = continuingControlDepths.length === 0
      ? baselineSecretControlDepth
      : Math.max(...continuingControlDepths);
    if (secretSubject && hasSecretTerminatingPath && continuingControlDepths.length > 0) {
      this.secretControlDepth = Math.max(
        this.secretControlDepth,
        baselineSecretControlDepth + 1,
      );
    }
  }

  /**
   * Shallowly scan a block or node for `mutDecl` nodes with `safe` prefix,
   * returning a map of binding name → whether the RHS is a gate expression.
   * Only looks one level deep (direct children of the block).
   */
  private collectSafeMutDecls(block: AstNode): Map<string, boolean> {
    const result = new Map<string, boolean>();
    const stmts = block.kind === "block" ? (block.children ?? []) : [block];
    for (const stmt of stmts) {
      if (stmt.kind === "mutDecl") {
        const info = parseBindingValue(stmt.value ?? "");
        if (info.safetyPrefix === "safe") {
          const init = stmt.children?.[0];
          const hasGate = init !== undefined && this.isGateExpression(init);
          result.set(info.name, hasGate);
        }
      }
    }
    return result;
  }

  private walkChildren(node: AstNode): void {
    for (const child of node.children ?? []) {
      this.walkNode(child);
    }
  }

  // ── Binding handlers ─────────────────────────────────────────────────────

  private registerParamBinding(node: AstNode): void {
    // paramDecl.value = "[qualifiers ]name: Type[ source_from Origin]" where leading qualifiers are
    // any of `readonly` / `tainted` (34A). Extract the bare name as the LAST whitespace token before
    // the colon; read qualifiers from the preceding tokens.
    const paramValue = node.value ?? "";
    const colonIdx = paramValue.indexOf(":");
    if (colonIdx === -1) return;
    const namePart = paramValue.slice(0, colonIdx).trim();
    const nameTokens = namePart.split(/\s+/).filter(Boolean);
    const name = nameTokens[nameTokens.length - 1] ?? namePart;
    // 34A: an explicit `tainted` param is untrusted input — closes the param-trusted-by-default
    // fail-OPEN (0031). Bare params stay trusted (opt-in, non-breaking).
    const isTaintedParam = nameTokens.slice(0, -1).includes("tainted");
    const typeSection = paramValue.slice(colonIdx + 1).trim();

    // Phase 4.4: detect `source_from` annotation in the type section
    // Format: "Type source_from Origin" (e.g. "String source_from Network.ClientSocket")
    const sourceFromIdx = typeSection.indexOf("source_from");
    let typeName: string;
    let sourceFromOrigin: string | undefined;
    if (sourceFromIdx !== -1) {
      typeName = typeSection.slice(0, sourceFromIdx).trim().split(/[<\s]/)[0] ?? "";
      sourceFromOrigin = typeSection.slice(sourceFromIdx + "source_from".length).trim();
    } else {
      typeName = typeSection.split(/[<\s]/)[0] ?? typeSection;
    }

    const locField = node.location !== undefined ? { declaredAt: node.location } : {};
    const authorityField = this.authorityTypes.has(typeName) ? { authorityType: typeName } : {};
    // NET-NEW 0111: a Passport-typed param enters at Raw (stage 0) — the most restricted stage.
    const passportField: { passportStage?: PassportStageV } = /Passport/i.test(typeName) ? { passportStage: 0 } : {};

    // Phase 4.4: auto-taint params from untrusted source_from origins.
    // 34A: an explicit `tainted` qualifier does the same, without needing a source_from origin.
    // Treat both as `unsafe`-equivalent (safetyPrefix = "unsafe") so the existing
    // VALUESTATE-003/004/005 sink guards fire normally — no new diagnostic codes.
    const untrusted = isTaintedParam
      || (sourceFromOrigin !== undefined && isUntrustedSourceFromOrigin(sourceFromOrigin));
    if (untrusted) {
      this.registerBinding({ name, safetyPrefix: "unsafe", typeName, ...locField, ...passportField, ...authorityField });
    } else if (this.currentFlowKind === "secureFlowDecl" || this.currentFlowKind === "guardedFlowDecl" || this.currentFlowKind === "governedFlowDecl") {
      // R&D 0093 "34B hole": a BARE param at a posture-gated entry boundary (secure/guarded
      // flow) is untrusted-until-gated. `boundary-untrusted` is inert everywhere EXCEPT a
      // governed sink, where it fires FUNGI-VALUESTATE-008 (warning) — closing the
      // param-trusted-by-default fail-open at the secure/guarded tier without the false
      // positives of a full taint flip (string-concat / VS-004 stays clean). `pure`/plain
      // `flow` stay trusted-by-default (non-breaking).
      this.registerBinding({ name, safetyPrefix: "boundary-untrusted", typeName, ...locField, ...passportField, ...authorityField });
    } else {
      this.registerBinding({ name, safetyPrefix: undefined, typeName, ...locField, ...passportField, ...authorityField });
    }
  }

  private handleLetDecl(node: AstNode): void {
    const info = parseBindingValue(node.value ?? "");
    // Attach declaration location for Rust-style "declared here" diagnostics
    const locField = node.location !== undefined ? { declaredAt: node.location } : {};

    // Phase 11B.1: propagate taint — if the init expression references an
    // unsafe or tainted binding (via a non-gate call), the new binding is tainted.
    // Phase 11B.2: user-defined gate functions also break the taint chain.
    const init = node.children?.[0];
    if (init?.kind === "listLiteral") {
      this.emitAuthorityContainment(this.collectAuthorityArguments(init), node.location);
    }
    const movedAuthority =
      init?.kind === "identifier" ? this.lookupBinding(init.value ?? "")?.authorityType : undefined;
    if (init?.kind === "identifier" && movedAuthority !== undefined) {
      this.consumeAuthorityBinding(init.value ?? "", node.location);
    }
    const declaredAuthority = this.authorityTypes.has(info.typeName) ? info.typeName : undefined;
    const authorityType = declaredAuthority ?? movedAuthority;
    const authorityField = authorityType !== undefined ? { authorityType } : {};
    const taintField: { tainted?: boolean; taintSource?: string } = {};
    if (init !== undefined && info.safetyPrefix !== "unsafe") {
      // unsafe bindings already have safetyPrefix tracking; we only need taint
      // propagation for plain let bindings derived from unsafe/tainted ones.
      if (isTaintedExpression(init, (name) => this.lookupBinding(name), this.userGates)) {
        const sourceName = findTaintSourceName(init, (name) => this.lookupBinding(name));
        taintField.tainted = true;
        if (sourceName !== undefined) taintField.taintSource = sourceName;
      }
    }

    // FUNGI-VALUESTATE-006: protected value assigned to plain binding
    // FUNGI-VALUESTATE-007: redacted value assigned to plain binding
    // Only fire when:
    //   1. The binding has an explicit type annotation (colonIdx present in value string)
    //   2. The declared type annotation is plain — no "protected" or "redacted" anywhere in the type
    const rawNodeValue = (node.value ?? "").trim();
    const colonIdx2 = rawNodeValue.indexOf(":");
    const hasExplicitType = colonIdx2 !== -1;
    // Extract the full type annotation section (after the colon)
    const typeAnnotationSection = hasExplicitType ? rawNodeValue.slice(colonIdx2 + 1).trim() : "";
    const hasGovernanceQualifier =
      typeAnnotationSection.includes("protected") || typeAnnotationSection.includes("redacted");
    if (hasExplicitType && !hasGovernanceQualifier && info.typeName !== "" && init !== undefined) {
      if (isProtectedValueExpression(init)) {
        this.diagnostics.push(makeVSDiag(
          "FUNGI-VALUESTATE-006",
          "PROTECTED_BOUNDARY_VIOLATION",
          `Cannot assign a 'protected' value to plain binding '${info.name}'. Declare the binding as 'protected ${info.typeName}', or pass the value through an authorised access gate.`,
          node.location,
          `Change the type annotation to: protected ${info.typeName}`,
          `protected ${info.typeName}`,
        ));
      } else if (isRedactCall(init, (name) => this.lookupBinding(name))) {
        this.diagnostics.push(makeVSDiag(
          "FUNGI-VALUESTATE-007",
          "REDACTED_BOUNDARY_VIOLATION",
          `Cannot assign a 'redacted' value to plain binding '${info.name}'. Redaction is irreversible — a redacted value cannot be converted back to its original type.`,
          node.location,
          `Use the redacted value as-is with type 'redacted ${info.typeName}', or do not redact before this point.`,
        ));
      }
    }

    // Secret-source inference: a binding read from a `secrets {}` credential accessor
    // (secret.get / vault.read / kms.decrypt …) is a secret. Tag it as SecureString so the
    // existing FUNGI-SECRET-001/003 sink guards block it from logs/serialization/audit output.
    const secretField =
      init !== undefined &&
      (this.secretControlDepth > 0 || derivesFromSecret(init, (name) => this.lookupBinding(name), this.moduleAliases))
        ? { typeName: "SecureString" }
        : {};
    // U2/#204: a binding that holds or derives a cleartext embedding (and isn't sealed)
    // carries SemanticVector confidentiality — propagates like taint/secret.
    const embeddingField =
      isEmbeddingTypeName(info.typeName) ||
      (init !== undefined && derivesFromEmbedding(init, (name) => this.lookupBinding(name)))
        ? { embeddingDerived: true }
        : {};
    // NET-NEW 0111: passport typestate. A gate (verify/authorize/seal) applied to a passport value
    // PRODUCES the next stage. Recognize the inflowing value as a passport if it is Passport-typed OR
    // (CHAIN FIX — the spec's typeName-only check breaks here) the gate's first arg already carries a
    // passportStage, so `authorize.passport(v)` where v is an unannotated let-binding still advances the
    // chain. A Passport-typed binding with no gate is Raw(0). Deny-by-default: unknown stays unstaged.
    const passportField: { passportStage?: PassportStageV } = {};
    if (init?.kind === "callExpr") {
      const gate = PASSPORT_GATE_STAGE.find(([re]) => re.test(buildFullCallName(init)));
      if (gate !== undefined) {
        // The call's identifier children are [receiver-namespace, ...args] (e.g. `verify.passport(p)`
        // parses as value="passport", children=[id "verify", id "p"]). The inflow is a passport if ANY
        // operand resolves to a Passport-typed binding OR one already carrying a passportStage (chain) —
        // the receiver namespace ("verify"/"authorize") is not a binding, so it filters out.
        const inflowIsPassport = (init.children ?? []).some((c) => {
          if (c.kind !== "identifier") return false;
          const ab = this.lookupBinding(c.value ?? "");
          return ab !== undefined && (ab.passportStage !== undefined || /Passport/i.test(ab.typeName));
        });
        if (inflowIsPassport) passportField.passportStage = gate[1];
      }
    }
    if (passportField.passportStage === undefined && /Passport/i.test(info.typeName)) passportField.passportStage = 0;
    this.registerBinding({ ...info, ...locField, ...taintField, ...secretField, ...embeddingField, ...passportField, ...authorityField });
    // Walk the init expression
    if (init !== undefined) this.walkNode(init);
  }

  private handleMutDecl(node: AstNode): void {
    const info = parseBindingValue(node.value ?? "");
    const init = node.children?.[0];

    // Rule 2: safe mut upgrade must use a recognised gate
    if (info.safetyPrefix === "safe" && init !== undefined) {
      if (!this.isGateExpression(init)) {
        this.diagnostics.push(makeVSDiag(
          "FUNGI-VALUESTATE-001",
          "UNSAFE_TO_SAFE_TRANSITION_DENIED",
          `'safe mut ${info.name}' requires a recognised gate function on the right-hand side (validate.*, sanitize.*, json.decode<T>, parse.*).`,
          node.location,
          `Use: safe mut ${info.name} = validate.${info.name}(${info.name})?`,
          `safe mut ${info.name} = validate.${info.name}(${info.name})?`,
        ));
      }
    }

    // Overwrite the previous unsafe registration with the new (possibly safe) one.
    // Phase 11B.1: propagate taint unless a gate clears it.
    // Phase 11B.2: user-defined gate functions also break the taint chain.
    const mutLocField = node.location !== undefined ? { declaredAt: node.location } : {};
    const mutTaintField: { tainted?: boolean; taintSource?: string } = {};
    if (init !== undefined && info.safetyPrefix !== "safe" && info.safetyPrefix !== "unsafe") {
      if (isTaintedExpression(init, (name) => this.lookupBinding(name), this.userGates)) {
        const sourceName = findTaintSourceName(init, (name) => this.lookupBinding(name));
        mutTaintField.tainted = true;
        if (sourceName !== undefined) mutTaintField.taintSource = sourceName;
      }
    }
    // When safetyPrefix is "safe" and a gate is used, taint is intentionally cleared
    // (the gate call gates are already excluded by isTaintedExpression).
    // Secret-origin propagates through a mut reassignment too (a derived secret stays
    // SecureString unless re-bound to a non-secret), closing the mut laundering path.
    const mutSecretField =
      init !== undefined &&
      (this.secretControlDepth > 0 || derivesFromSecret(init, (name) => this.lookupBinding(name), this.moduleAliases))
        ? { typeName: "SecureString" }
        : {};
    const mutEmbeddingField =
      isEmbeddingTypeName(info.typeName) ||
      (init !== undefined && derivesFromEmbedding(init, (name) => this.lookupBinding(name)))
        ? { embeddingDerived: true }
        : {};
    this.registerBinding({ ...info, ...mutLocField, ...mutTaintField, ...mutSecretField, ...mutEmbeddingField });

    if (init !== undefined) this.walkNode(init);
  }

  /**
   * Bare reassignment `name = rhs` (no binding keyword). Without this, `walkNode` fell
   * to `default` and never re-evaluated the target's value-state — so `mut s = "x";
   * s = secret.get("k"); http.post(u, s)` laundered the secret (and likewise embeddings
   * and ordinary taint). Recompute the target's flags from the RHS (mirrors handleMutDecl):
   * a dirty RHS taints/marks the target; a clean RHS — including a redact()/seal()
   * discharge — clears it. The update lands in the binding's declaring scope.
   */
  private handleAssignStmt(node: AstNode): void {
    const target = node.value ?? "";
    const rhs = node.children?.[0];
    if (target !== "" && rhs !== undefined && this.lookupBinding(target) !== undefined) {
      const lookup = (n: string) => this.lookupBinding(n);
      const existing = this.lookupBinding(target)!;
      const isSecret = this.secretControlDepth > 0 || derivesFromSecret(rhs, lookup, this.moduleAliases);
      const isEmbedding = derivesFromEmbedding(rhs, lookup);
      const isTainted = isTaintedExpression(rhs, lookup, this.userGates);
      const taintSrc = isTainted ? findTaintSourceName(rhs, lookup) : undefined;
      const patch: Partial<BindingInfo> = {
        tainted: isTainted,
        embeddingDerived: isEmbedding,
        // Recompute the secret marker: a secret RHS marks SecureString; a clean RHS
        // (incl. redact()) clears it without clobbering a real declared type.
        typeName: isSecret
          ? "SecureString"
          : existing.typeName === "SecureString" ? "" : existing.typeName,
        ...(taintSrc !== undefined ? { taintSource: taintSrc } : {}),
      };
      this.updateBinding(target, patch);
    }
    // Walk the RHS so a sink call on its right-hand side is still checked.
    this.walkChildren(node);
  }

  // ── Gate recognition ─────────────────────────────────────────────────────

  private isGateExpression(node: AstNode): boolean {
    // Accept `gate(args)?` — errorPropagation wrapping a callExpr
    if (node.kind === "errorPropagation") {
      const inner = node.children?.[0];
      return inner !== undefined && this.isGateExpression(inner);
    }
    // Accept `gate(args)` — callExpr with a recognised gate name
    // Phase 11B.2: also check user-defined gates.
    // Also check the unqualified method name (node.value) because buildFullCallName
    // may treat the first argument as the receiver for standalone calls like
    // validateEmail(rawEmail) → "rawEmail.validateEmail" instead of "validateEmail".
    if (node.kind === "callExpr") {
      if (this.insideRequirementConstraint) {
        return this.matchedRequirementValidators.has(node);
      }
      const methodNameOnly = node.value ?? "";
      return (
        isGateCallName(buildFullCallName(node), this.userGates) ||
        isGateCallName(methodNameOnly, this.userGates)
      );
    }
    return false;
  }

  // ── Trap declaration ──────────────────────────────────────────────────────
  // VSC-002 (owner decision A, 2026-06-16): a `trap` is NOT a declassifier. The previous
  // handler cleared taint on any binding merely *referenced* in a trap condition — but a bare
  // mention (or a non-constraining guard like `trap x.length < 3 : ERR`) validates nothing for
  // injection sinks, so it laundered unsafe/tainted values. Declassification now requires an
  // explicit validate.* / sanitize.* / redact() gate. `trap` remains a runtime guard/invariant
  // (parser + governance + WAT), but carries no value-state effect (trapDecl dispatch is a no-op).

  // ── Call expression rules ────────────────────────────────────────────────

  private handleCallExpr(node: AstNode): void {
    // RD-0659: every authority argument is a transfer in the first, borrow-free
    // authority profile. Nested call expressions own their own transfers; lists
    // and record-shaped arguments are traversed here so wrapping cannot duplicate.
    const authorityArguments = this.collectAuthorityArguments(node);
    if (authorityArguments.length > 0 && isAuthorityPersistenceCall(node, this.moduleAliases)) {
      for (const argument of authorityArguments) {
        const binding = this.lookupBinding(argument.value ?? "");
        this.diagnostics.push(makeVSDiag(
          "FUNGI-AFFINE-003",
          "AUTHORITY_PERSISTENCE_FORBIDDEN",
          `Authority value '${binding?.name ?? argument.value ?? "?"}' cannot cross a serialization or persistent-storage boundary.`,
          node.location,
          "Store the non-authorizing object identity or receipt instead; keep the runtime handle process-local.",
          undefined,
          binding?.declaredAt !== undefined
            ? { relatedLocations: [{ message: "authority declared here", location: binding.declaredAt }] }
            : undefined,
        ));
      }
    } else if (
      authorityArguments.length > 0
      && (
        node.value === "#record"
        || node.value === "#record-update"
        || (node.children ?? []).some((child) =>
          child.kind === "listLiteral"
          || (child.kind === "callExpr" && (child.value === "#record" || child.value === "#record-update")))
      )
    ) {
      this.emitAuthorityContainment(authorityArguments, node.location);
    } else {
      for (const argument of authorityArguments) {
        this.consumeAuthorityBinding(argument.value ?? "", node.location);
      }
    }

    // C1: resolve `let x = Module` aliases so an aliased sink (`x.write`) is matched + gated, not missed.
    const sinkName = buildFullCallName(node, this.moduleAliases);
    const isAuditLog = sinkName === "AuditLog.write";

    // Rule 1/3: governed sink — check all argument children for unsafe bindings.
    // Task 4: distinguish protected-without-redact at AuditLog (VALUESTATE-006)
    // from plain unsafe-at-sink (VALUESTATE-003).
    if (isGovernedSink(node, this.moduleAliases)) {
      for (const child of node.children ?? []) {
        if (isAuditLog) {
          // For AuditLog.write, check for protected values without redact first.
          this.checkArgForProtectedAtAuditLog(child, sinkName, node.location);
        }
        // Then check for unsafe bindings (VALUESTATE-003) — but not for
        // protected values at AuditLog, which already get VALUESTATE-006.
        this.checkArgForUnsafeBinding(child, sinkName, node.location);
      }

      // NET-NEW 0111 — affine consume-once + monotone stage-skip on Passport bindings at authority sinks.
      const need = requiredPassportStage(sinkName);
      // Class C (RD-0234b): a passport WRAPPED in a record/interpolation arg (sink({ p }) /
      // sink(`${p}`)) previously skipped the stage/consume gate (only BARE identifier args were
      // checked) and minted a signed manifest. Collect leaf-identifier passport candidates from
      // each arg subtree, not just the bare arg. redact()/seal() calls are a discharge boundary.
      const passportCandidates: AstNode[] = [];
      const collectLeafIdents = (n: AstNode): void => {
        if (n.kind === "callExpr" && (n.value === "redact" || n.value === "seal")) return;
        if (n.kind === "identifier" && (n.children ?? []).length === 0) passportCandidates.push(n);
        for (const c of n.children ?? []) collectLeafIdents(c);
      };
      for (const arg of node.children ?? []) collectLeafIdents(arg);
      for (const arg of passportCandidates) {
        const b = this.lookupBinding(arg.value ?? "");
        if (b?.passportStage === undefined) continue; // not a passport-typed value
        // (a) STATE-SKIP: the value's stage is below the sink's required stage → deny (Raw<Verified<Authorized<Sealed).
        if (need !== undefined && b.passportStage < need) {
          this.diagnostics.push(makeVSDiag(
            "FUNGI-PASSPORT-002", "PASSPORT_STATE_SKIP",
            `Passport '${b.name}' is at stage ${b.passportStage} but sink '${sinkName}' requires stage ${need} (Raw<Verified<Authorized<Sealed). Advance it through the missing gate(s) before this sink.`,
            node.location, `Apply the missing gate (verify/authorize/seal) to '${b.name}' before '${sinkName}'.`));
        }
        // (b) CONSUME-ONCE: already consumed at a prior authority sink → deny re-use (affine/linear single-use).
        if (b.consumed === true) {
          this.diagnostics.push(makeVSDiag(
            "FUNGI-AFFINE-001", "PASSPORT_CONSUMED_TWICE",
            `Passport '${b.name}' was already consumed and cannot be re-used (affine/linear single-use).`,
            node.location, `Re-derive a fresh passport; an authority value is consume-once.`,
            undefined,
            b.consumedAt !== undefined ? { relatedLocations: [{ message: "first consumed here", location: b.consumedAt }] } : undefined));
        } else if (need !== undefined) {
          // Mark consumed on first authority-sink use, so a second use fails closed.
          this.updateBinding(b.name, node.location !== undefined ? { consumed: true, consumedAt: node.location } : { consumed: true });
        }
      }
    }

    // Rule 4 (log side): log call — check for SecureString arguments
    if (isLogCall(node)) {
      const callName = buildFullCallName(node);
      for (const child of node.children ?? []) {
        this.checkArgForSecretLogging(child, callName, node.location);
      }
    }

    // Rule 4 (serialization side): FUNGI-SECRET-003 — SecureString in json.encode / serialize
    if (isSerializationCall(node)) {
      const callName = buildFullCallName(node);
      for (const child of node.children ?? []) {
        this.checkArgForSecretSerialization(child, callName, node.location);
      }
    }

    // Task 3 extended: SECRET-003 for AuditLog.write with SecureString fields
    if (isAuditLog) {
      for (const child of node.children ?? []) {
        this.checkArgForSecretSerialization(child, sinkName, node.location);
      }
    }

    // Secret → network egress: FUNGI-SECRET-002 — a raw secret transmitted off-host.
    if (isNetworkSink(node)) {
      const callName = buildFullCallName(node);
      for (const child of node.children ?? []) {
        this.checkArgForSecretNetwork(child, callName, node.location);
        this.checkArgForEmbeddingNetwork(child, callName, node.location);
        // Class C (RD-0234b): a PROTECTED (PII) value egressing off-host must also be
        // redacted/sealed. VALUESTATE-006 fired at AuditLog.write ONLY, so protected PII
        // via http.post / EmailService / NotificationService / response.body egressed clean.
        this.checkArgForProtectedAtAuditLog(child, callName, node.location, true);
      }
    }

    // A model can be admitted as local by compute-target policy, so it is not
    // automatically network egress. Raw credentials are nevertheless forbidden
    // at every model boundary because they can leak into model context, state,
    // traces, tensors, generated output, or plugin implementations.
    if (isModelSink(node)) {
      const callName = buildFullCallName(node);
      for (const child of node.children ?? []) {
        this.checkArgForSecretModel(child, callName, node.location);
      }
    }

    // Phase 4.3: Inter-flow taint — warn when a tainted argument is passed to a
    // user-defined flow. This is a call-site warning (FUNGI-VALUESTATE-004), NOT
    // full inter-procedural analysis. We do not follow into the callee body.
    //
    // #75 reframe (RD-0412 P1, VALUESTATE-004 was a FALSE CONTRADICTION): passing tainted data
    // INTO a recognized gate (validate*/check*/verify*/sanitize*/parse*/decode*) is the CLEARING
    // operation — untrusted-in → trusted-out — the entire purpose of a validation seam, NOT a
    // defect. The old rule flagged it and suggested `validate.X(X)`, i.e. "wrap the gate call in
    // a gate call" — a fix pointing at nothing, which blocked legitimate tainted→validator flows
    // (the auth-service corpus). Only a NON-gate user flow warrants the cross-flow taint warning.
    // (A gate that fails to actually re-type its input to safe is a separate concern — the gate's
    // own body — not a call-site error; tainted reaching a non-clearing governed SINK stays
    // covered by VALUESTATE-003.)
    const calleeName = node.value ?? "";
    const requirementValidatorMatched = this.insideRequirementConstraint
      && this.matchedRequirementValidators.has(node);
    const nameGateMayClear = !this.insideRequirementConstraint
      && isGateCallName(calleeName, this.userGates);
    if (this.userFlows.has(calleeName) && !nameGateMayClear && !requirementValidatorMatched) {
      // The shared requirement pass owns the exact 004/010 diagnostic. Do not
      // add the generic cross-flow warning for the same constraint identity.
      if (this.insideRequirementConstraint) return;
      // All children are arguments (no "method" style for user flow calls)
      const callArgs = node.children ?? [];
      for (const arg of callArgs) {
        if (isTaintedExpression(arg, (n) => this.lookupBinding(n), this.userGates)) {
          const taintName = findTaintSourceName(arg, (n) => this.lookupBinding(n))
            ?? (arg.kind === "identifier" ? (arg.value ?? "?") : "?");
          // Bool-typed bindings cannot carry injection payloads — exempt from VALUESTATE-004.
          // A Bool is structurally a single bit (true/false); it has no string-injection
          // surface even when derived from an unsafe boundary source.
          const argBinding =
            arg.kind === "identifier"
              ? this.lookupBinding(arg.value ?? "")
              : this.lookupBinding(taintName);
          if (
            argBinding !== undefined &&
            (argBinding.typeName === "Bool" || argBinding.typeName === "boolean")
          ) {
            continue;
          }
          this.diagnostics.push({
            code: "FUNGI-VALUESTATE-004",
            name: "TAINTED_VALUE_PROPAGATION",
            severity: "error",
            message: `Tainted value '${taintName}' passed to '${calleeName}'. Validate before passing to another flow.`,
            ...(node.location !== undefined ? { location: node.location } : {}),
            suggestedFix: `Validate '${taintName}' before the call: let safe${taintName.charAt(0).toUpperCase() + taintName.slice(1)} = validate.${taintName}(${taintName})?`,
            suggestedCode: `validate.${taintName}(${taintName})?`,
            why: `'${taintName}' is tainted — it came from an untrusted boundary source and has not been validated.`,
            risk: `Passing unvalidated input to '${calleeName}' can propagate taint across flow boundaries.`,
          });
          break; // One diagnostic per call site is enough
        }
      }
      // Inter-flow secret / embedding propagation (intra-procedural checker can't follow into the
      // callee body, so a sealed/redacted handoff can't be proven here). In PRODUCTION this fails
      // CLOSED (error): an unsealed secret/embedding crossing an unverified flow boundary is a real
      // exfiltration path and must not ship — the discharge is seal()/redact() at the boundary. In
      // development it stays a WARNING (fail-loud, migration-friendly), mirroring the mode-gated
      // escalation below (~L1716). Inter-procedural seal/redact discharge tracking is the precise
      // future fix (RD-0124 audit NOW-2 option b); until then, production fail-closed is the safe default.
      for (const arg of callArgs) {
        const lookup = (n: string) => this.lookupBinding(n);
        if (derivesFromSecret(arg, lookup, this.moduleAliases)) {
          this.diagnostics.push({
            code: "FUNGI-SECRET-006",
            name: "SECRET_CROSSES_FLOW_BOUNDARY",
            severity: this.mode === "production" ? "error" : "warning",
            message: `A secret value is passed to flow '${calleeName}', which may transmit it off-host. The checker does not follow into the callee — seal/redact it or confirm '${calleeName}' keeps it within a trusted boundary.`,
            ...(node.location !== undefined ? { location: node.location } : {}),
            suggestedFix: `Pass redact(...) instead, or audit '${calleeName}' for egress.`,
            why: `Cross-flow propagation is not inter-procedurally verified; a secret crossing a flow boundary unsealed is a potential exfiltration path.`,
            risk: `If '${calleeName}' egresses the value, the credential leaks.`,
          });
          break;
        }
      }
      for (const arg of callArgs) {
        const lookup = (n: string) => this.lookupBinding(n);
        if (derivesFromEmbedding(arg, lookup)) {
          this.diagnostics.push({
            code: "FUNGI-PRIVACY-004",
            name: "EMBEDDING_CROSSES_FLOW_BOUNDARY",
            severity: this.mode === "production" ? "error" : "warning",
            message: `A cleartext semantic embedding is passed to flow '${calleeName}', which may egress it. The checker does not follow into the callee — seal() it or confirm '${calleeName}' keeps it within a trusted boundary.`,
            ...(node.location !== undefined ? { location: node.location } : {}),
            suggestedFix: `Pass seal(...) instead, or audit '${calleeName}' for egress.`,
            why: `Cross-flow propagation is not inter-procedurally verified; a cleartext (vec2text-invertible) embedding crossing a flow boundary is a potential leak.`,
            risk: `If '${calleeName}' egresses the vector, the source content is recoverable.`,
          });
          break;
        }
      }
    }
  }

  /**
   * FUNGI-SECRET-002: a SecureString (incl. a value read from a `secrets {}` credential)
   * must not be transmitted to a network/egress sink — that is an exfiltration path.
   * `redact()` / sealing breaks the chain. Mirrors checkArgForSecretLogging.
   */
  private checkArgForSecretNetwork(
    node: AstNode,
    callName: string,
    location: SourceLocation | undefined,
  ): void {
    if (node.kind === "callExpr" && isRedactCall(node, (name) => this.lookupBinding(name))) return;
    if (node.kind === "identifier") {
      const binding = this.lookupBinding(node.value ?? "");
      if (binding?.typeName === "SecureString") {
        this.diagnostics.push(makeVSDiag(
          "FUNGI-SECRET-005",
          "SECRET_SENT_TO_NETWORK",
          `SecureString binding '${binding.name}' must not be transmitted to network sink '${callName}'.`,
          location,
          `Send a sealed/redacted form instead, e.g. redact(${binding.name}), or use a capability-scoped secret channel.`,
          `redact(${binding.name})`,
          {
            why: `'${binding.name}' is a secret — transmitting its raw value off-host is an exfiltration path.`,
            risk: `Sending credentials/keys/tokens to a network egress in plaintext leaks them to anyone observing the channel or endpoint.`,
          },
        ));
      }
      // A direct record literal stores each field value below an identifier
      // label. Descend so that wrapper cannot hide a secret from this sink.
      for (const child of evaluatedExpressionChildren(node)) {
        this.checkArgForSecretNetwork(child, callName, location);
      }
      return;
    }
    for (const child of evaluatedExpressionChildren(node)) {
      this.checkArgForSecretNetwork(child, callName, location);
    }
  }

  /**
   * FUNGI-SECRET-007: a SecureString (including derived secret material) must
   * not enter a model inference boundary. redact() is the only admitted
   * declassifier, whether execution is local or remote.
   */
  private checkArgForSecretModel(
    node: AstNode,
    callName: string,
    location: SourceLocation | undefined,
  ): void {
    if (isRedactCall(node, (name) => this.lookupBinding(name))) return;
    if (!derivesFromSecret(node, (name) => this.lookupBinding(name), this.moduleAliases)) return;

    const bindingName =
      node.kind === "identifier" ? (node.value ?? "secret value") : "secret-derived value";
    this.diagnostics.push(makeVSDiag(
      "FUNGI-SECRET-007",
      "SECRET_SENT_TO_MODEL",
      `Raw secret '${bindingName}' must not be passed to model sink '${callName}'.`,
      location,
      `Remove the secret from model input or pass an irreversible redacted placeholder.`,
      node.kind === "identifier" ? `redact(${bindingName})` : "redact(secretValue)",
      {
        why: `Model execution can retain or expose context through state, traces, tensors, plugins, or generated output even when compute is local.`,
        risk: `Credentials, keys, or tokens could become recoverable from model state or downstream model artifacts.`,
      },
    ));
  }

  /**
   * FUNGI-PRIVACY-002 (U2/#204): a cleartext semantic embedding (an Embedding/EmbeddingResult
   * value, or anything derived from EmbeddingModel.run/.embed) must not be transmitted to a
   * network/egress sink — an embedding is invertible (vec2text), so sending it cleartext leaks
   * the source text across the trust boundary. seal()/encrypt() breaks the chain. Filtering on
   * the vector must happen at a trusted endpoint AFTER decryption (composes with the pattern-10
   * verify-before-decrypt gate). Mirrors checkArgForSecretNetwork.
   */
  private checkArgForEmbeddingNetwork(
    node: AstNode,
    callName: string,
    location: SourceLocation | undefined,
  ): void {
    if (isSealCall(node, (name) => this.lookupBinding(name))) return; // a sealed/encrypted vector may cross — the cleartext may not
    if (node.kind === "identifier") {
      const binding = this.lookupBinding(node.value ?? "");
      if (binding?.embeddingDerived === true) {
        this.diagnostics.push(makeVSDiag(
          "FUNGI-PRIVACY-002",
          "EMBEDDING_EGRESS_DENIED",
          `Cleartext semantic embedding '${binding.name}' must not be transmitted to network sink '${callName}'.`,
          location,
          `Seal the vector before egress, e.g. seal(${binding.name}), and filter only at a trusted endpoint after decryption.`,
          `seal(${binding.name})`,
          {
            why: `'${binding.name}' is a semantic embedding — embedding-inversion (vec2text) reconstructs the source text from a cleartext vector, so egressing it is equivalent to leaking the text.`,
            risk: `A router/intermediary that receives a cleartext embedding can recover the original content; only an encrypted vector may cross an untrusted boundary.`,
          },
        ));
      }
      return;
    }
    // Inline embedding source passed straight to the sink, e.g. http.post(u, EmbeddingModel.run(x)).
    if (isEmbeddingSourceExpression(node)) {
      this.diagnostics.push(makeVSDiag(
        "FUNGI-PRIVACY-002",
        "EMBEDDING_EGRESS_DENIED",
        `A cleartext semantic embedding must not be transmitted to network sink '${callName}'.`,
        location,
        `Bind and seal the vector before egress: let v = seal(<embedding>), and filter only at a trusted endpoint after decryption.`,
        undefined,
        {
          why: `An embedding produced inline is still cleartext — embedding-inversion (vec2text) reconstructs the source text from it.`,
          risk: `Sending a cleartext embedding to a network egress leaks the source content to anyone observing the channel or endpoint.`,
        },
      ));
      return;
    }
    for (const child of evaluatedExpressionChildren(node)) {
      this.checkArgForEmbeddingNetwork(child, callName, location);
    }
  }

  /**
   * Recursively checks whether `node` or any of its descendants is an
   * identifier that resolves to an `unsafe` binding (FUNGI-VALUESTATE-003) or
   * a tainted-but-not-directly-unsafe binding (FUNGI-VALUESTATE-005).
   */
  private checkArgForUnsafeBinding(
    node: AstNode,
    sinkName: string,
    location: SourceLocation | undefined,
  ): void {
    if (node.kind === "identifier") {
      // Field-name guard (RD-0093b, mirrors checkArgForProtectedAtAuditLog): a record-literal field
      // `{ patientId: auditId }` / named arg `f(label: value)` is kind:"identifier" with value = the
      // FIELD/LABEL name and children = the value expression. The label is NOT a value reference — recurse
      // into the field VALUE, not the NAME, else a field whose name collides with a boundary-untrusted /
      // unsafe / tainted binding false-fires VS-008/003/005.
      if ((node.children?.length ?? 0) > 0) {
        for (const child of node.children!) this.checkArgForUnsafeBinding(child, sinkName, location);
        return;
      }
      const binding = this.lookupBinding(node.value ?? "");
      if (binding?.safetyPrefix === "unsafe") {
        // Rust-style: show where the unsafe binding was declared AND where it reaches the sink
        const related: DiagnosticRelatedLocation[] = [];
        if (binding.declaredAt !== undefined) {
          related.push({
            message: `'${binding.name}' declared as unsafe here`,
            location: binding.declaredAt,
          });
        }
        this.diagnostics.push(makeVSDiag(
          "FUNGI-VALUESTATE-003",
          "UNSAFE_VALUE_REACHED_GOVERNED_SINK",
          `Unsafe binding '${binding.name}' cannot flow into governed sink '${sinkName}'.`,
          location,
          `Add before the sink call: safe mut ${binding.name} = validate.${binding.name}(${binding.name})?`,
          `safe mut ${binding.name} = validate.${binding.name}(${binding.name})?`,
          {
            ...(related.length > 0 ? { relatedLocations: related } : {}),
            why: `'${binding.name}' was declared with 'unsafe let', meaning its value comes from an untrusted boundary source and has not been validated.`,
            risk: `Sending unvalidated boundary data to '${sinkName}' can cause injection attacks, data corruption, or governance violations.`,
          },
        ));
      } else if (binding?.tainted === true) {
        // Phase 11B.1 — FUNGI-VALUESTATE-005: derived unsafe value at sink
        const sourceName = binding.taintSource ?? binding.name;
        const related: DiagnosticRelatedLocation[] = [];
        if (binding.declaredAt !== undefined) {
          related.push({
            message: `'${binding.name}' derived from unsafe binding '${sourceName}' here`,
            location: binding.declaredAt,
          });
        }
        this.diagnostics.push(makeVSDiag(
          "FUNGI-VALUESTATE-005",
          "DERIVED_UNSAFE_VALUE_AT_SINK",
          `Binding '${binding.name}' is derived from unsafe binding '${sourceName}' and cannot flow into governed sink '${sinkName}'. Even after transformation (e.g. .trim()), a value derived from unsafe input is still tainted.`,
          location,
          `Use a validation gate before the sink: let safe${binding.name.charAt(0).toUpperCase() + binding.name.slice(1)} = validate.${sourceName}(${sourceName})?`,
          `validate.${sourceName}(${sourceName})?`,
          {
            ...(related.length > 0 ? { relatedLocations: related } : {}),
            why: `'${binding.name}' was derived from '${sourceName}', which was declared with 'unsafe let'. String methods like .trim() and .toLower() do not remove taint.`,
            risk: `Sending a transformed-but-tainted value to '${sinkName}' can cause injection attacks. Taint can only be removed by a validate.* or sanitize.* gate.`,
          },
        ));
      } else if (binding?.safetyPrefix === "boundary-untrusted") {
        // R&D 0093 "34B hole": an unmarked boundary param (bare param of a secure/guarded flow)
        // reaching a governed sink without a gate. Stage-1 WARNING (escalates to error in
        // production/deterministic). Inert everywhere else, so no VS-004 string-concat false positives.
        const related: DiagnosticRelatedLocation[] = [];
        if (binding.declaredAt !== undefined) {
          related.push({ message: `'${binding.name}' is an unmarked boundary input here`, location: binding.declaredAt });
        }
        this.diagnostics.push({
          ...makeVSDiag(
            "FUNGI-VALUESTATE-008",
            "BOUNDARY_INPUT_UNCLEAN",
            `Untrusted boundary input '${binding.name}' reaches governed sink '${sinkName}' without an explicit gate.`,
            location,
            `Add before the sink: safe mut ${binding.name} = validate.${binding.name}(${binding.name})?  (or declare the param 'tainted' and gate it).`,
            `safe mut ${binding.name} = validate.${binding.name}(${binding.name})?`,
            {
              ...(related.length > 0 ? { relatedLocations: related } : {}),
              why: `'${binding.name}' is a bare parameter of a secure/guarded flow — an entry-boundary input that has not been validated.`,
              risk: `Unvalidated boundary data at '${sinkName}' risks injection / governance violations. (Stage-1 WARNING; becomes an error in production.)`,
            },
          ),
          severity: this.mode === "production" ? "error" : "warning",
        });
      }
    }
    // Recurse into nested children (e.g. named-argument wrappers, blocks)
    for (const child of evaluatedExpressionChildren(node)) {
      this.checkArgForUnsafeBinding(child, sinkName, location);
    }
  }

  /** Checks the value crossing a logging sink, not every statement in its AST. */
  private checkArgForSecretLogging(
    node: AstNode,
    callName: string,
    location: SourceLocation | undefined,
  ): void {
    if (node.kind === "fnDecl") return;
    if (!isReviewedSecretSinkAstKind(node.kind)) {
      this.diagnostics.push(makeVSDiag(
        "FUNGI-SECRET-001",
        "SECRET_VALUE_LOGGED",
        `An unrecognized value of AST kind '${node.kind}' must not be passed to '${callName}'.`,
        location,
        "Classify this expression kind's secrecy semantics before allowing it at a logging or audit sink.",
        undefined,
        {
          why: "The checker has no reviewed value-secrecy rule for this AST kind.",
          risk: "Treating a future or malformed expression as public could expose secret-derived data.",
        },
      ));
      return;
    }
    // A recognized constant-time equality call yields only a public Boolean; do
    // not recursively treat its secret operands as values sent to the sink.
    if (node.kind === "callExpr" && isConstantTimeEqualsCall(
      node,
      (name) => this.lookupBinding(name),
    )) return;
    // A redact(...) wrapper produces a safe '[REDACTED]' placeholder — honor it at log
    // sinks just as checkArgForSecretSerialization does (do not recurse into its child).
    if (node.kind === "callExpr" && isRedactCall(node, (name) => this.lookupBinding(name))) return;
    const lookup = (name: string) => this.lookupBinding(name);
    if (node.kind === "matchExpr") {
      // A match expression's result is its value; its arm statements are not values
      // crossing the sink. Derive secrecy from the result semantics, then stop walking
      // the statement AST (which otherwise rejects public locals/loops as unknown values).
      if (derivesFromSecret(node, lookup, this.moduleAliases)) {
        this.diagnostics.push(makeVSDiag(
          "FUNGI-SECRET-001",
          "SECRET_VALUE_LOGGED",
          `Secret-derived expression must not be passed to '${callName}'.`,
          location,
          "Apply redact(...) to the secret-derived value before logging it.",
          undefined,
          {
            why: "The value produced by this match expression is secret-derived.",
            risk: "Logging the raw result can expose credentials or other secret material.",
          },
        ));
      }
      return;
    }
    if (node.kind === "callExpr" && isSecretSourceExpression(node, lookup, this.moduleAliases)) {
      // The recursive identifier walk below cannot recognize a direct accessor call
      // such as print(Env.get("k")); classify the accessor's result at the sink.
      this.diagnostics.push(makeVSDiag(
        "FUNGI-SECRET-001",
        "SECRET_VALUE_LOGGED",
        `Secret-derived expression must not be passed to '${callName}'.`,
        location,
        "Apply redact(...) to the secret-derived value before logging it.",
        undefined,
        {
          why: "The argument is a recognized secret-source expression.",
          risk: "Logging the raw result can expose credentials or other secret material.",
        },
      ));
      return;
    }
    if (node.kind === "identifier") {
      // Field-name guard (RD-0093b): check the field VALUE, not the field NAME — else a record/arg field
      // named after a SecureString binding false-fires SECRET-001.
      if ((node.children?.length ?? 0) > 0) {
        for (const child of node.children!) this.checkArgForSecretLogging(child, callName, location);
        return;
      }
      const binding = this.lookupBinding(node.value ?? "");
      if (binding?.typeName === "SecureString") {
        const related: DiagnosticRelatedLocation[] = [];
        if (binding.declaredAt !== undefined) {
          related.push({
            message: `'${binding.name}' declared as SecureString here`,
            location: binding.declaredAt,
          });
        }
        this.diagnostics.push(makeVSDiag(
          "FUNGI-SECRET-001",
          "SECRET_VALUE_LOGGED",
          `SecureString binding '${binding.name}' must not be passed to '${callName}'.`,
          location,
          `Replace with: log.info("...", { key: redact(${binding.name}) })`,
          `redact(${binding.name})`,
          {
            ...(related.length > 0 ? { relatedLocations: related } : {}),
            why: `'${binding.name}' is a SecureString — its raw value must never appear in logs, audit output, or error messages.`,
            risk: `Logging a secret exposes credentials, tokens, or keys in plaintext. Use redact() to produce a safe '[REDACTED]' placeholder.`,
          },
        ));
      }
    }
    for (const child of evaluatedExpressionChildren(node)) {
      this.checkArgForSecretLogging(child, callName, location);
    }
  }

  /**
   * FUNGI-SECRET-003: SecureString must not be passed to serialization functions.
   * Serializing a secret value would expose it in the output stream.
   * Extended (Task 3): also fires for SecureString in AuditLog.write and
   * SecureString field values in record literals passed to governed sinks.
   */
  private checkArgForSecretSerialization(
    node: AstNode,
    callName: string,
    location: SourceLocation | undefined,
  ): void {
    // A trusted constant-time comparison exposes only its public Boolean
    // result. Do not inspect the protected operands as serialized values.
    if (node.kind === "callExpr" && isConstantTimeEqualsCall(
      node,
      (name) => this.lookupBinding(name),
    )) return;
    // A redact() call wrapping the value is safe — do not recurse into it.
    if (node.kind === "callExpr" && isRedactCall(node, (name) => this.lookupBinding(name))) return;

    if (node.kind === "identifier") {
      // Field-name guard (RD-0093b): check the field VALUE, not the field NAME. Without this a field named
      // after a SecureString binding false-fired SECRET-003 AND — because the original code then `return`ed —
      // a SecureString in a field VALUE was MISSED (a false negative: a real secret in
      // `AuditLog.write({ x: secret })` escaped). Recursing into the value fixes both.
      if ((node.children?.length ?? 0) > 0) {
        for (const child of node.children!) this.checkArgForSecretSerialization(child, callName, location);
        return;
      }
      const binding = this.lookupBinding(node.value ?? "");
      if (binding?.typeName === "SecureString") {
        this.diagnostics.push(makeVSDiag(
          "FUNGI-SECRET-003",
          "SECRET_SERIALIZATION_DENIED",
          `SecureString binding '${binding.name}' must not be passed to '${callName}'. Secrets must not appear in serialized or audit output.`,
          location,
          `Use redact(${binding.name}) to produce a safe placeholder before passing to '${callName}'.`,
          `redact(${binding.name})`,
        ));
      }
      return;
    }
    // Task 3: check record literals — fire SECRET-003 for any SecureString field value
    // Record literals appear as children of call arguments in some AST shapes.
    for (const child of evaluatedExpressionChildren(node)) {
      this.checkArgForSecretSerialization(child, callName, location);
    }
  }

  /**
   * Task 4: FUNGI-VALUESTATE-006 (distinct from VALUESTATE-003) — fires when a
   * protected value (e.g. protected Email) is passed to AuditLog.write without
   * going through redact(). This is more specific than VALUESTATE-003 (unsafe-at-sink).
   *
   * A value is considered "protected" if:
   *   - Its type annotation contains "protected" (e.g. protected Email, protected String)
   *
   * Only fires for AuditLog.write, not other governed sinks.
   */
  private checkArgForProtectedAtAuditLog(
    node: AstNode,
    sinkName: string,
    location: SourceLocation | undefined,
    allowSealed = false,
  ): void {
    // A redact() call wrapping the value is the correct pattern — do not recurse into it.
    if (node.kind === "callExpr" && isRedactCall(node, (name) => this.lookupBinding(name))) return;
    // Network egress may preserve the protected value only inside an
    // authenticated sealed envelope. Audit logs still require redaction.
    if (allowSealed && isAuthenticatedSealCall(node, (name) => this.lookupBinding(name))) return;

    if (node.kind === "identifier") {
      // A record-literal field `{ email: redact(email) }` and a named argument `f(email: redact(email))`
      // are BOTH kind:"identifier" with value = the FIELD/LABEL name and children = the value expression.
      // The label is NOT a value reference — so check the field VALUE, not the field name. Without this:
      //   • FALSE POSITIVE — `{ email: redact(email) }` (the canonical PII-redaction pattern) was rejected
      //     because the field name "email" was looked up as the protected binding, ignoring the redact() wrap;
      //   • FALSE NEGATIVE — `{ other: email }` was MISSED because the field name "other" is not a binding, so
      //     the protected `email` value escaped unchecked (a real PII leak). Recursing into the field value
      //     wrapped in redact() discharges it; a bare protected value in any field still fails closed.
      if ((node.children?.length ?? 0) > 0) {
        for (const child of node.children!) this.checkArgForProtectedAtAuditLog(child, sinkName, location, allowSealed);
        return;
      }
      const binding = this.lookupBinding(node.value ?? "");
      if (binding !== undefined) {
        // Check if this is a protected value (typeName is "protected" — the first token
        // of an annotation like "protected Email" when parsed via parseBindingValue).
        const isProtected = binding.typeName === "protected" ||
          binding.typeName.startsWith("protected ");
        if (isProtected) {
          const isAuditSink = sinkName === "AuditLog.write";
          this.diagnostics.push(makeVSDiag(
            "FUNGI-VALUESTATE-009",
            "PROTECTED_VALUE_AT_AUDIT_LOG",
            isAuditSink
              ? `Protected binding '${binding.name}' passed to '${sinkName}' without redaction. Protected values must be redacted before appearing in audit logs.`
              : `Protected binding '${binding.name}' passed to '${sinkName}' without sealing or redaction. Protected values must be sealed before network egress.`,
            location,
            isAuditSink
              ? `Wrap with redact: AuditLog.write({ ..., ${binding.name}: redact(${binding.name}) })`
              : `Wrap the egress value with seal(${binding.name}), or redact it if the recipient does not need the original value.`,
            isAuditSink ? `redact(${binding.name})` : `seal(${binding.name})`,
            {
              why: isAuditSink
                ? `'${binding.name}' is a protected value. Audit logs are often accessible to operators and must not contain raw protected data.`
                : `'${binding.name}' is a protected value crossing a network boundary without an authenticated sealed envelope.`,
              risk: isAuditSink
                ? `Unredacted protected values in audit logs can leak sensitive data such as email addresses, user IDs, or PII.`
                : `Unsealed protected values can be disclosed or modified in transit or by an untrusted intermediary.`,
            },
          ));
        }
      }
      return;
    }
    for (const child of evaluatedExpressionChildren(node)) {
      this.checkArgForProtectedAtAuditLog(child, sinkName, location, allowSealed);
    }
  }

  // ── Binary expression rules ──────────────────────────────────────────────

  private handleBinaryExpr(node: AstNode): void {
    // Rule 4 (equality side): SecureString == or != is forbidden
    if (node.value === "==" || node.value === "!=") {
      const left = node.children?.[0];
      const right = node.children?.[1];
      if (left !== undefined) this.checkSecureStringEquality(left, node.location);
      if (right !== undefined) this.checkSecureStringEquality(right, node.location);
    }

    // Phase 8B: String taint propagation — FUNGI-VALUESTATE-004
    // "SELECT " + rawInput produces a tainted string that must not reach sinks
    // Partial implementation: detect when string + contains an unsafe binding
    if (node.value === "+") {
      const left  = node.children?.[0];
      const right = node.children?.[1];
      if (left !== undefined && right !== undefined) {
        this.checkStringConcatTaint(left, right, node.location);
      }
    }
  }

  /**
   * Phase 8B: FUNGI-VALUESTATE-004 — String taint propagation.
   * If a string concatenation includes an unsafe binding, the result is tainted.
   * This is the SQL injection pattern: "SELECT " + rawInput.
   */
  private checkStringConcatTaint(
    left: AstNode,
    right: AstNode,
    location: SourceLocation | undefined,
  ): void {
    // Find any unsafe identifier in either operand
    const unsafeLeft  = this.findUnsafeIdentifier(left);
    const unsafeRight = this.findUnsafeIdentifier(right);
    const unsafeBinding = unsafeLeft ?? unsafeRight;

    if (unsafeBinding === undefined) return;

    const related: DiagnosticRelatedLocation[] = [];
    if (unsafeBinding.declaredAt !== undefined) {
      related.push({
        message: `'${unsafeBinding.name}' declared as unsafe here`,
        location: unsafeBinding.declaredAt,
      });
    }

    this.diagnostics.push(makeVSDiag(
      "FUNGI-VALUESTATE-004",
      "TAINTED_VALUE_PROPAGATION",
      `String concatenation includes unsafe binding '${unsafeBinding.name}'. The result is tainted and must not reach governed sinks.`,
      location,
      `Validate '${unsafeBinding.name}' before concatenation: let safe = validate.${unsafeBinding.name}(${unsafeBinding.name})?`,
      `validate.${unsafeBinding.name}(${unsafeBinding.name})?`,
      {
        ...(related.length > 0 ? { relatedLocations: related } : {}),
        why: `'${unsafeBinding.name}' is unsafe — it came from an untrusted boundary and has not been validated.`,
        risk: `Concatenating unsafe input into strings sent to databases, shells, or HTML produces injection vulnerabilities.`,
      },
    ));
  }

  /**
   * Recursively finds the first unsafe binding identifier in an expression tree.
   */
  private findUnsafeIdentifier(node: AstNode): BindingInfo | undefined {
    if (node.kind === "identifier") {
      const binding = this.lookupBinding(node.value ?? "");
      if (binding?.safetyPrefix === "unsafe") return binding;
    }
    for (const child of node.children ?? []) {
      const found = this.findUnsafeIdentifier(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  private checkSecureStringEquality(
    node: AstNode,
    location: SourceLocation | undefined,
  ): void {
    if (node.kind === "identifier") {
      const binding = this.lookupBinding(node.value ?? "");
      if (binding?.typeName === "SecureString") {
        this.diagnostics.push(makeVSDiag(
          "FUNGI-SECRET-002",
          "SECRET_COMPARISON_DENIED",
          `SecureString binding '${binding.name}' must not be compared with == / !=. Use constantTimeEquals(${binding.name}, other) instead.`,
          location,
          `Replace with: let valid: Bool = constantTimeEquals(${binding.name}, other)`,
          `constantTimeEquals(${binding.name}, other)`,
        ));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Runs the value-state checker on a parsed Galerina AST.
 *
 * Call this after `parseProgram()`. The checker enforces:
 *   - `unsafe let` bindings cannot reach governed sinks without a gate upgrade
 *   - `safe mut` upgrades must use a recognised gate function
 *   - `SecureString` bindings must not appear in log calls or equality comparisons
 *
 * Phase 11B.2: user-defined gate functions are collected from fnDecl nodes
 * before checking. Functions whose names start with validate*, sanitize*,
 * check*, verify*, parse*, or decode* automatically break the taint chain.
 *
 * @param ast  The root `program` node from `parseProgram()`.
 * @returns    A result object containing all value-state diagnostics.
 */
// ---------------------------------------------------------------------------
// FUNGI-NUMERIC-001 — backend numeric-lowering safety gate (fail-closed, UNCONDITIONAL)
//
// A scalar 64-bit width that the WASM emitter cannot lower faithfully would be SILENTLY TRUNCATED
// 64→32 bit (CWE-704), and the run fallback (tree-walker) would hold the value in a JS `number`
// that loses precision above 2^53 — either way the author asked for 64 bits and silently got 32,
// a fail-OPEN correctness/security hazard (e.g. a financial `amount` wrapping at 2^31). Per
// "always make the most secure choice", we fail CLOSED: the governed runtime and the production
// build (both run checkValueStates) reject such a flow rather than emit a truncating module.
//
// Int64 has been LIFTED from this gate (owner-gated, 2026-06-25): the emitter now lowers it
// faithfully (i64.const, checked $fungi_*_i64, native i64.div_s|rem_s, i64 comparisons) and the
// tree-walker carries it as a bigint — proven byte-exact (walker ≡ WASM) over the (2^53,2^63)
// corpus. So only UInt64 remains gated, until a faithful *unsigned* 64-bit arithmetic layer lands
// (u64 div/compare/overflow differ from the signed i64.* ops the emitter currently uses). The set
// of gated widths is BACKEND_UNLOWERABLE_SCALAR in ./numeric-lowering.ts.
//
// UNCONDITIONAL (not mode-gated): silent truncation is always wrong, and the governed runtime
// calls checkValueStates with the default development mode — gating on production would leave
// the zero-trust path open. SCOPE: only the data-LOSING 64-bit widths. Int8/Int16 widen to i32
// and Float32 widens to f64 (no value loss), so they are deliberately NOT gated. The base type
// is matched EXACTLY, so a generic position like Tensor<Int64,[4]> / Array<UInt64> (an opaque
// i32 handle whose base is "Tensor"/"Array") is correctly NOT flagged.
//
// NOTE the gate set (BACKEND_UNLOWERABLE_SCALAR, consulted here) is now a STRICT SUBSET of the
// fast-tier bail set (FAST_TIER_UNLOWERABLE_SCALAR, consulted by flowDeclaresUnlowerable64): post-lift
// Int64 is admitted HERE but still routes off the i32-only bytecode-VM / sync fast-path to the walker.
const NUMERIC_FLOW_KINDS = new Set(["flowDecl", "secureFlowDecl", "pureFlowDecl", "guardedFlowDecl", "governedFlowDecl"]);
const NUMERIC_BIND_KINDS = new Set(["letDecl", "mutDecl", "readonlyDecl"]);

// numericBaseType (base type id from an annotation string) is now shared in ./numeric-lowering.ts
// so the emitter / interpreter / type-checker consult the SAME stripper (verified i64-lowering plan,
// Step 0a) — a bare `=== "Int64"` shortcut would miss `protected Int64` and mis-flag `Tensor<Int64>`.

function unlowerableNumericDiag(base: string, location: SourceLocation | undefined): ValueStateDiagnostic {
  return {
    code: "FUNGI-NUMERIC-001",
    name: "UNSUPPORTED_NUMERIC_WIDTH",
    severity: "error",
    message: `Scalar '${base}' is a valid Galerina type, but the current WASM backend cannot lower it without silently truncating to 32 bits — a fail-open correctness hazard. 64-bit integers are not yet faithfully emitted, so this is rejected rather than silently narrowed.`,
    ...(location !== undefined ? { location } : {}),
    suggestedFix: `Use 'Int' (32-bit) if the value fits its range, model the value as a String or two Int words, or wait for faithful i64 lowering before declaring '${base}'.`,
  };
}

// Single-pass scan for scalar Int64/UInt64 in return / parameter / local positions.
// Kept separate from the taint walk; its diagnostics are appended in checkValueStates.
function scanUnlowerableNumerics(root: AstNode): ValueStateDiagnostic[] {
  const out: ValueStateDiagnostic[] = [];
  const visit = (node: AstNode | undefined): void => {
    if (!node) return;
    if (NUMERIC_FLOW_KINDS.has(node.kind)) {
      const children = node.children ?? [];
      // Return type = first DIRECT typeRef child (param typeRefs are nested inside paramDecl).
      const retTypeNode = children.find((c) => c.kind === "typeRef");
      if (typeof retTypeNode?.value === "string") {
        const base = numericBaseType(retTypeNode.value);
        if (BACKEND_UNLOWERABLE_SCALAR.has(base)) out.push(unlowerableNumericDiag(base, retTypeNode.location ?? node.location));
      }
      for (const c of children) {
        if (c.kind !== "paramDecl") continue;
        const tr = (c.children ?? []).find((t) => t.kind === "typeRef"); // perf-allow: loop-array-find — bounded N over a paramDecl's children (typeRef lookup)
        if (typeof tr?.value === "string") {
          const base = numericBaseType(tr.value);
          if (BACKEND_UNLOWERABLE_SCALAR.has(base)) out.push(unlowerableNumericDiag(base, tr.location ?? c.location));
        }
      }
    } else if (NUMERIC_BIND_KINDS.has(node.kind) && typeof node.value === "string") {
      let rest = node.value;
      if (rest.startsWith("unsafe ")) rest = rest.slice("unsafe ".length).trim();
      else if (rest.startsWith("safe ")) rest = rest.slice("safe ".length).trim();
      const colonIdx = rest.indexOf(":");
      if (colonIdx !== -1) {
        const base = numericBaseType(rest.slice(colonIdx + 1));
        if (BACKEND_UNLOWERABLE_SCALAR.has(base)) out.push(unlowerableNumericDiag(base, node.location));
      }
    }
    for (const c of node.children ?? []) visit(c);
  };
  visit(root);
  return out;
}

// FUNGI-VALUESTATE-011 (R&D 0200 GO). The privacy declassifiers redact()/seal()/encrypt() are recognised
// by bare CALL-NAME — isRedactCall (`node.value === "redact"`) and isSealCall (`"seal"|"encrypt"`), never a
// resolved trusted identity. So a user flow with one of those names is accepted as a valid discharge at
// EVERY discharge site: a no-op `pure flow redact(x){ return x }` launders protected/secret/PII past the
// fail-closed value-state gate (CWE-501; main confirmed-live through the CLI, bridge 0197). Fail-closed
// FLOOR: reject the SHADOW at its DEFINITION. This single scan closes all 8 discharge sites BY CONSTRUCTION
// (a shadow can't be defined clean, so isRedactCall/isSealCall can never match a user flow anywhere).
// ⚠ Keep DECLASSIFIER_NAMES in sync with isRedactCall/isSealCall AND the constantTimeEquals
// clearing site — a declassifier verb that clears secret state but is absent here re-opens the
// bypass. `constantTimeEquals` was exactly that gap (WP94): it clears state at the SecureString
// comparison site yet was missing from this set, so a `pure flow constantTimeEquals(x){ return x }`
// laundered secrets past the gate. `tests/value-state/declassifier-shadow-drift.test.mjs` derives
// the protected set from the clearing sites so a future declassifier cannot be added to one list
// without the floor. Interim until the durable `disclose` primitive lands.
const DECLASSIFIER_NAMES: ReadonlySet<string> = new Set(["redact", "seal", "encrypt", "constantTimeEquals"]);
export function scanDeclassifierShadows(ast: AstNode): ValueStateDiagnostic[] {
  const out: ValueStateDiagnostic[] = [];
  const visit = (node: AstNode): void => {
    // Decode by DECLARED name across all five tiers. A governed flow parses to
    // `governedFlowDecl` with value "governed:<floor>:<name>", so the old
    // `FLOW_DECL_KINDS.has(kind) && value === name` shape missed it twice — a
    // `governed floor_2 flow redact(...)` could shadow the declassifier undetected.
    // A malformed governed value decodes to an error and is (correctly) not a shadow.
    const decoded = decodeFlowDecl(node);
    if (decoded !== undefined && !("error" in decoded)) {
      const name = decoded.name;
      if (DECLASSIFIER_NAMES.has(name)) {
        out.push(makeVSDiag(
          "FUNGI-VALUESTATE-011",
          "DECLASSIFIER_NAME_SHADOWED",
          `A user flow named '${name}' shadows the built-in privacy declassifier '${name}(...)'. The declassifier is recognised by call-name, so a same-named flow is accepted as a valid discharge and could launder protected/secret/PII data past the fail-closed value-state gate (CWE-501). Rename the flow.`,
          node.location,
          `Rename the flow so it does not shadow the declassifier (e.g. '${name}Value').`,
          undefined,
          {
            why: `The privacy declassifier '${name}' is matched by NAME, not by a resolved trusted identity — a user flow with the same name is indistinguishable from the real discharge at every governed sink.`,
            risk: `A no-op '${name}' could 'discharge' a protected/secret value that was never actually redacted or sealed, leaking PII/secrets past the gate.`,
          },
        ));
      }
    }
    for (const c of node.children ?? []) visit(c);
  };
  visit(ast);
  return out;
}

export function checkValueStates(
  ast: AstNode,
  // R&D 0093 stage-2: in production/deterministic builds, FUNGI-VALUESTATE-008 (the 34B-hole
  // boundary-input warning) escalates to an error; dev/check keep it a warning (migration).
  mode: "production" | "development" = "development",
  validatorInput: RequirementValidatorInput = EMPTY_REQUIREMENT_VALIDATOR_INPUT,
): ValueStateCheckResult {
  const {
    ast: analysisAst,
    analysis: requirementAnalysis,
  } = analyzeRequirementTaintForValueState(
    ast,
    EMPTY_REQUIREMENT_VALIDATOR_INPUT.flows,
    validatorInput,
  );
  // Phase 11B.2: collect user-defined gate functions before running the checker
  const userGates = collectUserGates(analysisAst);
  // Phase 4.3: collect user-defined flow names for inter-flow call-site warnings
  const userFlows = collectUserFlows(analysisAst);
  const authorityTypes = collectAuthorityTypes(analysisAst);
  const checker = new ValueStateChecker(
    userGates,
    userFlows,
    authorityTypes,
    mode,
    requirementAnalysis.matchedValidatorCalls,
  );
  checker.check(analysisAst);
  const result = checker.getResult();
  // FUNGI-NUMERIC-001: fail-closed scan for scalar 64-bit widths the WASM backend would truncate.
  // Always-on (correctness, not a taint rule) — merged into the result the governed runtime +
  // production build already surface as fail-closed errors.
  const numericDiags = scanUnlowerableNumerics(analysisAst);
  // FUNGI-VALUESTATE-011: fail-closed floor against declassifier-name shadowing (CWE-501, R&D 0200).
  const shadowDiags = scanDeclassifierShadows(analysisAst);
  // Requirement constraints use a stricter value-state context: legacy name-based
  // gates cannot declassify taint there. The shared taint analysis admits only an
  // exact Task-1 validator-authority match backed by Task-2 EffectFree evidence.
  const requirementDiags = requirementAnalysis.diagnostics;
  const extraDiags = [...requirementDiags, ...numericDiags, ...shadowDiags];
  if (extraDiags.length === 0) return result;
  return { ...result, diagnostics: [...result.diagnostics, ...extraDiags] };
}
