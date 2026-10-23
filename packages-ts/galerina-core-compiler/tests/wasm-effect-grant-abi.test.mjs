import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";
import { WAT_HEAP_BASE } from "@galerina/core-runtime-wasm";

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
  assert.notEqual(attempt.args[1], options.host.imports, "instantiate through the admission-scoped import view");
  const importedHost = attempt.args[1]?.host;
  assert.ok(importedHost && typeof importedHost === "object", "provide the host namespace through the admission view");
  assert.notEqual(
    importedHost["audit.write"],
    options.host.imports.host["audit.write"],
    "the effect handler is wrapped by the per-instantiation gate",
  );
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
    (func $start)
    (start $start)
    (func $call (result i32) (call $log (i32.const ${a}) (i32.const ${b})))
    (export "call" (func $call)))`;
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
  const acceptedHost = L.createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": (x, y) => { callbackCount++; calls.push(["write", x, y]); return 7; },
      "audit.log": (x, y) => { callbackCount++; calls.push(["log", x, y]); return 8; },
    },
  });
  const acceptedOptions = await admissionOptions(startGrantModule("(param i32 i32) (result i32)", a, b), acceptedHost);
  const accepted = await observeAdmission(t, acceptedOptions);
  const attempt = assertObservedLink(accepted, acceptedOptions);
  assert.equal(attempt.error, undefined);
  assert.ok(attempt.result instanceof WebAssembly.Instance);
  assert.equal(accepted.error, undefined);
  assert.ok(accepted.result.instance instanceof WebAssembly.Instance);
  assert.equal(accepted.result.host, acceptedHost);
  assert.deepEqual(WebAssembly.Module.imports(refused.compiled[0].module), WebAssembly.Module.imports(accepted.compiled[0].module), "twins have the same import roster");
  assert.equal(callbackCount, 0, "initialization performs no granted effect");
  assert.equal(accepted.result.instance.exports.call(), 8, "an explicit post-admission call can use the grant");
  assert.equal(callbackCount, 1);
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

  it("refuses an allow-listed effect name imported as a non-function before instantiation", async (t) => {
    const calls = [];
    const host = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push([a, b]); return 7; } },
    });
    const wrongKind = `(module
      (import "host" "audit.write" (global i32))
      (func (export "call") (result i32) (i32.const 0))
    )`;

    const observation = await observeAdmission(t, await admissionOptions(wrongKind, host));
    assert.equal(observation.compiled.length, 1, "the signed module is compiled for import inspection");
    assert.equal(observation.attempts.length, 0, "refusal occurs before WebAssembly.instantiate");
    assert.match(
      observation.error?.message ?? "",
      /CRITICAL_SECURITY_VIOLATION: module import\/link failed: unsupported host import kind: host\.audit\.write is global, expected function/i,
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

  it("does not let two admitted modules share one mutable host registry", async () => {
    const host = L.createHostRuntime();
    const handle = host.internArray([12345]);
    const reader = `(module
      (import "host" "__array_get" (func $get (param i32 i32) (result i32)))
      (func (export "read") (param $id i32) (result i32)
        (call $get (local.get $id) (i32.const 0)))
    )`;
    const first = await admit(reader, host);
    assert.equal(first.instance.exports.read(handle), 12345);

    await assert.rejects(admit(reader, host), /host runtime is already claimed or consumed/i);

    const isolated = await admit(reader, L.createHostRuntime());
    assert.equal(isolated.instance.exports.read(handle), -1, "a distinct admission cannot read the first host's array handle");
  });

  it("quarantines guest-memory access when export finalization fails after instantiation", async (t) => {
    const host = L.createHostRuntime();
    assert.equal(host.snapshotMemory(), null, "the host begins without a guest-memory binding");
    const options = await admissionOptions(`(module
      (memory (export "memory") 1)
      (func (export "ready") (result i32) (i32.const 1))
    )`, host);

    const instantiate = WebAssembly.instantiate;
    const entries = Object.entries;
    let genuineInstance;
    let entriesMock;
    let observedFinalization = false;
    const instantiateMock = t.mock.method(WebAssembly, "instantiate", async (...args) => {
      const instance = await Reflect.apply(instantiate, WebAssembly, args);
      genuineInstance = instance;
      entriesMock = t.mock.method(Object, "entries", (value) => {
        if (value === instance.exports) {
          observedFinalization = true;
          assert.equal(host.snapshotMemory(), null, "guest memory is not bound until export finalization succeeds");
          throw new Error("controlled export-finalization failure");
        }
        return Reflect.apply(entries, Object, [value]);
      });
      return instance;
    });
    try {
      await assert.rejects(
        L.admitAndInstantiate(options),
        /CRITICAL_SECURITY_VIOLATION: admission finalization failed: controlled export-finalization failure/i,
      );
    } finally {
      entriesMock?.mock.restore();
      instantiateMock.mock.restore();
    }
    assert.ok(genuineInstance instanceof WebAssembly.Instance, "fault injection follows real engine instantiation");
    assert.equal(observedFinalization, true, "the failure occurs while export wrappers are being finalized");
    assert.throws(
      () => host.snapshotMemory(),
      /FUNGI-WASM-QUARANTINED-001:.*snapshotMemory refused.*quarantin/i,
      "a rejected instance leaves the host quarantined rather than exposing memory for inspection",
    );
    await assert.rejects(admit(`(module (func (export "ready")))`, host), /host runtime is already claimed or consumed/i);
  });

  it("does not allow callers to attach or replace memory after admission", async () => {
    const emptyHost = L.createHostRuntime();
    await admit(`(module (func (export "ready")))`, emptyHost);
    assert.throws(
      () => emptyHost.bindMemory(new WebAssembly.Memory({ initial: 1 })),
      /cannot add memory after host admission/i,
    );

    const memoryHost = L.createHostRuntime();
    const admitted = await admit(
      `(module (memory (export "memory") 1) (data (i32.const 0) "\\2a\\00\\00\\00"))`,
      memoryHost,
    );
    const initialSnapshot = memoryHost.snapshotMemory();
    assert.ok(initialSnapshot instanceof Uint8Array, "successful admission binds snapshot-visible guest memory");
    assert.equal(initialSnapshot[0], 0x2a, "snapshot reads the admitted guest's initialized memory, not a detached replacement");
    initialSnapshot[0] = 0;
    assert.equal(memoryHost.snapshotMemory()?.[0], 0x2a, "snapshot mutation cannot alter guest memory");
    assert.throws(
      () => memoryHost.bindMemory(admitted.instance.exports.memory),
      /cannot change memory after host admission/i,
      "the public export wrapper cannot replace the internally bound guest memory",
    );
    assert.throws(
      () => memoryHost.bindMemory(new WebAssembly.Memory({ initial: 1 })),
      /cannot change memory after host admission/i,
    );
  });

  it("refuses admission of a host whose memory was bound outside the gate", async () => {
    const host = L.createHostRuntime();
    host.bindMemory(new WebAssembly.Memory({ initial: 1 }));
    await assert.rejects(
      admit(`(module (func (export "ready")))`, host),
      /pre-bound outside admission/i,
    );
  });

  it("observes signature refusal before start and preserves explicit post-admission calls", async (t) => {
    const compile = WebAssembly.compile;
    const instantiate = WebAssembly.instantiate;
    await assertSignatureTwins(t, "(param i64 i64) (result i32)", 3, 4);
    assert.equal(WebAssembly.compile, compile);
    assert.equal(WebAssembly.instantiate, instantiate);
    // An unobserved admission still reaches the original engine after both paths.
    const { instance } = await admit(`(module (func (export "f") (result i32) (i32.const 5)))`, L.createHostRuntime());
    assert.equal(instance.exports.f(), 5);
  });

  it("refuses a granted effect invoked by the module start function", async (t) => {
    const calls = [];
    const host = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.write": (a, b) => { calls.push([a, b]); return 7; } },
    });
    const options = await admissionOptions(startGrantModule(
      "(param i32 i32) (result i32)", 3, 4,
    ).replace("(func $start)", "(func $start (drop (call $log (i32.const 3) (i32.const 4))))"), host);
    const observed = await observeAdmission(t, options);
    assertObservedLink(observed, options);
    assert.ok(observed.error instanceof Error);
    assert.match(observed.error.message, /instantiation failed: host effect host\.audit\.log invoked before module admission completed/);
    assert.equal(observed.result, undefined);
    assert.deepEqual(calls, [], "the start function cannot escape a granted callback");
  });

  it("refuses secret and unknown grants before host creation", () => {
    for (const name of ["secret.read", "env.get", "vault.read", "crypto.sign", "random.bytes", "unknown.effect"]) {
      assert.throws(() => L.createHostRuntime(undefined, { effectHandlers: { [name]: () => 0 } }), new RegExp(GRANT));
    }
    assert.throws(() => L.createHostRuntime(undefined, { effectHandlers: { "audit.write": 1 } }), new RegExp(GRANT));
  });

  it("refuses ungranted/unknown-module imports but admits a pure module", async () => {
    await assert.rejects(admit(moduleImporting("host", "audit.write"), L.createHostRuntime()), /import host\.audit\.write \(function\) is not provided/);
    await assert.rejects(admit(moduleImporting("evil", "audit.write"), L.createHostRuntime()), /import evil\.audit\.write \(function\) is not provided/);
    const { instance } = await admit(`(module (func $f (result i32) (i32.const 5)) (export "f" (func $f)))`, L.createHostRuntime());
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

  it("refuses an accessor-backed profile that changes between policy and signature checks", () => {
    const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    const keys = L.generateRunnerKeypair();
    const signedDev = L.signWasm(wasm, keys.privateKeyPem, "dev");
    let profileReads = 0;
    const changingAttestation = Object.create(null, {
      sha256: { value: signedDev.sha256, enumerable: true },
      signature: { value: signedDev.signature, enumerable: true },
      profile: {
        enumerable: true,
        get() {
          profileReads += 1;
          return profileReads === 1 ? "certified" : "dev";
        },
      },
    });

    const verdict = L.verifyWasm(wasm, changingAttestation, {
      requireSigned: true,
      publicKeyPem: keys.publicKeyPem,
      requireCertifiedProfile: true,
    });

    assert.equal(verdict.ok, false, "the signed dev claim must not satisfy certified admission");
    assert.equal(profileReads, 0, "accessor-backed authority is refused without executing it");
  });

  it("quarantines an admitted instance after owned-memory cleanup fails", async () => {
    const calls = [];
    const host = L.createHostRuntime(undefined, {
      effectHandlers: { "audit.log": (a, b) => { calls.push([a, b]); return 1; } },
    });
    const heapBase = WAT_HEAP_BASE;
    const { instance } = await admit(`(module
      (import "host" "audit.log" (func $log (param i32 i32) (result i32)))
      (memory (export "memory") 1)
      (global $__fungi_heap (mut i32) (i32.const ${heapBase + 4}))
      (global $__fungi_ret_is_heap (mut i32) (i32.const 1))
      (global $__fungi_ret_words (mut i32) (i32.const 1))
      (func (export "__fungi_ret_is_heap_get") (result i32) (global.get $__fungi_ret_is_heap))
      (func (export "__fungi_ret_words_get") (result i32) (global.get $__fungi_ret_words))
      (func (export "__fungi_wipe_owned") (unreachable))
      (func (export "first") (result i32)
        (drop (call $log (i32.const 1) (i32.const 2)))
        (i32.const ${heapBase}))
      (func (export "second") (result i32)
        (drop (call $log (i32.const 3) (i32.const 4)))
        (i32.const ${heapBase}))
    )`, host);

    assert.throws(() => instance.exports.first(), /FUNGI-WASM-CLEANUP-001/);
    assert.throws(() => instance.exports.second(), /quarantin/i);
    assert.deepEqual(calls, [[1, 2]], "no later granted effect runs after cleanup failure");
  });

  it("does not invoke exports from an unadmitted raw WebAssembly instance", async () => {
    const calls = [];
    const assembled = await L.assembleWAT(moduleImporting("host", "audit.log"));
    assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
    const raw = new WebAssembly.Instance(new WebAssembly.Module(assembled.wasm), {
      host: { "audit.log": (a, b) => { calls.push([a, b]); return 1; } },
    });

    const result = L.invokeAdmittedExport(raw, "call", [5, 6]);

    assert.equal(result.ok, false, "raw engine instances have no admission receipt");
    assert.match(result.reason, /admission/i);
    assert.deepEqual(calls, [], "the helper refuses before executing the export");
  });
});
