/**
 * Boot-time handler-reference check (pure, not wired).
 *
 * `createAppKernel` resolves `opts.dispatch[policy.handler]` only when a
 * request arrives. A route whose handler is missing is refused with a 500 at
 * request time (kernel.ts gate 10). That plain property read also follows the
 * prototype chain, so a handler name such as `toString` on an ordinary object
 * literal resolves to an inherited function. This module lets a host refuse
 * both conditions before it starts listening. It is NOT called by
 * createAppKernel: wiring it into kernel construction is a separate kernel
 * change for the owner.
 *
 * Zero-trust choices:
 * - Only an OWN data property whose value is a function counts. Inherited
 *   properties and accessors are refused. Accessors are never invoked.
 * - Route arrays are walked by integer index through own data-property
 *   descriptors. Overridden `forEach` cannot skip checks. Index accessors
 *   and Proxy routes or dispatch objects are refused without invoking traps.
 * - Diagnostics carry a code and the route index only, never the handler name.
 */
import { types as nodeUtilTypes } from "node:util";
import type { RouteDeclaration } from "./types.js";
import type { HandlerDispatch } from "./kernel.js";

/** Same governed table size as typed-api-boundary MAX_ROUTES. */
export const HANDLER_REFERENCE_MAX_ROUTES = 256;

/** Input shape is wrong: routes not an array, dispatch not an object, or a route/handler name malformed. */
export const FUNGI_APPK_HRC_001 = "FUNGI-APPK-HRC-001";
/** No own dispatch entry for the route's handler name. */
export const FUNGI_APPK_HRC_002 = "FUNGI-APPK-HRC-002";
/** The name resolves only through the prototype chain (inherited), so it is refused. */
export const FUNGI_APPK_HRC_003 = "FUNGI-APPK-HRC-003";
/** The own entry is an accessor or not a function. */
export const FUNGI_APPK_HRC_004 = "FUNGI-APPK-HRC-004";

export interface HandlerReferenceDiagnostic {
  readonly code: string;
  readonly reason: string;
  /** Index into `routes`; absent for whole-input refusals. */
  readonly routeIndex?: number;
}

export type HandlerReferenceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostics: readonly HandlerReferenceDiagnostic[] };

function diag(code: string, reason: string, routeIndex?: number): HandlerReferenceDiagnostic {
  return Object.freeze(routeIndex === undefined ? { code, reason } : { code, reason, routeIndex });
}

function refused(diagnostics: HandlerReferenceDiagnostic[]): HandlerReferenceResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze(diagnostics) });
}

function hasInherited(dispatch: object, name: string): boolean {
  let proto: object | null = Object.getPrototypeOf(dispatch) as object | null;
  while (proto !== null) {
    if (nodeUtilTypes.isProxy(proto)) return true;
    if (Object.prototype.hasOwnProperty.call(proto, name)) return true;
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return false;
}

/** Check that every route's handler names an own, callable dispatch entry. */
export function checkHandlerReferences(
  routes: readonly RouteDeclaration[] | unknown,
  dispatch: HandlerDispatch | unknown,
): HandlerReferenceResult {
  if (!Array.isArray(routes)) return refused([diag(FUNGI_APPK_HRC_001, "routes must be an array")]);
  if (typeof dispatch !== "object" || dispatch === null || Array.isArray(dispatch)) {
    return refused([diag(FUNGI_APPK_HRC_001, "dispatch must be a non-array object")]);
  }
  if (nodeUtilTypes.isProxy(routes)) {
    return refused([diag(FUNGI_APPK_HRC_001, "routes must not be a Proxy")]);
  }
  if (nodeUtilTypes.isProxy(dispatch)) {
    return refused([diag(FUNGI_APPK_HRC_001, "dispatch must not be a Proxy")]);
  }
  const lengthDesc = Object.getOwnPropertyDescriptor(routes, "length");
  if (
    lengthDesc === undefined ||
    !("value" in lengthDesc) ||
    typeof lengthDesc.value !== "number" ||
    !Number.isInteger(lengthDesc.value) ||
    lengthDesc.value < 0
  ) {
    return refused([diag(FUNGI_APPK_HRC_001, "routes length must be a non-negative integer data property")]);
  }
  const diagnostics: HandlerReferenceDiagnostic[] = [];
  const len = lengthDesc.value;
  if (len > HANDLER_REFERENCE_MAX_ROUTES) {
    return refused([diag(FUNGI_APPK_HRC_001, "routes exceed the route-table bound")]);
  }
  for (let i = 0; i < len; i++) {
    const indexDesc = Object.getOwnPropertyDescriptor(routes, String(i));
    if (indexDesc === undefined || !("value" in indexDesc)) {
      diagnostics.push(diag(FUNGI_APPK_HRC_001, "route entry must be a data property", i));
      continue;
    }
    const route = indexDesc.value;
    if (nodeUtilTypes.isProxy(route) || typeof route !== "object" || route === null) {
      diagnostics.push(diag(FUNGI_APPK_HRC_001, "route must be a non-proxy object", i));
      continue;
    }
    const handler =
      Object.prototype.hasOwnProperty.call(route, "handler")
        ? (Object.getOwnPropertyDescriptor(route, "handler") as PropertyDescriptor | undefined)?.value
        : undefined;
    if (typeof handler !== "string" || handler.length === 0) {
      diagnostics.push(diag(FUNGI_APPK_HRC_001, "route handler must be a non-empty string data property", i));
      continue;
    }
    const own = Object.getOwnPropertyDescriptor(dispatch, handler);
    if (own === undefined) {
      diagnostics.push(
        hasInherited(dispatch, handler)
          ? diag(FUNGI_APPK_HRC_003, "handler resolves only through the prototype chain", i)
          : diag(FUNGI_APPK_HRC_002, "no dispatch entry for the route handler", i),
      );
      continue;
    }
    if (!("value" in own) || typeof own.value !== "function") {
      diagnostics.push(diag(FUNGI_APPK_HRC_004, "dispatch entry must be a function data property", i));
    }
  }
  return diagnostics.length === 0 ? Object.freeze({ ok: true as const }) : refused(diagnostics);
}

/** Throwing form for host boot code. The message lists codes and route indexes only. */
export function assertHandlerReferences(
  routes: readonly RouteDeclaration[] | unknown,
  dispatch: HandlerDispatch | unknown,
): void {
  const result = checkHandlerReferences(routes, dispatch);
  if (result.ok) return;
  const summary = result.diagnostics
    .map((d) => (d.routeIndex === undefined ? d.code : `${d.code}@route[${d.routeIndex}]`))
    .join(", ");
  throw new Error(`Handler reference check failed: ${summary}.`);
}
