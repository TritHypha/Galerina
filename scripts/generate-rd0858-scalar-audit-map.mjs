#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { exitOnHelp } from "./lib/cli-help.mjs";

exitOnHelp(import.meta.url, "usage: node scripts/generate-rd0858-scalar-audit-map.mjs --check|--write|--self-test\n  select exactly one mode\n  --help, -h  print this usage and exit 0 without reading or writing");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const AUDIT_MAP_RELATIVE = "docs/audit-map.json";
export const GOVERNING_PLAN_RELATIVE =
  "docs/superpowers/plans/2026-08-27-rd-0858-unit4-scalar-oracle-admission.md";

export const EXECUTABLE_CLOSURE_PATHS = Object.freeze([
  "packages/fungi/products/galerina/rd0858-unit4-scalar-oracle/scalar-oracle.fungi",
  "packages/fungi/products/galerina/rd0858-unit4-scalar-oracle/scalar-oracle.checked.json",
  "packages-ts/galerina-core-compiler/package.json",
  "packages-ts/galerina-core-compiler/src/checked-flow-artifact.ts",
  "packages-ts/galerina-core-compiler/src/index.ts",
  "packages-ts/galerina-core-compiler/src/requirement-process-adapter.ts",
  "packages-ts/galerina-core-compiler/src/requirement-process-protocol.ts",
  "packages-ts/galerina-core-compiler/src/requirement-process-worker.ts",
  "scripts/build-requirement-launcher.mjs",
  "scripts/generate-rd0858-scalar-oracle-artifact.mjs",
  "scripts/native/requirement-launcher/src/identity.rs",
  "scripts/native/requirement-launcher/src/main.rs",
  "scripts/native/requirement-launcher/src/protocol.rs",
  "scripts/native/requirement-launcher/src/windows.rs",
]);

const audit = (id, argv, dependsOn, timeoutMs = 130_000, maxOutputBytes = 1_048_576) => ({
  id,
  owner: "galerina",
  build: null,
  cwd: "repo://galerina",
  argv,
  dependsOn,
  timeoutMs,
  maxOutputBytes,
  exit: { pass: [0], finding: [1], refused: [2] },
  evidence: `receipt://galerina/rd0858-unit4-scalar-oracle/${id}`,
});

const auditTemplates = Object.freeze([
  audit("compiler-build", ["npm", "--prefix", "packages-ts/galerina-core-compiler", "run", "build"], []),
  audit(
    "scalar-artifact-codec",
    [
      "node",
      "--test",
      "packages-ts/galerina-core-compiler/tests/checked-flow-artifact.test.mjs",
      "scripts/tests/rd0858-scalar-oracle-artifact.test.mjs",
    ],
    ["compiler-build"],
  ),
  audit(
    "scalar-process-boundary",
    [
      "node",
      "--test",
      "packages-ts/galerina-core-compiler/tests/requirement-process-protocol.test.mjs",
      "packages-ts/galerina-core-compiler/tests/requirement-process-worker.test.mjs",
      "packages-ts/galerina-core-compiler/tests/requirement-process-root-red.test.mjs",
      "packages-ts/galerina-core-compiler/tests/requirement-process-adapter.test.mjs",
    ],
    ["scalar-artifact-codec"],
  ),
  audit(
    "scalar-native-launcher",
    ["node", "--test", "scripts/tests/requirement-launcher.test.mjs"],
    ["scalar-process-boundary"],
  ),
  audit(
    "scalar-rust-launcher",
    ["cargo", "test", "--manifest-path", "scripts/native/requirement-launcher/Cargo.toml"],
    ["scalar-native-launcher"],
  ),
  audit(
    "repository-graphs",
    ["node", "scripts/graph-all.mjs", "--check"],
    ["scalar-rust-launcher"],
  ),
  audit(
    "repository-phase-close",
    ["node", "scripts/run-phase-close.mjs"],
    ["repository-graphs"],
    600_000,
    8_388_608,
  ),
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const git = (args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
    maxBuffer: 1_048_576,
  }).trim();

export const implementationCommit = () => {
  const commit = git(["log", "-1", "--format=%H", "--", ...EXECUTABLE_CLOSURE_PATHS]);
  if (!/^[0-9a-f]{40}$/u.test(commit)) {
    throw new Error("AUDIT_MAP_BUILD_REFUSED");
  }
  for (const relative of EXECUTABLE_CLOSURE_PATHS) {
    if (git(["cat-file", "-e", `${commit}:${relative}`]) !== "") {
      throw new Error("AUDIT_MAP_CLOSURE_REFUSED");
    }
  }
  return commit;
};

const readCommittedFileBytes = (relative, refusal, runner) => {
  let bytes;
  try {
    bytes = runner("git", ["show", `HEAD:${relative}`], {
      cwd: root,
      encoding: null,
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 1_048_576,
    });
  } catch {
    throw new Error(refusal);
  }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new Error(refusal);
  }
  return Buffer.from(bytes);
};

