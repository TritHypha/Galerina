// =============================================================================
// Galerina Runtime — Governed Memory (Phase 11D skeleton)
//
// Tracks protected and redacted values at runtime.
// Every sensitive value carries a metadata tag with owner and permissions.
// =============================================================================

export type GovernedValueTag = {
  readonly id: string;            // unique value ID (nanoid-style)
  readonly ownerFlow: string;     // flow that created this value
  readonly baseType: string;      // "Email", "PatientId", etc.
  readonly qualifier: "protected" | "redacted";
  readonly createdAt: number;     // Date.now()
  readonly accessLog: readonly string[]; // which flows accessed this
};

export interface GovernedMemory {
  // Register a new protected/redacted value
  register(
    ownerFlow: string,
    qualifier: "protected" | "redacted",
    baseType: string,
  ): GovernedValueTag;

  // Record an access to a governed value
  access(id: string, accessorFlow: string): void;

  // Check if an access is allowed
  canAccess(id: string, accessorFlow: string): boolean;

  // Get all registered governed values (for runtime report)
  getAll(): readonly GovernedValueTag[];

  // Get access log for a specific value
  getAccessLog(id: string): readonly string[];
}

export function createGovernedMemory(): GovernedMemory {
  const store = new Map<string, GovernedValueTag>();
  let counter = 0;

  function register(
    ownerFlow: string,
    qualifier: "protected" | "redacted",
    baseType: string,
  ): GovernedValueTag {
    counter += 1;
    const id = `gv-${counter}`;
    const tag: GovernedValueTag = {
      id,
      ownerFlow,
      baseType,
      qualifier,
      createdAt: Date.now(),
      accessLog: [],
    };
    store.set(id, tag);
    return tag;
  }

  function access(id: string, accessorFlow: string): void {
    const tag = store.get(id);
    if (tag === undefined) return;
    const updated: GovernedValueTag = {
      ...tag,
      accessLog: [...tag.accessLog, accessorFlow],
    };
    store.set(id, updated);
  }

  function canAccess(_id: string, _accessorFlow: string): boolean {
    // Phase 11D placeholder — full capability checks in Phase 11D
    return true;
  }

  function getAll(): readonly GovernedValueTag[] {
    return [...store.values()];
  }

  function getAccessLog(id: string): readonly string[] {
    return store.get(id)?.accessLog ?? [];
  }

  return {
    register,
    access,
    canAccess,
    getAll,
    getAccessLog,
  };
}
