/** Canonicalize the semantic loop state, including provenance Maps and Sets. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const declarationIdentityIds = new WeakMap<object, number>();
let nextDeclarationIdentityId = 1;

function declarationIdentityId(identity: object): number {
  const existing = declarationIdentityIds.get(identity);
  if (existing !== undefined) return existing;
  const assigned = nextDeclarationIdentityId++;
  declarationIdentityIds.set(identity, assigned);
  return assigned;
}

function encode(value: unknown, active: Map<object, number>, nextId: { value: number }): unknown {
  if (value === undefined) return ["undefined"];
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : ["number", String(value)];
  if (typeof value === "bigint") return ["bigint", value.toString()];
  if (typeof value !== "object") return [typeof value, String(value)];

  const priorId = active.get(value);
  if (priorId !== undefined) return ["cycle", priorId];
  const id = nextId.value++;
  active.set(value, id);
  try {
    if (Array.isArray(value)) return ["array", id, value.map((item) => encode(item, active, nextId))];
    if (value instanceof Map) {
      const entries = [...value.entries()].sort(([left], [right]) =>
        compareText(String(left), String(right)));
      return ["map", id, entries.map(([key, item]) => [
        encode(key, active, nextId),
        encode(item, active, nextId),
      ])];
    }
    if (value instanceof Set) {
      const items = [...value].sort((left, right) => compareText(String(left), String(right)));
      return ["set", id, items.map((item) => encode(item, active, nextId))];
    }
    const object = value as Record<string, unknown>;
    return ["object", id, Object.keys(object).sort().map((key) => [
      key,
      key === "declarationIdentity" && object[key] !== null && typeof object[key] === "object"
        ? ["declaration-identity", declarationIdentityId(object[key] as object)]
        : encode(object[key], active, nextId),
    ])];
  } finally {
    active.delete(value);
  }
}

/**
 * Return a deterministic equality key for value-state loop analysis.
 * Captured lexical environments are security-relevant, so nested Maps/Sets
 * must be encoded rather than JSON.stringify's default empty-object form.
 */
export function valueStateLoopStateKey(
  scopes: ReadonlyArray<ReadonlyMap<string, unknown>>,
  secretControlDepth: number,
): string {
  const orderedScopes = scopes.map((scope) => new Map(
    [...scope.entries()].sort(([left], [right]) => compareText(left, right)),
  ));
  return JSON.stringify(encode([orderedScopes, secretControlDepth], new Map(), { value: 0 }));
}
