// Auth provider boundary contract (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape AuthProviderBoundary / AuthProviderDescriptor for the app-kernel
// "Define auth provider boundary contract" TODO. Captures the credential-admission
// rules a provider must honour (kind, location, issuer/audience, algorithms,
// PoP, emit principal/scopes) without verifying tokens, touching crypto, or
// wiring createAppKernel auth gates.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - Kind / location / algorithm tokens are exact closed vocabularies.
//  - "none" / HS* algorithms and header-presence fallback are refused.
//  - Diagnostic messages never echo tokens, labels, keys, paths, secrets or
//    unknown values.
//  - Numbers are finite, non-negative, safe integers within bounds (no NaN/Infinity).
//
// Not covered: live token verify, JWKS fetch, OAuth handshakes, mTLS handshake,
// scope/role policy model, idempotency store, rate-limit enforcement, Structured
// Await, queue/job contracts, runtime audit report, or handoff contracts.

/** Record / input is not a closed data object. */
export const FUNGI_APPK_APB_001 = "FUNGI-APPK-APB-001";
/** A field value is outside its closed domain. */
export const FUNGI_APPK_APB_002 = "FUNGI-APPK-APB-002";
/** Provider set consistency refuse (empty providers / duplicate ids / kind rules). */
export const FUNGI_APPK_APB_003 = "FUNGI-APPK-APB-003";
/** Nested provider / list refuse. */
export const FUNGI_APPK_APB_004 = "FUNGI-APPK-APB-004";
/** Result consistency refuse. */
export const FUNGI_APPK_APB_005 = "FUNGI-APPK-APB-005";

export const AUTH_PROVIDER_BOUNDARY_SCHEMA = "galerina.app-kernel.auth-provider-boundary/v1";

export const AUTH_PROVIDER_KINDS = Object.freeze([
  "bearer",
  "jwt",
  "oauth2",
  "oidc",
  "dpop",
  "mtls",
  "apiKey",
  "webhookSignature",
  "capabilityToken",
] as const);
export type AuthProviderKind = (typeof AUTH_PROVIDER_KINDS)[number];

export const AUTH_CREDENTIAL_LOCATIONS = Object.freeze([
  "authorizationHeader",
  "customHeader",
  "clientCertificate",
] as const);
export type AuthCredentialLocation = (typeof AUTH_CREDENTIAL_LOCATIONS)[number];

/** Symmetric and "none" algorithms are reserved and refused (zero-trust defaults). */
export const AUTH_ALLOWED_ALGORITHMS = Object.freeze([
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
  "PS256",
  "PS384",
  "PS512",
] as const);
export type AuthAllowedAlgorithm = (typeof AUTH_ALLOWED_ALGORITHMS)[number];

export const AUTH_PROVIDER_BOUNDARY_FIELDS = Object.freeze([
  "schema",
  "name",
  "providers",
  "diagnostics",
] as const);

export const AUTH_PROVIDER_DESCRIPTOR_FIELDS = Object.freeze([
  "id",
  "kind",
  "credentialLocation",
  "credentialHeader",
  "tokenPrefix",
  "audience",
  "issuer",
  "allowedAlgorithms",
  "maxClockSkewSeconds",
  "requireProofOfPossession",
  "emitPrincipalId",
  "emitScopes",
  "allowHeaderPresenceFallback",
] as const);

export type AuthProviderDiagnosticField =
  | "record"
  | "schema"
  | "name"
  | "providers"
  | "diagnostics"
  | "id"
  | "kind"
  | "credentialLocation"
  | "credentialHeader"
  | "tokenPrefix"
  | "audience"
  | "issuer"
  | "allowedAlgorithms"
  | "maxClockSkewSeconds"
  | "requireProofOfPossession"
  | "emitPrincipalId"
  | "emitScopes"
  | "allowHeaderPresenceFallback";

export interface AuthProviderDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: AuthProviderDiagnosticField;
}

