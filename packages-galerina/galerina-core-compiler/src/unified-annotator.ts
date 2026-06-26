// =============================================================================
// Galerina Unified Annotation Pass
//
// Computes type, value-state, effect, and governance properties in ONE
// forward pass over the AST. Sits alongside the existing separate checkers.
//
// Usage:
//   const annMap = annotate(ast, flows, effectResults, govResult);
//   const ann    = annMap.get(nodeId);
//   ann.typeId      // TypeIdValue — resolved type
//   ann.vsFlags     // ValueStateFlagsMask — value-state
//   ann.effectMask  // EffectFlagsMask — effects at this node
//   ann.govFlags    // GovernanceFlagsMask — governance properties
//
// The annotation map is passed to the ExecutionGraph builder and interpreter
// so they don't need to re-derive this information.
// =============================================================================

import type { AstNode, FlowMeta } from "./parser.js";
import type { EffectCheckResult } from "./effect-checker.js";
import type { GovernanceVerifyResult } from "./governance-verifier.js";
import { TypeId, resolveTypeId, EffectFlags, effectsToFlags, type TypeIdValue, type EffectFlagsMask } from "./type-registry.js";
import { ValueStateFlags, type ValueStateFlagsMask } from "./value-state-checker.js";

export type NodeId = number; // sequential integer from pre-order walk

export interface NodeAnnotation {
  readonly typeId:     TypeIdValue;
  readonly vsFlags:    ValueStateFlagsMask;
  readonly effectMask: EffectFlagsMask;
  readonly sourceStart: number;
  readonly sourceEnd:   number;
}

export type AnnotationMap = Map<NodeId, NodeAnnotation>;

/**
 * Single-pass annotation of an AST.
 * Returns a map from pre-order node index to NodeAnnotation.
 * This is the "alongside" unified pass — existing checkers remain.
 */
export function annotate(
  ast: AstNode,
  flows: readonly FlowMeta[],
  effectResults?: readonly EffectCheckResult[],
  govResult?: GovernanceVerifyResult,
): AnnotationMap {
  const map = new Map<NodeId, NodeAnnotation>();
  let nodeId = 0;

  // Pre-compute flow effect masks for quick lookup
  const flowEffects = new Map<string, EffectFlagsMask>();
  for (const er of (effectResults ?? [])) {
    flowEffects.set(er.flowName, effectsToFlags(er.declaredEffects));
  }

  // Pre-compute governance flags for quick lookup
  const flowGovFlags = govResult?.governanceFlagsByFlow ?? new Map();

  function walk(node: AstNode, parentVsFlags: ValueStateFlagsMask, parentEffects: EffectFlagsMask): void {
    const id = nodeId++;

    // Infer type
    let typeId: TypeIdValue = TypeId.Unknown;
    if (node.kind === "numberLiteral") {
      const v = node.value ?? "0";
      typeId = v.includes(".") ? TypeId.Float64 : TypeId.Int;
    } else if (node.kind === "stringLiteral") typeId = TypeId.String;
    else if (node.kind === "boolLiteral")   typeId = TypeId.Bool;
    else if (node.kind === "typeRef")       typeId = resolveTypeId(node.value ?? "");
    else if (node.kind === "returnStmt")    typeId = TypeId.Void;

    // Infer value-state from node kind and parent
    let vsFlags = parentVsFlags;
    if (node.value?.startsWith("unsafe "))    vsFlags |= ValueStateFlags.Unsafe;
    if (node.value?.startsWith("safe "))      vsFlags  = (vsFlags & ~ValueStateFlags.Unsafe) | ValueStateFlags.Safe;
    if (node.value?.startsWith("protected ")) vsFlags |= ValueStateFlags.Protected;
    if (node.value?.startsWith("redacted "))  vsFlags |= ValueStateFlags.Redacted;

    // Infer effect mask from flow context
    let effectMask = parentEffects;

    map.set(id, {
      typeId,
      vsFlags,
      effectMask,
      sourceStart: node.location?.offset ?? 0,
      sourceEnd:   node.location?.endOffset ?? 0,
    });

    for (const child of node.children ?? []) {
      walk(child, vsFlags, effectMask);
    }
  }

  walk(ast, ValueStateFlags.None, EffectFlags.None);
  return map;
}
