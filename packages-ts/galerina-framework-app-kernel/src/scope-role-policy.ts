// Scope and role policy model (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Closed-shape ScopeRolePolicy / RoleDescriptor for the app-kernel
// "Define scope and role policy model" TODO. Captures the role→scope grant
// table a kernel auth gate may consult (admitted scope vocabulary, roles with
// granted scopes, defaultDecision) without wiring createAppKernel auth gates,
// evaluating live principals, or implementing role inheritance.
//
// Zero-trust rules:
//  - Closed shapes via property descriptors (no getters run; symbols / accessors /
//    custom prototypes refuse). Unknown keys refuse without echoing the key.
//  - defaultDecision admits only "deny" (allow is refused).
//  - Scope / role tokens are exact closed domains; wildcards ("*", "...") refused.
//  - Role scopes must be a subset of admittedScopes; lists strictly ascending.
//  - Diagnostic messages never echo tokens, labels, keys, paths, secrets or
//    unknown values.
//  - Numbers are finite, non-negative, safe integers within bounds (no NaN/Infinity).
//
// Not covered: live principal evaluation, role inheritance graphs, IdempotencyStore,
// rate-limit enforcement, Structured Await, queue/job contracts, runtime audit
// report, or handoff contracts to core-runtime / api-server.

/** Record / input is not a closed data object. */
export const FUNGI_APPK_SRP_001 = "FUNGI-APPK-SRP-001";
/** A field value is outside its closed domain. */
export const FUNGI_APPK_SRP_002 = "FUNGI-APPK-SRP-002";
/** Policy set consistency refuse (empty roles / duplicate ids / scope subset). */
export const FUNGI_APPK_SRP_003 = "FUNGI-APPK-SRP-003";
/** Nested role / list refuse. */
export const FUNGI_APPK_SRP_004 = "FUNGI-APPK-SRP-004";
/** Result consistency refuse. */
export const FUNGI_APPK_SRP_005 = "FUNGI-APPK-SRP-005";

export const SCOPE_ROLE_POLICY_SCHEMA = "galerina.app-kernel.scope-role-policy/v1";

/** Zero-trust default: only deny is admitted. "allow" is reserved and refused. */
export const SCOPE_ROLE_DEFAULT_DECISIONS = Object.freeze(["deny"] as const);
export type ScopeRoleDefaultDecision = (typeof SCOPE_ROLE_DEFAULT_DECISIONS)[number];

export const SCOPE_ROLE_POLICY_FIELDS = Object.freeze([
  "schema",
  "name",
  "defaultDecision",
  "admittedScopes",
  "roles",
  "diagnostics",
] as const);

export const ROLE_DESCRIPTOR_FIELDS = Object.freeze(["id", "scopes"] as const);

export type ScopeRoleDiagnosticField =
  | "record"
  | "schema"
  | "name"
  | "defaultDecision"
  | "admittedScopes"
  | "roles"
  | "diagnostics"
  | "id"
  | "scopes";

export interface ScopeRoleDiagnostic {
  readonly code: string;
  readonly severity: "error";
  readonly message: string;
  readonly field: ScopeRoleDiagnosticField;
}

export interface RoleDescriptor {
  readonly id: string;
  readonly scopes: readonly string[];
}

export interface ScopeRolePolicy {
  readonly schema: typeof SCOPE_ROLE_POLICY_SCHEMA;
  readonly name: string;
  readonly defaultDecision: ScopeRoleDefaultDecision;
  readonly admittedScopes: readonly string[];
  readonly roles: readonly RoleDescriptor[];
  readonly diagnostics: readonly ScopeRoleDiagnostic[];
}

export type ReadScopeRolePolicyResult =
  | { readonly ok: true; readonly value: ScopeRolePolicy }
  | { readonly ok: false; readonly diagnostics: readonly ScopeRoleDiagnostic[] };

const TYPE_NAME = /^[A-Z][A-Za-z0-9_]{0,63}$/;
const ROLE_ID = /^[a-z][a-z0-9_]{0,63}$/;
/** Scope tokens match typed-api / route-defaults style: lowercase dotted. */
const SCOPE_TOKEN = /^[a-z][a-z0-9_.-]{0,63}$/;
const MAX_ROLES = 64;
const MAX_SCOPES = 256;
const MAX_LIST = 4096;
const MAX_TOKEN = 128;
const DEFAULT_SET = new Set<string>(SCOPE_ROLE_DEFAULT_DECISIONS);

const diag = (
  code: string,
  message: string,
  field: ScopeRoleDiagnosticField,
): ScopeRoleDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

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

function requireKeysSubset(
  snap: Extract<Snapshot, { ok: true }>,
  allowed: readonly string[],
  required: readonly string[],
  field: ScopeRoleDiagnosticField,
  out: ScopeRoleDiagnostic[],
): boolean {
  const allowedSet = new Set(allowed);
  for (const key of snap.values.keys()) {
    if (!allowedSet.has(key)) {
      out.push(diag(FUNGI_APPK_SRP_001, "Record has a key outside the closed shape.", field));
      return false;
    }
  }
  for (const key of required) {
    if (!snap.values.has(key)) {
      out.push(diag(FUNGI_APPK_SRP_001, "Record is missing a required field.", field));
      return false;
    }
  }
  return true;
}

