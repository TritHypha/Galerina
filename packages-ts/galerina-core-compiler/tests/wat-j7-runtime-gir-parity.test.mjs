/**
 * J7 / E2d — interpreter≡WASM on newly lowered runtime bodies after stage-declaration
 * composition (six GIR records from gir-emitter.fungi visible to runtime.fungi).
 *
 * Probes: evalGIRExpr, execGIRBody, lookupFlow, countK3Arm, findK3Arm, runProgram.
 * Combined module is lexer+parser+gir-emitter+runtime+driver (same Option-Y concat as
 * wat-p9-runtime-exec-parity). No wat-emitter.ts change.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import * as L from "../dist/index.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const strip = (p) => {
  let s = readFileSync(join(__dir, "../src/self-hosted", p), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

const DRIVER = `
pure flow j7EvalConst() -> Int
contract { intent { "J7: evalGIRExpr const Int 7" } }
{
  let expr: GIRExpr = GIRExpr { op: "const", ty: "Int", value: "7", kids: Array.empty() }
  let v: RtValue = evalGIRExpr(expr, Array.empty(), Array.empty())
  return v.i
}

pure flow j7ExecRet() -> Int
contract { intent { "J7: execGIRBody single ret const 5" } }
{
  let expr: GIRExpr = GIRExpr { op: "const", ty: "Int", value: "5", kids: Array.empty() }
  mut exprs: Array<GIRExpr> = Array.empty()
  exprs = exprs.append(expr)
  let stmt: GIRStmt = GIRStmt { op: "ret", name: "", name2: "", expr: exprs, body: Array.empty(), elseBody: Array.empty() }
  mut stmts: Array<GIRStmt> = Array.empty()
  stmts = stmts.append(stmt)
  let r: ExecResult = execGIRBody(stmts, Array.empty(), Array.empty())
  let rv: RtValue = r.retVal
  return rv.i
}

pure flow j7LookupMain() -> Int
contract { intent { "J7: lookupFlow finds main" } }
{
  mut flows: Array<FlowEntry> = Array.empty()
  let e: FlowEntry = FlowEntry { name: "main", params: Array.empty(), body: Array.empty(), qualifier: "pure", paramTypes: Array.empty(), returnType: "Int", effects: Array.empty() }
  flows = flows.append(e)
  let hit: FlowEntry = lookupFlow(flows, "main")
  if hit.name == "main" { return 1 }
  return 0
}

pure flow j7CountSome() -> Int
contract { intent { "J7: countK3Arm counts Some exactly once" } }
{
  mut arms: Array<GIRStmt> = Array.empty()
  let a: GIRStmt = GIRStmt { op: "k3_arm", name: "Some", name2: "", expr: Array.empty(), body: Array.empty(), elseBody: Array.empty() }
  let b: GIRStmt = GIRStmt { op: "k3_arm", name: "None", name2: "", expr: Array.empty(), body: Array.empty(), elseBody: Array.empty() }
  arms = arms.append(a)
  arms = arms.append(b)
  return countK3Arm(arms, "Some")
}

pure flow j7FindSome() -> Int
contract { intent { "J7: findK3Arm returns the Some arm" } }
{
  mut arms: Array<GIRStmt> = Array.empty()
  let a: GIRStmt = GIRStmt { op: "k3_arm", name: "Some", name2: "x", expr: Array.empty(), body: Array.empty(), elseBody: Array.empty() }
  let b: GIRStmt = GIRStmt { op: "k3_arm", name: "None", name2: "", expr: Array.empty(), body: Array.empty(), elseBody: Array.empty() }
  arms = arms.append(a)
  arms = arms.append(b)
  let found: GIRStmt = findK3Arm(arms, "Some")
  if found.name == "Some" {
    if found.name2 == "x" { return 1 }
  }
  return 0
}

pure flow runtimeProbe(src: String) -> Int
contract { intent { "J7: runProgram via buildFlowTable on source main" } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => {
      let p = parseFlows(toks)
      let table = buildFlowTable(p.flows)
      let rr = runProgram(table, "main", Array.empty())
      let rv: RtValue = rr.retVal
      return rv.i
    }
    Err(e) => { return -1 }
  }
}
`;

const SRC = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + "\n"
  + strip("gir-emitter.fungi") + "\n" + strip("runtime.fungi") + "\n" + DRIVER;

const prog = L.parseProgram(SRC, "j7-lexer-parser-giremit-runtime.fungi");
const parseErrs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const WAT = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "j7-runtime", prog.ast, true));

function unresolvedMembers(wat) {
  return [...wat.matchAll(/unresolved member: (\S+)/g)].map((m) => m[1]);
}

async function interpFlow(name) {
  const res = await L.executeFlow(name, new Map(), prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  return Number(res?.value?.value ?? res?.value ?? res);
}

let wasmCtx = null;
async function ensureWasm() {
  if (wasmCtx) return wasmCtx;
  const asm = await L.assembleWAT(WAT);
  assert.ok(asm.valid && (asm.diagnostics ?? []).length === 0,
    "J7 combined WAT assembles: " + JSON.stringify(asm.diagnostics));
  const host = L.createHostRuntime();
  let maxH = 0;
  for (const e of L.getInternedStrings()) {
    host.seedString(e.handle, e.value);
    if (e.handle > maxH) maxH = e.handle;
  }
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
  });
  wasmCtx = { host, instance, nextH: maxH + 1 };
  return wasmCtx;
}

async function wasmFlow(name) {
  const ctx = await ensureWasm();
  const fn = ctx.instance.exports[name];
  assert.equal(typeof fn, "function", `${name} exported`);
  return Number(fn());
}

async function interpRunProgram(src) {
  const args = new Map([["src", { __tag: "string", value: src }]]);
  const res = await L.executeFlow("runtimeProbe", args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });
  return Number(res?.value?.value ?? res?.value ?? res);
}

async function wasmRunProgram(src) {
  const ctx = await ensureWasm();
  const fn = ctx.instance.exports.runtimeProbe;
  assert.equal(typeof fn, "function", "runtimeProbe exported");
  const srcH = ctx.nextH++;
  ctx.host.seedString(srcH, src);
  return Number(fn(srcH));
}

const PROBES = [
  { name: "j7EvalConst", want: 7 },
  { name: "j7ExecRet", want: 5 },
  { name: "j7LookupMain", want: 1 },
  { name: "j7CountSome", want: 1 },
  { name: "j7FindSome", want: 1 },
];

describe("J7 runtime GIR stage-declaration interp≡WASM", () => {
  it("combined source parses clean", () => {
    assert.equal(parseErrs.length, 0,
      `parse: ${parseErrs[0]?.code ?? ""} ${parseErrs[0]?.message ?? ""}`);
  });

  it("six runtime bodies have no unresolved GIR members", () => {
    const members = unresolvedMembers(WAT);
    const girMembers = ["op", "ty", "value", "kids", "name", "name2", "expr", "body", "elseBody", "params", "qualifier", "paramTypes", "returnType", "effects"];
    const inRuntime = members.filter((m) => girMembers.includes(m));
    assert.deepEqual(inRuntime, [], "GIR record fields must lower: " + inRuntime.join(","));
  });

  for (const { name, want } of PROBES) {
    it(`interp≡WASM ${name} == ${want}`, async () => {
      const [i, w] = await Promise.all([interpFlow(name), wasmFlow(name)]);
      assert.equal(i, want, `interpreter ${name}`);
      assert.equal(w, i, `WASM ${name} == interpreter`);
    });
  }

  it("interp≡WASM runProgram return 3+4 == 7", async () => {
    const src = "pure flow main() -> Int\ncontract { intent { \"x\" } }\n{ return 3 + 4 }";
    const [i, w] = await Promise.all([interpRunProgram(src), wasmRunProgram(src)]);
    assert.equal(i, 7, "interpreter runProgram 3+4");
    assert.equal(w, i, "WASM runProgram == interpreter");
  });
});
