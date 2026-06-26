#!/usr/bin/env node
// =============================================================================
// @galerina/devtools-pci — CLI
//
// galerina-pci audit <file.spore> [--json]
// galerina-pci audit <directory> [--json]
//
// Exit codes:
//   0 — passed (no critical/high findings)
//   2 — findings present
//   3 — parse/read error
// =============================================================================

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { runPciAudit } from "./pci-checker.js";
import { buildComplianceReportFromDir, appendComplianceLedger } from "./compliance-ledger.js";
import type { PciFinding, PciAuditReport } from "./types.js";

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<number> {
  switch (command) {
    case "audit": {
      const target = args[1];
      if (!target) {
        process.stderr.write("Usage: galerina-pci audit <file.spore|directory> [--json]\n");
        return 1;
      }
      const wantJson = args.includes("--json");

      let stat;
      try { stat = statSync(target); }
      catch { process.stderr.write(`Cannot access '${target}'\n`); return 3; }

      if (stat.isDirectory()) {
        return auditDirectory(target, wantJson);
      } else {
        return auditFile(target, wantJson);
      }
    }

    case "ledger": {
      // #146 — build a hash-linked compliance report over an audit-egress directory
      // and append it to the append-only ledger. Post-hoc analysis only: this reads
      // egress batches and writes a report; it never touches a runtime request path.
      const sourceDir = args[1];
      if (!sourceDir) {
        process.stderr.write("Usage: galerina-pci ledger <egress-dir> [--json]\n");
        return 1;
      }
      let report;
      try {
        report = buildComplianceReportFromDir(sourceDir);
      } catch (e) {
        process.stderr.write(`Cannot build compliance report from '${sourceDir}': ${e instanceof Error ? e.message : String(e)}\n`);
        return 3;
      }
      const ledgerPath = appendComplianceLedger(sourceDir, report);
      if (args.includes("--json")) {
        process.stdout.write(JSON.stringify(report, null, 2) + "\n");
      } else {
        const head = report.chainHead.length > 16 ? `${report.chainHead.slice(0, 16)}…` : report.chainHead;
        process.stdout.write(
          `Galerina Compliance Ledger — ${sourceDir}\n` +
          `  batches: ${report.batchCount} | entries: ${report.entries.length} | allow: ${report.allowCount} | deny: ${report.denyCount}\n` +
          `  chain head: ${head}\n` +
          `  written:    ${ledgerPath}\n`,
        );
      }
      return 0;
    }

    default:
      process.stdout.write(`galerina-pci — PCI DSS 4.0.1 Compliance Audit for Galerina\n\n`);
      process.stdout.write(`Commands:\n`);
      process.stdout.write(`  audit <file.spore|directory> [--json]   Run PCI compliance audit\n`);
      process.stdout.write(`  ledger <egress-dir> [--json]          Build hash-linked compliance report from audit-egress\n\n`);
      process.stdout.write(`Exit codes: 0=passed, 2=findings present, 3=parse/read error\n`);
      return 0;
  }
}

function auditFile(filePath: string, wantJson: boolean): number {
  let source: string;
  try { source = readFileSync(filePath, "utf8"); }
  catch { process.stderr.write(`Cannot read '${filePath}'\n`); return 3; }

  const report = runPciAudit(source, filePath);

  if (wantJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    printReport(report, filePath);
  }

  return report.passed ? 0 : 2;
}

function auditDirectory(dirPath: string, wantJson: boolean): number {
  let llnFiles: string[];
  try {
    llnFiles = readdirSync(dirPath)
      .filter(f => f.endsWith(".spore"))
      .map(f => join(dirPath, f));
  } catch {
    process.stderr.write(`Cannot read directory '${dirPath}'\n`);
    return 3;
  }

  if (llnFiles.length === 0) {
    process.stderr.write(`No .spore files found in '${dirPath}'\n`);
    return 0;
  }

  const reports: PciAuditReport[] = [];
  let anyFail = false;

  for (const filePath of llnFiles) {
    let source: string;
    try { source = readFileSync(filePath, "utf8"); }
    catch { process.stderr.write(`Cannot read '${filePath}'\n`); continue; }
    const report = runPciAudit(source, filePath);
    reports.push(report);
    if (!report.passed) anyFail = true;
  }

  if (wantJson) {
    process.stdout.write(JSON.stringify(reports, null, 2) + "\n");
  } else {
    for (const report of reports) {
      printReport(report, report.source.slice(0, 60));
    }
    process.stdout.write(`\n=== Directory summary: ${reports.length} file(s), ${anyFail ? "FAIL" : "PASS"} ===\n`);
  }

  return anyFail ? 2 : 0;
}

function printReport(report: PciAuditReport, label: string): void {
  const status = report.passed ? "PASS" : "FAIL";
  process.stdout.write(`\nGalerina PCI DSS 4.0.1 Audit — ${label}\n`);
  process.stdout.write(`PCI DSS: ${report.pciDssVersion} | ${status} | ${report.findings.length} finding(s)\n\n`);

  if (report.findings.length === 0) {
    process.stdout.write("  No PCI compliance findings.\n");
  } else {
    for (const f of report.findings) {
      const icon = f.severity === "critical" ? "[CRIT]" : f.severity === "high" ? "[HIGH]" : "[MED] ";
      const flow = f.flowName ? `(${f.flowName}) ` : "";
      process.stdout.write(`  ${icon} [${f.code}] PCI Req ${f.pciRequirement} ${flow}${f.message}\n`);
    }
    process.stdout.write(`\nFailed requirements: ${report.failedRequirements.join(", ")}\n`);
  }
  process.stdout.write(`\n`);
}

main().then(code => process.exit(code)).catch(e => {
  process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
