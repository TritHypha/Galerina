import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";

const GRANT = "FUNGI-WASM-GRANT-001";

function moduleImporting(mod, name) {
  return `(module (import "${mod}" "${name}" (func $fx (param i32 i32) (result i32)))
    (func $call (param $a i32) (param $b i32) (result i32) (call $fx (local.get $a) (local.get $b)))
    (export "call" (func $call)))`;
}

async function admissionOptions(wat, host) {
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  const keys = L.generateRunnerKeypair();
  const attestation = L.signWasm(assembled.wasm, keys.privateKeyPem, "dev");
  return {
    wasm: assembled.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem: keys.publicKeyPem },
    host,
  };
}

async function admit(wat, host) {
  return L.admitAndInstantiate(await admissionOptions(wat, host));
}

describe("closed non-secret WASM effect-grant ABI", () => {
  it("exposes only the frozen audit grant signatures", () => {
    const abi = L.WASM_EFFECT_GRANT_ABI;
    assert.equal(Object.isFrozen(abi), true);
    assert.deepEqual(abi.map((entry) => entry.name), ["audit.write", "audit.log"]);
    for (const entry of abi) {
      assert.equal(Object.isFrozen(entry), true);
      assert.equal(entry.module, "host");
      assert.equal(entry.effect, "audit.write");
      assert.deepEqual([...entry.params], ["i32", "i32"]);
      assert.deepEqual([...entry.results], ["i32"]);
    }
    assert.equal(L.FUNGI_WASM_GRANT_001.code, GRANT);
  });

  it("admits and invokes allow-listed grants", async () => {
    const calls = [];
    const host = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push([a, b]); return 7; } },
    });
    const { instance } = await admit(moduleImporting("host", "audit.write"), host);
    assert.equal(instance.exports.call(3, 4), 7);
    assert.deepEqual(calls, [[3, 4]]);
  });

  it("refuses an allow-listed import with mismatched parameter types before the host callback can run", async () => {
    const calls = [];
    const host = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push([a, b]); return 7; } },
    });
    const wrongSignature = `(module
      (import "host" "audit.write" (func $fx (param i64 i64) (result i32)))
      (func (export "call") (param $a i64) (param $b i64) (result i32)
        (call $fx (local.get $a) (local.get $b)))
    )`;

    await assert.rejects(admit(wrongSignature, host), (error) => {
      assert.match(error.message, /CRITICAL_SECURITY_VIOLATION/);
      return true;
    });
    assert.deepEqual(calls, []);
  });

  it("refuses an allow-listed import with a mismatched arity before the host callback can run", async () => {
    const calls = [];
    const host = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push([a, b]); return 7; } },
    });
    const wrongArity = `(module
      (import "host" "audit.write" (func $fx (param i32) (result i32)))
      (func (export "call") (param $value i32) (result i32)
        (call $fx (local.get $value)))
    )`;

    await assert.rejects(admit(wrongArity, host), /expected type/i);
    assert.deepEqual(calls, []);
  });

  it("refuses an allow-listed import with a mismatched result type before the host callback can run", async () => {
    const calls = [];
    const host = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push([a, b]); return 7; } },
    });
    const wrongResult = `(module
      (import "host" "audit.write" (func $fx (param i32 i32) (result i64)))
      (func (export "call") (param $a i32) (param $b i32) (result i64)
        (call $fx (local.get $a) (local.get $b)))
    )`;

    await assert.rejects(admit(wrongResult, host), /expected type/i);
    assert.deepEqual(calls, []);
  });

  it("refuses an allow-listed effect name imported as a non-function before instantiation", async () => {
    const calls = [];
    const host = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push([a, b]); return 7; } },
    });
    const wrongKind = `(module
      (import "host" "audit.write" (global i32))
      (func (export "call") (result i32) (i32.const 0))
    )`;

    await assert.rejects(
      admit(wrongKind, host),
      /effect grant import kind mismatch: host\.audit\.write is declared global, expected function/i,
    );
    assert.deepEqual(calls, []);
  });

  it("freezes factory-created host imports against post-creation replacement", () => {
    const host = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": () => 7 },
    });

    assert.equal(Object.isFrozen(host), true);
    assert.equal(Object.isFrozen(host.imports), true);
    assert.equal(Object.isFrozen(host.imports.host), true);
    assert.throws(() => {
      host.imports.host["audit.write"] = () => 99;
    }, TypeError);
  });

  it("refuses a substituted non-factory host before guest start or callbacks", async () => {
    const calls = [];
    const factoryHost = L.createHostRuntime();
    const substitutedHost = {
      ...factoryHost,
      imports: {
        host: {
          "audit.write": (...args) => { calls.push(args); return 99; },
        },
      },
    };
    const startModule = `(module
      (import "host" "audit.write" (func $fx (param i32 i32) (result i32)))
      (func $start (call $fx (i32.const 1) (i32.const 2)) drop)
      (start $start)
    )`;

    await assert.rejects(admit(startModule, substitutedHost), /host runtime was not created by createHostRuntime/i);
    assert.deepEqual(calls, []);
  });

  it("retains the captured factory host when options change during compilation", async (t) => {
    const calls = [];
    const original = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push(["original", a, b]); return 7; } },
    });
    const replacement = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push(["replacement", a, b]); return 99; } },
    });
    const options = await admissionOptions(moduleImporting("host", "audit.write"), original);
    const compile = WebAssembly.compile;
    let compileCalls = 0;
    t.mock.method(WebAssembly, "compile", async (...args) => {
      compileCalls++;
      const compiled = await Reflect.apply(compile, WebAssembly, args);
      options.host = replacement;
      return compiled;
    });
    const result = await L.admitAndInstantiate(options);
    assert.equal(compileCalls, 1, "exercise the asynchronous compile boundary");
    assert.equal(result.host, original);
    assert.equal(result.instance.exports.call(3, 4), 7);
    assert.deepEqual(calls, [["original", 3, 4]]);
  });

  it("reads a changing host accessor once and uses that identity throughout admission", async () => {
    const calls = [];
    const original = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push(["original", a, b]); return 7; } },
    });
    const replacement = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push(["replacement", a, b]); return 99; } },
    });
    const options = await admissionOptions(moduleImporting("host", "audit.write"), original);
    let reads = 0;
    Object.defineProperty(options, "host", { get() { return ++reads === 1 ? original : replacement; } });
    const result = await L.admitAndInstantiate(options);
    assert.equal(reads, 1);
    assert.equal(result.host, original);
    assert.equal(result.instance.exports.call(3, 4), 7);
    assert.deepEqual(calls, [["original", 3, 4]]);
  });

  it("observes a positive start control and refuses mismatched imports before start", async () => {
    const calls = [];
    const host = L.createHostRuntime(undefined, {
      effectHandlers: {
        "audit.write": (a, b) => { calls.push(["write", a, b]); return 7; },
        "audit.log": (a, b) => { calls.push(["log", a, b]); return 8; },
      },
    });
    const validStart = `(module
      (import "host" "audit.log" (func $fx (param i32 i32) (result i32)))
      (func $start (call $fx (i32.const 1) (i32.const 2)) drop)
      (start $start)
    )`;
    const admitted = await admit(validStart, host);
    assert.deepEqual(calls, [["log", 1, 2]]);

    calls.length = 0;
    const mismatchedStart = `(module
      (import "host" "audit.write" (func $wrong (param i64 i64) (result i32)))
      (import "host" "audit.log" (func $right (param i32 i32) (result i32)))
      (func $start (call $right (i32.const 3) (i32.const 4)) drop)
      (start $start)
    )`;
    await assert.rejects(admit(mismatchedStart, host), /expected type/i);
    assert.deepEqual(calls, []);
    assert.ok(admitted.instance);
  });

  it("refuses secret and unknown grants before host creation", () => {
    for (const name of ["secret.read", "env.get", "vault.read", "crypto.sign", "random.bytes", "unknown.effect"]) {
      assert.throws(() => L.createHostRuntime(undefined, { effectHandlers: { [name]: () => 0 } }), new RegExp(GRANT));
    }
    assert.throws(() => L.createHostRuntime(undefined, { effectHandlers: { "audit.write": 1 } }), new RegExp(GRANT));
  });

  it("refuses ungranted/unknown-module imports but admits a pure module", async () => {
    const host = L.createHostRuntime();
    await assert.rejects(admit(moduleImporting("host", "audit.write"), host), /import host\.audit\.write \(function\) is not provided/);
    await assert.rejects(admit(moduleImporting("evil", "audit.write"), host), /import evil\.audit\.write \(function\) is not provided/);
    const { instance } = await admit(`(module (func $f (result i32) (i32.const 5)) (export "f" (func $f)))`, host);
    assert.equal(instance.exports.f(), 5);
  });

  it("continues refusing effectful Fungi entrypoints", () => {
    const src = `pure flow ok(x: Int) -> Int
contract { effects {} }
{ return x }
flow fx(x: Int) -> Int
contract { effects { audit.write } }
{ return x }
`;
    const parsed = L.parseProgram(src, "d8t5.fungi");
    assert.equal(parsed.diagnostics.length, 0);
    assert.ok(parsed.flows.length > 0);
    const effects = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, effects);
    assert.throws(
      () => L.renderWAT(L.buildWATModuleFromGIR({ ...gir, entryPoints: ["fx"] }, undefined, "d8t5", parsed.ast, false)),
      /FUNGI-WAT-EFFECT-001/,
    );
  });
});
