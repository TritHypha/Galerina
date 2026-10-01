/**
 * J5 / E2b — #100 receiver forms used by governance-verifier (8 module-wide nodes).
 *
 * Live traps are Array<Auto> get→Some(x) field reads in findPolicyExists (`pol.name`),
 * effectIsPermitted (`pol.name` / `pol.permittedEffects`), and verifyGuardDecl
 * (`g.permittedEffects` / `g.name`). PolicyDecl ⊏ GuardDecl is a prefix family, not
 * a unique J4 type; sibling Alpha/Beta `{name}` stays fail-closed.
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

function render(src, label = "wat-j5-member-receiver.fungi") {
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

const POLICY_GUARD = `
record PolicyDecl { name: String permittedEffects: Array<String> }
record GuardDecl { name: String permittedEffects: Array<String> enforcedLimits: Array<String> }
`;

const DISTRACTORS = `
record FlowDecl { kind: String name: String effects: Array<String> }
record DotPathParse { name: String nextPos: Int }
`;

const EFFECT_IS_PERMITTED = POLICY_GUARD + `
pure flow effectIsPermitted(policies: Array<Auto>, policyName: String, effect: String) -> Bool
contract { effects {} }
{
  mut i: Int = 0
  while i < policies.count() {
    let pOpt = policies.get(i)
    match pOpt {
      Some(pol) => {
        if pol.name == policyName {
          mut j: Int = 0
          while j < pol.permittedEffects.count() {
            let eOpt = pol.permittedEffects.get(j)
            match eOpt {
              Some(e) => { if e == effect { return true } }
              None => {}
              _ => {}
            }
            j = j + 1
          }
          return false
        }
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return false
}
`;

const FIND_POLICY_WITH_SIBLING = POLICY_GUARD + DISTRACTORS + `
pure flow findPolicyExists(policies: Array<Auto>, name: String) -> Bool
contract { effects {} }
{
  mut i: Int = 0
  while i < policies.count() {
    let pOpt = policies.get(i)
    match pOpt {
      Some(pol) => { if pol.name == name { return true } }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return false
}
pure flow effectIsPermitted(policies: Array<Auto>, policyName: String, effect: String) -> Bool
contract { effects {} }
{
  mut i: Int = 0
  while i < policies.count() {
    let pOpt = policies.get(i)
    match pOpt {
      Some(pol) => {
        if pol.name == policyName {
          return pol.permittedEffects.count() >= 0
        }
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return false
}
`;

const VERIFY_GUARD = POLICY_GUARD + `
pure flow verifyGuardDecl(guardDecls: Array<Auto>) -> Int
contract { effects {} }
{
  mut n: Int = 0
  mut i: Int = 0
  while i < guardDecls.count() {
    let gOpt = guardDecls.get(i)
    match gOpt {
      Some(g) => {
        n = n + g.permittedEffects.count()
        let gn: String = g.name
        if gn == "" { n = n + 0 }
      }
      None => {}
      _ => {}
    }
    i = i + 1
  }
  return n
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

const SIBLING_SHAPES = `
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

describe("J5 #100 Array<Auto> PolicyDecl/GuardDecl prefix-family receivers", () => {
  it("effectIsPermitted Array<Auto> get→Some(pol) reconstructs PolicyDecl prefix loads", () => {
    const wat = render(EFFECT_IS_PERMITTED, "j5-effect-is-permitted.fungi");
    const hits = unresolvedMembers(wat);
    assert.deepEqual(hits.filter((m) => m === "name" || m === "permittedEffects"), []);
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "pol.name at offset 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "pol.permittedEffects at offset 4");
  });

  it("findPolicyExists pol.name widens from sibling Auto {name, permittedEffects} despite distractors", () => {
    const wat = render(FIND_POLICY_WITH_SIBLING, "j5-find-policy.fungi");
    assert.deepEqual(unresolvedMembers(wat).filter((m) => m === "name" || m === "permittedEffects"), []);
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "pol.name at offset 0");
  });

  it("verifyGuardDecl Array<Auto> get→Some(g) loads name + permittedEffects", () => {
    const wat = render(VERIFY_GUARD, "j5-verify-guard.fungi");
    assert.deepEqual(unresolvedMembers(wat).filter((m) => m === "name" || m === "permittedEffects"), []);
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 0\)\)/, "g.name at offset 0");
    assert.match(wat, /i32\.load \(i32\.add [^\n]* \(i32\.const 4\)\)/, "g.permittedEffects at offset 4");
  });

  it("ambiguous Auto it.name across two equal-shape records stays unresolved", () => {
    const wat = render(AMBIGUOUS_NAME, "j5-ambiguous.fungi");
    assert.ok(unresolvedMembers(wat).includes("name"), "Alpha vs Beta .name must stay fail-closed");
  });

  it("sibling non-prefix shapes PolicyDecl vs DotPathParse .name stay unresolved", () => {
    const wat = render(SIBLING_SHAPES, "j5-sibling-shapes.fungi");
    assert.ok(unresolvedMembers(wat).includes("name"), "non-prefix .name must stay fail-closed");
  });

  it("interpreter≡WASM: Array<Auto> PolicyDecl name+permittedEffects loads return the same Int", async () => {
    const src = POLICY_GUARD + `
pure flow probe() -> Int
contract { effects {} }
{
  let p = PolicyDecl { name: "dom", permittedEffects: Array.empty() }
  mut policies: Array<Auto> = Array.empty()
  policies = policies.append(p)
  match policies.get(0) {
    Some(pol) => {
      let n: String = pol.name
      let fx: Array<Auto> = pol.permittedEffects
      return fx.count() + 1
    }
    None => { return -1 }
    _ => { return -2 }
  }
}
`;
    const prog = L.parseProgram(`@version 1\n${src}`, "j5-probe-parity.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, "parse errors: " + JSON.stringify(errs.slice(0, 3)));
    const fx = L.checkEffects(prog.flows, prog.ast);
    const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "j5-probe-parity", prog.ast, true));
    assert.deepEqual(unresolvedMembers(wat).filter((m) => m === "name" || m === "permittedEffects"), []);
    const interp = await L.executeFlow("probe", new Map(), prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
    const interpN = finiteNumber(interp, "j5 interp probe");
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
    const wasmN = finiteNumber(instance.exports.probe(), "j5 wasm probe");
    assert.equal(wasmN, interpN);
    assert.equal(wasmN, 1);
  });
});
