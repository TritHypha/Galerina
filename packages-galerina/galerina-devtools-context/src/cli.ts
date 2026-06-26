#!/usr/bin/env node
// =============================================================================
// @galerina/devtools-context — CLI
//
// galerina-context receipt <file.spore> [--flow <flowName>] [--json] [--markdown] [--summary]
//
// Without --flow: generates receipts for ALL flows in the file.
// With --flow:    generates receipt for just that one flow.
//
// Output formats:
//   default / --markdown  : human-readable Markdown (AI-friendly)
//   --json                : machine-readable JSON
//   --summary             : one-line summary per flow (name, qualifier, returnType, effects, flags, token reduction)
//
// Exit codes:
//   0 — success
//   1 — usage error
//   2 — file not found / parse error
//   3 — flow not found (--flow used but flow name not in file)
// =============================================================================

import { readFileSync } from "node:fs";
import { generateReceipts, generateFlowReceiptByName } from "./receipt-generator.js";
import { renderFileReceiptsMarkdown, renderReceiptMarkdown } from "./markdown-renderer.js";
import type { ReceiptOptions, FlowContextReceipt } from "./types.js";

const args = process.argv.slice(2);
const command = args[0];

/**
 * Render a one-line summary for a single flow receipt.
 * Format: flowName (qualifier) → returnType [N effects] [has-intent] [has-secrets] [has-economics] — estimated N% token reduction
 */
function renderSummaryLine(receipt: FlowContextReceipt): string {
  const parts: string[] = [];
  parts.push(`${receipt.flowName} (${receipt.qualifier}) -> ${receipt.returnType}`);
  parts.push(`[${receipt.contract.effects.length} effects]`);
  if (receipt.contract.intent !== undefined) parts.push("[has-intent]");
  if (receipt.contract.hasSecrets) parts.push("[has-secrets]");
  if (receipt.contract.hasEpilogue) parts.push("[has-economics]");
  parts.push(`— estimated ${receipt.tokenEstimate.reductionPct}% token reduction`);
  return parts.join(" ");
}

async function main(): Promise<number> {
  switch (command) {
    case "receipt": {
      const filePath = args[1];
      if (!filePath) {
        process.stderr.write(
          "Usage: galerina-context receipt <file.spore> [--flow <flowName>] [--json] [--markdown] [--summary]\n",
        );
        return 1;
      }

      const wantJson    = args.includes("--json");
      const wantSummary = args.includes("--summary");
      // wantMarkdown is unused when wantSummary or wantJson is set, but kept for reference
      const _wantMarkdown = args.includes("--markdown") || (!wantJson && !wantSummary);

      const flowIdx  = args.indexOf("--flow");
      const flowName = flowIdx >= 0 ? args[flowIdx + 1] : undefined;

      if (flowIdx >= 0 && !flowName) {
        process.stderr.write("--flow requires a flow name argument\n");
        return 1;
      }

      let source: string;
      try {
        source = readFileSync(filePath, "utf8");
      } catch {
        process.stderr.write(`Cannot read '${filePath}'\n`);
        return 2;
      }

      // Single-flow mode
      if (flowName) {
        const receipt = generateFlowReceiptByName(source, flowName, filePath);
        if (!receipt) {
          process.stderr.write(`Flow '${flowName}' not found in '${filePath}'\n`);
          return 3;
        }
        if (wantJson) {
          process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
        } else if (wantSummary) {
          process.stdout.write(renderSummaryLine(receipt) + "\n");
        } else {
          process.stdout.write(renderReceiptMarkdown(receipt) + "\n");
        }
        return 0;
      }

      // All-flows mode
      const opts: ReceiptOptions = { fileName: filePath };
      const fileReceipts = generateReceipts(source, opts);

      if (wantJson) {
        process.stdout.write(JSON.stringify(fileReceipts, null, 2) + "\n");
      } else if (wantSummary) {
        for (const receipt of fileReceipts.receipts) {
          process.stdout.write(renderSummaryLine(receipt) + "\n");
        }
      } else {
        process.stdout.write(renderFileReceiptsMarkdown(fileReceipts) + "\n");
      }

      if (!wantSummary) {
        // Summary to stderr so it doesn't pollute JSON piping
        process.stderr.write(
          `\nContext Receipts generated for ${fileReceipts.flowCount} flow(s). ` +
          `Token reduction: ${fileReceipts.overallReductionPct}% ` +
          `(${fileReceipts.totalReceiptTokens} receipt tokens vs ${fileReceipts.totalFullSourceTokens} source tokens)\n`,
        );
      }

      return 0;
    }

    default: {
      process.stdout.write(`galerina-context — Galerina Context Receipt Generator\n\n`);
      process.stdout.write(`Commands:\n`);
      process.stdout.write(
        `  receipt <file.spore> [--flow <name>] [--json] [--markdown] [--summary]   Generate context receipt(s)\n\n`,
      );
      process.stdout.write(`Options:\n`);
      process.stdout.write(`  --flow <name>   Generate receipt for a specific flow only\n`);
      process.stdout.write(`  --json          Output machine-readable JSON\n`);
      process.stdout.write(`  --markdown      Output human-readable Markdown (default)\n`);
      process.stdout.write(`  --summary       One-line summary per flow (name, qualifier, return type, reduction%)\n\n`);
      process.stdout.write(`Exit codes: 0=success, 1=usage error, 2=file error, 3=flow not found\n`);
      return 0;
    }
  }
}

main().then(code => process.exit(code)).catch(e => {
  process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
