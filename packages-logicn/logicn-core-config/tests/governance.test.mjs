// JOB 0011 (a) — project governance ceiling: full | auto | lean (default full, fail-closed).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveProjectGovernance,
  isGovernanceMode,
  DEFAULT_GOVERNANCE_MODE,
  GOVERNANCE_MODES,
  parseProjectConfig,
} from "../dist/index.js";

test("default is full; the union is full/auto/lean", () => {
  assert.equal(DEFAULT_GOVERNANCE_MODE, "full");
  assert.deepEqual([...GOVERNANCE_MODES], ["full", "auto", "lean"]);
});

test("isGovernanceMode accepts the three modes, rejects anything else", () => {
  for (const m of ["full", "auto", "lean"]) assert.ok(isGovernanceMode(m));
  for (const bad of ["loose", "off", "on", "", 1, null, undefined, {}]) {
    assert.equal(isGovernanceMode(bad), false);
  }
});

test("resolveProjectGovernance: missing → full (defaulted, not invalid)", () => {
  const r = resolveProjectGovernance(undefined);
  assert.equal(r.mode, "full");
  assert.equal(r.defaulted, true);
  assert.equal(r.invalid, false);
});

test("resolveProjectGovernance: valid modes pass through", () => {
  assert.equal(resolveProjectGovernance("auto").mode, "auto");
  assert.equal(resolveProjectGovernance("lean").mode, "lean");
  assert.equal(resolveProjectGovernance("full").mode, "full");
});

test("resolveProjectGovernance: invalid → full (fail-closed, flagged invalid)", () => {
  const r = resolveProjectGovernance("loose");
  assert.equal(r.mode, "full"); // forced to the STRICTEST, never a laxer mode
  assert.equal(r.invalid, true);
  assert.equal(r.defaulted, true);
});

test("parseProjectConfig: governance:auto is parsed onto the project", () => {
  const { project, diagnostics } = parseProjectConfig({
    name: "demo",
    version: "1.0.0",
    governance: "auto",
  });
  assert.ok(project);
  assert.equal(project.governance, "auto");
  assert.equal(diagnostics.length, 0);
});

test("parseProjectConfig: missing governance defaults to full, no diagnostic", () => {
  const { project, diagnostics } = parseProjectConfig({ name: "demo", version: "1.0.0" });
  assert.ok(project);
  assert.equal(project.governance, "full");
  assert.equal(diagnostics.length, 0);
});

test("parseProjectConfig: invalid governance → full + LLN-CONFIG-GOV-003 error", () => {
  const { project, diagnostics } = parseProjectConfig({
    name: "demo",
    version: "1.0.0",
    governance: "loose",
  });
  assert.ok(project);
  assert.equal(project.governance, "full"); // fail-closed
  const d = diagnostics.find((x) => x.code === "LLN-CONFIG-GOV-003");
  assert.ok(d, "expected LLN-CONFIG-GOV-003");
  assert.equal(d.severity, "error");
});
