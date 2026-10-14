import {
  canonicalEffectName,
  DENY_ONLY_EFFECTS,
  isRecognisedEffectName,
  observedEffectsForFlowNode,
} from "./effect-checker.js";
import { isFlowDeclNamed } from "./flow-name.js";
import type { AstNode, FlowMeta } from "./parser.js";
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

/**
 * Secret-bearing first segments. Union of value-state-checker.ts SECRET_NS (:472)
 * and the secret-handling receivers in EGRESS_SAFE_RECEIVERS (:378).
 */
const SECRET_EFFECT_NAMESPACES: ReadonlySet<string> = new Set([
  "secret",
  "secrets",
  "vault",
  "kms",
  "env",
  "keystore",
  "keyring",
  "hsm",
  "secretmanager",
  "secretstore",
]);

export function isProtectedAuthVerifyRoute(route: RouteEntry): boolean {
  return route.method === "POST" && route.pathPattern.test("/auth/verify");
}

export function isSecretBearingEffectName(name: string): boolean {
  const canonical = canonicalEffectName(name);
  const head = (canonical.split(".")[0] ?? canonical).toLowerCase();
  return SECRET_EFFECT_NAMESPACES.has(head);
}

/** @deprecated use isSecretBearingEffectName */
export function isSecretEffectName(name: string): boolean {
  return isSecretBearingEffectName(name);
}

function findFlowNode(ast: AstNode, name: string): AstNode | undefined {
  if (isFlowDeclNamed(ast, name)) return ast;
  for (const child of ast.children ?? []) {
    const found = findFlowNode(child, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

function flowHasSecretsBlock(flowNode: AstNode): boolean {
  if (flowNode.kind === "secretsBlock") return true;
  for (const child of flowNode.children ?? []) {
    if (flowHasSecretsBlock(child)) return true;
  }
  return false;
}

function declaredEffectsFromFlowNode(flowNode: AstNode): readonly string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (name.length === 0 || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  };
  for (const child of flowNode.children ?? []) {
    if (child.kind === "effectsDecl") {
      for (const effect of child.children ?? []) {
        if (effect.kind === "effectRef" && typeof effect.value === "string") add(effect.value);
      }
    }
    if (child.kind === "contractDecl") {
      for (const sub of child.children ?? []) {
        if (
          sub.kind === "identifier" &&
          typeof sub.value === "string" &&
          (sub.value === "effects:block" || sub.value === "effects:")
        ) {
          for (const effectChild of sub.children ?? []) {
            if (
              effectChild.kind === "identifier" &&
              typeof effectChild.value === "string" &&
              effectChild.value.startsWith("effect:")
            ) {
              add(effectChild.value.slice("effect:".length));
            }
          }
        }
      }
    }
  }
  return names;
}

function collectEffectNames(
  route: RouteEntry,
  ast: AstNode,
  flows: readonly FlowMeta[],
  effectResults: readonly ServeGateFlowEffects[],
): { readonly names: readonly string[]; readonly hasSecretsBlock: boolean; readonly unknown: string | undefined } {
  const flowNode = findFlowNode(ast, route.flowName);
  const flow = flows.find((candidate) => candidate.name === route.flowName);
  if (flowNode === undefined && flow === undefined) {
    return { names: [], hasSecretsBlock: false, unknown: `route '${route.method} ${route.path}' has no resolvable flow; secret requirement unknown` };
  }

  const summary = effectResults.find((candidate) => candidate.flowName === route.flowName);
  const names: string[] = [];
  const seen = new Set<string>();
  const addAll = (list: readonly string[]) => {
    for (const name of list) {
      if (name.length === 0 || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  };
  if (flow !== undefined) addAll(flow.declaredEffects);
  if (summary !== undefined) {
    addAll(summary.declaredEffects);
    addAll(summary.observedEffects);
  }
  if (flowNode !== undefined) {
    addAll(declaredEffectsFromFlowNode(flowNode));
    addAll(observedEffectsForFlowNode(flowNode));
  }
  if (summary === undefined && flowNode === undefined) {
    return { names, hasSecretsBlock: false, unknown: `route '${route.method} ${route.path}' has no effect summary; secret requirement unknown` };
  }
  return {
    names,
    hasSecretsBlock: flowNode !== undefined && flowHasSecretsBlock(flowNode),
    unknown: undefined,
  };
}

function classifyEffectName(name: string, route: RouteEntry): ServeGateVerdict {
  if (!isRecognisedEffectName(name)) {
    return {
      __tag: "refuse",
      reason: `route '${route.method} ${route.path}' declares unrecognised effect '${name}'; secret requirement unknown`,
    };
  }
  const canonical = canonicalEffectName(name);
  if (DENY_ONLY_EFFECTS.has(name) || DENY_ONLY_EFFECTS.has(canonical)) {
    return {
      __tag: "refuse",
      reason: `route '${route.method} ${route.path}' declares deny-only effect '${name}'`,
    };
  }
  if (isSecretBearingEffectName(name)) {
    return {
      __tag: "refuse",
      reason: `route '${route.method} ${route.path}' requires secret-bearing effect '${canonical}'; use the app-kernel gate 9.5`,
    };
  }
  return ADMIT;
}

export function classifyStandaloneServeRoute(
  route: RouteEntry,
  ast: AstNode,
  flows: readonly FlowMeta[] = [],
  effectResults: readonly ServeGateFlowEffects[] = [],
): ServeGateVerdict {
  if (isProtectedAuthVerifyRoute(route)) {
    return {
      __tag: "refuse",
      reason: `POST ${route.path} is reserved for the app-kernel gate 9.5 (POST /auth/verify)`,
    };
  }

  const collected = collectEffectNames(route, ast, flows, effectResults);
  if (collected.unknown !== undefined) {
    return { __tag: "refuse", reason: collected.unknown };
  }
  if (collected.hasSecretsBlock) {
    return {
      __tag: "refuse",
      reason: `route '${route.method} ${route.path}' carries a contract secrets block; use the app-kernel gate 9.5`,
    };
  }
  for (const name of collected.names) {
    const verdict = classifyEffectName(name, route);
    if (verdict.__tag === "refuse") return verdict;
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
  ast: AstNode,
  flows: readonly FlowMeta[] = [],
  effectResults: readonly ServeGateFlowEffects[] = [],
): ServeGateVerdict {
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    const verdict = classifyStandaloneServeRoute(route, ast, flows, effectResults);
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
  ast: AstNode,
  flows: readonly FlowMeta[] = [],
  effectResults: readonly ServeGateFlowEffects[] = [],
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const route of routes) {
    if (classifyStandaloneServeRoute(route, ast, flows, effectResults).__tag === "refuse") {
      names.add(route.flowName);
    }
  }
  return names;
}