export interface AuthProviderDescriptor {
  readonly id: string;
  readonly kind: AuthProviderKind;
  readonly credentialLocation: AuthCredentialLocation;
  readonly credentialHeader: string;
  readonly tokenPrefix: string;
  readonly audience: string;
  readonly issuer: string;
  readonly allowedAlgorithms: readonly AuthAllowedAlgorithm[];
  readonly maxClockSkewSeconds: number;
  readonly requireProofOfPossession: boolean;
  readonly emitPrincipalId: boolean;
  readonly emitScopes: boolean;
  readonly allowHeaderPresenceFallback: false;
}

export interface AuthProviderBoundary {
  readonly schema: typeof AUTH_PROVIDER_BOUNDARY_SCHEMA;
  readonly name: string;
  readonly providers: readonly AuthProviderDescriptor[];
  readonly diagnostics: readonly AuthProviderDiagnostic[];
}

export type ReadAuthProviderBoundaryResult =
  | { readonly ok: true; readonly value: AuthProviderBoundary }
  | { readonly ok: false; readonly diagnostics: readonly AuthProviderDiagnostic[] };

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const ID_TOKEN = /^[a-zA-Z_][A-Za-z0-9_]{0,63}$/;
const HEADER_TOKEN = /^[A-Za-z0-9-]{1,64}$/;
const PREFIX_TOKEN = /^[A-Za-z0-9._+-]{0,32}$/;
const ISSUER_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/~-]{0,255}$/;
const AUDIENCE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/~-]{0,255}$/;
const MAX_PROVIDERS = 64;
const MAX_ALGS = 16;
const MAX_LIST = 4096;
const MAX_TOKEN = 128;
const MAX_CLOCK_SKEW = 300;
const KIND_SET = new Set<string>(AUTH_PROVIDER_KINDS);
const LOCATION_SET = new Set<string>(AUTH_CREDENTIAL_LOCATIONS);
const ALG_SET = new Set<string>(AUTH_ALLOWED_ALGORITHMS);
const KINDS_NEED_ISSUER = new Set<string>(["jwt", "oauth2", "oidc", "dpop", "capabilityToken"]);
const KINDS_NEED_AUDIENCE = new Set<string>(["jwt", "oauth2", "oidc", "dpop", "capabilityToken"]);
const KINDS_NEED_ALGS = new Set<string>(["jwt", "oauth2", "oidc", "dpop", "capabilityToken"]);
const KINDS_NEED_POP = new Set<string>(["dpop"]);
const KINDS_MTLS = new Set<string>(["mtls"]);

const diag = (
  code: string,
  message: string,
  field: AuthProviderDiagnosticField,
): AuthProviderDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

type Snapshot = { readonly ok: true; readonly values: ReadonlyMap<string, unknown> } | { readonly ok: false };

function snapshotRecord(value: unknown, maxKeys: number): Snapshot {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false };
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return { ok: false };
    const values = new Map<string, unknown>();
    const keys = Reflect.ownKeys(value);
    if (keys.length > maxKeys) return { ok: false };
    for (const key of keys) {
      if (typeof key !== "string") return { ok: false };
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return { ok: false };
      values.set(key, d.value);
    }
    return { ok: true, values };
  } catch {
    return { ok: false };
  }
}

function snapshotArray(value: unknown, max: number): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const length: unknown = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > max) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1) return undefined;
    const out: unknown[] = [];
    for (let i = 0; i < length; i += 1) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return undefined;
      out.push(d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

function strictlyAscending(xs: readonly string[]): boolean {
  return xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);
}

function readBoundedInt(
  value: unknown,
  field: AuthProviderDiagnosticField,
  max: number,
  out: AuthProviderDiagnostic[],
): number | undefined {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  ) {
    out.push(diag(FUNGI_APPK_APB_002, "Numeric field is outside the closed domain.", field));
    return undefined;
  }
  return value;
}