function isWildcardScope(token: string): boolean {
  return token.includes("*") || token.includes("?") || token === "any" || token === "all";
}

function readScopeList(
  value: unknown,
  field: ScopeRoleDiagnosticField,
  max: number,
  out: ScopeRoleDiagnostic[],
  requireNonEmpty: boolean,
): readonly string[] | undefined {
  const items = snapshotArray(value, max);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_SRP_004, "Scope list must be a dense array within bounds.", field));
    return undefined;
  }
  if (requireNonEmpty && items.length === 0) {
    out.push(diag(FUNGI_APPK_SRP_003, "Scope list must be non-empty.", field));
    return undefined;
  }
  const scopes: string[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !SCOPE_TOKEN.test(item) || isWildcardScope(item)) {
      out.push(diag(FUNGI_APPK_SRP_002, "Scope token is outside the closed domain.", field));
      return undefined;
    }
    scopes.push(item);
  }
  if (!strictlyAscending(scopes)) {
    out.push(diag(FUNGI_APPK_SRP_002, "Scope list must be strictly ascending with no duplicates.", field));
    return undefined;
  }
  return Object.freeze(scopes);
}

function snapshotDiagnostics(
  value: unknown,
  field: ScopeRoleDiagnosticField,
  out: ScopeRoleDiagnostic[],
): readonly ScopeRoleDiagnostic[] | undefined {
  const items = snapshotArray(value, MAX_LIST);
  if (items === undefined) {
    out.push(diag(FUNGI_APPK_SRP_001, "Diagnostics must be a dense array within bounds.", field));
    return undefined;
  }
  const result: ScopeRoleDiagnostic[] = [];
  for (const item of items) {
    const snap = snapshotRecord(item, 8);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_SRP_001, "Diagnostic entry must be a plain data object.", field));
      return undefined;
    }
    const known = new Set(["code", "severity", "message", "field"]);
    if ([...snap.values.keys()].some((k) => !known.has(k))) {
      out.push(diag(FUNGI_APPK_SRP_001, "Diagnostic entry has a key outside the closed shape.", field));
      return undefined;
    }
    for (const req of known) {
      if (!snap.values.has(req)) {
        out.push(diag(FUNGI_APPK_SRP_001, "Diagnostic entry is missing a required field.", field));
        return undefined;
      }
    }
    const code = snap.values.get("code");
    const severity = snap.values.get("severity");
    const message = snap.values.get("message");
    const f = snap.values.get("field");
    if (typeof code !== "string" || code.length === 0 || code.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_SRP_002, "Diagnostic code is outside the closed domain.", field));
      return undefined;
    }
    if (severity !== "error") {
      out.push(diag(FUNGI_APPK_SRP_002, "Diagnostic severity is outside the closed domain.", field));
      return undefined;
    }
    if (typeof message !== "string" || message.length === 0 || message.length > 512) {
      out.push(diag(FUNGI_APPK_SRP_002, "Diagnostic message is outside the closed domain.", field));
      return undefined;
    }
    if (typeof f !== "string" || f.length === 0 || f.length > MAX_TOKEN) {
      out.push(diag(FUNGI_APPK_SRP_002, "Diagnostic field is outside the closed domain.", field));
      return undefined;
    }
    result.push(
      Object.freeze({ code, severity: "error" as const, message, field: f as ScopeRoleDiagnosticField }),
    );
  }
  return Object.freeze(result);
}

function readRole(
  value: unknown,
  admitted: ReadonlySet<string>,
  out: ScopeRoleDiagnostic[],
): RoleDescriptor | undefined {
  const snap = snapshotRecord(value, ROLE_DESCRIPTOR_FIELDS.length);
  if (!snap.ok) {
    out.push(diag(FUNGI_APPK_SRP_004, "Role descriptor must be a plain data object.", "roles"));
    return undefined;
  }
  if (!requireKeysSubset(snap, ROLE_DESCRIPTOR_FIELDS, ["id", "scopes"], "roles", out)) {
    return undefined;
  }

  const id = snap.values.get("id");
  if (typeof id !== "string" || !ROLE_ID.test(id)) {
    out.push(diag(FUNGI_APPK_SRP_002, "Role id is outside the closed domain.", "id"));
    return undefined;
  }

  const scopes = readScopeList(snap.values.get("scopes"), "scopes", MAX_SCOPES, out, true);
  if (scopes === undefined) return undefined;

  for (const scope of scopes) {
    if (!admitted.has(scope)) {
      out.push(diag(FUNGI_APPK_SRP_003, "Role scopes must be a subset of admittedScopes.", "scopes"));
      return undefined;
    }
  }

  return Object.freeze({ id, scopes });
}

