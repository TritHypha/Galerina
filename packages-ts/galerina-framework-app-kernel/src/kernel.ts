/**
 * App Kernel — the FIXED, non-bypassable governed request pipeline (framework P1 slice 2).
 *
 * The kernel runs a SINGLE ordered sequence of gates. The order is hard-coded
 * here — it is NOT pluggable, has no middleware chain, and cannot be reordered,
 * skipped, or extended by callers. This is the deliberate anti-middleware stance:
 * a developer cannot accidentally (or maliciously) move auth after dispatch, or
 * drop a size check. Every gate fails CLOSED — on any rejection the kernel
 * returns a safe, typed error response and the handler is NEVER invoked.
 *
 * Pipeline (fixed):
 *   1  normalise request
 *   2  match route        (unknown path → 404, known path/wrong method → 405)
 *   3  resolve effective policy (resolveEffectiveRoutePolicy, posture-aware)
 *   4  body size          (> maxSizeBytes → 413)
 *   5  content-type       (mismatch → 415)
 *   6  auth               (mode 'required' && no Authorization → 401)
 *   7  decode JSON        (invalid → 422)
 *   8  idempotency        (enabled + duplicate key → 409)
 *   9  concurrency        (> maxConcurrent → 429)
 *   9.5 secrets           (a required secret absent/faulted/unresolved → 503, fail-closed)
 *   10 dispatch handler   (ONLY now is developer code reached)
 *   11 encode response
 *   12 audit placeholder
 */
import type { HttpMethod, RouteDeclaration, EffectiveRoutePolicy } from "./types.js";
import { resolveEffectiveRoutePolicy, type EffectivePosture } from "./route-defaults.js";
// Gate 9.5 — the fail-closed secrets seam. The kernel depends only on the structural
// SecretsProvider shape (no hard compile dependency on @galerina/ext-secrets-spore); a
// boot-resolved SealArena satisfies it by shape and is passed via CreateAppKernelOptions.
import { createSecretGate } from "./secret-gate.js";
import type { SecretsProvider } from "./secret-gate.js";
// #195/#179 — resolve OS/HW posture via @galerina/core-config (single source of truth for the
// fail-secure logic). @galerina/core-config is declared as a file: dependency in package.json;
// the bare specifier resolves via the package's main entry (dist/index.js) which re-exports
// posture.js via its barrel. Relative-dist paths removed — #155 / item #8 Bob review.
import { resolvePosture } from "@galerina/core-config";
import type { SecurityPosture, ResolvedPosture, EnvironmentMode } from "@galerina/core-config";
// K3 boundary collapse for channel/identity admission — the TLSTP S1 cert-gate verdict folds in
// here. @galerina/tower-citizen is a file: dependency; "." export resolves to dist/index.js.
import { decideAtBoundary } from "@galerina/tower-citizen";
import type { Verdict } from "@galerina/tower-citizen";

/** Normalised inbound request the pipeline operates on. */
export interface GalerinaKernelRequest {
  readonly method: HttpMethod;
  readonly path: string;
  /** Header names are matched case-insensitively by the kernel. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
  readonly query: Readonly<Record<string, string>>;
  readonly requestId: string;
  readonly receivedAt: number;
  /** Optional channel/identity verdict from the transport (e.g. the TLSTP S1 cert-gate K3 fold).
   *  When present it is collapsed FAIL-CLOSED at the auth gate: only ALLOW (+1) admits; an
   *  INDETERMINATE (0) or DENY (−1) refuses. Absent → the header-presence check applies (legacy). */
  readonly channelVerdict?: Verdict;
  /** Exact scopes carried by the authenticated principal that produced `channelVerdict`. */
  readonly principalScopes?: readonly string[];
  /** Stable, transport-authenticated principal identity used for per-principal budgets. */
  readonly principalId?: string;
}

/** Safe, typed response. `body` is only present once a handler has run and encoded. */
export interface GalerinaKernelResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Uint8Array;
}

