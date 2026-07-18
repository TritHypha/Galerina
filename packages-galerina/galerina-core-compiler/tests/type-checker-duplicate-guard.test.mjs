/**
 * #126 — two TOP-LEVEL domain-guard declarations with the SAME name must be caught at COMPILE time.
 *
 * Surfaced by scripts/audit-silent-overwrite.mjs: governance-verifier keys every top-level guard/policy
 * into its `knownDomainGuards` map by name, so a 2nd declaration of a name silently overwrote the 1st
 * (the same silent-overwrite fault as duplicate flows/types — #107). `guard Name {}` is the v2.2
 * canonical form and `policy Name {}` its legacy alias; they share ONE module namespace. checkTypes now
 * emits FUNGI-NAME-002 (DUPLICATE_NAME) for the 2nd+ declaration, so it fails fast with a clear message.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

const typeErrors = (src) => {
  const prog = L.parseProgram(`@version 1\n${src}`, "dup-guard.fungi");
  return L.checkTypes(prog.ast).diagnostics.filter((d) => d.severity === "error");
};
const guard = (name) => `guard ${name} { permitted_effects { database.write } }`;
const policy = (name) => `policy ${name} { permitted_effects { database.write } }`;

describe("#126: duplicate domain-guard names (FUNGI-NAME-002)", () => {
  it("two guards with the same name in one module → FUNGI-NAME-002 error", () => {
    const errs = typeErrors(`${guard("PaymentGuard")}\n${guard("PaymentGuard")}`);
    assert.ok(
      errs.some((e) => e.code === "FUNGI-NAME-002" && /Domain guard 'PaymentGuard' is already declared/.test(e.message)),
      JSON.stringify(errs),
    );
  });

  it("two policies (legacy alias) with the same name → FUNGI-NAME-002 error", () => {
    const errs = typeErrors(`${policy("FinanceAccess")}\n${policy("FinanceAccess")}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-NAME-002"), JSON.stringify(errs));
  });

  it("a policy and a guard sharing a name collide — they are one namespace", () => {
    const errs = typeErrors(`${policy("SharedName")}\n${guard("SharedName")}`);
    assert.ok(errs.some((e) => e.code === "FUNGI-NAME-002"), JSON.stringify(errs));
  });

  it("distinct guard names compile clean (no false positive)", () => {
    assert.deepEqual(typeErrors(`${guard("GuardA")}\n${guard("GuardB")}`).map((e) => e.code), []);
  });

  it("only the 2nd occurrence is flagged — the first is authoritative (one error per duplicate)", () => {
    const errs = typeErrors(`${guard("G")}\n${guard("G")}`).filter((e) => e.code === "FUNGI-NAME-002");
    assert.equal(errs.length, 1);
  });

  it("three guards with the same name → the 2nd and 3rd are both flagged", () => {
    const errs = typeErrors(`${guard("G")}\n${guard("G")}\n${guard("G")}`).filter((e) => e.code === "FUNGI-NAME-002");
    assert.equal(errs.length, 2);
  });
});
