// diag-constants-migration — 2026-10-02 (Phillip 16:35 BST order). The older FUNGI-FAULT-001/003/006,
// FUNGI-INV-000..004, FUNGI-WAT-* refusals, FUNGI-NUMERIC-OP-005 and FUNGI-HALLMARK-006 now use the
// diagnostic-constants pattern: ONE exported constant { code, name, severity, message, suggestedFix } in the
// family _DIAGNOSTICS array, and every emit references it. IDs, meanings and emitted text are unchanged.
// Modelled on T24 in interpreter-i2-i3.test.mjs.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkEffects,
  checkTypes,
  resolveSymbols,
  verifyGovernance,
  checkProgram,
  assertCheckedProgram,
  FUNGI_FAULT_001,
  FUNGI_FAULT_003,
  FUNGI_FAULT_006,
  FUNGI_INV_000,
  FUNGI_INV_001,
  FUNGI_INV_002,
  FUNGI_INV_003,
  FUNGI_INV_004,
  FUNGI_FAULT_DIAGNOSTICS,
  FUNGI_INV_DIAGNOSTICS,
  FUNGI_WAT_BODY_001,
  FUNGI_WAT_CHECKED_001,
  FUNGI_WAT_DECIMAL_001,
  FUNGI_WAT_EFFECT_001,
  FUNGI_WAT_HOF_001,
  FUNGI_WAT_INT64_001,
  FUNGI_WAT_METHOD_001,
  FUNGI_WAT_MONEY_001,
  FUNGI_WAT_PATTERN_001,
  FUNGI_WAT_STMT_001,
  FUNGI_WAT_DIAGNOSTICS,
  FUNGI_NUMERIC_OP_005,
  FUNGI_NUMERIC_OP_DIAGNOSTICS,
  FUNGI_HALLMARK_006,
  FUNGI_HALLMARK_DIAGNOSTICS,
} from "../dist/index.js";
import {
  refuseMoneyWat,
  refuseDecimalWat,
  refuseUnknownMethodWat,
  refuseMixed64BitWat,
  refusePatternWat,
  refuseGovernedOrClosureStmtWat,
  refuseEffectfulEntryWat,
  refuseHofCapture,
  refuseHofShadowed,
  refusePureFlowRequiresAstBody,
} from "../dist/wat-emitter-refusals.js";
import { faultHandlerDiagMeta } from "../dist/governance-verifier.js";

const SRC = new URL("../src/", import.meta.url);

