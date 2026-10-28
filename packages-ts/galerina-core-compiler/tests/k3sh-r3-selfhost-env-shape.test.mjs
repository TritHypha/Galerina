/**
 * K3-SH r3 leftover pin: the 10:55 GMT work-driver counts (bootstrap 17,
 * i3-corpus 5, pipeline 8, runtime 6) were envLookup/envBind calling
 * env.count/get/append, which the interpreter classifies as secret.read.
 * That rename is already on main 19e061568 (start-sha ancestor). Remaining
 * `env: Array<Binding>` parameters (runGIRBody, evalGIRExpr, execGIRBody)
 * are the GIR binding table, not Env-namespace methods; harnesses must keep
 * the executeFlow key `env` while runtime.fungi:1108 names that param `env`.
 * Replay: node --test --test-reporter=tap tests/k3sh-r3-selfhost-env-shape.test.mjs
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const DIR = dirname(fileURLToPath(import.meta.url));
const SH = join(DIR, "../src/self-hosted");
const TESTS = DIR;

function load(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}

function stripComments(line) {
  const slash = line.indexOf("//");
  const semi = line.indexOf(";;");
  const cut = [slash, semi].filter((n) => n >= 0);
  const noComment = cut.length > 0 ? line.slice(0, Math.min(...cut)) : line;
  return noComment.replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

const SECRET_READ_RECEIVER = /(^|[^A-Za-z0-9_.])(Env|env|vault|Secrets)\.[A-Za-z_]/;

describe("K3-SH r3 self-hosted env shape", () => {
  it("runtime.fungi envLookup/envBind take bindings, not env.methods", () => {
    const src = load(join(SH, "runtime.fungi"));
    assert.equal(src.includes("pure flow envLookup(bindings: Array<Binding>, name: String) -> RtValue"), true);
    assert.equal(src.includes("pure flow envBind(bindings: Array<Binding>, name: String, v: RtValue) -> Array<Binding>"), true);
    assert.equal(src.includes("while i < bindings.count()"), true);
    assert.equal(src.includes("let bOpt = bindings.get(i)"), true);
    assert.equal(src.includes("return bindings.append(Binding { name: name, val: v })"), true);
  });

  it("runGIRBody still names the Binding table param env (runtime.fungi:1108)", () => {
    const src = load(join(SH, "runtime.fungi"));
    assert.equal(src.includes("pure flow runGIRBody(stmts: Array<GIRStmt>, env: Array<Binding>) -> RtValue"), true);
    assert.equal(src.includes("let res: ExecResult = execGIRBody(stmts, env, Array.empty())"), true);
  });

  it("type-checker.fungi resolveStatic/resolveBitfieldAccess stay off env.", () => {
    const src = load(join(SH, "type-checker.fungi"));
    assert.equal(src.includes("pure flow resolveStatic(statics: StaticEnv, name: String) -> String"), true);
    assert.equal(src.includes("pure flow resolveBitfieldAccess(bitfields: BitfieldEnv, register: String, field: String) -> Int"), true);
  });

  it("no self-hosted .fungi source uses a secret.read receiver", () => {
    const hits = [];
    for (const name of readdirSync(SH).filter((f) => f.endsWith(".fungi")).sort()) {
      const lines = load(join(SH, name)).split(/\r?\n/);
      lines.forEach((line, index) => {
        if (SECRET_READ_RECEIVER.test(stripComments(line))) {
          hits.push(`${name}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    assert.deepEqual(hits, []);
  });

  it("runtime harness passes executeFlow key env to runGIRBody", () => {
    const src = load(join(TESTS, "self-hosted-runtime.test.mjs"));
    assert.equal(src.includes("\"runGIRBody\", new Map([[\"stmts\", vList(stmts)], [\"env\", vList(env)]])"), true);
    assert.equal(src.includes("[\"env\", vList([])],"), true);
  });

  it("pipeline harness passes executeFlow key env to runGIRBody", () => {
    const src = load(join(TESTS, "self-hosted-pipeline.test.mjs"));
    assert.equal(
      src.includes("await executeFlow(\"runGIRBody\", new Map([[\"stmts\", stmts], [\"env\", vList(env)]]), runtime.ast)"),
      true,
    );
  });

  it("env-receiver harness calls envBind/envLookup with bindings", () => {
    const src = load(join(TESTS, "self-hosted-env-receiver.test.mjs"));
    assert.equal(src.includes("[\"bindings\", emptyList]"), true);
    assert.equal(src.includes("\"envBind\""), true);
    assert.equal(src.includes("\"envLookup\""), true);
  });
});
