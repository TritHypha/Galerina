/**
 * J6c / E2c stage 3 — type-checker Auto-param `stmt: Auto` remainder.
 *
 * Live traps of this form: checkGenericBinding `{typeBase,typeArgs,name}`,
 * checkTensorBinding `{initTensorElem,declaredTensorElem,declaredTensorShape,initTensorShape,name}`.
 * Parked `.pattern` / `.target` / `litI32Overflow` stay unresolved (unteachable).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";

function finiteNumber(x, label) {
  let cur = x;
  if (typeof cur === "object" && cur && Object.prototype.hasOwnProperty.call(cur, "value")) {
    cur = cur.value;
  }
  if (typeof cur === "object" && cur && Object.prototype.hasOwnProperty.call(cur, "value")) {
    cur = cur.value;
  }
  if (typeof cur !== "number" || !Number.isFinite(cur)) {
    throw new Error(`${label}: not a finite number: ${JSON.stringify(x)}`);
  }
  return cur;
}

function render(src, label = "wat-j6c-member-receiver.fungi") {
  const prog = L.parseProgram(`@version 1\n${src}`, label);
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, "parse errors: " + JSON.stringify(errs.slice(0, 3)));
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  return L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, label, prog.ast, true));
}

function unresolvedMembers(wat) {
  return [...wat.matchAll(/unresolved member: (\S+)/g)].map((m) => m[1]);
}

const GENERIC_AUTO = `
pure flow checkGenericBinding(flowName: String, stmt: Auto) -> Int
contract { effects {} }
{
  let base: String = stmt.typeBase
  mut a: Int = 0
  while a < stmt.typeArgs.count() {
    a = a + 1
  }
  if stmt.name == "xs" {
    if base == "Array" { return 1 }
  }
  return 0
}
`;

const TENSOR_AUTO = `
pure flow checkTensorBinding(flowName: String, stmt: Auto) -> Int
contract { effects {} }
{
  if stmt.initTensorElem == "" { return 0 }
  let de: String = stmt.declaredTensorElem
  let ie: String = stmt.initTensorElem
  if stmt.declaredTensorShape != stmt.initTensorShape {
    if stmt.name == "t" { return 1 }
  }
  if de == ie { return 2 }
  return 3
}
`;

const AMBIGUOUS_NAME = `
record Alpha { name: String }
record Beta { name: String }
pure flow readAmbiguous(it: Auto) -> Int
contract { effects {} }
{
  let name: String = it.name
  return 1
}
`;

const MISSING_PATTERN = `
pure flow checkMatchArms(a: Auto) -> Int
contract { effects {} }
{
  if a.pattern == "_" { return 1 }
  return 0
}
`;

describe("J6c #100 Auto-param stmt: Auto remainder", () => {
  it("checkGenericBinding stmt: Auto loads typeBase/typeArgs/name", () => {
    const wat = render(GENERIC_AUTO, "j6c-generic.fungi");
    assert.deepEqual(
      unresolvedMembers(wat).filter((m) => m === "typeBase" || m === "typeArgs" || m === "name"),
      [],
    );
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "stmt.typeBase at offset 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "stmt.typeArgs at offset 4");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 8\)\)/, "stmt.name at offset 8");
  });

  it("checkTensorBinding stmt: Auto loads tensor fields + name", () => {
    const wat = render(TENSOR_AUTO, "j6c-tensor.fungi");
    assert.deepEqual(
      unresolvedMembers(wat).filter((m) =>
        m === "initTensorElem" || m === "declaredTensorElem" ||
        m === "declaredTensorShape" || m === "initTensorShape" || m === "name"
      ),
      [],
    );
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "initTensorElem at 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "declaredTensorElem at 4");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 8\)\)/, "declaredTensorShape at 8");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 12\)\)/, "initTensorShape at 12");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 16\)\)/, "name at 16");
  });

  it("ambiguous Auto it.name across two equal-shape records stays unresolved", () => {
    const wat = render(AMBIGUOUS_NAME, "j6c-ambiguous.fungi");
    assert.ok(unresolvedMembers(wat).includes("name"), "Alpha vs Beta .name must stay fail-closed");
  });

  it("missing .pattern on Auto param stays unresolved (no invented AST field)", () => {
    const wat = render(MISSING_PATTERN, "j6c-pattern.fungi");
    assert.ok(unresolvedMembers(wat).includes("pattern"), ".pattern must stay fail-closed");
  });

  it("interpreter≡WASM: Auto-param {typeBase,name} loads", async () => {
    const src = `
pure flow checkGeneric(stmt: Auto) -> Int
contract { effects {} }
{
  if stmt.typeBase == "Array" {
    if stmt.name == "xs" { return 1 }
  }
  return 0
}
pure flow probe() -> Int
contract { effects {} }
{
  return checkGeneric({ typeBase: "Array", name: "xs" })
}
`;
    const prog = L.parseProgram(`@version 1\n${src}`, "j6c-probe-parity.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, "parse errors: " + JSON.stringify(errs.slice(0, 3)));
    const fx = L.checkEffects(prog.flows, prog.ast);
    const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "j6c-probe-parity", prog.ast, true));
    assert.deepEqual(
      unresolvedMembers(wat).filter((m) => m === "typeBase" || m === "name"),
      [],
    );
    const interp = await L.executeFlow("probe", new Map(), prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    const interpN = finiteNumber(interp, "j6c interp probe");
    const asm = await L.assembleWAT(wat);
    assert.ok(asm.valid && (asm.diagnostics ?? []).length === 0, "assemble: " + JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    for (const e of L.getInternedStrings()) {
      host.seedString(e.handle, e.value);
    }
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    const wasmN = finiteNumber(instance.exports.probe(), "j6c wasm probe");
    assert.equal(wasmN, interpN);
    assert.equal(wasmN, 1);
  });
});
