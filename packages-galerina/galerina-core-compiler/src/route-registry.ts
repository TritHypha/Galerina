import { type AstNode } from "./parser.js";

export interface RouteEntry {
  readonly method: string;
  readonly path: string;
  readonly flowName: string;
  readonly requestType: string;
  readonly responseType: string;
  readonly pathPattern: RegExp;
  readonly paramNames: readonly string[];
}

export interface RouteMatch {
  readonly route: RouteEntry;
  readonly params: ReadonlyMap<string, string>;
}

export interface RouteRegistry {
  readonly routes: readonly RouteEntry[];
  match(method: string, path: string): RouteMatch | null;
}

export function buildRouteRegistry(ast: AstNode): RouteRegistry {
  const routes: RouteEntry[] = [];

  function walk(node: AstNode): void {
    if (node.kind === "routeDecl" && node.value !== undefined) {
      const entry = parseRouteEntry(node);
      if (entry !== null) routes.push(entry);
    }
    for (const child of node.children ?? []) walk(child);
  }

  walk(ast);

  return {
    routes,
    match(method: string, rawPath: string): RouteMatch | null {
      const path = rawPath.split("?")[0] ?? rawPath;
      const normalMethod = method.toUpperCase();

      for (const route of routes) {
        if (route.method !== normalMethod) continue;
        const matched = path.match(route.pathPattern);
        if (matched === null) continue;

        const params = new Map<string, string>();
        route.paramNames.forEach((name, index) => {
          params.set(name, matched[index + 1] ?? "");
        });

        return { route, params };
      }

      return null;
    },
  };
}

function parseRouteEntry(node: AstNode): RouteEntry | null {
  const raw = node.value;
  if (raw === undefined) return null;
  const spaceIdx = raw.indexOf(" ");
  if (spaceIdx === -1) return null;

  const method = raw.slice(0, spaceIdx).toUpperCase();
  const path = raw.slice(spaceIdx + 1).trim();
  if (path === "") return null;

  let flowName = "";
  let requestType = "";
  let responseType = "";

  for (const child of node.children ?? []) {
    if (child.kind === "identifier" && child.value?.startsWith("flow:") === true) {
      flowName = child.value.slice("flow:".length);
    } else if (child.kind === "typeRef" && child.value !== undefined) {
      requestType = child.value;
    } else if (child.kind === "identifier" && child.value?.startsWith("response:") === true) {
      responseType = child.value.slice("response:".length);
    }
  }

  if (flowName === "") return null;

  const paramNames: string[] = [];
  const patternStr = path.replace(/\{([^}]+)\}/g, (_full, name: string) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  const pathPattern = new RegExp(`^${patternStr}$`);

  return { method, path, flowName, requestType, responseType, pathPattern, paramNames };
}
