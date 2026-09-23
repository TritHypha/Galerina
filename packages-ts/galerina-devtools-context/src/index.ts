// =============================================================================
// @galerina/devtools-context — Public API
//
// Context Receipt generator for Galerina .fungi files.
// Produces minimal AI-consumable structural summaries: ~2% token cost,
// 100% architectural intent preserved.
// =============================================================================

// Core types
export type {
  FlowContextReceipt,
  FileContextReceipts,
  ReceiptOptions,
} from "./types.js";

// Receipt generator
export {
  generateReceipts,
  generateFlowReceiptByName,
} from "./receipt-generator.js";

// Markdown renderer
export {
  md,
  renderReceiptMarkdown,
  renderFileReceiptsMarkdown,
} from "./markdown-renderer.js";

/** Package version — used for receipt metadata. */
export const DEVTOOLS_CONTEXT_VERSION = "0.1.0";
