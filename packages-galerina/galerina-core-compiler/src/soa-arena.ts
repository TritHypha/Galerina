// =============================================================================
// Galerina SoA (Structure of Arrays) Node Arena
//
// Instead of:  AstNode { kind, location, children, value, flags }
// Store:       kinds[],  starts[], ends[], flags[], typeIds[], effectMasks[]
//
// Benefits:
//   Type checker scans typeIds[] linearly — one cache miss per 8 nodes
//   Effect checker scans effectMasks[] linearly — one SIMD-friendly pass
//   Value-state checker scans vsFlags[] linearly
//
// Odin-inspired: data-oriented design for the compiler's hot passes.
// =============================================================================

export const MAX_NODES = 65536; // 64K nodes covers most real programs

export class SoANodeArena {
  /** Node kind IDs (mirrors AstNodeKind → numeric mapping) */
  readonly kinds      = new Int16Array(MAX_NODES);
  /** Source start offset (byte index into source text) */
  readonly starts     = new Int32Array(MAX_NODES);
  /** Source end offset */
  readonly ends       = new Int32Array(MAX_NODES);
  /** NodeFlags bitmask (IsPure, HasContract, TensorCandidate, etc.) */
  readonly nodeFlags  = new Int16Array(MAX_NODES);
  /** TypeId of this node's resolved type */
  readonly typeIds    = new Int16Array(MAX_NODES);
  /** EffectFlags bitmask of effects this node requires */
  readonly effectMasks = new Int32Array(MAX_NODES);
  /** ValueStateFlags bitmask */
  readonly vsFlags    = new Int16Array(MAX_NODES);
  /** GovernanceFlags bitmask */
  readonly govFlags   = new Int16Array(MAX_NODES);
  /** First child node index (-1 if leaf) */
  readonly firstChild = new Int32Array(MAX_NODES);
  /** Next sibling node index (-1 if last) */
  readonly nextSib    = new Int32Array(MAX_NODES);
  /** String pool offset for value/name strings */
  readonly nameOffset = new Int32Array(MAX_NODES);

  private count = 0;

  allocate(): number {
    if (this.count >= MAX_NODES) throw new Error("SoANodeArena overflow");
    const id = this.count++;
    this.firstChild[id] = -1;
    this.nextSib[id]    = -1;
    return id;
  }

  get size(): number { return this.count; }

  /** Scan all nodes of a given kind — fast linear pass, cache-friendly */
  scanByKind(kind: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.count; i++) {
      if ((this.kinds[i] ?? 0) === kind) result.push(i);
    }
    return result;
  }

  /** Find all nodes with a given effect mask bit set — single linear scan */
  scanByEffectFlag(flag: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.count; i++) {
      if ((this.effectMasks[i] ?? 0) & flag) result.push(i);
    }
    return result;
  }

  /** Check if any node violates a value-state rule — O(n) linear scan */
  findValueStateViolations(requiredFlag: number, forbiddenFlag: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const v = this.vsFlags[i] ?? 0;
      if ((v & requiredFlag) && (v & forbiddenFlag)) result.push(i);
    }
    return result;
  }
}