function readBoolean(
  value: unknown,
  field: AuthProviderDiagnosticField,
  out: AuthProviderDiagnostic[],
): boolean | undefined {
  if (value !== true && value !== false) {
    out.push(diag(FUNGI_APPK_APB_002, "Flag must be a boolean.", field));
    return undefined;
  }
  return value;
}

function requireKeysSubset(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  required: readonly string[],
  field: AuthProviderDiagnosticField,
  out: AuthProviderDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_APB_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_APB_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function snapshotDiagnostics(
  value: unknown,
  field: AuthProviderDiagnosticField,
  out: AuthProviderDiagnostic[],
): readonly AuthProviderDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_APB_001, "Diagnostics must be a dense array within bounds.", field));
    return undefined;
  }
  const result: AuthProviderDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_APB_001, "Diagnostic entry must be a plain data object.", field));
      return undefined;
    }
    const known = new Set(["code", "severity", "message", "field"]);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_APPK_APB_001, "Diagnostic entry has a key outside the closed shape.", field));
      return undefined;
    }
    for (const req of known) {
      if (!snap.values.has(req)) {
        out.push(diag(FUNGI_APPK_APB_001, "Diagnostic entry is missing a required field.", field));
        return undefined;
      }
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_APB_002, "Diagnostic code is outside the closed domain.", field));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_APPK_APB_002, "Diagnostic severity is outside the closed domain.", field));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_APPK_APB_002, "Diagnostic message is outside the closed domain.", field));
      return undefined;
    }
    if (typeof f !== "string" || f.length === 0 || f.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_APB_002, "Diagnostic field is outside the closed domain.", field));
      return undefined;
    }
    result.push(
      Object.freeze({ code, severity: "error" as const, message, field: f as AuthProviderDiagnosticField }),
    );
  }
  return Object.freeze(result);
}

function readAlgorithms(
  value: unknown,
  out: AuthProviderDiagnostic[],
): readonly AuthAllowedAlgorithm[] | undefined {
  const items = snapshotArray(value, MAX_ALGS);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_APB_004, "Allowed algorithms must be a dense array within bounds.", "allowedAlgorithms"));
    return undefined;
  }
  const algs: AuthAllowedAlgorithm[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !ALG_SET.has(item)) {
      out.push(diag(FUNGI_APPK_APB_002, "Algorithm token is outside the closed vocabulary.", "allowedAlgorithms"));
      return undefined;
    }
    algs.push(item as AuthAllowedAlgorithm);
  }
  if (!strictlyAscending(algs)) {
    out.push(
      diag(FUNGI_APPK_APB_002, "Allowed algorithms must be strictly ascending with no duplicates.", "allowedAlgorithms"),
    );
    return undefined;
  }
  return Object.freeze(algs);
}

