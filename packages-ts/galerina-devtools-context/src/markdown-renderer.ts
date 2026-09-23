// =============================================================================
// @galerina/devtools-context — Markdown Renderer
//
// Renders a FlowContextReceipt as a human-readable Markdown document.
// Optimised for AI consumption: structured, terse, no body code.
// =============================================================================

import type { FlowContextReceipt, FileContextReceipts } from "./types.js";

/**
 * Render a single FlowContextReceipt as Markdown.
 *
 * Example output:
 *   ## Context Receipt: processPasswordHashing
 *   **File:** auth.fungi | **Qualifier:** secure | **Return:** HashResult
 *   ...
 */
export function md(value: unknown): string {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("`", "\\`")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

export function renderReceiptMarkdown(receipt: FlowContextReceipt): string {
  const lines: string[] = [];

  lines.push(`## Context Receipt: ${md(receipt.flowName)}`);
  lines.push(
    `**File:** ${md(receipt.sourceFile)} | **Qualifier:** ${md(receipt.qualifier)} | **Return:** ${md(receipt.returnType)}`,
  );
  lines.push("");

  // Signature
  lines.push("### Signature");
  if (receipt.params.length === 0) {
    lines.push("- *(no parameters)*");
  } else {
    for (const p of receipt.params) {
      lines.push(`- ${md(p.name)}: ${md(p.type)}`);
    }
  }
  lines.push("");

  // Contract
  lines.push("### Contract");
  if (receipt.contract.intent) {
    lines.push(`- **Intent:** "${md(receipt.contract.intent)}"`);
  } else {
    lines.push("- **Intent:** *(not declared)*");
  }

  if (receipt.contract.effects.length > 0) {
    lines.push(`- **Effects:** ${receipt.contract.effects.map(md).join(", ")}`);
  } else {
    lines.push("- **Effects:** none");
  }

  if (receipt.contract.authority.length > 0) {
    lines.push(`- **Authority:** ${receipt.contract.authority.map(md).join(", ")}`);
  }

  if (receipt.contract.economicsHints.length > 0) {
    lines.push(`- **Economics:** ${receipt.contract.economicsHints.map(md).join("; ")}`);
  }

  const flags: string[] = [];
  if (receipt.contract.hasSecrets)  flags.push("secrets{}");
  if (receipt.contract.hasEpilogue) flags.push("epilogue{}");
  if (flags.length > 0) {
    lines.push(`- **Flags:** ${flags.join(", ")}`);
  }
  lines.push("");

  // Structural links
  if (receipt.callees.length > 0) {
    lines.push("### Calls");
    for (const callee of receipt.callees) {
      lines.push(`- ${md(callee)}()`);
    }
    lines.push("");
  }

  // Governance
  lines.push("### Governance");

  if (receipt.governance.taintSources.length > 0) {
    lines.push(`- **Taint sources:** ${receipt.governance.taintSources.map(md).join(", ")}`);
  } else {
    lines.push("- **Taint sources:** none");
  }

  if (receipt.governance.sinkTypes.length > 0) {
    lines.push(`- **Sink types:** ${receipt.governance.sinkTypes.map(md).join(", ")}`);
  }

  if (receipt.governance.governanceCodes.length > 0) {
    lines.push(`- **Gov codes:** ${receipt.governance.governanceCodes.map(md).join(", ")}`);
  }

  lines.push(
    `- **Token reduction:** ${receipt.tokenEstimate.reductionPct}% estimated` +
    ` (${receipt.tokenEstimate.receiptTokens} receipt tokens vs ${receipt.tokenEstimate.fullSourceTokens} source tokens)`,
  );
  lines.push("");

  return lines.join("\n");
}

/**
 * Render all receipts in a FileContextReceipts as a single Markdown document.
 */
export function renderFileReceiptsMarkdown(file: FileContextReceipts): string {
  const lines: string[] = [];

  lines.push(`# Context Receipts: ${file.sourceFile}`);
  lines.push(
    `**Generated:** ${file.generatedAt} | **Flows:** ${file.flowCount} | **Overall token reduction:** ${file.overallReductionPct}%`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const receipt of file.receipts) {
    lines.push(renderReceiptMarkdown(receipt));
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
