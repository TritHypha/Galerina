#!/usr/bin/env node
// =============================================================================
// @galerina/devtools-naming — CLI
//
// galerina-naming check <file.spore> [--json] [--strict]
//
// Exit codes:
//   0 — clean (no findings)
//   1 — usage error
//   2 — naming findings present
//   3 — parse error
// =============================================================================

import { readFileSync } from "node:fs";
import { runNamingAudit } from "./naming-runner.js";

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<number> {
  switch (command) {
    case "check": {
      const filePath = args[1];
      if (!filePath) {
        process.stderr.write(
          "Usage: galerina-naming check <file.spore> [--json] [--strict]\n",
        );
        return 1;
      }

      const wantJson   = args.includes("--json");
      const strictMode = args.includes("--strict");

      let source: string;
      try {
        source = readFileSync(filePath, "utf8");
      } catch {
        process.stderr.write(`Cannot read '${filePath}'\n`);
        return 1;
      }

      const report = runNamingAudit(source, {
        fileName: filePath,
        strict: strictMode,
      });

      // Parse error — exit 3
      if (report.parseErrors > 0 && report.findings.length === 0) {
        if (wantJson) {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        } else {
          process.stderr.write(
            `Parse error in '${filePath}' — ${report.parseErrors} error(s). Naming check skipped.\n`,
          );
        }
        return 3;
      }

      if (wantJson) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        process.stdout.write(`\nGalerina Naming Check — ${filePath}\n`);
        process.stdout.write(
          `${strictMode ? "[strict] " : ""}${report.summary}\n\n`,
        );
        if (report.findings.length === 0) {
          process.stdout.write("  ✓ No findings\n");
        } else {
          for (const f of report.findings) {
            const loc = f.line !== undefined ? `:${f.line}` : "";
            const flow = f.flowName !== undefined ? ` (flow: ${f.flowName})` : "";
            process.stdout.write(`  [${f.code}]${flow}${loc} ${f.message}\n`);
          }
        }
        process.stdout.write("\n");
      }

      return report.findings.length > 0 ? 2 : 0;
    }

    default:
      process.stdout.write("galerina-naming — Galerina Naming Devtools\n\n");
      process.stdout.write("Commands:\n");
      process.stdout.write(
        "  check <file.spore> [--json] [--strict]   Check naming conventions\n\n",
      );
      process.stdout.write(
        "Exit codes: 0=clean, 2=findings present, 3=parse error\n",
      );
      return 0;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
