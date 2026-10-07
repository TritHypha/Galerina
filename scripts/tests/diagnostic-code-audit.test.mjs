import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..");
const AUDIT = join(SCRIPTS, "audit-diagnostic-codes.mjs");
const roots = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture(source) {
  const root = mkdtempSync(join(tmpdir(), "diagnostic-code-audit-"));
  roots.push(root);
  const sourceDirectory = join(root, "packages-ts", "fixture", "src");
  mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(join(sourceDirectory, "diagnostics.ts"), source);
  return root;
}

function run(root) {
  const result = spawnSync(
    process.execPath,
    [AUDIT, "--root", root, "--json"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.stdout.trim(), "", "audit must emit JSON");
  assert.equal(
    result.stdout.trimStart().startsWith("{"),
    true,
    "audit --json must emit a JSON object rather than the human report",
  );
  return { result, report: JSON.parse(result.stdout) };
}

const definition = (allowedLine = "") => `
export const DIAG = {
  code: "FUNGI-GOV-999",
  name: "PROFILE_BOUNDARY",
  severity: "warning",
  ${allowedLine}
};
export function emit(isProduction) {
  return makeGovDiag(
    "FUNGI-GOV-999",
    "PROFILE_BOUNDARY",
    isProduction ? "error" : "warning",
  );
}
`;

const registry = (severities) => `
export const DIAGNOSTIC_ALLOWED_SEVERITIES = {
  "FUNGI-GOV-999": [${severities.map((item) => `"${item}"`).join(", ")}],
};
`;

test("an exact declared profile-severity set admits the observed severities", () => {
  const { result, report } = run(fixture(
    definition('allowedSeverities: ["error", "warning"],'),
  ));

  assert.equal(result.status, 0);
  assert.deepEqual(report.violations, []);
});

test("an exact central severity registry admits an inline-only diagnostic", () => {
  const { result, report } = run(fixture(
    definition() + registry(["error", "warning"]),
  ));

  assert.equal(result.status, 0);
  assert.deepEqual(report.violations, []);
});

test("an undeclared multi-severity diagnostic is refused", () => {
  const { result, report } = run(fixture(definition()));

  assert.equal(result.status, 1);
  assert.ok(report.violations.some((item) =>
    item.code === "V4_MULTI_SEVERITY"
    && item.subject === "FUNGI-GOV-999"));
});

test("an over-broad severity declaration is stale and refused", () => {
  const { result, report } = run(fixture(
    definition('allowedSeverities: ["error", "info", "warning"],'),
  ));

  assert.equal(result.status, 1);
  assert.ok(report.violations.some((item) =>
    item.code === "V4_POLICY_STALE"
    && item.subject === "FUNGI-GOV-999"));
});

test("Rust runtime error metadata participates in uniqueness and severity audit", () => {
  const root = fixture("");
  const rustPath = join(root, "packages-ts", "fixture", "src", "secret_arena.rs");
  writeFileSync(rustPath, [
    "pub struct RuntimeErrorCode {",
    "    pub code: &'static str,",
    "    pub name: &'static str,",
    "    pub severity: &'static str,",
    "    pub message: &'static str,",
    "}",
    "pub const ERR_EXAMPLE_REFUSED: RuntimeErrorCode = RuntimeErrorCode {",
    '    code: "ERR_EXAMPLE_REFUSED",',
    '    name: "EXAMPLE_REFUSED",',
    '    severity: "error",',
    '    message: "example refused",',
    "};",
    "",
  ].join("\n"));

  const { result, report } = run(root);
  assert.equal(result.status, 0, JSON.stringify(report.violations));
  assert.deepEqual(report.violations, []);
});

test("Rust runtime error metadata refuses invalid severity and overloaded names", () => {
  const root = fixture("");
  const rustPath = join(root, "packages-ts", "fixture", "src", "secret_arena.rs");
  writeFileSync(rustPath, [
    "pub struct RuntimeErrorCode {",
    "    pub code: &'static str,",
    "    pub name: &'static str,",
    "    pub severity: &'static str,",
    "    pub message: &'static str,",
    "}",
    "pub const ERR_EXAMPLE_REFUSED: RuntimeErrorCode = RuntimeErrorCode {",
    '    code: "ERR_EXAMPLE_REFUSED",',
    '    name: "EXAMPLE_REFUSED",',
    '    severity: "fatal",',
    '    message: "example refused",',
    "};",
    "pub const ERR_EXAMPLE_ALSO_REFUSED: RuntimeErrorCode = RuntimeErrorCode {",
    '    code: "ERR_EXAMPLE_ALSO_REFUSED",',
    '    name: "EXAMPLE_REFUSED",',
    '    severity: "error",',
    '    message: "also refused",',
    "};",
    "",
  ].join("\n"));

  const { result, report } = run(root);
  assert.equal(result.status, 2);
  assert.ok(report.violations.some((item) =>
    item.code === "V2_NAME_COLLISION" && item.subject === "EXAMPLE_REFUSED"));
  assert.ok(report.violations.some((item) =>
    item.code === "V3_SEVERITY_VOCAB" && item.subject === "ERR_EXAMPLE_REFUSED"));
});
