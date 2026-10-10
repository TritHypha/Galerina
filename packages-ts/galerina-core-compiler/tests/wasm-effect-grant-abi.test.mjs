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

// Observe the real engine call; never manufacture its result or failure.
async function observeAdmission(t, options) {
  const compile = WebAssembly.compile;
  const instantiate = WebAssembly.instantiate;
  const observation = { compiled: [], attempts: [], result: undefined, error: undefined };
  const compileMock = t.mock.method(WebAssembly, "compile", async (...args) => {
    const module = await Reflect.apply(compile, WebAssembly, args);
    observation.compiled.push({ module, bytes: new Uint8Array(args[0]) });
    return module;
  });
  const instantiateMock = t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const attempt = { args, result: undefined, error: undefined };
    observation.attempts.push(attempt);
    try {
      attempt.result = await Reflect.apply(instantiate, WebAssembly, args);
      return attempt.result;
    } catch (error) {
      attempt.error = error;
      throw error;
    }
  });
  try {
    observation.result = await L.admitAndInstantiate(options);
  } catch (error) {
    observation.error = error;
  } finally {
    instantiateMock.mock.restore();
    compileMock.mock.restore();
    assert.equal(WebAssembly.instantiate, instantiate, "restore the instantiate observer");
    assert.equal(WebAssembly.compile, compile, "restore the compile observer");
  }
  return observation;
}

function assertObservedLink(observation, options) {
  assert.equal(observation.compiled.length, 1, "one real compilation");
  const { module, bytes } = observation.compiled[0];
  assert.ok(module instanceof WebAssembly.Module);
  assert.deepEqual(bytes, new Uint8Array(options.wasm), "compile the signed guest bytes");
  assert.equal(observation.attempts.length, 1, "one real instantiation attempt");
  const attempt = observation.attempts[0];
  assert.equal(attempt.args.length, 2);
  assert.equal(attempt.args[0], module, "instantiate the exact compiled module");
  assert.equal(attempt.args[1], options.host.imports, "use the exact factory imports");
  return attempt;
}

function assertSignatureRefusal(observation, options, calls, callbackCount) {
  const attempt = assertObservedLink(observation, options);
  assert.ok(attempt.error instanceof WebAssembly.LinkError, "engine must report LinkError");
  assert.equal(attempt.result, undefined, "engine must not instantiate");
  assert.equal(observation.result, undefined, "admission must not succeed");
  assert.ok(observation.error instanceof Error);
  assert.match(observation.error.message, /^CRITICAL_SECURITY_VIOLATION: module import\/link failed:/);
  assert.equal(callbackCount, 0, "no start callback before failed linking");
  assert.deepEqual(calls, []);
}

function startGrantModule(signature, a, b) {
  return `(module
    (import "host" "audit.write" (func $write ${signature}))
    (import "host" "audit.log" (func $log (param i32 i32) (result i32)))
    (func $start (drop (call $log (i32.const ${a}) (i32.const ${b}))))
    (start $start))`;
}

async function assertSignatureTwins(t, signature, a = 1, b = 2) {
  const calls = [];
  let callbackCount = 0;
  const host = L.createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": (x, y) => { callbackCount++; calls.push(["write", x, y]); return 7; },
      "audit.log": (x, y) => { callbackCount++; calls.push(["log", x, y]); return 8; },
    },
  });
  const options = await admissionOptions(startGrantModule(signature, a, b), host);
  const refused = await observeAdmission(t, options);
  assertSignatureRefusal(refused, options, calls, callbackCount);
  const acceptedOptions = await admissionOptions(startGrantModule("(param i32 i32) (result i32)", a, b), host);
  const accepted = await observeAdmission(t, acceptedOptions);
  const attempt = assertObservedLink(accepted, acceptedOptions);
  assert.equal(attempt.error, undefined);
  assert.ok(attempt.result instanceof WebAssembly.Instance);
  assert.equal(accepted.error, undefined);
  assert.ok(accepted.result.instance instanceof WebAssembly.Instance);
  assert.equal(accepted.result.host, host);
  assert.deepEqual(WebAssembly.Module.imports(refused.compiled[0].module), WebAssembly.Module.imports(accepted.compiled[0].module), "twins have the same import roster");
  assert.equal(callbackCount, 1, "exactly one independently counted start callback");
  assert.deepEqual(calls, [["log", a, b]]);
  return { refused, options };
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

  it("refuses an allow-listed import with mismatched parameter types before the host callback can run", async (t) => {
    await assertSignatureTwins(t, "(param i64 i64) (result i32)");
  });

  it("refuses an allow-listed import with a mismatched arity before the host callback can run", async (t) => {
    await assertSignatureTwins(t, "(param i32) (result i32)");
  });

  it("refuses an allow-listed import with a mismatched result type before the host callback can run", async (t) => {
    await assertSignatureTwins(t, "(param i32 i32) (result i64)");
  });

  it("rejects synthetic invalid observation records with the same signature-refusal oracle", async (t) => {
    const { refused, options } = await assertSignatureTwins(t, "(param i64 i64) (result i32)");
    // A real observation is the positive oracle control; the following records
    // are synthetic perturbations, NOT engine fault-injection evidence.
    const check = record => assertSignatureRefusal(record, options, [], 0);
    assert.doesNotThrow(() => check(refused));
    const attempt = refused.attempts[0];
    const invalid = [
      ["pre-instantiation generic critical refusal", { ...refused, compiled: [], attempts: [], error: new Error("CRITICAL_SECURITY_VIOLATION: synthetic attestation refusal before compilation") }],
      ["observed non-LinkError", { ...refused, attempts: [{ ...attempt, error: new Error("synthetic non-link failure") }] }],
      ["unexpected successful admission", { ...refused, result: { instance: {} } }],
      ["wrong compiled module identity", { ...refused, attempts: [{ ...attempt, args: [{}, options.host.imports] }] }],
      ["wrong factory imports identity", { ...refused, attempts: [{ ...attempt, args: [attempt.args[0], {}] }] }],
      ["wrong public failure phase", { ...refused, error: new Error("CRITICAL_SECURITY_VIOLATION: instantiation failed: synthetic failure") }],
    ];
    for (const [label, record] of invalid) {
      assert.throws(() => check(record), { code: "ERR_ASSERTION" }, label);
    }
    assert.throws(() => assertSignatureRefusal(refused, options, [["log", 1, 2]], 1), { code: "ERR_ASSERTION" });
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

  it("observes a positive start control and refuses mismatched imports before start", async (t) => {
    const compile = WebAssembly.compile;
    const instantiate = WebAssembly.instantiate;
    await assertSignatureTwins(t, "(param i64 i64) (result i32)", 3, 4);
    assert.equal(WebAssembly.compile, compile);
    assert.equal(WebAssembly.instantiate, instantiate);
    // An unobserved admission still reaches the original engine after both paths.
    const { instance } = await admit(`(module (func (export "f") (result i32) (i32.const 5)))`, L.createHostRuntime());
    assert.equal(instance.exports.f(), 5);
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
