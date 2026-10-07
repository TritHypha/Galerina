/**
 * Shared generic argument-position metadata for the type checker and analyses
 * that inspect type references. Payload positions are not type references.
 */
export type GenericArgKind = "type" | "tag" | "shape" | "dim";

export const GENERIC_ARG_KINDS: ReadonlyMap<string, readonly GenericArgKind[]> = new Map([
  ["Brand", ["type", "tag"]],
  ["Authority", ["tag"]],
  ["Tensor", ["type", "shape"]],
  ["Vector", ["type", "dim"]],
  ["Matrix", ["type", "dim", "dim"]],
  ["Money", ["tag"]],
  ["Embedding", ["dim"]],
]);

export function genericArgumentKind(base: string, index: number): GenericArgKind {
  return GENERIC_ARG_KINDS.get(base)?.[index] ?? "type";
}