// [constant, pinned code, pinned name, pinned severity, family array, owner src file]
const MIGRATED = [
  [FUNGI_FAULT_001, "FUNGI-FAULT-001", "FAULT_HANDLER_MONOTONICITY", "error", FUNGI_FAULT_DIAGNOSTICS, "governed-control-diagnostics.ts"],
  [FUNGI_FAULT_003, "FUNGI-FAULT-003", "FAULT_HANDLER_FAIL_OPEN", "error", FUNGI_FAULT_DIAGNOSTICS, "governed-control-diagnostics.ts"],
  [FUNGI_FAULT_006, "FUNGI-FAULT-006", "DECLARED_HANDLER_NOT_EXECUTED", "error", FUNGI_FAULT_DIAGNOSTICS, "governed-control-diagnostics.ts"],
  [FUNGI_INV_000, "FUNGI-INV-000", "GOVERNANCE_VIOLATION", "error", FUNGI_INV_DIAGNOSTICS, "governed-control-diagnostics.ts"],
  [FUNGI_INV_001, "FUNGI-INV-001", "PRECONDITION_VIOLATED", "error", FUNGI_INV_DIAGNOSTICS, "governed-control-diagnostics.ts"],
  [FUNGI_INV_002, "FUNGI-INV-002", "POSTCONDITION_VIOLATED", "error", FUNGI_INV_DIAGNOSTICS, "governed-control-diagnostics.ts"],
  [FUNGI_INV_003, "FUNGI-INV-003", "INVARIANT_BLOCK_EMPTY", "warning", FUNGI_INV_DIAGNOSTICS, "governed-control-diagnostics.ts"],
  [FUNGI_INV_004, "FUNGI-INV-004", "SYMBOL_UNRESOLVED_IN_INVARIANT", "error", FUNGI_INV_DIAGNOSTICS, "governed-control-diagnostics.ts"],
  [FUNGI_WAT_BODY_001, "FUNGI-WAT-BODY-001", "PURE_FLOW_REQUIRES_AST_BODY", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_WAT_CHECKED_001, "FUNGI-WAT-CHECKED-001", "CHECKED_PROGRAM_REQUIRED", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_WAT_DECIMAL_001, "FUNGI-WAT-DECIMAL-001", "DECIMAL_FORM_NOT_LOWERED", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_WAT_EFFECT_001, "FUNGI-WAT-EFFECT-001", "EFFECTFUL_ENTRY_NOT_LOWERED", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_WAT_HOF_001, "FUNGI-WAT-HOF-001", "ARRAY_HOF_REQUIRES_NAMED_FLOW", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_WAT_INT64_001, "FUNGI-WAT-INT64-001", "MIXED_64BIT_OP_NOT_LOWERED", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_WAT_METHOD_001, "FUNGI-WAT-METHOD-001", "UNKNOWN_METHOD_NOT_LOWERED", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_WAT_MONEY_001, "FUNGI-WAT-MONEY-001", "MONEY_FORM_NOT_LOWERED", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_WAT_PATTERN_001, "FUNGI-WAT-PATTERN-001", "PATTERN_CAPABILITY_NOT_LOWERED", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_WAT_STMT_001, "FUNGI-WAT-STMT-001", "GOVERNED_OR_CLOSURE_STMT_NOT_LOWERED", "error", FUNGI_WAT_DIAGNOSTICS, "wat-emitter-refusals.ts"],
  [FUNGI_NUMERIC_OP_005, "FUNGI-NUMERIC-OP-005", "MONEY_CODE_NOT_LITERAL", "error", FUNGI_NUMERIC_OP_DIAGNOSTICS, "numeric-hallmark-diagnostics.ts"],
  [FUNGI_HALLMARK_006, "FUNGI-HALLMARK-006", "HALLMARK_SCHEMA_FIELD_NOT_ENFORCED", "error", FUNGI_HALLMARK_DIAGNOSTICS, "numeric-hallmark-diagnostics.ts"],
];

function srcFiles(dirUrl, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dirUrl, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...srcFiles(new URL(`${entry.name}/`, dirUrl), `${prefix}${entry.name}/`));
    else if (entry.name.endsWith(".ts")) out.push(`${prefix}${entry.name}`);
  }
  return out;
}
const countLiteral = (text, code) => text.split(`"${code}"`).length - 1 + text.split(`'${code}'`).length - 1;

