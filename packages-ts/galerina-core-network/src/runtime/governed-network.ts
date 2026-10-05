// Governed network runtime contracts (TODO pass, Grok 2026-10-05; README "GovernedNetworkRuntime",
// "SafeHttpRequest Types", "Validation Helpers", "safeHttpRequest()").
//
// This package still never dials: `safeHttpRequest` validates, then hands the request to the
// caller-supplied runtime's `request`. Every check is fail-closed and the package's own validators
// always run; a runtime's own validate* results are added on top and can only refuse more.

import { FUNGI_NETWORK_CODES, type FungiNetworkCode } from "../diagnostics/network-codes.js";
import { guardOutboundHost } from "../egress-guard.js";
import type { AiProviderNetworkPolicy, NetworkDiagnostic, NetworkEndpointRule, NetworkPolicy, NetworkProtocol } from "../index.js";

export type NetworkDestinationCategory = "ai" | "payment" | "analytics" | "internal" | "public" | "webhook" | "database" | "custom";

export interface NetworkDestinationReference {
  readonly name: string;
  readonly protocol: NetworkProtocol;
  readonly host: string;
  readonly port?: number;
  readonly tlsRequired: boolean;
  readonly provider?: string;
  readonly category?: NetworkDestinationCategory;
  readonly dataCategories?: readonly string[];
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface SafeHttpRequestInput {
  readonly destination: NetworkDestinationReference;
  readonly method: HttpMethod;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs: number;
  readonly capability: string;
}

export interface SafeHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly destination: NetworkDestinationReference;
  readonly receivedAt: string;
  readonly durationMs: number;
}

export interface GovernedNetworkRuntime {
  readonly policy: NetworkPolicy;
  validate(destination: NetworkDestinationReference): readonly NetworkDiagnostic[];
  validateDestination(destination: NetworkDestinationReference): readonly NetworkDiagnostic[];
  validateTlsRequirement(destination: NetworkDestinationReference): readonly NetworkDiagnostic[];
  validateCapability(capability: string): readonly NetworkDiagnostic[];
  request(input: SafeHttpRequestInput): Promise<SafeHttpResponse>;
}

/** Upper bound on any request timeout, whatever the caller asks for. */
export const SAFE_HTTP_MAX_TIMEOUT_MS = 120_000;
/** Prompt cap used when an AI provider policy declares no maxPromptBytes. */
export const DEFAULT_MAX_PROMPT_BYTES = 1024 * 1024;
const APPROVED_AI_PROVIDER_IDS: ReadonlySet<string> = new Set(["openai"]);

