import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  STAGE_B_PARITY_SCHEMA,
  STAGE_B_TYPE_CODE_SUBSET,
  collectHostStageBAtoms,
  executeFlow,
  filterStageBTypeSubset,
  uniqueStageBAtoms,
  hashStageBParity,
  parseProgram,
} from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const TC_FUNGI = join(__dir, "..", "src", "self-hosted", "type-checker.fungi");

const UNKNOWN_PARAM = `pure flow unknownParam(a: Nope) -> Int
contract { intent { "parity" } }
{
  return 1
}
`;

const CLEAN = `pure flow add(a: Int, b: Int) -> Int
contract { intent { "parity" } }
{
  return a
}
`;

const BAD_ARITH = `pure flow badArith(a: Bool, b: Bool) -> Int
contract { intent { "parity" } }
{
  return a + b
}
`;

const BAD_RETURN = `pure flow badReturn() -> String
contract { intent { "parity" } }
{
  return 1
}
`;

const GARBAGE = "not a flow {{{";

const vStr = (s) => ({ __tag: "string", value: String(s) });
const vInt = (n) => ({ __tag: "int", value: n });
const vList = (items) => ({ __tag: "list", items });

function vRecord(obj) {
  const fields = new Map();
  for (const [k, v] of Object.entries(obj)) fields.set(k, v);
  return { __tag: "record", fields };
}

function loadTypeChecker() {
  let source = readFileSync(TC_FUNGI, "utf8");
  if (source.charCodeAt(0) === 0xFEFF) source = source.slice(1);
  return parseProgram(source, "type-checker.fungi");
}

async function selfHostedTypeCodes(program, flows) {
  const args = new Map([["flows", vList(flows)]]);
  const result = await executeFlow(
    "checkFlows",
    args,
    program.ast,
    program.flows,
    undefined,
    undefined,
    { pureFastPath: false },
  );
  const rec = result.value ?? result;
  return rec.fields.get("diagnostics").items.map((item) => {
    const row = item.value ?? item;
    return row.fields.get("code").value;
  });
}

function hostTypeSubset(source) {
  return uniqueStageBAtoms(filterStageBTypeSubset(collectHostStageBAtoms(source)));
}

function uniqueCode(code) {
  return uniqueStageBAtoms([{ stage: "type", code }]);
}

function syntheticFlow(name, returnType, params, returnExpr) {
  return vRecord({
    name: vStr(name),
    returnType: vStr(returnType),
    params: vList(params),
    returnExpr: vRecord(returnExpr),
  });
}

