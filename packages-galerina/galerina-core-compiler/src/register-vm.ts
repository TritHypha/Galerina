// =============================================================================
// Galerina Phase 23C — Register VM Bytecode Types
//
// Defines the register-based bytecode ISA for the Galerina runtime.
// Phase 23: type definitions and emitBytecode stub.
// Full implementation: Phase 23 replaces the tree-walking interpreter.
//
// Architecture: register-based VM with a constant pool.
// Instructions reference registers by numeric ID (RegisterId).
// Constants are stored in a per-function pool (ConstantPoolIndex).
//
// WASM compatibility: register widths map to WASM value types.
//   integer  → i32
//   float    → f64
//   pointer  → i32 (WASM32 addressing)
// =============================================================================

/** Numeric register identifier. Registers are per-function, starting at 0. */
export type RegisterId = number;

/** Index into a RegisterFunction's constant pool. */
export type ConstantPoolIndex = number;

/**
 * All opcodes in the Galerina register VM ISA.
 *
 * LOAD/STORE — binding ↔ register moves
 * CALL/RETURN — flow invocation
 * Arithmetic  — ADD, SUB, MUL, DIV, MOD
 * Comparison  — EQ, NEQ, LT, LTE, GT, GTE
 * Control flow — JUMP, JUMP_IF_FALSE
 * Governed    — CAPABILITY_CALL (effectful), AUDIT_WRITE (audit trail)
 * Sentinel    — UNREACHABLE (stub for unimplemented ops in Phase 23)
 */
export type RegisterOpcode =
  | "LOAD_CONST"       // load constant from pool → dest
  | "LOAD_LOCAL"       // load local binding into register → dest
  | "STORE_LOCAL"      // store register into local binding ← src1
  | "CALL"             // call a flow; args in registers; result → dest
  | "RETURN"           // return value in register src1
  | "ADD"              // dest = src1 + src2
  | "SUB"              // dest = src1 - src2
  | "MUL"              // dest = src1 * src2
  | "DIV"              // dest = src1 / src2
  | "MOD"              // dest = src1 % src2
  | "EQ"               // dest = src1 == src2
  | "NEQ"              // dest = src1 != src2
  | "LT"               // dest = src1 < src2
  | "LTE"              // dest = src1 <= src2
  | "GT"               // dest = src1 > src2
  | "GTE"              // dest = src1 >= src2
  | "JUMP"             // unconditional jump; immediate = target instruction index
  | "JUMP_IF_FALSE"    // jump if src1 is falsy; immediate = target instruction index
  | "CAPABILITY_CALL"  // call through capability host (effectful); immediate = capability name
  | "AUDIT_WRITE"      // write to audit log; src1 = event record register
  | "UNREACHABLE";     // stub: emitted for unimplemented ops in Phase 23

/** A single register VM instruction. */
export interface RegisterInstruction {
  readonly op: RegisterOpcode;
  readonly dest?: RegisterId;
  readonly src1?: RegisterId;
  readonly src2?: RegisterId;
  readonly immediate?: number | string;
  readonly constIndex?: ConstantPoolIndex;
}

/**
 * A compiled register VM function (corresponds to a Galerina flow).
 * Constants are deduplicated and stored in the pool for space efficiency.
 */
export interface RegisterFunction {
  readonly name: string;
  readonly registerCount: number;
  readonly constants: readonly (string | number | boolean | null)[];
  readonly instructions: readonly RegisterInstruction[];
  readonly isPure: boolean;
}

/**
 * A complete register VM bytecode module.
 * Contains all compiled functions and the program entry points.
 */
export interface RegisterBytecodeModule {
  readonly schemaVersion: "spore.bytecode.v1";
  readonly functions: readonly RegisterFunction[];
  readonly entryPoints: readonly string[];
}

/**
 * Compiles GIR flows to register bytecode.
 *
 * Stub: Phase 23C — emits a minimal stub bytecode for each flow.
 * Each stub function contains a single UNREACHABLE instruction.
 * Full implementation: Phase 23 — full lowering from GIR to register ISA,
 * replacing the tree-walking interpreter.
 */
export function emitBytecode(
  girFlows: readonly {
    name: string;
    qualifier: string;
    effects: { declared: readonly string[] };
  }[],
): RegisterBytecodeModule {
  const functions: RegisterFunction[] = girFlows.map((flow) => {
    const isPure = flow.qualifier === "pure" && flow.effects.declared.length === 0;

    // Phase 23C stub: each flow body is a single UNREACHABLE instruction.
    // Full implementation will lower the GIR expression tree to register ops.
    const instructions: RegisterInstruction[] = [
      { op: "UNREACHABLE" },
    ];

    return {
      name: flow.name,
      registerCount: 1,  // minimum: 1 register for return value
      constants: [],
      instructions,
      isPure,
    };
  });

  // Entry points: all non-pure flows with declared effects are potential entry points.
  // Phase 23: GIR entry point metadata will be used instead.
  const entryPoints = girFlows
    .filter((f) => f.qualifier !== "pure" || f.effects.declared.length > 0)
    .map((f) => f.name);

  return {
    schemaVersion: "spore.bytecode.v1",
    functions,
    entryPoints,
  };
}
