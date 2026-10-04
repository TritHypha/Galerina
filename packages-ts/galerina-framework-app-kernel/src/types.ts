/**
 * App Kernel core contracts (framework P1).
 *
 * A route DECLARATION is what a developer writes — only the deltas from the
 * secure defaults. The EFFECTIVE policy is what the kernel enforces (defaults +
 * overrides), with every explicit relaxation recorded for the security report.
 * See design-doc §10 (secure-by-default route policy).
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

/** Methods that mutate state — idempotency is auto-enabled for these. */
export const MUTATING_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
  "POST", "PUT", "PATCH", "DELETE",
]);

export type AuthMode = "required" | "public";
export interface AuthPolicy {
  readonly mode: AuthMode;
  readonly scopes: readonly string[];
  /**
   * @deprecated Header presence is not authentication. `true` is refused at construction
   * (resolveEffectiveRoutePolicy throws); `false` or absent changes nothing. A `required`-auth
   * route always needs a verified channel/identity verdict and principal, or it answers 401.
   */
  readonly allowHeaderPresenceFallback?: boolean;
}

/** `"strip"` is reserved: it is not implemented, so a route declaring it is refused at construction. */
export type UnknownFieldsMode = "deny" | "strip" | "allow";
export type DuplicateKeysMode = "deny" | "lastWins";
export interface BodyPolicy {
  readonly contentType: string;
  readonly maxSizeBytes: number;
  readonly unknownFields: UnknownFieldsMode;
  readonly duplicateKeys: DuplicateKeysMode;
}

export interface IdempotencyPolicy {
  readonly enabled: boolean;
  readonly header: string;
  readonly ttlSeconds: number;
  /** "replay" is reserved and not implemented: route admission refuses it (a duplicate key is always 409). */
  readonly onDuplicate: "reject" | "replay";
}

export interface LimitsPolicy {
  readonly rate: string;
  readonly maxConcurrent: number;
  readonly memoryBytes: number;
  readonly timeoutMs: number;
}

export interface AuditPolicy {
  readonly runtimeReport: boolean;
}

/**
 * Secrets a route requires resolved-and-not-faulted BEFORE its handler is dispatched.
 * A required secret only ever TIGHTENS admission (it never relaxes) — see gate 9.5.
 * Empty `require` (the default) is a strict no-op, so every existing route is unaffected.
 */
export interface SecretsPolicy {
  /** Secret NAMES this route requires present-and-not-faulted before dispatch. */
  readonly require: readonly string[];
}

/** What a developer writes — only the deltas from the secure defaults. */
export interface RouteDeclaration {
  readonly method: HttpMethod;
  readonly path: string;
  readonly handler: string;
  readonly requestType?: string;
  readonly responseType?: string;
  readonly auth?: Partial<AuthPolicy>;
  readonly body?: Partial<BodyPolicy>;
  /** `false` disables idempotency explicitly; otherwise overrides the method-aware default. */
  readonly idempotency?: Partial<IdempotencyPolicy> | false;
  readonly limits?: Partial<LimitsPolicy>;
  readonly audit?: Partial<AuditPolicy>;
  /** Secret names this route requires (present-and-not-faulted) before dispatch. Omitted → none. */
  readonly secrets?: Partial<SecretsPolicy>;
}

/** The fully-resolved policy the kernel enforces (defaults + overrides). */
export interface EffectiveRoutePolicy {
  readonly method: HttpMethod;
  readonly path: string;
  readonly handler: string;
  readonly requestType: string | undefined;
  readonly responseType: string | undefined;
  readonly auth: AuthPolicy;
  readonly body: BodyPolicy;
  readonly idempotency: IdempotencyPolicy;
  readonly limits: LimitsPolicy;
  readonly audit: AuditPolicy;
  /** Secrets required before dispatch (gate 9.5). Empty `require` = no-op (non-breaking default). */
  readonly secrets: SecretsPolicy;
  /** Blocks that came from the secure defaults (not declared by the developer). */
  readonly appliedDefaults: readonly string[];
  /** Explicit security relaxations — recorded for the security report. */
  readonly relaxations: readonly string[];
}
