/**
 * J4 / E2a — #100 receiver forms used by checkFlowEffects.
 *
 * The live run-path traps are `fd.name` / `fd.kind` / `fd.effects` / `fd.usedEffects`
 * after `match flows.get(i) { Some(fd) => … }` where `flows: Array<Auto>`. Concrete
 * `Array<FlowDecl>` already lowered (p9-100 pin). Auto match-binds reconstruct a
 * unique record layout from the arm's `bind.field` uses and emit existing i32.load
 * field loads. Ambiguous single-field Auto stays fail-closed (not a default type).
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

function render(src, label = "wat-j4-member-receiver.fungi") {
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

const FLOWDECL = `record FlowDecl { kind: String name: String effects: Array<String> usedEffects: Array<String> }\n`;

const AUTO_MATCH = FLOWDECL + `
pure flow checkFlowEffects(flows: Array<Auto>) -> Int
contract { effects {} }
{
  mut i: Int = 0
  mut n: Int = 0
  while i < flows.count() {
    let fdOpt = flows.get(i)
    match fdOpt {
      Some(fd) => {
        let name: String = fd.name
        let kind: String = fd.kind
        let effects: Array<Auto> = fd.effects
        let usedEffects: Array<Auto> = fd.usedEffects
        n = n + effects.count() + usedEffects.count()
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return n
}
`;

const CONCRETE_MATCH = FLOWDECL + `
pure flow readName(flows: Array<FlowDecl>) -> Int
contract { effects {} }
{
  match flows.get(0) {
    Some(fd) => {
      let name: String = fd.name
      return 1
    }
    None => { return 0 }
    _ => { return 0 }
  }
}
`;

const AMBIGUOUS_AUTO = `
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

describe("J4 #100 match-bound Some(x) from Array.get receiver", () => {
  it("concrete Array<FlowDecl> get→Some(fd)→fd.name already lowers to i32.load", () => {
    const wat = render(CONCRETE_MATCH, "j4-concrete.fungi");
    assert.equal(unresolvedMembers(wat).filter((m) => m === "name").length, 0);
    assert.match(wat, /i32\.load \(i32\.add/);
  });

  it("Array<Auto> get→Some(fd) reconstructs FlowDecl from the four checkFlowEffects fields", () => {
    const wat = render(AUTO_MATCH, "j4-auto-match.fungi");
    const hits = unresolvedMembers(wat);
    assert.deepEqual(hits.filter((m) => ["name", "kind", "effects", "usedEffects"].includes(m)), []);
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "fd.kind at offset 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "fd.name at offset 4");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 8\)\)/, "fd.effects at offset 8");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 12\)\)/, "fd.usedEffects at offset 12");
  });

  it("ambiguous Auto it.name across two records stays unresolved (no default type)", () => {
    const wat = render(AMBIGUOUS_AUTO, "j4-ambiguous.fungi");
    assert.ok(unresolvedMembers(wat).includes("name"), "ambiguous .name must stay fail-closed");
  });

  it("interpreter≡WASM: in-flow Array<Auto> get→Some(fd) field loads return the same Int", async () => {
    const src = FLOWDECL + `
pure flow probe() -> Int
contract { effects {} }
{
  let fd = FlowDecl { kind: "pure", name: "ab", effects: Array.empty(), usedEffects: Array.empty() }
  mut flows: Array<Auto> = Array.empty()
  flows = flows.append(fd)
  match flows.get(0) {
    Some(x) => {
      let name: String = x.name
      let kind: String = x.kind
      let effects: Array<Auto> = x.effects
      let usedEffects: Array<Auto> = x.usedEffects
      return effects.count() + usedEffects.count() + 1
    }
    None => { return -1 }
    _ => { return -2 }
  }
}
`;
    const prog = L.parseProgram(`@version 1\n${src}`, "j4-probe-parity.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, "parse errors: " + JSON.stringify(errs.slice(0, 3)));
    const fx = L.checkEffects(prog.flows, prog.ast);
    const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "j4-probe-parity", prog.ast, true));
    assert.deepEqual(unresolvedMembers(wat).filter((m) => ["name", "kind", "effects", "usedEffects"].includes(m)), []);
    const interp = await L.executeFlow("probe", new Map(), prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    const interpN = finiteNumber(interp, "j4 interp probe");
    const asm = await L.assembleWAT(wat);
    assert.ok(asm.valid && (asm.diagnostics ?? []).length === 0, "assemble: " + JSON.stringify(asm.diagnostics));
    const host = L.createHostRuntime();
    let maxHandle = 0;
    for (const e of L.getInternedStrings()) {
      host.seedString(e.handle, e.value);
      if (e.handle > maxHandle) maxHandle = e.handle;
    }
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    });
    const wasmN = finiteNumber(instance.exports.probe(), "j4 wasm probe");
    assert.equal(wasmN, interpN);
    assert.equal(wasmN, 1);
  });
});

