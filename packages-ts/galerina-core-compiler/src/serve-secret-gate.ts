import type { FlowMeta } from "./parser.js";
import type { RouteEntry } from "./route-registry.js";

/**
 * Standalone compiler `serve()` / `startServer()` must not dispatch secret-requiring
 * or protected routes. Those belong on the app-kernel gate 9.5 path.
 * Unknown or undeclared secret requirements refuse closed.
 */
export const STANDALONE_AUTH_VERIFY_REFUSAL =
  "Galerina: POST /auth/verify is reserved for the app-kernel gate 9.5; standalone serve() refuses secret-requiring and protected routes";

export type ServeGateVerdict =
  | { readonly __tag: "admit" }
  | { readonly __tag: "refuse"; readonly reason: string };

const ADMIT: ServeGateVerdict = { __tag: "admit" };

export interface ServeGateFlowEffects {
  readonly flowName: string;
  readonly declaredEffects: readonly string[];
  readonly observedEffects: readonly string[];
}

export function isProtectedAuthVerifyRoute(route: RouteEntry): boolean {
  return route.method === "POST" && route.pathPattern.test("/auth/verify");
}

export function isSecretEffectName(name: string): boolean {
  return /(?:^|[.])secret(?:$|[.])/iu.test(name);
}

function flowEffectsLookSecret(summary: ServeGateFlowEffects, declaredOnFlow: readonly string[]): boolean {
  const names = [
    ...summary.declaredEffects,
    ...summary.observedEffects,
    ...declaredOnFlow,
  ];
  return names.some(isSecretEffectName);
}

export function classifyStandaloneServeRoute(
  route: RouteEntry,
  flows: readonly FlowMeta[],
  effectResults: readonly ServeGateFlowEffects[],
): ServeGateVerdict {
  if (isProtectedAuthVerifyRoute(route)) {
    return {
      __tag: "refuse",
      reason: `POST ${route.path} is reserved for the app-kernel gate 9.5 (POST /auth/verify)`,
    };
  }

  const flow = flows.find((candidate) => candidate.name === route.flowName);
  if (flow === undefined) {
    return {
      __tag: "refuse",
      reason: `route '${route.method} ${route.path}' has no resolvable flow; secret requirement unknown`,
    };
  }

  const summary = effectResults.find((candidate) => candidate.flowName === route.flowName);
  if (summary === undefined) {
    return {
      __tag: "refuse",
      reason: `route '${route.method} ${route.path}' has no effect summary; secret requirement unknown`,
    };
  }

  if (flowEffectsLookSecret(summary, flow.declaredEffects)) {
    return {
      __tag: "refuse",
      reason: `route '${route.method} ${route.path}' requires secret effects; use the app-kernel gate 9.5`,
    };
  }

  return ADMIT;
}

export function standaloneAuthVerifyRefusal(routes: readonly RouteEntry[]): ServeGateVerdict {
  if (routes.some(isProtectedAuthVerifyRoute)) {
    return { __tag: "refuse", reason: STANDALONE_AUTH_VERIFY_REFUSAL };
  }
  return ADMIT;
}

export function standaloneServeSecretRefusal(
  routes: readonly RouteEntry[],
  flows: readonly FlowMeta[],
  effectResults: readonly ServeGateFlowEffects[],
): ServeGateVerdict {
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const verdict = classifyStandaloneServeRoute(route, flows, effectResults);
    if (verdict.__tag !== "refuse" || seen.has(verdict.reason)) continue;
    seen.add(verdict.reason);
    reasons.push(verdict.reason);
  }
  if (reasons.length === 0) return ADMIT;
  return {
    __tag: "refuse",
    reason: `Galerina: standalone serve() refuses secret-requiring and protected routes (${reasons.join("; ")}). Use the app-kernel gate 9.5.`,
  };
}

export function protectedStandaloneFlowNames(
  routes: readonly RouteEntry[],
  flows: readonly FlowMeta[],
  effectResults: readonly ServeGateFlowEffects[],
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const route of routes) {
    if (classifyStandaloneServeRoute(route, flows, effectResults).__tag === "refuse") {
      names.add(route.flowName);
    }
  }
  return names;
}
