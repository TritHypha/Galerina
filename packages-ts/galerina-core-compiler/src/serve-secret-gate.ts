import {
  canonicalEffectName,
  DENY_ONLY_EFFECTS,
  isRecognisedEffectName,
  observedEffectsForFlowNodeIncludingNestedFns,
} from "./effect-checker.js";
import { decodeFlowDecl, isFlowDeclNamed } from "./flow-name.js";
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

function normalizeDeclaredRoutePath(path: string): string | null {
  const noQuery = path.split("?")[0] ?? path;
  const segments = noQuery.split(/(\{[^{}]*\})/g);
  const out: string[] = [];
  for (const segment of segments) {
    if (/^\{[^{}]+\}$/u.test(segment)) {
      out.push(segment);
      continue;
    }
    try {
      out.push(decodeURIComponent(segment).toLowerCase());
    } catch {
      return null;
    }
  }
  let joined = out.join("");
  while (joined.length > 1 && joined.endsWith("/")) joined = joined.slice(0, -1);
  return joined;
}

function compileDeclaredPathPattern(path: string): RegExp | null {
  const paramNames: string[] = [];
  try {
    const segments = path.split(/(\{[^{}]*\})/g);
    const patternStr = segments.map((segment) => {
      const param = /^\{([^{}]+)\}$/u.exec(segment);
      if (param !== null) {
        const name = param[1] as string;
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name) || paramNames.includes(name)) {
          throw new Error("invalid parameter");
        }
        paramNames.push(name);
        return "([^/]+)";
      }
      if (segment.includes("{") || segment.includes("}")) throw new Error("malformed template");
      return segment.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    }).join("");
    return new RegExp(`^${patternStr}$`);
  } catch {
    return null;
  }
}

