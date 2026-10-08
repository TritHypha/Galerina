// W2 closure cut (2026-07-16, RD-0403 §1.1): `node:http` is imported LAZILY inside startServer.
// The static import dragged the entire Node network stack (http → tls → http2 → net → dns +
// internal undici; measured 237 vs 112 native modules) onto the single-file `check` path via
// index.js → route-dispatcher.js — a network stack has no business in a file check. The deferred
// import fails CLOSED at first use with the same rejection semantics callers already handle
// (startServer rejects). Detector: scripts/audit-check-import-set.mjs (the import-set ratchet).
import { type GalerinaValue } from "./interpreter.js";
import { type AstNode } from "./parser.js";
import { buildRouteRegistry, type RouteMatch, type RouteRegistry } from "./route-registry.js";
import { jsObjectToGalerina } from "./stdlib.js";

export interface ServerConfig {
  readonly port: number;
  readonly host?: string;
  readonly maxBodyBytes?: number;
  /** Per-flow request caps derived from admitted Fungi contract limits. */
  readonly routeBodyLimits?: ReadonlyMap<string, number>;
  readonly mode?: "dev" | "production" | "deterministic";
  /** Request timeout ms — default 30000 (30s). OWASP F4: prevents slowloris. */
  readonly requestTimeoutMs?: number;
  /** Headers timeout ms — default 10000 (10s). Should be > requestTimeoutMs per Node docs. */
  readonly headersTimeoutMs?: number;
  /** Max requests per minute per IP — default 200 (dev) / 60 (prod). OWASP F5. */
  readonly rateLimit?: number;
}

// ── OWASP F5: simple token-bucket rate limiter (per-IP, in-memory) ──────────
// Not a substitute for infrastructure-level rate limiting (nginx/Cloudflare),
// but prevents a single Node process from being flooded from one client.
export class RateLimiter {
  private readonly counts = new Map<string, { n: number; resetAt: number }>();
  private readonly capacity: number;
  private readonly now: () => number;

  constructor(
    private readonly limitPerMin: number,
    options: { readonly capacity?: number; readonly now?: () => number } = {},
  ) {
    if (!Number.isSafeInteger(limitPerMin) || limitPerMin <= 0) {
      throw new Error("RateLimiter limitPerMin must be a positive safe integer");
    }
    this.capacity = options.capacity ?? 10_000;
    if (!Number.isSafeInteger(this.capacity) || this.capacity <= 0) {
      throw new Error("RateLimiter capacity must be a positive safe integer");
    }
    this.now = options.now ?? Date.now;
  }

  isAllowed(ip: string): boolean {
    const now = this.now();
    const entry = this.counts.get(ip);
    if (entry !== undefined && now < entry.resetAt) {
      if (entry.n >= this.limitPerMin) return false;
      entry.n++;
      return true;
    }

    if (entry === undefined && this.counts.size >= this.capacity) {
      for (const [candidateIp, candidate] of this.counts) {
        if (now >= candidate.resetAt) this.counts.delete(candidateIp);
      }
      if (this.counts.size >= this.capacity) return false;
    }

    if (entry !== undefined || this.counts.size < this.capacity) {
      this.counts.set(ip, { n: 1, resetAt: now + 60_000 });
      return true;
    }
    return false;
  }
}

export interface RunningServer {
  close(): Promise<void>;
  readonly port: number;
  readonly registry: RouteRegistry;
}

export type AdmittedRouteExecutor = (
  flowName: string,
  args: ReadonlyMap<string, GalerinaValue>,
) => Promise<GalerinaValue>;

export function makeResponseValue(status: number, body: GalerinaValue): GalerinaValue {
  const fields = new Map<string, GalerinaValue>([
    ["__httpStatus", { __tag: "int", value: status }],
    ["__body", body],
    ["__isResponse", { __tag: "bool", value: true }],
  ]);
  return { __tag: "record", fields };
}

