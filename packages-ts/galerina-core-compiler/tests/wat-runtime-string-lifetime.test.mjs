import assert from "node:assert/strict";
import test from "node:test";
import * as L from "../dist/index.js";

const WAT = `(module
  (import "host" "__str_trim" (func $trim (param i32) (result i32)))
  (global $retained (mut i32) (i32.const -1))
  (func (export "capture") (param $input i32)
    local.get $input
    call $trim
    global.set $retained
  )
  (func (export "retained") (result i32)
    global.get $retained
  )
)`;

test("a guest-retained derived string survives later mutation of its seeded input slot", async () => {
  const assembled = await L.assembleWAT(WAT);
  assert.ok(assembled.valid && assembled.diagnostics.length === 0, JSON.stringify(assembled.diagnostics));

  const host = L.createHostRuntime();
  host.seedString(0, "A");
  const { instance } = await WebAssembly.instantiate(assembled.wasm, host.imports);
  instance.exports.capture(0);
  const retained = instance.exports.retained();

  assert.notEqual(retained, 0, "the guest result must not alias its mutable seeded input slot");
  assert.equal(host.readString(retained), "A");
  host.seedString(0, "B");
  assert.equal(host.readString(retained), "A");
  assert.throws(() => host.seedString(retained, "clobbered"), /immutable interned string handle/);
});