/** What a dispatched handler receives — the request plus its resolved policy and decoded JSON. */
export interface HandlerContext {
  readonly request: GalerinaKernelRequest;
  readonly policy: EffectiveRoutePolicy;
  /** Parsed JSON body, or `undefined` when the request carried no body. */
  readonly json: unknown;
  /** Fail-closed secret accessor. Runs `fn` with a short-lived view; returns `undefined` for an
   *  absent/faulted secret (or absent provider). Any secret this route DECLARES via
   *  `secrets.require` is already guaranteed present-and-not-faulted by gate 9.5 before dispatch. */
  readonly getSecret: (name: string, fn: (value: Uint8Array) => unknown) => undefined;
  /** Aborted when the route deadline expires. */
  readonly deadlineSignal: AbortSignal;
}

/** A dispatched handler returns the response payload; the kernel encodes it. */
export interface HandlerResult {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

export type HandlerFn = (ctx: HandlerContext) => HandlerResult | Promise<HandlerResult>;

/** name → handler. The route declares the name; only declared names are reachable. */
export type HandlerDispatch = Readonly<Record<string, HandlerFn>>;

export type IdempotencyClaimResult = "claimed" | "duplicate";

/** Pluggable atomic admission store for idempotency keys (default: in-memory). */
export interface IdempotencyStore {
  /** Decides and reserves the key as one atomic storage operation. */
  claim(scope: string, key: string, ttlSeconds: number): IdempotencyClaimResult | Promise<IdempotencyClaimResult>;
}

/** Default in-memory idempotency store. Process-local; replaced via options in real deployments. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly #seen = new Map<string, number>();
  readonly #capacity: number;
  readonly #maxKeyBytes: number;
  readonly #now: () => number;

  constructor(opts: { readonly capacity?: number; readonly maxKeyBytes?: number; readonly now?: () => number } = {}) {
    this.#capacity = opts.capacity ?? 10_000;
    this.#maxKeyBytes = opts.maxKeyBytes ?? 256;
    this.#now = opts.now ?? Date.now;
    if (!Number.isSafeInteger(this.#capacity) || this.#capacity < 1) throw new Error("Idempotency capacity must be a positive safe integer.");
    if (!Number.isSafeInteger(this.#maxKeyBytes) || this.#maxKeyBytes < 1) throw new Error("Idempotency key limit must be a positive safe integer.");
  }

  claim(scope: string, key: string, ttlSeconds: number): IdempotencyClaimResult {
    if (typeof scope !== "string" || scope.trim().length === 0) {
      throw new TypeError("Idempotency scope must be a non-empty string");
    }
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new TypeError("Idempotency key must be a non-empty string");
    }
    if (new TextEncoder().encode(key).byteLength > this.#maxKeyBytes) {
      throw new Error("Idempotency key exceeds the configured byte limit.");
    }
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) throw new Error("Idempotency TTL must be finite and positive.");
    const now = this.#now();
    for (const [entryKey, expiresAt] of this.#seen) {
      if (expiresAt <= now) this.#seen.delete(entryKey);
    }
    const composite = `${scope}\u0000${key}`;
    const existing = this.#seen.get(composite);
    if (existing !== undefined && existing > now) return "duplicate";
    if (!this.#seen.has(composite) && this.#seen.size >= this.#capacity) {
      throw new Error("Idempotency store capacity reached.");
    }
    this.#seen.set(composite, now + ttlSeconds * 1_000);
    return "claimed";
  }

  /** @deprecated Use claim() so callers cannot mistake admission for observation. */
  seen(scope: string, key: string, ttlSeconds: number): boolean {
    return this.claim(scope, key, ttlSeconds) === "duplicate";
  }
}

/**
 * One audit record per handled request. Emitted AFTER the response is computed,
 * on the audit pipe — never on the request's critical path (Tri-Pipe principle).
 */
export interface AuditEvent {
  readonly requestId: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly status: number;
  /** Typed error code when the pipeline rejected; `undefined` on a handler success. */
  readonly errorCode: KernelErrorCode | undefined;
  /** Resolved policy provenance — what was defaulted, what was relaxed. */
  readonly appliedDefaults: readonly string[];
  readonly relaxations: readonly string[];
  /** ms since epoch at which the event was emitted. */
  readonly at: number;
  /** Resolved OS/HW posture (#195) — present when the kernel resolved posture from 'auto'. */
  readonly resolvedPosture?: ResolvedPosture;
}

