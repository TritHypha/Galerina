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
// fail-secure logic). Relative-dist import: this path resolves identically from src/ and dist/
// (each sits two levels under packages-galerina/). Swap to the bare specifier once workspaces land (#155).
import { resolvePosture } from "../../galerina-core-config/dist/posture.js";
import type { SecurityPosture, ResolvedPosture } from "../../galerina-core-config/dist/posture.js";
import type { EnvironmentMode } from "../../galerina-core-config/dist/index.js";
// K3 boundary collapse for channel/identity admission — the TLSTP S1 cert-gate verdict folds in
// here. Relative-dist import (same pattern as core-config above; bare specifier once #155 lands).
import { decideAtBoundary } from "../../galerina-tower-citizen/dist/index.js";
import type { Verdict } from "../../galerina-tower-citizen/dist/index.js";

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
  readonly getSecret: (name: string, fn: (value: Uint8Array) => unknown) => unknown;
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

/** Pluggable store for idempotency keys (default: in-memory). Deny-by-default: an absent store still gates. */
export interface IdempotencyStore {
  /** Returns true if the key was already seen (and records it if not). Fail-closed on the caller side. */
  seen(routeKey: string, key: string): boolean | Promise<boolean>;
}

/** Default in-memory idempotency store. Process-local; replaced via options in real deployments. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  readonly #seen = new Set<string>();
  seen(routeKey: string, key: string): boolean {
    const composite = `${routeKey}\u0000${key}`;
    if (this.#seen.has(composite)) return true;
    this.#seen.add(composite);
    return false;
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

/**
 * Audit pipe. `emit` is synchronous and MUST NOT block — implementations queue
 * and flush off the critical path. The kernel calls it WITHOUT awaiting, so a
 * slow or failing sink can never delay (or break) the response (Tri-Pipe).
 */
export interface AuditSink {
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
  #scheduled = false;

  emit(event: AuditEvent): void {
    // Enqueue only — never process inline. That non-blocking contract is the point.
    this.#queue.push(event);
    this.#schedule();
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
      // FIFO drain. Each event is an already-built record; nothing heavy happens here.
      this.#drained.push(this.#queue.shift() as AuditEvent);
    }
  }

  /** Test/inspection hook: events that have been flushed off the queue. */
  drained(): readonly AuditEvent[] {
    return this.#drained;
  }

  /** Count still waiting to be flushed (0 once a tick has elapsed). */
  pending(): number {
    return this.#queue.length;
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
  | "unprocessable_entity"
  | "conflict"
  | "too_many_requests"
  | "secret_unavailable"
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
  let anyRouteRequiresSecret = false;
  for (const route of opts.routes) {
    const policy = resolveEffectiveRoutePolicy(route, { posture });
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
    if (policy.auth.mode === "required") {
      if (req.channelVerdict !== undefined) {
        // Zero-trust: a transport-supplied channel/identity verdict (e.g. the TLSTP S1 cert-gate)
        // is collapsed FAIL-CLOSED here — only an explicit ALLOW (+1) admits; an INDETERMINATE (0)
        // or DENY (−1) refuses. unknown → DENY by the algebra, not a flag.
        if (!decideAtBoundary(req.channelVerdict).authorized) {
          return { response: errorResponse(401, "unauthorized", "Channel/identity verdict denied admission."), policy };
        }
      } else if (policy.auth.allowHeaderPresenceFallback === true) {
        // OPT-IN legacy fallback: header-PRESENCE only — NOT a real token verification (it admits any
        // non-empty Authorization header), so it is gated behind an explicit per-route opt-in (default
        // off). "Presence" means a NON-EMPTY value: an absent, empty, or whitespace-only Authorization
        // header is not presence and is denied — this closes the empty-header admission the prior
        // `=== undefined` check let through (RD-0307/0309). Mirrors galerina-auth `headerPresenceVerdict`
        // (the reusable posture factor), kept INLINE so the kernel takes no capability-package compile
        // dependency — the same structural-seam stance as gate 9.5 (Hardened Border: core-config + tower-citizen only).
        const authz = header(req.headers, "authorization");
        if (authz === undefined || authz.trim().length === 0) {
          return { response: errorResponse(401, "unauthorized", "Authorization header required."), policy };
        }
      } else {
        // TIGHTENED default (fail-closed, owner decision 2026-06-23): with no channel/identity verdict
        // supplied, a required-auth route does NOT admit on header presence alone — presence is not
        // authentication. Deny unless a verdict authorises (or the route opts into the legacy fallback).
        return { response: errorResponse(401, "unauthorized", "A channel/identity verdict is required (header presence is not sufficient)."), policy };
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
        json = JSON.parse(text);
      } catch {
        return { response: errorResponse(422, "unprocessable_entity", "Body is not valid JSON."), policy };
      }
    } else {
      json = undefined;
    }

    // ── 8 idempotency ──
    if (policy.idempotency.enabled) {
      const key = header(req.headers, policy.idempotency.header);
      if (key !== undefined) {
        const rk = routeKey(method, path);
        let duplicate: boolean;
        try {
          duplicate = await idempotencyStore.seen(rk, key);
        } catch {
          // Fail closed: if the store errors we reject rather than risk a replay.
          return { response: errorResponse(409, "conflict", "Idempotency store unavailable."), policy };
        }
        if (duplicate) {
          return { response: errorResponse(409, "conflict", `Duplicate idempotency key '${key}'.`), policy };
        }
      }
    }

    // ── 9 concurrency ──
    const rk = routeKey(method, path);
    const current = inFlight.get(rk) ?? 0;
    if (current >= policy.limits.maxConcurrent) {
      return { response: errorResponse(
        429, "too_many_requests",
        `Concurrency limit ${policy.limits.maxConcurrent} reached for '${rk}'.`,
      ), policy };
    }
    inFlight.set(rk, current + 1);

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

      // ── 10 dispatch handler ── (ONLY now is developer code reached)
      const fn = opts.dispatch[policy.handler];
      if (fn === undefined) {
        // Misconfiguration, not client error: route declares an unknown handler.
        return { response: errorResponse(500, "internal_error", `No handler '${policy.handler}' registered.`), policy };
      }

      let result: HandlerResult;
      try {
        result = await fn({ request: req, policy, json, getSecret: secretGate.getSecret });
      } catch {
        // Handler faults fail closed: a safe 500, no internal detail leaks.
        return { response: errorResponse(500, "internal_error", "Handler failed."), policy };
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

      const response: GalerinaKernelResponse =
        body === undefined ? { status, headers } : { status, headers, body };
      return { response, policy };
    } finally {
      // Release the concurrency slot whether the handler succeeded or threw.
      const after = (inFlight.get(rk) ?? 1) - 1;
      if (after <= 0) inFlight.delete(rk);
      else inFlight.set(rk, after);
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
   * Public entry point. Runs the fixed pipeline, then emits the audit event on
   * the audit pipe WITHOUT awaiting it (Tri-Pipe: audit must never block or
   * break the response), and returns immediately.
   */
  async function handle(req: GalerinaKernelRequest): Promise<GalerinaKernelResponse> {
    const outcome = await runPipeline(req);
    const { response, policy } = outcome;

    // ── 12 audit ── (off the critical path; fire-and-forget, never awaited)
    // Build the event AFTER the response is fully computed, then hand it to the
    // sink. We do not await: a slow or throwing sink must not delay the caller.
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
    try {
      auditSink.emit(event);
    } catch {
      // A faulty sink must never affect the response. Swallow and move on.
    }

    return response;
  }

  return { handle };
}