export function isProtectedAuthVerifyRoute(route: RouteEntry): boolean {
  const normalized = normalizeDeclaredRoutePath(route.path);
  if (normalized === "/auth/verify") return true;
  if (route.method !== "POST") return false;
  if (route.pathPattern.test("/auth/verify")) return true;
  if (normalized === null) return false;
  const rebuilt = compileDeclaredPathPattern(normalized);
  return rebuilt !== null && rebuilt.test("/auth/verify");
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

function callableDeclName(node: AstNode): string | undefined {
  const decoded = decodeFlowDecl(node);
  if (decoded !== undefined && !("error" in decoded) && decoded.name.length > 0) {
    return decoded.name;
  }
  if (node.kind === "fnDecl" && typeof node.value === "string" && node.value.length > 0) {
    return node.value;
  }
  return undefined;
}

/**
 * Index flow decls and module-level fn decls. Nested fns inside a flow stay
 * off this map: `observedEffectsForFlowNodeIncludingNestedFns` already covers them.
 */
function indexReachableCallables(ast: AstNode): ReadonlyMap<string, AstNode> {
  const map = new Map<string, AstNode>();
  function walk(node: AstNode, insideFlow: boolean): void {
    const decoded = decodeFlowDecl(node);
    if (decoded !== undefined && !("error" in decoded) && decoded.name.length > 0) {
      if (!map.has(decoded.name)) map.set(decoded.name, node);
      for (const child of node.children ?? []) walk(child, true);
      return;
    }
    if (!insideFlow && node.kind === "fnDecl") {
      const name = callableDeclName(node);
      if (name !== undefined && !map.has(name)) map.set(name, node);
      return;
    }
    for (const child of node.children ?? []) walk(child, insideFlow);
  }
  walk(ast, false);
  return map;
}

function isMethodCall(node: AstNode): boolean {
  return (node as AstNode & { readonly callStyle?: string }).callStyle === "method";
}

function callTargetName(node: AstNode): string | undefined {
  if (node.kind !== "callExpr" || typeof node.value !== "string" || node.value.length === 0) {
    return undefined;
  }
  if (node.value.startsWith("step:")) return node.value.slice("step:".length);
  return node.value;
}

function collectCalleeNames(node: AstNode, callableNames: ReadonlySet<string>): readonly string[] {
  const found: string[] = [];
  function consider(name: string): void {
    if (callableNames.has(name)) found.push(name);
  }
  function walk(n: AstNode): void {
    if (n.kind === "callExpr") {
      const target = callTargetName(n);
      if (target !== undefined) consider(target);
    } else if (n.kind === "identifier" && typeof n.value === "string") {
      // Value-position alias (`let f = helper`): walk the indexed callable.
      consider(n.value);
    }
    for (const child of n.children ?? []) walk(child);
  }
  walk(node);
  return found;
}

function nestedFnDeclNames(node: AstNode): ReadonlySet<string> {
  const names = new Set<string>();
  function walk(n: AstNode): void {
    if (n.kind === "fnDecl" && typeof n.value === "string" && n.value.length > 0) {
      names.add(n.value);
    }
    for (const child of n.children ?? []) walk(child);
  }
  walk(node);
  return names;
}

function unresolvedBareCallName(
  node: AstNode,
  callableNames: ReadonlySet<string>,
): string | undefined {
  const nested = nestedFnDeclNames(node);
  let found: string | undefined;
  function walk(n: AstNode): void {
    if (found !== undefined) return;
    if (
      n.kind === "callExpr"
      && typeof n.value === "string"
      && n.value.length > 0
      && !n.value.startsWith("#")
      && !isMethodCall(n)
    ) {
      const target = callTargetName(n) ?? n.value;
      if (!callableNames.has(target) && !nested.has(target)) {
        found = n.value;
        return;
      }
    }
    for (const child of n.children ?? []) walk(child);
  }
  walk(node);
  return found;
}

function reachableEffectsFromFlow(
  ast: AstNode,
  rootName: string,
): {
  readonly names: readonly string[];
  readonly hasSecretsBlock: boolean;
  readonly unresolved: string | undefined;
} {
  const callables = indexReachableCallables(ast);
  const callableNames = new Set(callables.keys());
  const names: string[] = [];
  const seen = new Set<string>();
  const visited = new Set<string>();
  let hasSecretsBlock = false;
  let unresolved: string | undefined;
  const queue: string[] = [rootName];
  while (queue.length > 0) {
    const name = queue.shift();
    if (name === undefined || visited.has(name)) continue;
    visited.add(name);
    const node = callables.get(name);
    if (node === undefined) continue;
    if (flowHasSecretsBlock(node)) hasSecretsBlock = true;
    for (const effect of declaredEffectsFromFlowNode(node)) {
      if (effect.length === 0 || seen.has(effect)) continue;
      seen.add(effect);
      names.push(effect);
    }
    for (const effect of observedEffectsForFlowNodeIncludingNestedFns(node)) {
      if (effect.length === 0 || seen.has(effect)) continue;
      seen.add(effect);
      names.push(effect);
    }
    if (unresolved === undefined) {
      unresolved = unresolvedBareCallName(node, callableNames);
    }
    for (const callee of collectCalleeNames(node, callableNames)) {
      if (!visited.has(callee)) queue.push(callee);
    }
  }
  return { names, hasSecretsBlock, unresolved };
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
  const reachable = reachableEffectsFromFlow(ast, route.flowName);
  addAll(reachable.names);
  if (reachable.unresolved !== undefined) {
    return {
      names,
      hasSecretsBlock: reachable.hasSecretsBlock,
      unknown: `route '${route.method} ${route.path}' calls unresolved name '${reachable.unresolved}'; secret requirement unknown`,
    };
  }
  if (summary === undefined && flowNode === undefined && reachable.names.length === 0) {
    return { names, hasSecretsBlock: false, unknown: `route '${route.method} ${route.path}' has no effect summary; secret requirement unknown` };
  }
  return {
    names,
    hasSecretsBlock: (flowNode !== undefined && flowHasSecretsBlock(flowNode)) || reachable.hasSecretsBlock,
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
