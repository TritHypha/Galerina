/**
 * J6b / E2c stage 2 — type-checker informal Array<Auto> decls + nested get→Some.
 *
 * Live traps of this form: buildStaticEnv `{kind,name,value,typeName}`,
 * buildBitfieldEnv decls `{kind,fields,register}` + nested fields.get `{name,mask}`.
 * Auto-param / `.pattern` / `.target` / `litI32Overflow` stay unresolved (J6c / unteachable).
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

function render(src, label = "wat-j6b-member-receiver.fungi") {
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

const STATIC_DECLS = `
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
        if d.kind == "static" {
          entries = entries.append({ name: d.name, value: d.value, typeName: d.typeName })
        }
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return { entries: entries }
}
`;

const BITFIELD_DECLS = `
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
        if d.kind == "bitfield" {
          mut j: Int = 0
          while j < d.fields.count() {
            let fOpt = d.fields.get(j)
            match fOpt {
              Some(f) => {
                entries = entries.append({ register: d.register, field: f.name, mask: f.mask })
              }
              None => {}
              _ => {}
            }
            j = j + 1
          }
        }
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return { entries: entries }
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

const MISSING_PATTERN = `
pure flow checkMatchArms(arms: Array<Auto>) -> Int
contract { effects {} }
{
  mut i: Int = 0
  while i < arms.count() {
    let aOpt = arms.get(i)
    match aOpt {
      Some(a) => {
        if a.pattern == "_" { return 1 }
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return 0
}
`;

describe("J6b #100 informal Array<Auto> decls + nested get→Some", () => {
  it("buildStaticEnv decls get→Some(d) loads kind/name/value/typeName", () => {
    const wat = render(STATIC_DECLS, "j6b-static.fungi");
    assert.deepEqual(
      unresolvedMembers(wat).filter((m) => m === "kind" || m === "name" || m === "value" || m === "typeName"),
      [],
    );
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "d.kind at offset 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "d.name at offset 4");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 8\)\)/, "d.value at offset 8");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 12\)\)/, "d.typeName at offset 12");
  });

  it("buildBitfieldEnv decls + nested fields.get loads kind/fields/register and name/mask", () => {
    const wat = render(BITFIELD_DECLS, "j6b-bitfield.fungi");
    assert.deepEqual(
      unresolvedMembers(wat).filter((m) =>
        m === "kind" || m === "fields" || m === "register" || m === "name" || m === "mask"
      ),
      [],
    );
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "d.kind / f.name at offset 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "d.fields / f.mask at offset 4");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 8\)\)/, "d.register at offset 8");
  });

  it("ambiguous Auto it.name across two equal-shape records stays unresolved", () => {
    const wat = render(AMBIGUOUS_NAME, "j6b-ambiguous.fungi");
    assert.ok(unresolvedMembers(wat).includes("name"), "Alpha vs Beta .name must stay fail-closed");
  });

  it("missing .pattern on Array<Auto> match arms stays unresolved (no invented AST field)", () => {
    const wat = render(MISSING_PATTERN, "j6b-pattern.fungi");
    assert.ok(unresolvedMembers(wat).includes("pattern"), ".pattern must stay fail-closed");
  });

  it("interpreter≡WASM: informal {kind,name,value,typeName} match-bound loads", async () => {
    const src = `
pure flow probe() -> Int
contract { effects {} }
{
  mut decls: Array<Auto> = Array.empty()
  decls = decls.append({ kind: "static", name: "x", value: "1", typeName: "Int" })
  match decls.get(0) {
    Some(d) => {
      if d.kind == "static" {
        if d.name == "x" {
          if d.value == "1" {
            if d.typeName == "Int" { return 1 }
          }
        }
      }
      return 0
    }
    None => { return 0 - 1 }
    _ => { return 0 - 2 }
  }
}
`;
    const prog = L.parseProgram(`@version 1\n${src}`, "j6b-probe-parity.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, "parse errors: " + JSON.stringify(errs.slice(0, 3)));
    const fx = L.checkEffects(prog.flows, prog.ast);
    const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "j6b-probe-parity", prog.ast, true));
    assert.deepEqual(
      unresolvedMembers(wat).filter((m) => m === "kind" || m === "name" || m === "value" || m === "typeName"),
      [],
    );
    const interp = await L.executeFlow("probe", new Map(), prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    const interpN = finiteNumber(interp, "j6b interp probe");
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
    const wasmN = finiteNumber(instance.exports.probe(), "j6b wasm probe");
    assert.equal(wasmN, interpN);
    assert.equal(wasmN, 1);
  });
});
