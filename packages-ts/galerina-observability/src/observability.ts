// =============================================================================
// One-call wiring — the actuator "starter". Bundles a HealthRegistry, a
// MetricsCollector and a structured Logger, and hands back the kernel surface
// (routes + dispatch) plus the two metrics integration seams. PURE of ambient
// authority and side effects: constructing this starts nothing and reads nothing.
// =============================================================================

import type {
  AuditEvent,
  AuditReservation,
  AuditSink,
  HandlerDispatch,
  RouteDeclaration,
} from "../../galerina-framework-app-kernel/dist/index.js";
import { HealthRegistry, type HealthRegistryOptions } from "./health.js";
import { MetricsCollector, type MetricsCollectorOptions } from "./metrics.js";
import { createLogger, type Logger, type LoggerOptions } from "./logger.js";
import {
  instrumentDispatch,
  metricsAuditSink,
  observabilityRoutes,
  type InstrumentOptions,
  type ObservabilityRouteOptions,
} from "./kernel-integration.js";

export interface CreateObservabilityOptions {
  readonly health?: HealthRegistryOptions;
  readonly metrics?: MetricsCollectorOptions;
  readonly logger?: LoggerOptions;
  /** Receipt-preserving primary for mandatory runtime reports; metrics remains a non-authorizing observer. */
  readonly receiptSink?: AuditSink;
  /** Endpoint/path/auth knobs forwarded to `observabilityRoutes` (registry+metrics injected for you). */
  readonly routes?: Omit<ObservabilityRouteOptions, "registry" | "metrics">;
}

/** The assembled observability surface, ready to compose into `createAppKernel(...)`. */
export interface Observability {
  readonly registry: HealthRegistry;
  readonly metrics: MetricsCollector;
  readonly logger: Logger;
  /** Actuator routes (health probes + /metrics) to merge into the kernel's `routes`. */
  readonly routes: readonly RouteDeclaration[];
  /** Handlers for those routes to merge into the kernel's `dispatch`. */
  readonly dispatch: HandlerDispatch;
  /**
   * An AuditSink that feeds the bundled collector (counts + error rates, NO latency).
   * Use this OR `instrument`, never both on this collector (they would double-count).
   */
  readonly auditSink: AuditSink;
  /** Wrap your app dispatch to record counts + error rates + LATENCY (the richer option). */
  instrument(dispatch: HandlerDispatch, opts?: InstrumentOptions): HandlerDispatch;
}

const ROUTE_OPTION_KEYS = new Set(["basePath", "handlerPrefix", "metricsAuth", "includePrometheus"]);

/**
 * Admit only the inert, caller-owned portion of route configuration. Trusted
 * collectors are injected by createObservability after this boundary and can
 * never be replaced by a spread or accessor supplied by the caller.
 */
function validateRouteOptions(value: unknown): Omit<ObservabilityRouteOptions, "registry" | "metrics"> {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("routes must be a plain data object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("routes must have a plain or null prototype");
  }

  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !ROUTE_OPTION_KEYS.has(key)) {
      throw new TypeError(`routes contains unsupported key '${String(key)}'`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError(`routes.${key} must be an own data property`);
    }
    const option = descriptor.value;
    if (option === undefined) {
      out[key] = undefined;
      continue;
    }
    if ((key === "basePath" || key === "handlerPrefix") && typeof option !== "string") {
      throw new TypeError(`routes.${key} must be a string`);
    }
    if (key === "metricsAuth" && option !== "required" && option !== "public") {
      throw new TypeError("routes.metricsAuth must be 'required' or 'public'");
    }
    if (key === "includePrometheus" && typeof option !== "boolean") {
      throw new TypeError("routes.includePrometheus must be a boolean");
    }
    out[key] = option;
  }
  return out as Omit<ObservabilityRouteOptions, "registry" | "metrics">;
}

/**
 * Assemble health + metrics + logging + the kernel surface in one call.
 *
 *   const obs = createObservability();
 *   obs.registry.registerReadiness("db", () => db.ping());
 *   const kernel = createAppKernel({
 *     routes:   [...appRoutes,   ...obs.routes],
 *     dispatch: obs.instrument({ ...appDispatch, ...obs.dispatch }),
 *   });
 *   // obs.metrics.snapshot() is what the /metrics endpoint serves.
 */
export function createObservability(opts: CreateObservabilityOptions = {}): Observability {
  const registry = new HealthRegistry(opts.health ?? {});
  const metrics = new MetricsCollector(opts.metrics ?? {});
  const logger = createLogger(opts.logger ?? {});
  const routeOptions = validateRouteOptions(opts.routes);
  const surface = observabilityRoutes({ ...routeOptions, registry, metrics });
  let metricsMode: "audit" | "instrument" | undefined;
  const claimMetricsMode = (mode: "audit" | "instrument"): void => {
    if (metricsMode !== undefined && metricsMode !== mode) {
      throw new Error("Observability metrics seams are mutually exclusive: use auditSink or instrument, not both.");
    }
    metricsMode = mode;
  };
  const rawAuditSink = metricsAuditSink(metrics, opts.receiptSink);
  const auditSink: AuditSink = {
    reserve(): AuditReservation | undefined {
      claimMetricsMode("audit");
      return rawAuditSink.reserve();
    },
    commit(reservation: AuditReservation, event: AuditEvent): void {
      claimMetricsMode("audit");
      rawAuditSink.commit(reservation, event);
    },
    cancel(reservation: AuditReservation): void {
      claimMetricsMode("audit");
      rawAuditSink.cancel(reservation);
    },
    emit(event: AuditEvent): void {
      claimMetricsMode("audit");
      rawAuditSink.emit(event);
    },
  };

  return {
    registry,
    metrics,
    logger,
    routes: surface.routes,
    dispatch: surface.dispatch,
    auditSink,
    instrument: (dispatch, instrumentOpts) => {
      claimMetricsMode("instrument");
      return instrumentDispatch(dispatch, metrics, instrumentOpts ?? {});
    },
  };
}