/** Exact, single-use capacity held for one mandatory audit event. */
export interface AuditReservation {
  readonly id: symbol;
}

/**
 * Audit pipe. Capacity admission is synchronous and MUST NOT block. The
 * reservation is an affine capability: a successful `reserve` guarantees one
 * later `commit`, and the exact reservation may be committed or cancelled once.
 * The event flush remains asynchronous and off the handler's critical path.
 */
export interface AuditSink {
  reserve(): AuditReservation | undefined;
  commit(reservation: AuditReservation, event: AuditEvent): void;
  cancel(reservation: AuditReservation): void;
  /** Best-effort admission for events whose route policy does not require a report. */
  emit(event: AuditEvent): void;
}

/**
 * Default in-memory async audit sink. `emit` only enqueues (cheap, non-blocking);
 * a flush is scheduled on the microtask queue, with a timer fallback, so events
 * drain AFTER the current response has already been returned to the caller.
 */
export class InMemoryAuditSink implements AuditSink {
  readonly #queue: AuditEvent[] = [];
  readonly #drained: AuditEvent[] = [];
  readonly #reservations = new Set<AuditReservation>();
  #scheduled = false;
  readonly #capacity: number;

  constructor(opts: { readonly capacity?: number } = {}) {
    this.#capacity = opts.capacity ?? 1_024;
    if (!Number.isSafeInteger(this.#capacity) || this.#capacity < 1) {
      throw new Error("Audit capacity must be a positive safe integer.");
    }
  }

  reserve(): AuditReservation | undefined {
    const retained = this.#queue.length + this.#drained.length + this.#reservations.size;
    if (retained >= this.#capacity) return undefined;
    const reservation = Object.freeze({ id: Symbol("galerina-audit-reservation") });
    this.#reservations.add(reservation);
    return reservation;
  }

  commit(reservation: AuditReservation, event: AuditEvent): void {
    if (!this.#reservations.delete(reservation)) {
      throw new Error("Audit reservation is foreign, cancelled, or already consumed.");
    }
    this.#queue.push(event);
    this.#schedule();
  }

  cancel(reservation: AuditReservation): void {
    if (!this.#reservations.delete(reservation)) {
      throw new Error("Audit reservation is foreign, committed, or already cancelled.");
    }
  }

  emit(event: AuditEvent): void {
    const reservation = this.reserve();
    if (reservation === undefined) {
      throw new Error("Audit evidence capacity reached.");
    }
    this.commit(reservation, event);
  }

  #schedule(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    // Microtask first (runs after the response resolves); timer is a belt-and-braces fallback.
    queueMicrotask(() => this.#flush());
    const timer = setTimeout(() => this.#flush(), 0);
    // Don't keep the event loop alive just to drain the audit queue.
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      (timer as { unref(): void }).unref();
    }
  }

  #flush(): void {
    if (!this.#scheduled) return;
    this.#scheduled = false;
    while (this.#queue.length > 0) {
      // FIFO transfer. Retained evidence still owns capacity until explicitly taken.
      this.#drained.push(this.#queue.shift() as AuditEvent);
    }
  }

  /** Test/inspection hook: events that have been flushed off the queue. */
  drained(): readonly AuditEvent[] {
    return Object.freeze([...this.#drained]);
  }

  /** Transfer custody of flushed evidence and release its retained capacity. */
  takeDrained(): readonly AuditEvent[] {
    const transferred = Object.freeze([...this.#drained]);
    this.#drained.length = 0;
    return transferred;
  }

  /** Count still waiting to be flushed (0 once a tick has elapsed). */
  pending(): number {
    return this.#queue.length;
  }

  /** Accepted evidence is never evicted; retained for compatibility and proof. */
  dropped(): number {
    return 0;
  }
}

export interface CreateAppKernelOptions {
  readonly routes: readonly RouteDeclaration[];
  readonly dispatch: HandlerDispatch;
  /** OS/HW posture (#195): 'off' | 'auto' | 'on', or a pre-resolved 'off'/'on'. Defaults to 'off'.
   *  'on' tightens body/limit ceilings; 'auto' resolves fail-secure from `env`. */
  readonly posture?: SecurityPosture | EffectivePosture;
  /** Deployment environment driving 'auto' resolution (#195). Default 'unknown' → fail-secure 'on'. */
  readonly env?: EnvironmentMode;
  /** Override the idempotency store (default: in-memory). */
  readonly idempotencyStore?: IdempotencyStore;
  /** Override the audit sink (default: in-memory async). Emitted off the critical path. */
  readonly auditSink?: AuditSink;
  /** Boot-resolved secrets provider (a SealArena from ext-secrets-spore `loadAll`). Absent → every
   *  route that DECLARES a required secret fails closed at gate 9.5 (503); secret-free routes are
   *  unaffected. The host owns the provider's lifecycle and MUST `dispose()` it on shutdown. */
  readonly secretsProvider?: SecretsProvider;
  /** Closed-schema validators keyed by `RouteDeclaration.requestType`. */
  readonly requestValidators?: Readonly<Record<string, (value: unknown) => boolean>>;
}

export interface AppKernel {
  handle(req: GalerinaKernelRequest): Promise<GalerinaKernelResponse>;
}

/** Typed error codes the kernel can emit. Stable surface for callers/tests. */
export type KernelErrorCode =
  | "route_not_found"
  | "method_not_allowed"
  | "payload_too_large"
  | "unsupported_media_type"
  | "unauthorized"
  | "forbidden"
  | "unprocessable_entity"
  | "conflict"
  | "too_many_requests"
  | "secret_unavailable"
  | "deadline_exceeded"
  | "resource_limit_exceeded"
  | "audit_unavailable"
  | "internal_error";

const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "content-type": "application/json",
});

/** Build a safe, typed, fail-closed error response. Never carries handler output. */
function errorResponse(status: number, code: KernelErrorCode, message: string): GalerinaKernelResponse {
  return {
    status,
    headers: JSON_HEADERS,
    body: new TextEncoder().encode(JSON.stringify({ error: code, message })),
  };
}

function routeKey(method: HttpMethod, path: string): string {
  return `${method} ${path}`;
}

/** Case-insensitive header lookup over a frozen record. */
function header(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) return headers[k];
  }
  return undefined;
}

/** Parse `application/json; charset=utf-8` → `application/json`. */
function baseContentType(value: string): string {
  const semi = value.indexOf(";");
  return (semi === -1 ? value : value.slice(0, semi)).trim().toLowerCase();
}

/** Detect duplicate object keys, including escape-equivalent spellings, without changing JSON values. */
function hasDuplicateJsonKeys(text: string): boolean {
  const stack: Array<{ readonly kind: "object"; readonly keys: Set<string>; expectingKey: boolean } | { readonly kind: "array" }> = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      const start = i;
      i += 1;
      for (; i < text.length; i += 1) {
        if (text[i] === "\\") {
          i += 1;
        } else if (text[i] === '"') {
          break;
        }
      }
      const top = stack[stack.length - 1];
      if (top?.kind === "object" && top.expectingKey) {
        const key = JSON.parse(text.slice(start, i + 1)) as string;
        if (top.keys.has(key)) return true;
        top.keys.add(key);
        top.expectingKey = false;
      }
      continue;
    }
    if (ch === "{") stack.push({ kind: "object", keys: new Set<string>(), expectingKey: true });
    else if (ch === "[") stack.push({ kind: "array" });
    else if (ch === "}" || ch === "]") stack.pop();
    else if (ch === ",") {
      const top = stack[stack.length - 1];
      if (top?.kind === "object") top.expectingKey = true;
    }
  }
  return false;
}