describe("diag-constants migration: constant shape, pins and family arrays", () => {
  it("each constant has exactly { code, name, severity, message, suggestedFix } with the pinned values", () => {
    for (const [diag, code, name, severity] of MIGRATED) {
      assert.deepEqual(Object.keys(diag).sort(), ["code", "message", "name", "severity", "suggestedFix"], code);
      assert.equal(diag.code, code);
      assert.equal(diag.name, name);
      assert.equal(diag.severity, severity);
      assert.ok(typeof diag.message === "string" && diag.message.length > 0, `${code} message`);
      assert.ok(typeof diag.suggestedFix === "string" && diag.suggestedFix.length > 0, `${code} suggestedFix`);
    }
  });

  it("each constant is listed in its family _DIAGNOSTICS array, and the arrays have unique codes and names", () => {
    for (const [diag, code, , , family] of MIGRATED) assert.ok(family.includes(diag), `${code} in its family array`);
    for (const family of [FUNGI_FAULT_DIAGNOSTICS, FUNGI_INV_DIAGNOSTICS, FUNGI_WAT_DIAGNOSTICS, FUNGI_NUMERIC_OP_DIAGNOSTICS, FUNGI_HALLMARK_DIAGNOSTICS]) {
      assert.ok(Object.isFrozen(family));
      assert.equal(new Set(family.map((d) => d.code)).size, family.length);
      assert.equal(new Set(family.map((d) => d.name)).size, family.length);
    }
    assert.deepEqual(FUNGI_HALLMARK_DIAGNOSTICS.map((d) => d.code), ["FUNGI-HALLMARK-001", "FUNGI-HALLMARK-002", "FUNGI-HALLMARK-003", "FUNGI-HALLMARK-004", "FUNGI-HALLMARK-005", "FUNGI-HALLMARK-006"]);
  });

  it("the owner file defines each code literal exactly once, and no other core-compiler src file quotes it", () => {
    const files = srcFiles(SRC);
    const text = Object.fromEntries(files.map((f) => [f, readFileSync(new URL(f, SRC), "utf8")]));
    for (const [, code, , , , owner] of MIGRATED) {
      assert.equal(countLiteral(text[owner], code), 1, `${code} is defined once in ${owner}`);
      const offenders = files.filter((f) => f !== owner && countLiteral(text[f], code) > 0);
      assert.deepEqual(offenders, [], `${code} has inline literals outside ${owner}`);
    }
  });
});

describe("diag-constants migration: WAT refusals throw through the constants (text unchanged)", () => {
  const cases = [
    [() => refuseMoneyWat("operator +"), FUNGI_WAT_MONEY_001],
    [() => refuseDecimalWat("mixed Decimal x Int"), FUNGI_WAT_DECIMAL_001],
    [() => refuseUnknownMethodWat("frobnicate"), FUNGI_WAT_METHOD_001],
    [() => refuseMixed64BitWat("+", "Int64 x Int"), FUNGI_WAT_INT64_001],
    [() => refusePatternWat("matchesPattern", "dynamic"), FUNGI_WAT_PATTERN_001],
    [() => refuseGovernedOrClosureStmtWat("fnDecl"), FUNGI_WAT_STMT_001],
    [() => refuseEffectfulEntryWat("sendMail"), FUNGI_WAT_EFFECT_001],
    [() => refuseHofCapture("map", "addOffset"), FUNGI_WAT_HOF_001],
    [() => refuseHofShadowed("reduce", "sum"), FUNGI_WAT_HOF_001],
    [() => refusePureFlowRequiresAstBody("noBody"), FUNGI_WAT_BODY_001],
  ];
  for (const [fn, diag] of cases) {
    it(`${diag.code}: thrown Error carries code / diagnosticName and the message starts with the code`, () => {
      assert.throws(fn, (err) => {
        assert.ok(err instanceof Error);
        assert.equal(err.code, diag.code);
        assert.equal(err.diagnosticName, diag.name);
        assert.ok(err.message.startsWith(`${diag.code}: `), err.message);
        return true;
      });
    });
  }

  it("emitted text is unchanged (byte pins for MONEY-001 and EFFECT-001)", () => {
    assert.throws(() => refuseMoneyWat("operator +"), {
      message:
        "FUNGI-WAT-MONEY-001: Money operator + is not in the WASM host ABI (only the per-currency constructors such as " +
        "Money.gbp(\"1.00\") are lowered). WAT emission refuses rather than operate on the opaque Money handle " +
        "(fail-closed); run the flow through the governed interpreter.",
    });
    assert.throws(() => refuseEffectfulEntryWat("sendMail"), {
      message:
        "FUNGI-WAT-EFFECT-001: effectful flow 'sendMail' is named in gir.entryPoints and is not WASM-exportable " +
        "(D8: EFFECTFUL_ENTRY_NOT_LOWERED). WAT emission refuses rather than export an (unreachable) stub " +
        "(fail-closed).",
    });
  });

  it("FUNGI-WAT-CHECKED-001: positive (unchecked values refused) and negative (a checked program passes)", () => {
    for (const bad of [undefined, null, {}, [], Number.NaN, "pure flow f() -> Int { return 1 }"]) {
      assert.throws(() => assertCheckedProgram(bad), (err) => err.code === FUNGI_WAT_CHECKED_001.code
        && err.diagnosticName === FUNGI_WAT_CHECKED_001.name
        && err.message.startsWith(`${FUNGI_WAT_CHECKED_001.code}: `));
    }
    const refused = checkProgram("", "");
    assert.equal(refused.ok, false);
    assert.equal(refused.code, FUNGI_WAT_CHECKED_001.code);
    assert.equal(refused.diagnostics[0].code, FUNGI_WAT_CHECKED_001.code);
    const ok = checkProgram("@version 1\npure flow add(a: Int, b: Int) -> Int {\n  return a + b\n}\n", "add.fungi");
    assert.equal(ok.ok, true, JSON.stringify(ok.diagnostics ?? []));
    assert.doesNotThrow(() => assertCheckedProgram(ok.program));
  });
});