function readProvider(
  value: unknown,
  out: AuthProviderDiagnostic[],
): AuthProviderDescriptor | undefined {
  const snap = snapshotRecord(value, AUTH_PROVIDER_DESCRIPTOR_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_APB_004, "Provider descriptor must be a plain data object.", "providers"));
    return undefined;
  }
  if (
    !requireKeysSubset(
      snap,
      AUTH_PROVIDER_DESCRIPTOR_FIELDS,
      [
        "id",
        "kind",
        "credentialLocation",
        "credentialHeader",
        "tokenPrefix",
        "audience",
        "issuer",
        "allowedAlgorithms",
        "maxClockSkewSeconds",
        "requireProofOfPossession",
        "emitPrincipalId",
        "emitScopes",
        "allowHeaderPresenceFallback",
      ],
      "providers",
      out,
    )
  ) {
    return undefined;
  }

  const id = snap.values.get("id");
  if (typeof id !== "string" || !ID_TOKEN.test(id)) {
    out.push(diag(FUNGI_APPK_APB_002, "Provider id is outside the closed domain.", "id"));
    return undefined;
  }

  const kind = snap.values.get("kind");
  if (typeof kind !== "string" || !KIND_SET.has(kind)) {
    out.push(diag(FUNGI_APPK_APB_002, "Provider kind is outside the closed vocabulary.", "kind"));
    return undefined;
  }

  const credentialLocation = snap.values.get("credentialLocation");
  if (typeof credentialLocation !== "string" || !LOCATION_SET.has(credentialLocation)) {
    out.push(diag(FUNGI_APPK_APB_002, "Credential location is outside the closed vocabulary.", "credentialLocation"));
    return undefined;
  }

  const credentialHeader = snap.values.get("credentialHeader");
  if (typeof credentialHeader !== "string") {
    out.push(diag(FUNGI_APPK_APB_002, "Credential header is outside the closed domain.", "credentialHeader"));
    return undefined;
  }

  const tokenPrefix = snap.values.get("tokenPrefix");
  if (typeof tokenPrefix !== "string" || !PREFIX_TOKEN.test(tokenPrefix)) {
    out.push(diag(FUNGI_APPK_APB_002, "Token prefix is outside the closed domain.", "tokenPrefix"));
    return undefined;
  }

  const audience = snap.values.get("audience");
  if (typeof audience !== "string" || (audience.length > 0 && !AUDIENCE_TOKEN.test(audience))) {
    out.push(diag(FUNGI_APPK_APB_002, "Audience is outside the closed domain.", "audience"));
    return undefined;
  }

  const issuer = snap.values.get("issuer");
  if (typeof issuer !== "string" || (issuer.length > 0 && !ISSUER_TOKEN.test(issuer))) {
    out.push(diag(FUNGI_APPK_APB_002, "Issuer is outside the closed domain.", "issuer"));
    return undefined;
  }

  const allowedAlgorithms = readAlgorithms(snap.values.get("allowedAlgorithms"), out);
  if (allowedAlgorithms === undefined) return undefined;

  const maxClockSkewSeconds = readBoundedInt(
    snap.values.get("maxClockSkewSeconds"),
    "maxClockSkewSeconds",
    MAX_CLOCK_SKEW,
    out,
  );
  if (maxClockSkewSeconds === undefined) return undefined;

  const requireProofOfPossession = readBoolean(
    snap.values.get("requireProofOfPossession"),
    "requireProofOfPossession",
    out,
  );
  if (requireProofOfPossession === undefined) return undefined;

  const emitPrincipalId = readBoolean(snap.values.get("emitPrincipalId"), "emitPrincipalId", out);
  if (emitPrincipalId === undefined) return undefined;

  const emitScopes = readBoolean(snap.values.get("emitScopes"), "emitScopes", out);
  if (emitScopes === undefined) return undefined;

  const allowHeaderPresenceFallback = snap.values.get("allowHeaderPresenceFallback");
  if (allowHeaderPresenceFallback !== false) {
    out.push(
      diag(
        FUNGI_APPK_APB_002,
        "Header-presence authentication fallback is refused.",
        "allowHeaderPresenceFallback",
      ),
    );
    return undefined;
  }

  // Kind / location consistency (never echo kind/location tokens).
  if (KINDS_MTLS.has(kind)) {
    if (credentialLocation !== "clientCertificate") {
      out.push(diag(FUNGI_APPK_APB_003, "mTLS providers must use client-certificate location.", "credentialLocation"));
      return undefined;
    }
    if (credentialHeader.length !== 0) {
      out.push(diag(FUNGI_APPK_APB_003, "mTLS providers must use an empty credential header.", "credentialHeader"));
      return undefined;
    }
    if (tokenPrefix.length !== 0) {
      out.push(diag(FUNGI_APPK_APB_003, "mTLS providers must use an empty token prefix.", "tokenPrefix"));
      return undefined;
    }
  } else {
    if (credentialLocation === "clientCertificate") {
      out.push(diag(FUNGI_APPK_APB_003, "Non-mTLS providers must not use client-certificate location.", "credentialLocation"));
      return undefined;
    }
    if (!HEADER_TOKEN.test(credentialHeader)) {
      out.push(diag(FUNGI_APPK_APB_002, "Credential header is outside the closed domain.", "credentialHeader"));
      return undefined;
    }
  }

  if (KINDS_NEED_ISSUER.has(kind) && issuer.length === 0) {
    out.push(diag(FUNGI_APPK_APB_003, "Provider kind requires a non-empty issuer.", "issuer"));
    return undefined;
  }
  if (!KINDS_NEED_ISSUER.has(kind) && issuer.length !== 0) {
    out.push(diag(FUNGI_APPK_APB_003, "Provider kind must not declare an issuer.", "issuer"));
    return undefined;
  }

  if (KINDS_NEED_AUDIENCE.has(kind) && audience.length === 0) {
    out.push(diag(FUNGI_APPK_APB_003, "Provider kind requires a non-empty audience.", "audience"));
    return undefined;
  }
  if (!KINDS_NEED_AUDIENCE.has(kind) && audience.length !== 0) {
    out.push(diag(FUNGI_APPK_APB_003, "Provider kind must not declare an audience.", "audience"));
    return undefined;
  }

  if (KINDS_NEED_ALGS.has(kind) && allowedAlgorithms.length === 0) {
    out.push(diag(FUNGI_APPK_APB_003, "Provider kind requires a non-empty algorithm set.", "allowedAlgorithms"));
    return undefined;
  }
  if (!KINDS_NEED_ALGS.has(kind) && allowedAlgorithms.length !== 0) {
    out.push(diag(FUNGI_APPK_APB_003, "Provider kind must not declare algorithms.", "allowedAlgorithms"));
    return undefined;
  }

  if (KINDS_NEED_POP.has(kind) && requireProofOfPossession !== true) {
    out.push(diag(FUNGI_APPK_APB_003, "Provider kind requires proof-of-possession.", "requireProofOfPossession"));
    return undefined;
  }
  if (!KINDS_NEED_POP.has(kind) && requireProofOfPossession !== false) {
    out.push(diag(FUNGI_APPK_APB_003, "Provider kind must not require proof-of-possession.", "requireProofOfPossession"));
    return undefined;
  }

  if (kind === "bearer" && tokenPrefix.length === 0) {
    out.push(diag(FUNGI_APPK_APB_003, "Bearer providers require a non-empty token prefix.", "tokenPrefix"));
    return undefined;
  }
  if (kind !== "bearer" && kind !== "apiKey" && tokenPrefix.length !== 0 && !KINDS_MTLS.has(kind)) {
    // jwt/oauth2/oidc/dpop/webhook/capability may use empty prefix (raw token) only.
    // Non-bearer kinds with a prefix are refused except bearer itself.
    if (kind !== "jwt" && kind !== "oauth2" && kind !== "oidc" && kind !== "dpop" && kind !== "capabilityToken") {
      out.push(diag(FUNGI_APPK_APB_003, "Provider kind must use an empty token prefix.", "tokenPrefix"));
      return undefined;
    }
  }
  if ((kind === "webhookSignature" || kind === "apiKey") && tokenPrefix.length !== 0) {
    out.push(diag(FUNGI_APPK_APB_003, "Provider kind must use an empty token prefix.", "tokenPrefix"));
    return undefined;
  }

  if (emitPrincipalId !== true) {
    out.push(diag(FUNGI_APPK_APB_003, "Auth providers must emit a principal id.", "emitPrincipalId"));
    return undefined;
  }

  return Object.freeze({
    id,
    kind: kind as AuthProviderKind,
    credentialLocation: credentialLocation as AuthCredentialLocation,
    credentialHeader,
    tokenPrefix,
    audience,
    issuer,
    allowedAlgorithms,
    maxClockSkewSeconds,
    requireProofOfPossession,
    emitPrincipalId,
    emitScopes,
    allowHeaderPresenceFallback: false as const,
  });
}