describe("C19-A Stage-B governed diagnostic bytes", () => {
  it("is deterministic for the same source", () => {
    const first = collectHostStageBAtoms(UNKNOWN_PARAM);
    const second = collectHostStageBAtoms(UNKNOWN_PARAM);
    assert.equal(hashStageBParity(first), hashStageBParity(second));
    assert.equal(hashStageBParity(first).length, 64);
  });

  it("includes FUNGI-TYPE-001 for an unknown parameter type", () => {
    const atoms = collectHostStageBAtoms(UNKNOWN_PARAM);
    assert.ok(
      atoms.some((atom) => atom.stage === "type" && atom.code === "FUNGI-TYPE-001"),
      `got ${atoms.map((atom) => atom.stage + ":" + atom.code).join(",") || "(none)"}`,
    );
  });

  it("changes the hash when a diagnostic atom is planted", () => {
    const atoms = collectHostStageBAtoms(CLEAN);
    const planted = [...atoms, { stage: "type", code: "FUNGI-TYPE-001" }];
    assert.notEqual(hashStageBParity(atoms), hashStageBParity(planted));
  });

  it("matches the Stage-B type-checker subset for unknown parameter types", async () => {
    const host = hostTypeSubset(UNKNOWN_PARAM);
    const program = loadTypeChecker();
    const fungiCodes = await selfHostedTypeCodes(program, [
      syntheticFlow(
        "unknownParam",
        "Int",
        [vRecord({ name: vStr("a"), typeName: vStr("Nope") })],
        {
          kind: vStr("literal"),
          litType: vStr("Int"),
          leftType: vStr(""),
          rightType: vStr(""),
        },
      ),
    ]);
    const selfHosted = uniqueStageBAtoms(
      fungiCodes
        .filter((code) => code === "FUNGI-TYPE-001")
        .map((code) => ({ stage: "type", code })),
    );
    assert.ok(selfHosted.length > 0, `self-hosted codes: ${fungiCodes.join(",") || "(none)"}`);
    assert.deepEqual(host, selfHosted);
    assert.equal(hashStageBParity(host), hashStageBParity(selfHosted));
    assert.equal(STAGE_B_PARITY_SCHEMA, "fungi.compiler.stage-b-parity.v1");
  });

  it("freezes the Stage-B type-code subset", () => {
    assert.deepEqual([...STAGE_B_TYPE_CODE_SUBSET], [
      "FUNGI-TYPE-001",
      "FUNGI-TYPE-004",
      "FUNGI-TYPE-008",
    ]);
  });

  it("hashes identity not occurrence count for unique atoms", () => {
    const once = [{ stage: "type", code: "FUNGI-TYPE-001" }];
    const twice = [
      { stage: "type", code: "FUNGI-TYPE-001" },
      { stage: "type", code: "FUNGI-TYPE-001" },
    ];
    assert.notEqual(hashStageBParity(once), hashStageBParity(twice));
    assert.deepEqual(uniqueStageBAtoms(once), uniqueStageBAtoms(twice));
    assert.equal(hashStageBParity(uniqueStageBAtoms(once)), hashStageBParity(uniqueStageBAtoms(twice)));
  });

  it("is independent of atom insertion order", () => {
    const forward = [
      { stage: "type", code: "FUNGI-TYPE-008" },
      { stage: "type", code: "FUNGI-TYPE-001" },
      { stage: "effect", code: "FUNGI-EFFECT-001" },
    ];
    const reverse = [...forward].reverse();
    assert.equal(hashStageBParity(forward), hashStageBParity(reverse));
  });

  it("has an empty type subset for a clean Int flow", () => {
    const subset = hostTypeSubset(CLEAN);
    assert.deepEqual(subset, []);
  });

  it("does not classify parse diagnostics as type-stage atoms", () => {
    const parsed = parseProgram(GARBAGE, "garbage.fungi");
    const parseCodes = parsed.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code);
    assert.ok(parseCodes.length > 0, "garbage source must produce parse errors");
    const typeCodes = new Set(
      collectHostStageBAtoms(GARBAGE)
        .filter((atom) => atom.stage === "type")
        .map((atom) => atom.code),
    );
    for (const code of parseCodes) {
      assert.equal(typeCodes.has(code), false, `parse code ${code} leaked into type stage`);
    }
  });

  it("matches Stage-B FUNGI-TYPE-004 for non-Int arithmetic", async () => {
    const host = uniqueStageBAtoms(
      hostTypeSubset(BAD_ARITH).filter((atom) => atom.code === "FUNGI-TYPE-004"),
    );
    assert.deepEqual(host, uniqueCode("FUNGI-TYPE-004"));
    const program = loadTypeChecker();
    const fungiCodes = await selfHostedTypeCodes(program, [
      syntheticFlow(
        "badArith",
        "Int",
        [
          vRecord({ name: vStr("a"), typeName: vStr("Bool") }),
          vRecord({ name: vStr("b"), typeName: vStr("Bool") }),
        ],
        {
          kind: vStr("arith"),
          litType: vStr(""),
          leftType: vStr("Bool"),
          rightType: vStr("Bool"),
        },
      ),
    ]);
    const selfHosted = uniqueStageBAtoms(
      fungiCodes
        .filter((code) => code === "FUNGI-TYPE-004")
        .map((code) => ({ stage: "type", code })),
    );
    assert.ok(selfHosted.length > 0, `self-hosted codes: ${fungiCodes.join(",") || "(none)"}`);
    assert.deepEqual(host, selfHosted);
    assert.equal(hashStageBParity(host), hashStageBParity(selfHosted));
  });

  it("matches Stage-B FUNGI-TYPE-008 for a return-type mismatch", async () => {
    const host = uniqueStageBAtoms(
      hostTypeSubset(BAD_RETURN).filter((atom) => atom.code === "FUNGI-TYPE-008"),
    );
    assert.deepEqual(host, uniqueCode("FUNGI-TYPE-008"));
    const program = loadTypeChecker();
    const fungiCodes = await selfHostedTypeCodes(program, [
      syntheticFlow(
        "badReturn",
        "String",
        [],
        {
          kind: vStr("literal"),
          litType: vStr("Int"),
          leftType: vStr(""),
          rightType: vStr(""),
        },
      ),
    ]);
    const selfHosted = uniqueStageBAtoms(
      fungiCodes
        .filter((code) => code === "FUNGI-TYPE-008")
        .map((code) => ({ stage: "type", code })),
    );
    assert.ok(selfHosted.length > 0, `self-hosted codes: ${fungiCodes.join(",") || "(none)"}`);
    assert.deepEqual(host, selfHosted);
    assert.equal(hashStageBParity(host), hashStageBParity(selfHosted));
  });
});
