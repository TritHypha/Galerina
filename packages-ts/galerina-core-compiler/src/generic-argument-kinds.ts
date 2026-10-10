/** Shared builtin generic arity and argument-position metadata. Payloads are not types. */
export type GenericArgKind = "type" | "tag" | "shape" | "dim";

// Existing type-checker arities; sharing prevents analysis from inventing surplus type positions.
export const GENERIC_ARITY: ReadonlyMap<string, number> = new Map([
  ["Option", 1],
  ["Result", 2],
  ["Array", 1],
  ["List", 1],
  ["Set", 1],
  ["Map", 2],
  ["Channel", 1],
  ["Vector", 2],
  ["Matrix", 3],
  ["Money", 1],
  ["Tensor", 2],
  ["ReadOnlyView", 1],
  ["Brand", 2],
  ["Authority", 1],
  ["Embedding", 1],
  ["Secret", 1],
  ["ZipPair", 2],
]);

export const GENERIC_ARG_KINDS: ReadonlyMap<string, readonly GenericArgKind[]> = new Map([
  ["Brand", ["type", "tag"]],          // Brand<T, Tag> — nominal identity, bare or quoted
  ["Authority", ["tag"]],             // Authority<Tag> — opaque runtime authority identity
  ["Tensor", ["type", "shape"]],      // Tensor<Elem, [d0, d1, ...]>
  ["Vector", ["type", "dim"]],        // Vector<Elem, N>
  ["Matrix", ["type", "dim", "dim"]], // Matrix<Elem, R, C>
  ["Money", ["tag"]],                 // Money<GBP> — currency, not a type
  ["Embedding", ["dim"]],             // Embedding<768>
]);

/** Analysis does not infer types from surplus builtin positions; the type checker rejects arity. */
export function genericArgumentKind(base: string, index: number): GenericArgKind | undefined {
  const arity = GENERIC_ARITY.get(base);
  if (!Number.isInteger(index) || index < 0 || (arity !== undefined && index >= arity)) return undefined;
  return GENERIC_ARG_KINDS.get(base)?.[index] ?? "type";
}