export function makeApiErrorValue(status: number, message: string): GalerinaValue {
  const fields = new Map<string, GalerinaValue>([
    ["__httpStatus", { __tag: "int", value: status }],
    ["__message", { __tag: "string", value: message }],
    ["__isApiError", { __tag: "bool", value: true }],
  ]);
  return { __tag: "record", fields };
}

export async function startServer(
  ast: AstNode,
  config: ServerConfig,
  executeAdmittedRoute: AdmittedRouteExecutor,
): Promise<RunningServer> {
  const requestedHost = config.host ?? "127.0.0.1";
  const bindHost = requestedHost === "[::1]" ? "::1" : requestedHost;
  if (bindHost !== "127.0.0.1" && bindHost !== "::1") {
    throw new Error(
      "Standalone compiler server refuses external binding; use the authenticated app-kernel boundary",
    );
  }
  const maxBodyBytes = config.maxBodyBytes ?? 1_048_576;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new Error("Galerina: maxBodyBytes must be a positive safe integer");
  }
  const routeBodyLimits = new Map(config.routeBodyLimits ?? []);
  for (const [flowName, limit] of routeBodyLimits) {
    if (flowName.length === 0 || !Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error("Galerina: invalid per-route request-size limit");
    }
  }
  const registry = buildRouteRegistry(ast);
  const authVerifyRoutes = registry.routes.filter(
    (route) => route.method === "POST" && route.pathPattern.test("/auth/verify"),
  );
  if (authVerifyRoutes.length > 0 && (
    authVerifyRoutes.length !== 1 || authVerifyRoutes[0]?.path !== "/auth/verify"
  )) {
    throw new Error("Galerina: POST /auth/verify is reserved and must have one exact route binding");
  }
  // W2: the network stack loads only when a server actually starts (see header comment).
  const { createServer } = await import("node:http");
  const mode          = config.mode ?? "dev";
  // OWASP F5: rate limit — production/deterministic default 60 req/min; dev 200
  const rateLimit     = config.rateLimit ?? (mode === "dev" ? 200 : 60);
  const rateLimiter   = new RateLimiter(rateLimit);
  // OWASP F4: request + headers timeouts — prevent slowloris / keep-alive abuse
  const requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
  const headersTimeoutMs = config.headersTimeoutMs ?? Math.max(requestTimeoutMs + 5_000, 15_000);

  const server = createServer((req: any, res: any) => {
    // OWASP F5: rate check — block before any parsing
    const clientIp = (req.socket?.remoteAddress ?? "unknown") as string;
    if (!rateLimiter.isAllowed(clientIp)) {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Retry-After", "60");
      res.end(JSON.stringify({ error: "Too Many Requests", retryAfterSeconds: 60 }));
      return;
    }
    const url = req.url ?? "/";
    const method = req.method?.toUpperCase() ?? "GET";
    const queryParams = parseQueryString(url);
    const path = url.split("?")[0] ?? "/";

    const match = registry.match(method, path);
    if (match === null) {
      const pathExists = registry.routes.some((route) => route.pathPattern.test(path));
      res.setHeader("Content-Type", "application/json");
      if (pathExists) {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method Not Allowed" }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Not Found", path }));
      }
      return;
    }

    const routeBodyLimit = routeBodyLimits.get(match.route.flowName);
    const effectiveMaxBodyBytes = routeBodyLimit === undefined
      ? maxBodyBytes
      : Math.min(maxBodyBytes, routeBodyLimit);

    const chunks: Uint8Array[] = [];
    let bodySize = 0;
    let settled = false;

    req.on("data", (chunk: Uint8Array) => {
      if (settled) return;
      bodySize += chunk.length;
      if (bodySize > effectiveMaxBodyBytes) {
        settled = true;
        res.statusCode = 413;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Request body too large" }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (settled) return;
      const body = concatBytes(chunks);
      let reqValue: GalerinaValue;
      try {
        reqValue = hydrateRequest(req, match, body, queryParams, path);
      } catch {
        res.statusCode = 422;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Unprocessable Entity" }));
        return;
      }
      // Pass the request value under both "request" (canonical style) and "req"
      // (legacy style) so flows using either parameter name work correctly.
      const args = new Map<string, GalerinaValue>([
        ["request", reqValue],
        ["req",     reqValue],
      ]);

      // ── SECURITY: Runtime effect gate (F1 hardened — Audit Pass 2) ─────────
      // Transport never calls the interpreter directly. The runtime supplies a
      // callback only after the shared compiler/governance admission has passed.
      executeAdmittedRoute(match.route.flowName, args).then((value) => {
        serializeResponse(value, res);
      }).catch((error: unknown) => {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          error: "Flow execution failed",
        }));
      });
    });

    req.on("error", () => {
      if (settled) return;
      settled = true;
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Bad Request" }));
    });
  });

  // OWASP F4: wire request + headers timeouts (cast as any — tsconfig has limited Node types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _srv = server as any;
  _srv.requestTimeout  = requestTimeoutMs;
  _srv.headersTimeout  = headersTimeoutMs;
  _srv.keepAliveTimeout = Math.min(requestTimeoutMs, 5_000);

  return new Promise<RunningServer>((resolve, reject) => {
    // OWASP F7: the standalone compiler surface is loopback-only. External
    // exposure belongs to the authenticated app-kernel boundary.
    server.listen(config.port, bindHost, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : config.port;
      resolve({
        close(): Promise<void> {
          return new Promise((closeResolve, closeReject) =>
            server.close((err: unknown) => (err ? closeReject(err) : closeResolve())),
          );
        },
        port: actualPort,
        registry,
      });
    });
    server.on("error", reject);
  });
}

