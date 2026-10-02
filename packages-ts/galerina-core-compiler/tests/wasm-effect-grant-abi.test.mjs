/**
 * D8 item 3 (Codex GO 2026-10-02, relatedCommit 0d06d6c1) - explicit, closed,
 * non-secret host-import ABI for effect grants; deny by default; unknown
 * imports refused. Effectful entry points stay FUNGI-WAT-EFFECT-001.
 * Replay: node --test --test-reporter=tap tests/wasm-effect-grant-abi.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as L from "../dist/index.js";

const GRANT = "FUNGI-WASM-GRANT-001";

function moduleImporting(mod, name) {
  return `(module
  (import "${mod}" "${name}" (func $fx (param i32 i32) (result i32)))
  (func $call (param $a i32) (param $b i32) (result i32)
    (call $fx (local.get $a) (local.get $b)))
  (export "call" (func $call)))`;
}

async function admit(wat, host) {
  const assembled = await L.assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  const keys = L.generateRunnerKeypair();
  const attestation = L.signWasm(assembled.wasm, keys.privateKeyPem, "dev");
  return L.admitAndInstantiate({
    wasm: assembled.wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem: keys.publicKeyPem },
    host,
  });
}

describe("D8-3 T1 the ABI table is closed, frozen and non-secret", () => {
  it("exactly audit.write / audit.log, host module, (i32, i32) -> i32", () => {
    const abi = L.WASM_EFFECT_GRANT_ABI;
    assert.equal(Object.isFrozen(abi), true);
    assert.deepEqual(abi.map((e) => e.name), ["audit.write", "audit.log"]);
    for (const e of abi) {
      assert.equal(Object.isFrozen(e), true);
      assert.equal(e.module, "host");
      assert.equal(e.effect, "audit.write");
      assert.deepEqual([...e.params], ["i32", "i32"]);
      assert.deepEqual([...e.results], ["i32"]);
      assert.equal(/secret|env|vault|crypto|password|argon|bcrypt|random|key|credential|protected/i.test(e.name + e.effect), false, e.name);
    }
    assert.equal(L.FUNGI_WASM_GRANT_001.code, GRANT);
    assert.equal(L.FUNGI_WASM_GRANT_001.name, "EFFECT_GRANT_NOT_ALLOWLISTED");
  });
  it("every ABI name is a real STDLIB_CAPABILITY_MAP wasmImport for its declaring effect", () => {
    for (const e of L.WASM_EFFECT_GRANT_ABI) {
      const hits = [...L.STDLIB_CAPABILITY_MAP.values()].filter((c) => c.wasmImport === `host:${e.name}`);
      assert.ok(hits.length > 0, e.name);
      for (const c of hits) assert.deepEqual([...c.requiredEffects], [e.effect], e.name);
    }
  });
});

describe("D8-3 T2 positive: an allow-listed grant links and is called", () => {
  it("audit.write grant is admitted; the call reaches the handler", async () => {
    const calls = [];
    const host = L.createHostRuntime(undefined, { effectHandlers: { "audit.write": (a, b) => { calls.push([a, b]); return 7; } } });
    const { instance } = await admit(moduleImporting("host", "audit.write"), host);
    assert.equal(instance.exports.call(3, 4), 7);
    assert.deepEqual(calls, [[3, 4]]);
  });
  it("audit.log grant is admitted", async () => {
    const host = L.createHostRuntime(undefined, { effectHandlers: { "audit.log": () => 0 } });
    const { instance } = await admit(moduleImporting("host", "audit.log"), host);
    assert.equal(instance.exports.call(1, 2), 0);
  });
});

describe("D8-3 T3 negative: non-allow-listed grants are refused at host construction", () => {
  const DENIED = [
    "secret.read", "env.get", "vault.read", "crypto.sign", "crypto.verify", "password.verify",
    "argon2.hash", "bcrypt.verify", "random.bytes", "fs.write", "http.post", "db.insert",
    "email.send", "clock.now", "unknown.effect", "__str_length", "__fungi_wipe_owned",
  ];
  for (const name of DENIED) {
    it(`${name} -> ${GRANT}`, () => {
      assert.throws(
        () => L.createHostRuntime(undefined, { effectHandlers: { [name]: () => 0 } }),
        (e) => e instanceof Error && e.message.startsWith(`${GRANT}: effect grant '${name}' is not in the closed non-secret WASM effect-grant ABI`),
      );
    });
  }
  it("a non-function handler for an allow-listed name is refused", () => {
    assert.throws(
      () => L.createHostRuntime(undefined, { effectHandlers: { "audit.write": 1 } }),
      new RegExp(`${GRANT}: effect grant 'audit.write' handler is not a function`),
    );
  });
  it("one bad grant refuses the whole host (no partial grant set)", () => {
    assert.throws(
      () => L.createHostRuntime(undefined, { effectHandlers: { "audit.write": () => 0, "secret.read": () => 0 } }),
      new RegExp(GRANT),
    );
  });
});

describe("D8-3 T4 deny by default; unknown imports refused at admission", () => {
  it("allow-listed import without a grant fails admission", async () => {
    await assert.rejects(admit(moduleImporting("host", "audit.write"), L.createHostRuntime()), /CRITICAL_SECURITY_VIOLATION: disallowed host import/);
  });
  it("secret import can never be granted, so it never links", async () => {
    const host = L.createHostRuntime(undefined, { effectHandlers: { "audit.write": () => 0 } });
    await assert.rejects(admit(moduleImporting("host", "secret.read"), host), /CRITICAL_SECURITY_VIOLATION: disallowed host import .*host\.secret\.read \(function\) is not provided/);
  });
  it("an import from an unknown module is refused", async () => {
    const host = L.createHostRuntime(undefined, { effectHandlers: { "audit.write": () => 0 } });
    await assert.rejects(admit(moduleImporting("evil", "audit.write"), host), /CRITICAL_SECURITY_VIOLATION: disallowed host import .*evil\.audit\.write \(function\) is not provided/);
  });
  it("no grants: the bridge-only host still admits a pure module", async () => {
    const { instance } = await admit(`(module (func $f (result i32) (i32.const 5)) (export "f" (func $f)))`, L.createHostRuntime());
    assert.equal(instance.exports.f(), 5);
  });
});

describe("D8-3 T5 effectful entry points still refuse at emit (D8 item 2 unchanged)", () => {
  it("FUNGI-WAT-EFFECT-001 for an effectful entry", () => {
    const src = `pure flow ok(x: Int) -> Int
contract { effects {} }
{ return x }

flow fx(x: Int) -> Int
contract { effects { audit.write } }
{ return x }
`;
    const parsed = L.parseProgram(src, "d8t5.fungi");
    const fx = L.checkEffects(parsed.flows, parsed.ast);
    const { gir } = L.emitGIR(parsed.ast, parsed.flows, fx);
    assert.throws(
      () => L.renderWAT(L.buildWATModuleFromGIR({ ...gir, entryPoints: ["fx"] }, undefined, "d8t5", parsed.ast, false)),
      /FUNGI-WAT-EFFECT-001/,
    );
  });
});