function refusedBoundary(diagnostics: readonly AuthProviderDiagnostic[]): AuthProviderBoundary {
  return Object.freeze({
    schema: AUTH_PROVIDER_BOUNDARY_SCHEMA,
    name: "Refused",
    providers: Object.freeze([] as AuthProviderDescriptor[]),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed AuthProviderBoundary; never throws; success recomputed from diagnostics. */
export function createAuthProviderBoundary(input: unknown): AuthProviderBoundary {
  const out: AuthProviderDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, AUTH_PROVIDER_BOUNDARY_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_APB_001, "Auth provider boundary must be a plain data object.", "record"));
      return refusedBoundary(out);
    }
    if (
      !requireKeysSubset(
        snap,
        AUTH_PROVIDER_BOUNDARY_FIELDS,
        ["schema", "name", "providers"],
        "record",
        out,
      )
    ) {
      return refusedBoundary(out);
    }

    const schema = snap.values.get("schema");
    if (schema !== AUTH_PROVIDER_BOUNDARY_SCHEMA) {
      out.push(diag(FUNGI_APPK_APB_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedBoundary(out);
    }

    const name = snap.values.get("name");
    if (typeof name !== "string" || !TYPE_NAME.test(name)) {
      out.push(diag(FUNGI_APPK_APB_002, "Boundary name is outside the closed domain.", "name"));
      return refusedBoundary(out);
    }

    const providerItems = snapshotArray(snap.values.get("providers"), MAX_PROVIDERS);
    if (providerItems === undefined) {
      out.push(diag(FUNGI_APPK_APB_004, "Providers must be a dense array within bounds.", "providers"));
      return refusedBoundary(out);
    }
    if (providerItems.length === 0) {
      out.push(diag(FUNGI_APPK_APB_003, "Auth provider boundary requires at least one provider.", "providers"));
      return refusedBoundary(out);
    }

    const providers: AuthProviderDescriptor[] = [];
    const seenIds = new Set<string>();
    for (const item of providerItems) {
      const provider = readProvider(item, out);
      if (provider === undefined) return refusedBoundary(out);
      if (seenIds.has(provider.id)) {
        out.push(diag(FUNGI_APPK_APB_003, "Provider ids must be unique.", "id"));
        return refusedBoundary(out);
      }
      seenIds.add(provider.id);
      providers.push(provider);
    }

    // Providers must be strictly ascending by id for stable closed output.
    const ids = providers.map((p) => p.id);
    if (!strictlyAscending(ids)) {
      out.push(diag(FUNGI_APPK_APB_003, "Providers must be ordered by strictly ascending id.", "providers"));
      return refusedBoundary(out);
    }

    let diagnostics: readonly AuthProviderDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
      if (nested === undefined) return refusedBoundary(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_APB_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedBoundary(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: AUTH_PROVIDER_BOUNDARY_SCHEMA,
      name,
      providers: Object.freeze(providers),
      diagnostics,
    });
  } catch {
    return refusedBoundary([diag(FUNGI_APPK_APB_001, "Auth provider boundary read failed closed.", "record")]);
  }
}

/** Read a closed AuthProviderBoundary; never throws; never echoes refused tokens. */
export function readAuthProviderBoundary(value: unknown): ReadAuthProviderBoundaryResult {
  const created = createAuthProviderBoundary(value);
  if (created.diagnostics.length > 0) {
    return { ok: false, diagnostics: created.diagnostics };
  }
  return { ok: true, value: created };
}

export function isAuthProviderKind(value: unknown): value is AuthProviderKind {
  return typeof value === "string" && KIND_SET.has(value);
}

export function isAuthCredentialLocation(value: unknown): value is AuthCredentialLocation {
  return typeof value === "string" && LOCATION_SET.has(value);
}

export function isAuthAllowedAlgorithm(value: unknown): value is AuthAllowedAlgorithm {
  return typeof value === "string" && ALG_SET.has(value);
}