function hydrateRequest(
  req: any,
  match: RouteMatch,
  body: Uint8Array,
  queryParams: ReadonlyMap<string, string>,
  rawPath: string,
): GalerinaValue {
  const headers = new Map<string, GalerinaValue>();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, { __tag: "string", value });
  }

  const params = new Map<string, GalerinaValue>();
  for (const [key, value] of match.params) params.set(key, { __tag: "string", value });

  const queryMap = new Map<string, GalerinaValue>();
  for (const [key, value] of queryParams) queryMap.set(key, { __tag: "string", value });

  const bodyBytes: GalerinaValue = { __tag: "bytes", value: new Uint8Array(body) };

  // Auto-parse JSON body if Content-Type is application/json
  let parsedBody: GalerinaValue = bodyBytes;  // default: raw bytes
  const contentType = (req.headers["content-type"] ?? "").toLowerCase();
  // /auth/verify is the owner-selected protected verification ingress. Keep
  // its wire body opaque here; transport decoding would create host strings or
  // objects before Fungi-side verification. This does not establish ciphertext-
  // only input: the verifier still needs Fungi-side envelope/auth checks before
  // any provider call or outcome. Other routes retain legacy JSON parsing.
  const preserveVerificationWireBytes =
    req.method?.toUpperCase() === "POST" && rawPath === "/auth/verify";
  if (!preserveVerificationWireBytes && contentType.includes("application/json") && body.length > 0) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
      const parsed = JSON.parse(text);
      parsedBody = jsObjectToGalerina(parsed);
    } catch { throw new Error("INVALID_JSON_BODY"); }
  }

  const fields = new Map<string, GalerinaValue>([
    ["method", { __tag: "string", value: req.method?.toUpperCase() ?? "GET" }],
    ["path", { __tag: "string", value: rawPath }],
    ["params", { __tag: "record", fields: params }],
    ["query", { __tag: "record", fields: queryMap }],
    ["headers", { __tag: "record", fields: headers }],
    ["jsonBody", parsedBody],
    ["body",     bodyBytes],
    ["rawBody",  bodyBytes],
  ]);
  return { __tag: "record", fields };
}