function parseRatePerMinute(rate: string): number {
  const match = /^(\d+)\/minute$/.exec(rate);
  if (match === null) throw new Error(`Unsupported route rate '${rate}'. Expected '<positive integer>/minute'.`);
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid route rate '${rate}'.`);
  return value;
}

/**
 * Create an App Kernel over a fixed set of routes and a handler dispatch table.
 * The returned `handle` runs the fixed, non-bypassable pipeline.
 */
export function createAppKernel(opts: CreateAppKernelOptions): AppKernel {
  // #195/#179 — resolve posture. 'auto' adapts fail-secure to `env`; explicit 'off'/'on' is
  // honored as-is (and 'off' stays the default), so existing callers are unchanged. When 'auto'
  // is used, the full resolution (effective + controls + rationale) is recorded per audit event.
  const requestedPosture: SecurityPosture | EffectivePosture = opts.posture ?? "off";
  const resolvedPosture: ResolvedPosture | undefined =
    requestedPosture === "auto" ? resolvePosture("auto", opts.env ?? "unknown") : undefined;
  const posture: EffectivePosture = resolvedPosture
    ? resolvedPosture.effective
    : (requestedPosture === "on" ? "on" : "off");
  const idempotencyStore: IdempotencyStore = opts.idempotencyStore ?? new InMemoryIdempotencyStore();
  const auditSink: AuditSink = opts.auditSink ?? new InMemoryAuditSink();
  // Build the gate-9.5 secrets seam ONCE (off the request path). No provider → `admit` refuses any
  // route that DECLARES a required secret, but is a strict no-op for secret-free routes (see gate 9.5).
  const secretGate = createSecretGate(opts.secretsProvider);

  // Pre-resolve the routing table once. path → (method → resolved policy).
  const byPath = new Map<string, Map<HttpMethod, EffectiveRoutePolicy>>();
  const ratesPerMinute = new Map<string, number>();
  let anyRouteRequiresSecret = false;
  for (const route of opts.routes) {
    const policy = resolveEffectiveRoutePolicy(route, { posture });
    if (
      policy.requestType !== undefined &&
      policy.body.unknownFields === "deny" &&
      opts.requestValidators?.[policy.requestType] === undefined
    ) {
      throw new Error(`A request validator is required for closed request type '${policy.requestType}'.`);
    }
    ratesPerMinute.set(routeKey(policy.method, policy.path), parseRatePerMinute(policy.limits.rate));
    if (policy.secrets.require.length > 0) anyRouteRequiresSecret = true;
    let methods = byPath.get(route.path);
    if (methods === undefined) {
      methods = new Map<HttpMethod, EffectiveRoutePolicy>();
      byPath.set(route.path, methods);
    }
    methods.set(route.method, policy);
  }

  // Fail-closed surfacing: if any route declares a required secret but NO provider was wired, those
  // routes will 503 (dark) at gate 9.5 by design. Surface it loudly ONCE at boot so a forgotten
  // provider is not silently swallowed. Not a gate change — just an operability warning.
  if (anyRouteRequiresSecret && opts.secretsProvider === undefined) {
    console.warn(
      "[galerina-app-kernel] gate 9.5: one or more routes declare secrets.require but no " +
        "secretsProvider was supplied — every secret-requiring route will fail closed (503 " +
        "secret_unavailable). Wire a boot-resolved SecretsProvider (ext-secrets-spore loadAll arena).",
    );
  }

  // Live concurrency counters, keyed per route. Reset as handlers settle.
  const inFlight = new Map<string, number>();
  const rateWindows = new Map<string, { count: number; resetAt: number }>();
  const maxRateWindows = 10_000;

  /** Internal pipeline result: the response plus the matched policy (for audit provenance). */
  interface PipelineOutcome {
    readonly response: GalerinaKernelResponse;
    /** Resolved policy for the matched route; `undefined` when no route matched (404/405). */
    readonly policy: EffectiveRoutePolicy | undefined;
  }

  async function runPipeline(req: GalerinaKernelRequest): Promise<PipelineOutcome> {
    // ── 1 normalise ──
    // The request type already gives us a normalised shape; we treat `method`
    // as authoritative and look up headers case-insensitively below.
    const method = req.method;
    const path = req.path;

    // ── 2 match route ──
    const methods = byPath.get(path);
    if (methods === undefined) {
      return { response: errorResponse(404, "route_not_found", `No route for path '${path}'.`), policy: undefined };
    }
    const policy = methods.get(method);
    if (policy === undefined) {
      return { response: errorResponse(405, "method_not_allowed", `Method '${method}' not allowed for '${path}'.`), policy: undefined };
    }

    // ── 3 resolve policy ── (already resolved at construction; `policy` is it)

    // ── 4 body size ──
    if (req.body.byteLength > policy.body.maxSizeBytes) {
      return { response: errorResponse(
        413, "payload_too_large",
        `Body ${req.body.byteLength}B exceeds limit ${policy.body.maxSizeBytes}B.`,
      ), policy };
    }

    // ── 5 content-type ── (only enforced when a body is present)
    if (req.body.byteLength > 0) {
      const ct = header(req.headers, "content-type");
      if (ct === undefined || baseContentType(ct) !== baseContentType(policy.body.contentType)) {
        return { response: errorResponse(
          415, "unsupported_media_type",
          `Expected content-type '${policy.body.contentType}'.`,
        ), policy };
      }
    }

    // ── 6 auth ──
    // A supplied transport/channel verdict constrains EVERY route, including a route whose
    // application auth mode is public. `public` means no application credential is required;
    // it never means an explicitly untrusted TLS/channel peer can bypass its configured gate.
    // Only ALLOW (+1) admits. INDETERMINATE (0), DENY (−1), and invalid values refuse.
    if (
      req.channelVerdict !== undefined &&
      !decideAtBoundary(req.channelVerdict).authorized
    ) {
      return { response: errorResponse(401, "unauthorized", "Channel/identity verdict denied admission."), policy };
    }

    if (policy.auth.mode === "required") {
      if (req.channelVerdict !== undefined) {
        // The mandatory channel fold above already proved ALLOW.
      } else {
        return { response: errorResponse(401, "unauthorized", "A channel/identity verdict is required (header presence is not sufficient)."), policy };
      }
      if (
        req.principalId === undefined ||
        req.principalId.trim().length === 0 ||
        new TextEncoder().encode(req.principalId).byteLength > 256
      ) {
        return { response: errorResponse(401, "unauthorized", "An authenticated principal identity is required."), policy };
      }
    }

    if (policy.auth.scopes.length > 0) {
      const admittedScopes = new Set(req.principalScopes ?? []);
      if (req.channelVerdict === undefined || policy.auth.scopes.some((scope) => !admittedScopes.has(scope))) {
        return { response: errorResponse(403, "forbidden", "The authenticated principal lacks a required route scope."), policy };
      }
    }

    // ── 7 decode JSON ── (only when a body is present)
    let json: unknown;
    if (req.body.byteLength > 0) {
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(req.body);
      } catch {
        return { response: errorResponse(422, "unprocessable_entity", "Body is not valid UTF-8."), policy };
      }
      try {
        if (policy.body.duplicateKeys === "deny" && hasDuplicateJsonKeys(text)) {
          return { response: errorResponse(422, "unprocessable_entity", "Body contains duplicate JSON object keys."), policy };
        }
        json = JSON.parse(text);
      } catch {
        return { response: errorResponse(422, "unprocessable_entity", "Body is not valid JSON."), policy };
      }
      if (json === null) {
        return { response: errorResponse(422, "unprocessable_entity", "JSON null is forbidden."), policy };
      }
      if (policy.requestType === undefined) {
        return { response: errorResponse(422, "unprocessable_entity", "A closed request type is required for JSON bodies."), policy };
      }
      if (policy.requestType !== undefined) {
        const validator = opts.requestValidators?.[policy.requestType];
        if (validator === undefined) {
          return { response: errorResponse(500, "internal_error", "Request validator is unavailable."), policy };
        }
        let valid = false;
        try {
          valid = validator(json);
        } catch {
          valid = false;
        }
        if (!valid) {
          return { response: errorResponse(422, "unprocessable_entity", "Body does not match the admitted request type."), policy };
        }
      }
    } else {
      json = undefined;
    }

    // ── 8 rate ──
    const rk = routeKey(method, path);
    const now = Date.now();
    const rateLimit = ratesPerMinute.get(rk) as number;
    const rateSubject = policy.auth.mode === "required" ? (req.principalId as string) : "public";
    const rateKey = `${rk}\u0000${rateSubject}`;
    const window = rateWindows.get(rateKey);
    if (window === undefined || window.resetAt <= now) {
      if (window !== undefined) rateWindows.delete(rateKey);
      if (rateWindows.size >= maxRateWindows) {
        for (const [key, candidate] of rateWindows) {
          if (candidate.resetAt <= now) rateWindows.delete(key);
        }
      }
      if (rateWindows.size >= maxRateWindows) {
        return { response: errorResponse(429, "too_many_requests", "Rate-limit identity capacity reached."), policy };
      }
      rateWindows.set(rateKey, { count: 1, resetAt: now + 60_000 });
    } else if (window.count >= rateLimit) {
      return { response: errorResponse(429, "too_many_requests", `Rate limit ${rateLimit}/minute reached for '${rk}'.`), policy };
    } else {
      window.count += 1;
    }

    if (req.body.byteLength > policy.limits.memoryBytes) {
      return { response: errorResponse(503, "resource_limit_exceeded", "Request exceeds the route memory budget."), policy };
    }

    // ── 9 concurrency ──
    const current = inFlight.get(rk) ?? 0;
    if (current >= policy.limits.maxConcurrent) {
      return { response: errorResponse(
        429, "too_many_requests",
        `Concurrency limit ${policy.limits.maxConcurrent} reached for '${rk}'.`,
      ), policy };
    }
    inFlight.set(rk, current + 1);
    let releaseWhenHandlerSettles = false;
    let slotReleased = false;
    const releaseSlot = (): void => {
      if (slotReleased) return;
      slotReleased = true;
      const after = (inFlight.get(rk) ?? 1) - 1;
      if (after <= 0) inFlight.delete(rk);
      else inFlight.set(rk, after);
    };

    try {
      // ── 9.5 secrets ── (fail-closed; MUST sit inside this try so the finally still releases the
      // concurrency slot on a refusal — otherwise a storm of secret-missing requests would leak
      // `inFlight` counters and self-DoS via gate 9). A route with no required secret is a no-op.
      const secretRefusal = secretGate.admit(policy.secrets.require);
      if (secretRefusal !== null) {
        // 503: an absent/faulted/unresolvable secret is a server-side UNAVAILABILITY, not a client
        // error. The handler is NEVER reached (gate 9.5 < gate 10), so no side effect can occur.
        return { response: errorResponse(503, secretRefusal, "A required secret is unavailable."), policy };
      }

      const fn = opts.dispatch[policy.handler];
      if (fn === undefined) {
        // Misconfiguration, not client error: do not consume an admission key
        // for a route that cannot dispatch.
        return { response: errorResponse(500, "internal_error", `No handler '${policy.handler}' registered.`), policy };
      }

      // ── 9.75 idempotency ──
      // Claim only after every pre-handler refusal gate has passed. A rejected
      // rate/resource/concurrency/secret/route attempt must not consume a key.
      if (policy.idempotency.enabled) {
        const key = header(req.headers, policy.idempotency.header);
        if (key === undefined || key.length === 0) {
          return { response: errorResponse(409, "conflict", `Header '${policy.idempotency.header}' is required.`), policy };
        }
        let claim: IdempotencyClaimResult;
        try {
          claim = await idempotencyStore.claim(rk, key, policy.idempotency.ttlSeconds);
        } catch {
          // Fail closed: if the store errors or returns malformed data, reject.
          return { response: errorResponse(409, "conflict", "Idempotency store unavailable."), policy };
        }
        if (claim !== "claimed" && claim !== "duplicate") {
          return { response: errorResponse(409, "conflict", "Idempotency store returned an invalid claim."), policy };
        }
        if (claim === "duplicate") {
          return { response: errorResponse(409, "conflict", `Duplicate idempotency key '${key}'.`), policy };
        }
      }

      // ── 10 dispatch handler ── (ONLY now is developer code reached)
      let result: HandlerResult;
      const deadline = new AbortController();
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      let handlerPromise: Promise<HandlerResult> | undefined;
      try {
        handlerPromise = Promise.resolve(fn({
          request: req,
          policy,
          json,
          getSecret: (name, callback) => deadline.signal.aborted
            ? undefined
            : secretGate.getSecret(policy.secrets.require, name, callback),
          deadlineSignal: deadline.signal,
        }));
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          deadlineTimer = setTimeout(() => {
            deadline.abort();
            reject(new Error("GALERINA_ROUTE_DEADLINE"));
          }, policy.limits.timeoutMs);
        });
        result = await Promise.race([handlerPromise, timeoutPromise]);
      } catch {
        if (deadline.signal.aborted) {
          releaseWhenHandlerSettles = true;
          if (handlerPromise !== undefined) {
            void handlerPromise.finally(releaseSlot).catch(() => undefined);
          }
          return { response: errorResponse(504, "deadline_exceeded", "Route execution exceeded its deadline."), policy };
        }
        // Handler faults fail closed: a safe 500, no internal detail leaks.
        return { response: errorResponse(500, "internal_error", "Handler failed."), policy };
      } finally {
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
      }

      // ── 11 encode ──
      const status = result.status ?? 200;
      const headers: Record<string, string> = { ...JSON_HEADERS, ...(result.headers ?? {}) };
      let body: Uint8Array | undefined;
      if (result.body === undefined) {
        body = undefined;
      } else if (result.body instanceof Uint8Array) {
        body = result.body;
      } else {
        try {
          body = new TextEncoder().encode(JSON.stringify(result.body));
        } catch {
          return { response: errorResponse(500, "internal_error", "Response could not be encoded."), policy };
        }
      }

      if (body !== undefined && body.byteLength > policy.limits.memoryBytes) {
        return { response: errorResponse(503, "resource_limit_exceeded", "Response exceeds the route memory budget."), policy };
      }

      const response: GalerinaKernelResponse =
        body === undefined ? { status, headers } : { status, headers, body };
      return { response, policy };
    } finally {
      // A timed-out handler retains its active-compute lease until its actual
      // Promise settles. This bounds non-cooperative zombie work.
      if (!releaseWhenHandlerSettles) releaseSlot();
    }
  }

  /**
   * Decode the typed error code (if any) out of a kernel error body so the audit
   * record can carry it. Success responses carry no `error` field → undefined.
   */
  function errorCodeOf(res: GalerinaKernelResponse): KernelErrorCode | undefined {
    if (res.status < 400 || res.body === undefined) return undefined;
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(res.body));
      if (parsed !== null && typeof parsed === "object" && "error" in parsed) {
        const code = (parsed as { error: unknown }).error;
        if (typeof code === "string") return code as KernelErrorCode;
      }
    } catch {
      // Non-JSON body (e.g. a handler's raw bytes) — no typed code to report.
    }
    return undefined;
  }

  /**
   * Public entry point. A mandatory runtime report reserves bounded evidence
   * capacity before any pipeline or handler state can change. The handler and
   * the eventual evidence flush remain asynchronous happy-path work.
   */
  async function handle(req: GalerinaKernelRequest): Promise<GalerinaKernelResponse> {
    const declaredPolicy = byPath.get(req.path)?.get(req.method);
    let reservation: AuditReservation | undefined;
    let reservationLive = false;

    if (declaredPolicy?.audit.runtimeReport === true) {
      try {
        const candidate = auditSink.reserve();
        if (candidate === undefined || candidate === null || typeof candidate !== "object") {
          return errorResponse(503, "audit_unavailable", "Required runtime audit evidence capacity is unavailable.");
        }
        reservation = candidate;
        reservationLive = true;
      } catch {
        return errorResponse(503, "audit_unavailable", "Required runtime audit evidence capacity is unavailable.");
      }
    }

    try {
      const outcome = await runPipeline(req);
      const { response, policy } = outcome;

      // ── 12 audit ── Build the event after the response is computed. A mandatory
      // event consumes its exact reservation synchronously; flushing stays off-path.
      const event: AuditEvent = {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: response.status,
        errorCode: errorCodeOf(response),
        appliedDefaults: policy?.appliedDefaults ?? [],
        relaxations: policy?.relaxations ?? [],
        at: Date.now(),
        ...(resolvedPosture ? { resolvedPosture } : {}),
      };

      if (reservation !== undefined) {
        try {
          auditSink.commit(reservation, event);
          reservationLive = false;
        } catch {
          return errorResponse(503, "audit_unavailable", "Required runtime audit evidence could not be accepted.");
        }
      } else if (policy !== undefined) {
        try {
          auditSink.emit(event);
        } catch {
          // This route did not require runtime evidence. A best-effort refusal
          // cannot erase or overwrite evidence the sink already accepted.
        }
      }

      return response;
    } finally {
      if (reservationLive && reservation !== undefined) {
        try {
          auditSink.cancel(reservation);
        } catch {
          // The sink may have consumed the lease before refusing commit. There
          // is no safe second authority action to take at this boundary.
        }
      }
    }
  }

  return { handle };
}
