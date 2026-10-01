/**
 * J6a / E2c stage 1 — type-checker match-bound Array.get → Some(x) receivers.
 *
 * Live traps of this form: lookupQualifiedType / checkViewBindings `{name,typeName}`,
 * resolveStatic `{name,value}` as prefix of StaticEnv.entries `{name,value,typeName}`,
 * resolveBitfieldAccess `{register,field,mask}`. Auto-param / firstExpr / informal
 * `.pattern` / `decls` shapes are J6b/J6c.
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

function render(src, label = "wat-j6a-member-receiver.fungi") {
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

const NAME_TYPENAME = `
record RecordFieldDecl { name: String typeName: String }
record FlowParam { name: String typeName: String isReadonly: Bool isTainted: Bool sourceFrom: String whereExpr: String }
record Stmt { kind: String name: String typeName: String expr: Array<String> }
`;

const LOOKUP = NAME_TYPENAME + `
pure flow qualifierParamScope(params: Array<FlowParam>) -> Array<Auto>
contract { effects {} }
{
  mut out: Array<Auto> = Array.empty()
  mut i: Int = 0
  while i < params.count() {
    let pOpt = params.get(i)
    match pOpt {
      Some(p) => { out = out.append({ name: p.name, typeName: p.typeName }) }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return out
}
pure flow lookupQualifiedType(scope: Array<Auto>, name: String) -> String
contract { effects {} }
{
  mut i: Int = 0
  while i < scope.count() {
    let opt = scope.get(i)
    match opt {
      Some(entry) => {
        if entry.name == name { return entry.typeName }
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return ""
}
`;

const STATIC_ENV = `
record StaticEnv { entries: Array<Auto> }
pure flow buildStaticEnv(decls: Array<Auto>) -> StaticEnv
contract { effects {} }
{
  mut entries: Array<Auto> = Array.empty()
  mut i: Int = 0
  while i < decls.count() {
    let dOpt = decls.get(i)
    match dOpt {
      Some(d) => {
        entries = entries.append({ name: d.name, value: d.value, typeName: d.typeName })
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return { entries: entries }
}
pure flow resolveStatic(env: StaticEnv, name: String) -> String
contract { effects {} }
{
  mut i: Int = 0
  while i < env.entries.count() {
    let eOpt = env.entries.get(i)
    match eOpt {
      Some(e) => {
        if e.name == name { return e.value }
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return ""
}
`;

const BITFIELD_ENV = `
record BitfieldEnv { entries: Array<Auto> }
pure flow buildBitfieldEnv(decls: Array<Auto>) -> BitfieldEnv
contract { effects {} }
{
  mut entries: Array<Auto> = Array.empty()
  mut i: Int = 0
  while i < decls.count() {
    let dOpt = decls.get(i)
    match dOpt {
      Some(d) => {
        entries = entries.append({ register: d.register, field: d.field, mask: d.mask })
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return { entries: entries }
}
pure flow resolveBitfieldAccess(env: BitfieldEnv, register: String, field: String) -> Int
contract { effects {} }
{
  mut i: Int = 0
  while i < env.entries.count() {
    let eOpt = env.entries.get(i)
    match eOpt {
      Some(e) => {
        if e.register == register {
          if e.field == field { return e.mask }
        }
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return 0 - 1
}
`;

const AMBIGUOUS_NAME = `
record Alpha { name: String }
record Beta { name: String }
pure flow readAmbiguous(xs: Array<Auto>) -> Int
contract { effects {} }
{
  match xs.get(0) {
    Some(it) => {
      let name: String = it.name
      return 1
    }
    None => { return 0 }
    _ => { return 0 }
  }
}
`;

const NON_PREFIX = `
record PolicyDecl { name: String permittedEffects: Array<String> }
record DotPathParse { name: String nextPos: Int }
pure flow readNameOnly(xs: Array<Auto>) -> Int
contract { effects {} }
{
  match xs.get(0) {
    Some(it) => {
      let name: String = it.name
      return 1
    }
    None => { return 0 }
    _ => { return 0 }
  }
}
`;

describe("J6a #100 match-bound Array.get Some receivers (type-checker forms)", () => {
  it("lookupQualifiedType Array<Auto> get→Some(entry) loads name@0 typeName@4 despite FlowParam/Stmt", () => {
    const wat = render(LOOKUP, "j6a-lookup.fungi");
    assert.deepEqual(unresolvedMembers(wat).filter((m) => m === "name" || m === "typeName"), []);
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "entry.name at offset 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "entry.typeName at offset 4");
  });

  it("resolveStatic env.entries.get→Some(e) uses {name,value,typeName} prefix loads", () => {
    const wat = render(STATIC_ENV, "j6a-static.fungi");
    assert.deepEqual(unresolvedMembers(wat).filter((m) => m === "name" || m === "value"), []);
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "e.name at offset 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "e.value at offset 4");
  });

  it("resolveBitfieldAccess env.entries.get→Some(e) loads register/field/mask", () => {
    const wat = render(BITFIELD_ENV, "j6a-bitfield.fungi");
    assert.deepEqual(unresolvedMembers(wat).filter((m) => m === "register" || m === "field" || m === "mask"), []);
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "e.register at offset 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "e.field at offset 4");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 8\)\)/, "e.mask at offset 8");
  });

  it("ambiguous Auto it.name across two equal-shape records stays unresolved", () => {
    const wat = render(AMBIGUOUS_NAME, "j6a-ambiguous.fungi");
    assert.ok(unresolvedMembers(wat).includes("name"), "Alpha vs Beta .name must stay fail-closed");
  });

  it("sibling non-prefix PolicyDecl vs DotPathParse .name stays unresolved", () => {
    const wat = render(NON_PREFIX, "j6a-sibling.fungi");
    assert.ok(unresolvedMembers(wat).includes("name"), "non-prefix .name must stay fail-closed");
  });

  it("interpreter≡WASM: Array<Auto> {name,typeName} match-bound loads return the same String handle path as Int", async () => {
    const src = NAME_TYPENAME + `
pure flow probe() -> Int
contract { effects {} }
{
  mut scope: Array<Auto> = Array.empty()
  scope = scope.append({ name: "x", typeName: "Int" })
  match scope.get(0) {
    Some(entry) => {
      let n: String = entry.name
      let t: String = entry.typeName
      if n == "x" {
        if t == "Int" { return 1 }
      }
      return 0
    }
    None => { return 0 - 1 }
    _ => { return 0 - 2 }
  }
}
`;
    const prog = L.parseProgram(`@version 1\n${src}`, "j6a-probe-parity.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, "parse errors: " + JSON.stringify(errs.slice(0, 3)));
    const fx = L.checkEffects(prog.flows, prog.ast);
    const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "j6a-probe-parity", prog.ast, true));
    assert.deepEqual(unresolvedMembers(wat).filter((m) => m === "name" || m === "typeName"), []);
    const interp = await L.executeFlow("probe", new Map(), prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    const interpN = finiteNumber(interp, "j6a interp probe");
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
    const wasmN = finiteNumber(instance.exports.probe(), "j6a wasm probe");
    assert.equal(wasmN, interpN);
    assert.equal(wasmN, 1);
  });
});
