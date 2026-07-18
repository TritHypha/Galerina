/**
 * Border-safe governed-runtime seam (RD-0361 R4 / #143 · P1.5). The seam is the one declared, deny-by-default
 * edge a border-locked consumer (the app-kernel) binds to reach authoritative twin execution WITHOUT pulling
 * the compiler across the Hardened Border. This pins the load-bearing guarantee: unplugged => DENY, and a
 * version-skewed provider => DENY (both fail closed, never admit).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GOVERNED_RUNTIME_SEAM_VERSION,
  DENY_ALL_RUNTIME_EXECUTOR,
  bindGovernedRuntime,
} from "../dist/index.js";

const req = (over = {}) => ({
  seamVersion: GOVERNED_RUNTIME_SEAM_VERSION,
  artifactSha256: "0".repeat(64),
  exportName: "admitSecrets",
  args: [1],
  ...over,
});

test("★ unplugged: with NO executor wired, the seam DENIES (deny-by-default, the whole point)", () => {
  const exec = bindGovernedRuntime(undefined);
  const v = exec.admitAndExecute(req());
  assert.equal(v.outcome, "deny", "an unplugged runtime seam must deny, never admit");
});

test("DENY_ALL_RUNTIME_EXECUTOR denies every request", () => {
  assert.equal(DENY_ALL_RUNTIME_EXECUTOR.admitAndExecute(req()).outcome, "deny");
});

test("version skew: a provider pinned to a DIFFERENT seam version is REFUSED (falls back to deny-all)", () => {
  const stale = { seamVersion: "galerina.runtime.seam.v0", admitAndExecute: () => ({ outcome: "admit" }) };
  const exec = bindGovernedRuntime(stale);
  assert.equal(exec, DENY_ALL_RUNTIME_EXECUTOR, "a version-mismatched executor must be refused");
  assert.equal(exec.admitAndExecute(req()).outcome, "deny");
});

test("a matched provider is bound and its verdict flows through (admit AND deny)", () => {
  const admitting = {
    seamVersion: GOVERNED_RUNTIME_SEAM_VERSION,
    admitAndExecute: (r) => (r.exportName === "admitSecrets" ? { outcome: "admit", result: "admit" } : { outcome: "deny", reason: "unknown export" }),
  };
  const exec = bindGovernedRuntime(admitting);
  assert.equal(exec.admitAndExecute(req()).outcome, "admit");
  assert.equal(exec.admitAndExecute(req({ exportName: "other" })).outcome, "deny");
});