function refusedPolicy(diagnostics: readonly ScopeRoleDiagnostic[]): ScopeRolePolicy {
  return Object.freeze({
    schema: SCOPE_ROLE_POLICY_SCHEMA,
    name: "Refused",
    defaultDecision: "deny" as const,
    admittedScopes: Object.freeze([] as string[]),
    roles: Object.freeze([] as RoleDescriptor[]),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Build a closed ScopeRolePolicy; never throws; success recomputed from diagnostics. */
export function createScopeRolePolicy(input: unknown): ScopeRolePolicy {
  const out: ScopeRoleDiagnostic[] = [];
  try {
    const snap = snapshotRecord(input, SCOPE_ROLE_POLICY_FIELDS.length);
    if (!snap.ok) {
      out.push(diag(FUNGI_APPK_SRP_001, "Scope role policy must be a plain data object.", "record"));
      return refusedPolicy(out);
    }
    if (
      !requireKeysSubset(
        snap,
        SCOPE_ROLE_POLICY_FIELDS,
        ["schema", "name", "defaultDecision", "admittedScopes", "roles"],
        "record",
        out,
      )
    ) {
      return refusedPolicy(out);
    }

    const schema = snap.values.get("schema");
    if (schema !== SCOPE_ROLE_POLICY_SCHEMA) {
      out.push(diag(FUNGI_APPK_SRP_002, "Schema token is outside the closed vocabulary.", "schema"));
      return refusedPolicy(out);
    }

    const name = snap.values.get("name");
    if (typeof name !== "string" || !TYPE_NAME.test(name)) {
      out.push(diag(FUNGI_APPK_SRP_002, "Policy name is outside the closed domain.", "name"));
      return refusedPolicy(out);
    }

    const defaultDecision = snap.values.get("defaultDecision");
    if (typeof defaultDecision !== "string" || !DEFAULT_SET.has(defaultDecision)) {
      out.push(diag(FUNGI_APPK_SRP_002, "Default decision is outside the closed vocabulary.", "defaultDecision"));
      return refusedPolicy(out);
    }

    const admittedScopes = readScopeList(
      snap.values.get("admittedScopes"),
      "admittedScopes",
      MAX_SCOPES,
      out,
      true,
    );
    if (admittedScopes === undefined) return refusedPolicy(out);
    const admittedSet = new Set(admittedScopes);

    const roleItems = snapshotArray(snap.values.get("roles"), MAX_ROLES);
    if (roleItems === undefined) {
      out.push(diag(FUNGI_APPK_SRP_004, "Roles must be a dense array within bounds.", "roles"));
      return refusedPolicy(out);
    }
    if (roleItems.length === 0) {
      out.push(diag(FUNGI_APPK_SRP_003, "Scope role policy requires at least one role.", "roles"));
      return refusedPolicy(out);
    }

    const roles: RoleDescriptor[] = [];
    const seenIds = new Set<string>();
    for (const item of roleItems) {
      const role = readRole(item, admittedSet, out);
      if (role === undefined) return refusedPolicy(out);
      if (seenIds.has(role.id)) {
        out.push(diag(FUNGI_APPK_SRP_003, "Role ids must be unique.", "id"));
        return refusedPolicy(out);
      }
      seenIds.add(role.id);
      roles.push(role);
    }

    const ids = roles.map((r) => r.id);
    if (!strictlyAscending(ids)) {
      out.push(diag(FUNGI_APPK_SRP_003, "Roles must be ordered by strictly ascending id.", "roles"));
      return refusedPolicy(out);
    }

    let diagnostics: readonly ScopeRoleDiagnostic[] = Object.freeze([]);
    if (snap.values.has("diagnostics")) {
      const nested = snapshotDiagnostics(snap.values.get("diagnostics"), "diagnostics", out);
      if (nested === undefined) return refusedPolicy(out);
      if (nested.length > 0) {
        out.push(diag(FUNGI_APPK_SRP_005, "Input diagnostics must be empty on create.", "diagnostics"));
        return refusedPolicy(out);
      }
      diagnostics = nested;
    }

    return Object.freeze({
      schema: SCOPE_ROLE_POLICY_SCHEMA,
      name,
      defaultDecision: defaultDecision as ScopeRoleDefaultDecision,
      admittedScopes,
      roles: Object.freeze(roles),
      diagnostics,
    });
  } catch {
    return refusedPolicy([diag(FUNGI_APPK_SRP_001, "Scope role policy read failed closed.", "record")]);
  }
}

/** Read a closed ScopeRolePolicy; never throws; never echoes refused tokens. */
export function readScopeRolePolicy(value: unknown): ReadScopeRolePolicyResult {
  const created = createScopeRolePolicy(value);
  if (created.diagnostics.length > 0) {
    return { ok: false, diagnostics: created.diagnostics };
  }
  return { ok: true, value: created };
}

export function isScopeRoleDefaultDecision(value: unknown): value is ScopeRoleDefaultDecision {
  return typeof value === "string" && DEFAULT_SET.has(value);
}