export const readCommittedPlanBytes = (runner = execFileSync) =>
  readCommittedFileBytes(GOVERNING_PLAN_RELATIVE, "AUDIT_MAP_PLAN_REFUSED", runner);

export const readCommittedAuditMapBytes = (runner = execFileSync) =>
  readCommittedFileBytes(AUDIT_MAP_RELATIVE, "AUDIT_MAP_COMMITTED_VIEW_REFUSED", runner);

export const assertAuditMapCheckoutProjection = (canonical, checkout) => {
  if (
    !Buffer.isBuffer(canonical) ||
    canonical.length === 0 ||
    canonical.includes(0x0d) ||
    !Buffer.isBuffer(checkout) ||
    checkout.length === 0
  ) {
    throw new Error("AUDIT_MAP_FIXED_POINT_REFUSED");
  }
  if (checkout.equals(canonical)) return;

  let checkoutOffset = 0;
  for (const byte of canonical) {
    if (byte === 0x0a) {
      if (checkout[checkoutOffset] !== 0x0d || checkout[checkoutOffset + 1] !== 0x0a) {
        throw new Error("AUDIT_MAP_FIXED_POINT_REFUSED");
      }
      checkoutOffset += 2;
    } else {
      if (checkout[checkoutOffset] !== byte) {
        throw new Error("AUDIT_MAP_FIXED_POINT_REFUSED");
      }
      checkoutOffset += 1;
    }
  }
  if (checkoutOffset !== checkout.length) {
    throw new Error("AUDIT_MAP_FIXED_POINT_REFUSED");
  }
};

export const buildAuditMapCandidate = () => {
  const commit = implementationCommit();
  const planBytes = readCommittedPlanBytes();
  const planDigest = sha256(planBytes);
  const locator = `git://galerina/${commit}`;
  const value = {
    schema: "audit-map.v1",
    subject: {
      id: "rd0858-unit4-scalar-profile-1",
      owner: "galerina",
      locator,
    },
    approval: {
      // Generation supplies a proposal, not approval. planDigest below is
      // governing-document provenance, not the shared tool's executable digest.
      status: "DRAFT",
      planDigest: null,
      authority: null,
      evidence: null,
    },
    audits: auditTemplates.map((entry) => ({ ...entry, build: locator })),
  };
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  if (bytes.includes(0x0d) || /(?:^|["\s])[A-Za-z]:[\\/]/u.test(bytes.toString("utf8"))) {
    throw new Error("AUDIT_MAP_CANONICAL_REFUSED");
  }
  return Object.freeze({ bytes, implementationCommit: commit, planDigest });
};

const check = () => {
  const candidate = buildAuditMapCandidate();
  const committed = readCommittedAuditMapBytes();
  if (!committed.equals(candidate.bytes)) throw new Error("AUDIT_MAP_FIXED_POINT_REFUSED");
  const checkout = readFileSync(join(root, AUDIT_MAP_RELATIVE));
  assertAuditMapCheckoutProjection(committed, checkout);
  process.stdout.write(
    `AUDIT_MAP PASS fixed-point ${candidate.implementationCommit} ${candidate.planDigest}\n`,
  );
};

const write = () => {
  const candidate = buildAuditMapCandidate();
  const target = join(root, AUDIT_MAP_RELATIVE);
  writeFileSync(target, candidate.bytes);
  if (!readFileSync(target).equals(candidate.bytes)) {
    throw new Error("AUDIT_MAP_WRITE_REFUSED");
  }
  process.stdout.write(`AUDIT_MAP PASS write ${candidate.implementationCommit}\n`);
};

const selfTest = () => {
  const first = buildAuditMapCandidate();
  const second = buildAuditMapCandidate();
  if (!first.bytes.equals(second.bytes)) throw new Error("AUDIT_MAP_NONDETERMINISTIC_REFUSED");
  const decoded = JSON.parse(first.bytes.toString("utf8"));
  const locator = `git://galerina/${first.implementationCommit}`;
  if (
    decoded.subject.locator !== locator ||
    decoded.approval.status !== "DRAFT" ||
    decoded.approval.planDigest !== null ||
    decoded.approval.authority !== null ||
    decoded.approval.evidence !== null ||
    !decoded.audits.every((entry) => entry.build === locator)
  ) {
    throw new Error("AUDIT_MAP_BINDING_REFUSED");
  }
  process.stdout.write("AUDIT_MAP PASS self-test byte-identical\n");
};

const main = () => {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--check", "--write", "--self-test"].includes(args[0])) {
    throw new Error("AUDIT_MAP_ARGUMENT_REFUSED");
  }
  if (args[0] === "--check") check();
  else if (args[0] === "--write") write();
  else selfTest();
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "AUDIT_MAP_REFUSED"}\n`);
    process.exitCode = 2;
  }
}
