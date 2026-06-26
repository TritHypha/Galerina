#!/usr/bin/env node
// =============================================================================
// @galerina/devtools-security — CLI
//
// galerina-security audit <file.spore> [--profile strict,high_integrity] [--json]
// galerina-security risk <classification> <records> <probability>
// galerina-security path-check <root> <path>
//
// Exit codes:
//   0 — passed (no critical/high findings)
//   1 — usage error
//   2 — security findings present (critical or high)
//   3 — parse error
// =============================================================================

import { readFileSync } from "node:fs";
import { runSecurityAudit, type SecurityAuditOptions } from "./audit-runner.js";
import { checkPathSandbox } from "./path-sandbox.js";
import { validateRegexPattern } from "./regex-guard.js";
import { assessRisk, formatRiskAssessment, DataClassification } from "./risk-calculator.js";
import type { RuntimeProfile } from "@galerina/core-compiler";
import { runPciAudit } from "@galerina/devtools-pci";

const args = process.argv.slice(2);
const command = args[0];

async function main(): Promise<number> {
  switch (command) {
    case "audit": {
      const filePath = args[1];
      if (!filePath) {
        process.stderr.write("Usage: galerina-security audit <file.spore> [--profile strict,...] [--governance dev|production|deterministic|check-only] [--json] [--strict] [--pci]\n");
        return 1;
      }
      const wantJson    = args.includes("--json");
      const strictMode  = args.includes("--strict");
      const wantPci     = args.includes("--pci");
      const profileIdx  = args.indexOf("--profile");
      const profiles: RuntimeProfile[] = profileIdx >= 0
        ? (args[profileIdx + 1] ?? "strict").split(",") as RuntimeProfile[]
        : ["strict"];

      const govIdx = args.indexOf("--governance");
      const validGov = ["dev", "production", "deterministic", "check-only"] as const;
      type GovProfile = (typeof validGov)[number];
      const governanceProfile: GovProfile = govIdx >= 0
        ? (args[govIdx + 1] as GovProfile)
        : "dev";
      if (!validGov.includes(governanceProfile)) {
        process.stderr.write(`Unknown --governance '${governanceProfile}'. Expected one of: ${validGov.join(", ")}\n`);
        return 1;
      }

      let source: string;
      try { source = readFileSync(filePath, "utf8"); }
      catch { process.stderr.write(`Cannot read '${filePath}'\n`); return 1; }

      const opts: SecurityAuditOptions = { profiles, governanceProfile, fileName: filePath, strict: strictMode };
      const report = await runSecurityAudit(source, opts);

      // Run PCI audit if --pci flag is present
      const pciReport = wantPci ? runPciAudit(source, filePath) : null;

      if (wantJson) {
        if (pciReport !== null) {
          process.stdout.write(JSON.stringify({ security: report, pci: pciReport }, null, 2) + "\n");
        } else {
          process.stdout.write(JSON.stringify(report, null, 2) + "\n");
        }
      } else {
        process.stdout.write(`\nGalerina Security Audit — ${filePath}\n`);
        process.stdout.write(`Profile: ${profiles.join(", ")} | Governance: ${governanceProfile} | ${report.summary}\n\n`);
        if (report.findings.length === 0) {
          process.stdout.write("  ✓ No findings\n");
        } else {
          for (const f of report.findings) {
            const icon = f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : f.severity === "medium" ? "🟡" : "ℹ️";
            process.stdout.write(`  ${icon} [${f.code}] ${f.flowName ? `(${f.flowName}) ` : ""}${f.message}\n`);
          }
        }
        process.stdout.write("\n");

        if (pciReport !== null) {
          const pciStatus = pciReport.passed ? "PASS" : "FAIL";
          process.stdout.write(`PCI DSS 4.0.1 Audit — ${pciStatus} | ${pciReport.findings.length} finding(s)\n\n`);
          if (pciReport.findings.length === 0) {
            process.stdout.write("  ✓ No PCI findings\n");
          } else {
            for (const f of pciReport.findings) {
              const icon = f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : "🟡";
              process.stdout.write(`  ${icon} [${f.code}] PCI Req ${f.pciRequirement} ${f.flowName ? `(${f.flowName}) ` : ""}${f.message}\n`);
            }
            process.stdout.write(`\n  Failed PCI requirements: ${pciReport.failedRequirements.join(", ")}\n`);
          }
          process.stdout.write("\n");
        }
      }

      const securityPassed = report.passed;
      const pciPassed = pciReport === null || pciReport.passed;
      return (securityPassed && pciPassed) ? 0 : 2;
    }

    case "path-check": {
      const [, , root, path] = args;
      if (!root || !path) {
        process.stderr.write("Usage: galerina-security path-check <root> <path>\n");
        return 1;
      }
      const result = checkPathSandbox(root, path);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return result.allowed ? 0 : 2;
    }

    case "regex-check": {
      const pattern = args[1];
      if (!pattern) { process.stderr.write("Usage: galerina-security regex-check <pattern>\n"); return 1; }
      const result = validateRegexPattern(pattern);
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return result.safe ? 0 : 2;
    }

    case "risk": {
      const [, , classStr, recordsStr, probStr] = args;
      if (!classStr || !recordsStr || !probStr) {
        process.stderr.write("Usage: galerina-security risk <classification> <records> <probability>\n");
        process.stderr.write("  classifications: public employee_data healthcare_phi financial_record customer_pii intellectual_property\n");
        return 1;
      }
      const classMap: Record<string, DataClassification> = {
        public: DataClassification.Public,
        employee_data: DataClassification.Employee_Data,
        healthcare_phi: DataClassification.Healthcare_PHI,
        financial_record: DataClassification.Financial_Record,
        customer_pii: DataClassification.Customer_PII,
        intellectual_property: DataClassification.Intellectual_Property,
      };
      const cls = classMap[classStr.toLowerCase()];
      if (cls === undefined) { process.stderr.write(`Unknown classification: ${classStr}\n`); return 1; }
      const profile = {
        classification: cls,
        recordCount: parseInt(recordsStr, 10),
        breachProbability: parseFloat(probStr),
        isMultiCloud: args.includes("--multi-cloud"),
        isUngovernedAI: args.includes("--ungoverned-ai"),
      };
      process.stdout.write(formatRiskAssessment(profile) + "\n");
      return 0;
    }

    default:
      process.stdout.write(`galerina-security — Galerina Security Devtools\n\n`);
      process.stdout.write(`Commands:\n`);
      process.stdout.write(`  audit <file.spore> [--profile strict,...] [--json] [--strict] [--pci]   Run security audit (add --pci for PCI DSS 4.0.1 checks)\n`);
      process.stdout.write(`  path-check <root> <path>                                      Check path confinement\n`);
      process.stdout.write(`  regex-check <pattern>                                         Check regex for ReDoS\n`);
      process.stdout.write(`  risk <classification> <records> <probability>                 Calculate breach risk\n\n`);
      process.stdout.write(`Exit codes: 0=passed, 2=findings present, 3=parse error\n`);
      return 0;
  }
}

main().then(code => process.exit(code)).catch(e => {
  process.stderr.write(`Fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