function gov(source) {
  const parsed = parseProgram(source, "diag-constants.fungi");
  const effects = checkEffects(parsed.flows, parsed.ast);
  return verifyGovernance(parsed.ast, parsed.flows, effects, "dev");
}
const findDiag = (r, code) => r.diagnostics.find((d) => d.code === code);
const hasDiag = (r, code) => r.diagnostics.some((d) => d.code === code);

describe("diag-constants migration: governance FAULT / INV emits use the constants", () => {
  it("faultHandlerDiagMeta returns the constant name and suggestedFix for FAULT-001/003/006, none otherwise", () => {
    for (const diag of [FUNGI_FAULT_001, FUNGI_FAULT_003, FUNGI_FAULT_006]) {
      assert.deepEqual(faultHandlerDiagMeta(diag.code), { kind: "found", name: diag.name, hint: diag.suggestedFix });
    }
    assert.deepEqual(faultHandlerDiagMeta("not-a-fault-code"), { kind: "none", reason: "unknown-fault-code" });
  });

  it("FAULT-001 positive (on_denial_fault retry) carries the constant name/fix; negative (halt) is clean", () => {
    const flow = (h) => `flow fetchOrder(id: String) -> Result<String, String>
contract {
  intent { "Fetch an order." }
  effects { network.outbound }
  resilience {
    ${h}
  }
}
{
  let r = OrdersDB.read(id)?
  return Ok(r)
}`;
    const d = findDiag(gov(flow("on_denial_fault retry")), FUNGI_FAULT_001.code);
    assert.equal(typeof d, "object");
    assert.equal(d.name, FUNGI_FAULT_001.name);
    assert.equal(d.suggestedFix, FUNGI_FAULT_001.suggestedFix);
    assert.equal(hasDiag(gov(flow("on_denial_fault halt")), FUNGI_FAULT_001.code), false);
  });

  it("INV-001 static diagnostic uses the KB name PRECONDITION_VIOLATED; a true ensure is clean", () => {
    const flow = (cond) => `pure flow probe(x: Int) -> Int
contract {
  intent { "Probe." }
  invariant { ensure ${cond}; }
}
{ return x }`;
    const d = findDiag(gov(flow("false")), FUNGI_INV_001.code);
    assert.equal(typeof d, "object");
    assert.equal(d.name, FUNGI_INV_001.name);
    assert.equal(d.severity, FUNGI_INV_001.severity);
    assert.equal(hasDiag(gov(flow("5 > 0")), FUNGI_INV_001.code), false);
  });

  it("INV-003 empty invariant block is a warning named by the constant; a non-empty block is clean", () => {
    const flow = (body) => `pure flow probe(x: Int) -> Int
contract {
  intent { "Probe." }
  invariant {${body}}
}
{ return x }`;
    const d = findDiag(gov(flow("")), FUNGI_INV_003.code);
    assert.equal(typeof d, "object");
    assert.equal(d.name, FUNGI_INV_003.name);
    assert.equal(d.severity, "warning");
    assert.equal(hasDiag(gov(flow(" ensure x >= 0; ")), FUNGI_INV_003.code), false);
  });

  it("INV-004 unresolved symbol is named by the constant; a parameter reference is clean", () => {
    const flow = (cond) => `pure flow probe(x: Int) -> Int
contract {
  intent { "Probe." }
  invariant { ensure ${cond}; }
}
{ return x }`;
    const d = findDiag(gov(flow("nope > 0")), FUNGI_INV_004.code);
    assert.equal(typeof d, "object");
    assert.equal(d.name, FUNGI_INV_004.name);
    assert.equal(hasDiag(gov(flow("x > 0")), FUNGI_INV_004.code), false);
  });
});