const PROTOCOLS: ReadonlySet<string> = new Set(["https", "http", "tls", "tcp", "udp", "websocket", "rawSocket"]);
const TLS_PROTOCOLS: ReadonlySet<string> = new Set(["https", "tls"]);
const METHODS: ReadonlySet<string> = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const SECRET_HEADERS: ReadonlySet<string> = new Set(["authorization", "proxy-authorization", "cookie", "x-api-key", "api-key", "x-auth-token"]);
const SECRET_QUERY = /[?&](?:access_token|token|api_key|apikey|key|secret|password|signature|sig)=/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
function diag(code: FungiNetworkCode, message: string, path: string): NetworkDiagnostic {
  return Object.freeze({ code, severity: "error" as const, message, path });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const normaliseHost = (host: string): string => host.trim().toLowerCase().replace(/\.$/, "");

function wellFormedDestination(destination: unknown): destination is NetworkDestinationReference {
  if (!isRecord(destination)) return false;
  const { name, protocol, host, port, tlsRequired } = destination;
  if (typeof name !== "string" || name.trim().length === 0) return false;
  if (typeof protocol !== "string" || !PROTOCOLS.has(protocol)) return false;
  if (typeof host !== "string" || host.trim().length === 0 || CONTROL.test(host) || /[\s/@]/.test(host)) return false;
  if (port !== undefined && (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535)) return false;
  return typeof tlsRequired === "boolean";
}

/**
 * Deny-by-default destination check. A destination passes only when it is well formed, is not an
 * SSRF target (per `policy.egress`, defaults deny non-public hosts), is not a raw socket while
 * raw sockets are denied, and matches an outbound `allow` rule (exact host, protocol and port) with
 * no matching `deny` rule. Undeclared destinations are FUNGI-NETWORK-001 even when the policy's
 * defaultEffect is "allow" (README: validation must reject undeclared destinations; owner may revisit).
 * A "*" host never matches, so wildcard egress admits nothing.
 */
export function validateDestination(destination: NetworkDestinationReference, policy: NetworkPolicy): NetworkDiagnostic[] {
  if (!isRecord(policy) || !Array.isArray(policy.endpoints)) return [diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Network policy is unavailable or malformed.", "policy")];
  if (!wellFormedDestination(destination)) return [diag(FUNGI_NETWORK_CODES.UNDECLARED_DESTINATION, "Destination must declare a name, a known protocol, a plain host, an optional port 1-65535 and tlsRequired.", "destination")];
  const out: NetworkDiagnostic[] = [];
  const host = normaliseHost(destination.host);
  if (destination.protocol === "rawSocket" && policy.denyRawSockets !== false) out.push(diag(FUNGI_NETWORK_CODES.RAW_SOCKET_DENIED, "Raw sockets are denied by policy.", "destination.protocol"));
  const egress = guardOutboundHost(host, policy.egress ?? {});
  if (!egress.allowed) out.push(diag(FUNGI_NETWORK_CODES.DESTINATION_NOT_ALLOWLISTED, "Destination host is an SSRF target and is denied.", "destination.host"));
  const endpoints: readonly NetworkEndpointRule[] = policy.endpoints;
  const matches = endpoints.filter((rule) =>
    rule.direction === "outbound" &&
    rule.protocol === destination.protocol &&
    (rule.hosts ?? []).some((h: string) => h !== "*" && normaliseHost(h) === host) &&
    (rule.ports === undefined || rule.ports.length === 0 || (destination.port !== undefined && rule.ports.includes(destination.port))));
  if (matches.some((rule) => rule.effect === "deny")) out.push(diag(FUNGI_NETWORK_CODES.DESTINATION_NOT_ALLOWLISTED, "Destination matches a deny rule.", "destination"));
  else if (!matches.some((rule) => rule.effect === "allow")) out.push(diag(FUNGI_NETWORK_CODES.UNDECLARED_DESTINATION, "Destination is not declared by an outbound allow rule.", "destination"));
  return out;
}

/** TLS check: a TLS-requiring policy or destination admits only https/tls, and tlsRequired may not be false under a TLS policy. */
export function validateTlsRequirement(destination: NetworkDestinationReference, policy: NetworkPolicy): NetworkDiagnostic[] {
  if (!isRecord(policy) || !isRecord(policy.tls)) return [diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Network TLS policy is unavailable or malformed.", "policy.tls")];
  if (!wellFormedDestination(destination)) return [diag(FUNGI_NETWORK_CODES.INSECURE_TRANSPORT, "Destination is malformed; transport security cannot be established.", "destination")];
  const policyRequires = policy.tls.requireTls !== false;
  const out: NetworkDiagnostic[] = [];
  if ((policyRequires || destination.tlsRequired) && !TLS_PROTOCOLS.has(destination.protocol)) out.push(diag(FUNGI_NETWORK_CODES.INSECURE_TRANSPORT, "Plaintext transport is denied; use https or tls.", "destination.protocol"));
  if (policyRequires && destination.tlsRequired !== true) out.push(diag(FUNGI_NETWORK_CODES.INSECURE_TRANSPORT, "Destination must declare tlsRequired under a TLS-requiring policy.", "destination.tlsRequired"));
  return out;
}

/**
 * Capability check. NetworkPolicy carries no capability grants, so the grants are passed explicitly;
 * with none (the default) every capability is FUNGI-NETWORK-002.
 */
export function validateCapability(capability: string, policy: NetworkPolicy, granted: readonly string[] = []): NetworkDiagnostic[] {
  if (!isRecord(policy)) return [diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Network policy is unavailable or malformed.", "policy")];
  if (typeof capability !== "string" || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(capability)) return [diag(FUNGI_NETWORK_CODES.CAPABILITY_MISSING, "Capability must be a declared identifier.", "capability")];
  if (!Array.isArray(granted) || !granted.includes(capability)) return [diag(FUNGI_NETWORK_CODES.CAPABILITY_MISSING, "Capability is not granted for this network operation.", "capability")];
  return [];
}

function validateRequestShape(input: SafeHttpRequestInput, policy: NetworkPolicy): NetworkDiagnostic[] {
  const out: NetworkDiagnostic[] = [];
  if (!METHODS.has(input.method)) out.push(diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Method must be GET, POST, PUT, PATCH or DELETE.", "method"));
  if (typeof input.path !== "string" || !input.path.startsWith("/") || input.path.startsWith("//") || CONTROL.test(input.path) || input.path.includes("\\") || input.path.includes("#") || /(?:^|\/)\.\.?(?:\/|\?|$)/.test(input.path) || /%(?:2e|2f|5c|00)/i.test(input.path)) {
    out.push(diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Path must be an origin-relative path starting with a single '/', with no dot segments or encoded dots/slashes.", "path"));
  } else if (policy.privacy?.denyQueryStringSecrets !== false && SECRET_QUERY.test(input.path)) {
    out.push(diag(FUNGI_NETWORK_CODES.SECRET_FLOW, "Secrets must not travel in the query string.", "path"));
  }
  const timeoutOk = typeof input.timeoutMs === "number" && Number.isInteger(input.timeoutMs) && input.timeoutMs >= 1 && input.timeoutMs <= SAFE_HTTP_MAX_TIMEOUT_MS;
  if (!timeoutOk) out.push(diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, `timeoutMs must be an integer 1..${SAFE_HTTP_MAX_TIMEOUT_MS}.`, "timeoutMs"));
  if (input.headers !== undefined) {
    if (!isRecord(input.headers)) out.push(diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Headers must be a string record.", "headers"));
    else for (const [name, value] of Object.entries(input.headers)) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || typeof value !== "string" || CONTROL.test(value)) {
        out.push(diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Header names must be tokens and values must carry no control characters.", "headers"));
      } else if (name.toLowerCase() === "host" && normaliseHost(value.replace(/:\d{1,5}$/, "")) !== normaliseHost(input.destination.host)) {
        out.push(diag(FUNGI_NETWORK_CODES.DESTINATION_NOT_ALLOWLISTED, "A Host header must name the validated destination host.", "headers.host"));
      } else if (SECRET_HEADERS.has(name.toLowerCase()) && !TLS_PROTOCOLS.has(input.destination.protocol)) {
        out.push(diag(FUNGI_NETWORK_CODES.SECRET_FLOW, "Credential headers are only sent over TLS.", `headers.${name.toLowerCase()}`));
      }
    }
  }
  return out;
}

const runtimeUsable = (runtime: unknown): runtime is GovernedNetworkRuntime =>
  isRecord(runtime) && isRecord(runtime.policy) &&
  ["validate", "validateDestination", "validateTlsRequirement", "validateCapability", "request"].every((k) => typeof runtime[k] === "function");

export class NetworkAdmissionError extends Error {
  readonly diagnostics: readonly NetworkDiagnostic[];
  constructor(diagnostics: readonly NetworkDiagnostic[]) {
    super(`Network request refused: ${[...new Set(diagnostics.map((d) => d.code))].join(", ")}`);
    this.name = "NetworkAdmissionError";
    this.diagnostics = Object.freeze([...diagnostics]);
  }
}

function runtimeDiagnostics(call: () => readonly NetworkDiagnostic[], path: string): NetworkDiagnostic[] {
  try {
    const result = call();
    if (!Array.isArray(result)) return [diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Runtime validator returned no diagnostic list.", path)];
    return result.filter((d) => isRecord(d) && d.severity === "error");
  } catch {
    return [diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Runtime validator threw.", path)];
  }
}

/**
 * Validate a request against the runtime's policy and then delegate to `runtime.request`.
 * Rejects with NetworkAdmissionError on any error diagnostic, before any I/O. The capability must be
 * in the caller's explicit `granted` list (default none) AND pass the runtime's own validateCapability;
 * a permissive runtime cannot admit an ungranted capability.
 * A response that is not a plain record with an integer status 100-599, string headers and the
 * same destination is refused (FUNGI-NETWORK-008).
 */
export async function safeHttpRequest(input: SafeHttpRequestInput, runtime: GovernedNetworkRuntime, granted: readonly string[] = []): Promise<SafeHttpResponse> {
  if (!runtimeUsable(runtime)) throw new NetworkAdmissionError([diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Governed network runtime is unavailable or incomplete.", "runtime")]);
  if (!isRecord(input)) throw new NetworkAdmissionError([diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Request input must be a plain record.", "input")]);
  const policy = runtime.policy;
  const destination = input.destination;
  const diagnostics: NetworkDiagnostic[] = [
    ...validateDestination(destination, policy),
    ...validateTlsRequirement(destination, policy),
    ...validateCapability(input.capability, policy, granted),
  ];
  if (wellFormedDestination(destination)) diagnostics.push(...validateRequestShape(input, policy));
  diagnostics.push(
    ...runtimeDiagnostics(() => runtime.validate(destination), "runtime.validate"),
    ...runtimeDiagnostics(() => runtime.validateDestination(destination), "runtime.validateDestination"),
    ...runtimeDiagnostics(() => runtime.validateTlsRequirement(destination), "runtime.validateTlsRequirement"),
    ...runtimeDiagnostics(() => runtime.validateCapability(input.capability), "runtime.validateCapability"),
  );
  if (diagnostics.length > 0) throw new NetworkAdmissionError(diagnostics);
  const response: unknown = await runtime.request(input);
  const okResponse = isRecord(response) &&
    typeof response.status === "number" && Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 &&
    isRecord(response.headers) && Object.values(response.headers).every((v) => typeof v === "string") &&
    response.destination === destination &&
    typeof response.receivedAt === "string" &&
    typeof response.durationMs === "number" && Number.isFinite(response.durationMs) && response.durationMs >= 0;
  if (!okResponse) throw new NetworkAdmissionError([diag(FUNGI_NETWORK_CODES.RUNTIME_POLICY_UNAVAILABLE, "Runtime returned a malformed response or a different destination.", "response")]);
  return response as unknown as SafeHttpResponse;
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bBearer\s{1,8}[A-Za-z0-9._~+/-]{16}/,
  /\beyJ[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8}/,
];
// Bounded patterns only: the gate runs on attacker-controlled text up to the byte cap, so every
// scan must stay linear (an unbounded `[...]+@` scan is quadratic on a long run with no '@').
const EMAIL_WINDOW = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/;
const PHONE = /\+?\d[\d ().-]{8,24}\d/;

const looksLikePii = (text: string): boolean => EMAIL_WINDOW.test(text) || PHONE.test(text);

/** Count TextEncoder-compatible UTF-8 bytes without allocating an encoded copy. */
const utf8ByteLengthUpTo = (text: string, maximum: number): number | undefined => {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const first = text.charCodeAt(i);
    if (first <= 0x7f) bytes += 1;
    else if (first <= 0x7ff) bytes += 2;
    else if (first >= 0xd800 && first <= 0xdbff && i + 1 < text.length) {
      const second = text.charCodeAt(i + 1);
      if (second >= 0xdc00 && second <= 0xdfff) {
        bytes += 4;
        i++;
      } else {
        // TextEncoder replaces an unpaired surrogate with U+FFFD (three UTF-8 bytes).
        bytes += 3;
      }
    } else {
      // Includes lone low surrogates, also replaced with U+FFFD by TextEncoder.
      bytes += 3;
    }
    if (bytes > maximum) return undefined;
  }
  return bytes;
};

/**
 * Prompt gate against an AI provider policy. Heuristic and fail-closed: a non-string prompt or one
 * over the byte cap (DEFAULT_MAX_PROMPT_BYTES when the policy declares none) is FUNGI-NETWORK-007;
 * secret-looking text is FUNGI-NETWORK-006 unless allowSecretsInPrompt; e-mail or phone-like text is
 * FUNGI-NETWORK-006 unless allowPii. Passing this gate is not proof a prompt is secret- or PII-free.
 */
export function validateAiPrompt(prompt: string, policy: AiProviderNetworkPolicy): NetworkDiagnostic[] {
  if (!isRecord(policy) || typeof policy.provider !== "string" || !APPROVED_AI_PROVIDER_IDS.has(policy.provider)) return [diag(FUNGI_NETWORK_CODES.AI_PROVIDER_NOT_APPROVED, "AI provider policy is missing or not approved.", "policy")];
  if (typeof prompt !== "string") return [diag(FUNGI_NETWORK_CODES.AI_PROVIDER_NOT_APPROVED, "Prompt must be text.", "prompt")];
  const out: NetworkDiagnostic[] = [];
  const configuredCap = policy.maxPromptBytes;
  if (configuredCap !== undefined && (typeof configuredCap !== "number" || !Number.isSafeInteger(configuredCap) || configuredCap < 1 || configuredCap > DEFAULT_MAX_PROMPT_BYTES)) {
    return [diag(FUNGI_NETWORK_CODES.AI_PROVIDER_NOT_APPROVED, "Prompt size policy is invalid.", "policy.maxPromptBytes")];
  }
  const cap = configuredCap ?? DEFAULT_MAX_PROMPT_BYTES;
  // Refuse before encoding so an attacker-controlled string cannot cause a larger temporary byte allocation.
  if (utf8ByteLengthUpTo(prompt, cap) === undefined) return [diag(FUNGI_NETWORK_CODES.AI_PROVIDER_NOT_APPROVED, "Prompt exceeds the provider's size policy.", "prompt")];
  if (policy.allowSecretsInPrompt !== true && SECRET_PATTERNS.some((re) => re.test(prompt))) out.push(diag(FUNGI_NETWORK_CODES.SECRET_FLOW, "Prompt appears to contain a secret.", "prompt"));
  if (policy.allowPii !== true && looksLikePii(prompt)) out.push(diag(FUNGI_NETWORK_CODES.SECRET_FLOW, "Prompt appears to contain personal data.", "prompt"));
  return out;
}