function parseQueryString(url: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const qIdx = url.indexOf("?");
  if (qIdx === -1) return map;

  const qs = url.slice(qIdx + 1);
  for (const pair of qs.split("&")) {
    if (pair === "") continue;
    const [rawKey, rawValue] = pair.split("=");
    if (rawKey !== undefined) {
      // SECURITY: wrap decodeURIComponent — malformed % sequences throw URIError
      // which previously propagated as an unhandled exception → 500/process instability.
      // Now: silently skip malformed pairs (400 is returned by the body handler).
      try {
        const key = decodeURIComponent(rawKey);
        const val = decodeURIComponent(rawValue ?? "");
        map.set(key, val);
      } catch {
        // Malformed URI encoding — skip this pair (attacker cannot influence values)
      }
    }
  }
  return map;
}

function serializeResponse(flowResult: GalerinaValue, res: any): void {
  res.setHeader("Content-Type", "application/json");

  if (flowResult.__tag === "ok") {
    serializeResponseValue(flowResult.value, res);
    return;
  }
  if (flowResult.__tag === "err") {
    serializeErrorValue(flowResult.error, res);
    return;
  }
  if (flowResult.__tag === "record") {
    serializeResponseValue(flowResult, res);
    return;
  }

  res.statusCode = 500;
  res.end(JSON.stringify({ error: "Internal runtime error", detail: "Unexpected flow result" }));
}

function serializeResponseValue(value: GalerinaValue, res: any): void {
  if (value.__tag === "record") {
    const status = value.fields.get("__httpStatus");
    const body = value.fields.get("__body");

    // Convention over configuration: if the record carries NEITHER control field
    // (__httpStatus / __body), it IS the response body. A flow that returns
    // `{ success: true }` should produce `{"success":true}` with status 200 —
    // developers and AI should not have to build an envelope by hand.
    if (status === undefined && body === undefined) {
      res.statusCode = 200;
      // Strip internal bookkeeping (__-prefixed) fields before serializing.
      const clean: Record<string, unknown> = {};
      for (const [k, v] of value.fields) {
        if (!k.startsWith("__")) clean[k] = galerinaValueToJs(v);
      }
      res.end(JSON.stringify(clean));
      return;
    }

    const statusCode = status?.__tag === "int" ? status.value : 200;
    res.statusCode = statusCode;

    if (statusCode === 204 || body === undefined || body.__tag === "void") {
      res.end();
      return;
    }

    if (body.__tag === "string") {
      try {
        JSON.parse(body.value);
        res.end(body.value);
      } catch {
        res.end(JSON.stringify({ value: body.value }));
      }
      return;
    }

    res.end(JSON.stringify(galerinaValueToJs(body)));
    return;
  }

  res.statusCode = 200;
  res.end(JSON.stringify(galerinaValueToJs(value)));
}

function serializeErrorValue(value: GalerinaValue, res: any): void {
  if (value.__tag === "record") {
    const status = value.fields.get("__httpStatus");
    const message = value.fields.get("__message");
    const statusCode = status?.__tag === "int" ? status.value : 500;
    res.statusCode = statusCode;
    res.end(JSON.stringify({
      error: true,
      status: statusCode,
      message: message?.__tag === "string" ? message.value : "Error",
    }));
    return;
  }

  res.statusCode = 500;
  res.end(JSON.stringify({ error: true, status: 500, message: "Unhandled error" }));
}

function galerinaValueToJs(value: GalerinaValue): unknown {
  switch (value.__tag) {
    case "string": return value.value;
    case "int":
    case "float": return value.value;
    case "bytes": return Array.from(value.value);
    case "bool": return value.value;
    case "void":
    case "none": return null;
    case "some": return galerinaValueToJs(value.value);
    case "ok": return galerinaValueToJs(value.value);
    case "err": return { error: galerinaValueToJs(value.error) };
    case "secure": return "[SECURE]";
    case "protected": return "[PROTECTED]";
    case "redacted": return "[REDACTED]";
    case "list": return value.items.map((item) => galerinaValueToJs(item));
    case "record": {
      const out: Record<string, unknown> = {};
      for (const [key, field] of value.fields) {
        if (!key.startsWith("__")) out[key] = galerinaValueToJs(field);
      }
      return out;
    }
    default:
      return null;
  }
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