describe("diag-constants migration: NUMERIC-OP-005 and HALLMARK-006 type-checker emits", () => {
  const tcErrors = (src) => {
    const p = parseProgram(src, "probe.fungi");
    resolveSymbols(p.ast);
    const tc = checkTypes(p.ast);
    return [...(p.diagnostics ?? []), ...(tc?.diagnostics ?? [])];
  };

  it("NUMERIC-OP-005 positive: a computed currency code emits the constant (code, name, message, fix)", () => {
    const d = tcErrors('pure flow probe(code: String) -> Money {\n  return Money.of("9.99", code)\n}')
      .find((x) => x.code === FUNGI_NUMERIC_OP_005.code);
    assert.equal(typeof d, "object");
    assert.equal(d.name, FUNGI_NUMERIC_OP_005.name);
    assert.equal(d.message, FUNGI_NUMERIC_OP_005.message);
    assert.equal(d.suggestedFix, FUNGI_NUMERIC_OP_005.suggestedFix);
  });

  it("NUMERIC-OP-005 negative: a literal currency code does not emit it", () => {
    const ds = tcErrors('pure flow probe() -> Money {\n  return Money.of("9.99", "CHF")\n}');
    assert.equal(ds.some((x) => x.code === FUNGI_NUMERIC_OP_005.code), false);
  });

  const hallmark = (extra) => `@version 1
hallmark LoyaltyPoints of Decimal {
  ops:  { add, compare }
${extra}  gate: flow assayPoints
}
pure flow assayPoints(raw: Decimal) -> Result<LoyaltyPoints, ValidationError> {
  contract { intent "Admit a balance." }
  return Ok(LoyaltyPoints(raw))
}
`;

  it("HALLMARK-006 positive: decimals: / sign: schema fields are refused with the constant's code and name", () => {
    for (const field of ["decimals: 0", "sign: non-negative"]) {
      const d = checkTypes(parseProgram(hallmark(`  ${field}\n`), "h.fungi").ast).diagnostics
        .find((x) => x.code === FUNGI_HALLMARK_006.code);
      assert.equal(typeof d, "object", `expected ${FUNGI_HALLMARK_006.code} for ${field}`);
      assert.equal(d.name, FUNGI_HALLMARK_006.name);
      assert.equal(d.severity, FUNGI_HALLMARK_006.severity);
      assert.ok(d.message.includes(`'${field.slice(0, field.indexOf(":"))}:'`), d.message);
    }
  });

  it("HALLMARK-006 negative: a schema without decimals:/sign: does not emit it", () => {
    const r = checkTypes(parseProgram(hallmark(""), "h.fungi").ast);
    assert.equal(r.diagnostics.some((x) => x.code === FUNGI_HALLMARK_006.code), false);
  });
});