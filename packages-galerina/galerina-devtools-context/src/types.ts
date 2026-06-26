// =============================================================================
// @galerina/devtools-context — Core Types
//
// FlowContextReceipt: the minimal AI-consumable structural summary of a flow.
// ~2% of raw source tokens, 100% of architectural intent preserved.
// =============================================================================

/**
 * A Context Receipt for a single Galerina flow.
 *
 * Contains everything an AI agent needs to understand and modify a flow
 * without seeing the implementation body:
 *  - Signature: name, params with types, return type, qualifier
 *  - Contract: intent, effects, authority, economics, secrets/epilogue flags
 *  - Governance: taint sources, sink types, governance codes
 *  - Token stats: full source size vs receipt size, reduction %
 */
export interface FlowContextReceipt {
  readonly flowName: string;
  readonly qualifier: "pure" | "secure" | "guarded" | "flow";
  readonly params: ReadonlyArray<{ readonly name: string; readonly type: string }>;
  readonly returnType: string;
  readonly contract: {
    readonly intent?: string;
    readonly effects: readonly string[];
    readonly authority: readonly string[];
    readonly economicsHints: readonly string[];  // e.g. "max_compute_cost: £0.05"
    readonly hasSecrets: boolean;
    readonly hasEpilogue: boolean;
  };
  readonly governance: {
    readonly taintSources: readonly string[];     // any 'unsafe let' or 'source_from' indicators
    readonly sinkTypes: readonly string[];         // AuditLog, DB, network calls found in contract
    readonly governanceCodes: readonly string[];   // GOV-010, VAL-001 etc. that would fire
  };
  readonly callees: readonly string[];             // flow names called from this flow's body
  readonly tokenEstimate: {
    readonly fullSourceTokens: number;             // rough token count of full source
    readonly receiptTokens: number;                // receipt size
    readonly reductionPct: number;                 // typically 92–98%
  };
  readonly sourceFile: string;
  readonly generatedAt: string;
}

/**
 * Result of generating receipts for an entire .spore file.
 */
export interface FileContextReceipts {
  readonly schemaVersion: "spore.context-receipt.v1";
  readonly sourceFile: string;
  readonly flowCount: number;
  readonly receipts: readonly FlowContextReceipt[];
  readonly totalFullSourceTokens: number;
  readonly totalReceiptTokens: number;
  readonly overallReductionPct: number;
  readonly generatedAt: string;
}

/**
 * Options for receipt generation.
 */
export interface ReceiptOptions {
  /** If set, only generate a receipt for this specific flow name. */
  readonly flowFilter?: string;
  /** Source file name — used for sourceFile field in receipts. */
  readonly fileName?: string;
}
