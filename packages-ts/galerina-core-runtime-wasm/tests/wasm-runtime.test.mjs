// wasm-runtime.test.mjs — the border-safe TCB owns this surface, so it verifies it here (not only via the
// compiler's re-export). Covers the admission gate's FAIL-CLOSED contract: deterministic hashing, a genuine
// sign→verify roundtrip, and refusal on a missing / tampered / profile-mismatched attestation.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wasmHash, generateRunnerKeypair, signWasm, verifyWasm, createHostRuntime,
  admitAndInstantiate, MAX_WASM_ARRAYS, MAX_WASM_ARRAY_ITEMS, MAX_WASM_STRINGS, MAX_WASM_STRING_CHARS, MAX_WASM_HOST_RECORDS,
  MAX_RECORD_COPY_NODES,
} from "../dist/index.js";

const bin = (bytes) => new Uint8Array(bytes);

test("wasmHash is deterministic sha256 hex", () => {
  const a = wasmHash(bin([1, 2, 3]));
  const b = wasmHash(bin([1, 2, 3]));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, wasmHash(bin([1, 2, 4]))); // different bytes → different hash
});

test("sign → verify roundtrip admits a genuine attestation", () => {
  const wasm = bin([10, 20, 30, 40]);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const att = signWasm(wasm, privateKeyPem, "certified");
  const v = verifyWasm(wasm, att, { requireSigned: true, publicKeyPem, requireCertifiedProfile: true });
  assert.equal(v.ok, true);
});

test("FAIL-CLOSED: no attestation is refused", () => {
  const v = verifyWasm(bin([1]), undefined, { requireSigned: true, publicKeyPem: "x" });
  assert.equal(v.ok, false);
});

test("FAIL-CLOSED: a tampered binary breaks the signature", () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const att = signWasm(bin([1, 2, 3]), privateKeyPem, "certified");
  // verify the SAME attestation against DIFFERENT bytes → hash mismatch, refused
  const v = verifyWasm(bin([1, 2, 9]), att, { requireSigned: true, publicKeyPem });
  assert.equal(v.ok, false);
});

test("FAIL-CLOSED: a dev attestation cannot pass a certified-required policy (profile bound into the signature)", () => {
  const wasm = bin([5, 5, 5]);
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const devAtt = signWasm(wasm, privateKeyPem, "dev");
  // re-labelling to certified must not verify — the profile is inside the signed pre-image (#173)
  const forged = { ...devAtt, profile: "certified" };
  const v = verifyWasm(wasm, forged, { requireSigned: true, publicKeyPem, requireCertifiedProfile: true });
  assert.equal(v.ok, false);
});

function rangeHost() {
  const rt = createHostRuntime();
  return { rt, range: rt.imports.host.__range };
}

test("__range(2,7) still materializes the exclusive interval", () => {
  const { rt, range } = rangeHost();
  assert.deepEqual([...rt.readArray(range(2, 7))], [2, 3, 4, 5, 6]);
});

test("hostile: __range must not allocate a 1e5 host array outside guest memory", () => {
  const { range } = rangeHost();
  assert.throws(() => range(0, 100_000), /guest memory|fuel/);
});

test("__range refuses a second allocation once host fuel is exhausted", () => {
  const { range } = rangeHost();
  range(0, 10_000);
  assert.throws(() => range(0, 10_000), /fuel|guest memory/);
});

test("bound guest memory is the range ceiling after bindMemory", () => {
  const { rt, range } = rangeHost();
  rt.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  assert.throws(() => range(0, 20_000), /guest memory/);
  assert.deepEqual([...rt.readArray(range(0, 3))], [0, 1, 2]);
});

test("hostile: __range refuses a full intern store before allocate or fuel debit", () => {
  const { rt, range } = rangeHost();
  for (let i = 0; i < MAX_WASM_ARRAYS; i++) rt.internArray([]);
  assert.throws(() => range(0, 5), /Array store exceeds the host bound/);
  assert.throws(() => range(0, 5), /Array store exceeds the host bound/);
});

test("hostile: empty __range refuses a full intern store before internArrayItems([])", () => {
  const { rt, range } = rangeHost();
  for (let i = 0; i < MAX_WASM_ARRAYS; i++) rt.internArray([]);
  assert.throws(() => range(7, 7), /Array store exceeds the host bound/);
  assert.throws(() => range(3, 1), /Array store exceeds the host bound/);
});

test("positive: empty __range still interns [] when the store has a free slot", () => {
  const { rt, range } = rangeHost();
  const id = range(5, 5);
  assert.deepEqual([...rt.readArray(id)], []);
});

test("hostile: __range host-bound check precedes allocate for MAX_WASM_ARRAY_ITEMS", () => {
  const { range } = rangeHost();
  assert.throws(() => range(0, MAX_WASM_ARRAY_ITEMS + 1), /cardinality exceeds the host bound|guest memory|fuel/);
});

test("positive: internArray stores a small i32 list", () => {
  const rt = createHostRuntime();
  const id = rt.internArray([1, 2, 3]);
  assert.deepEqual([...rt.readArray(id)], [1, 2, 3]);
});

test("hostile: readArray snapshot does not observe later append", () => {
  const rt = createHostRuntime();
  const id = rt.imports.host.__array_create();
  rt.imports.host.__array_append(id, 1);
  const snap = rt.readArray(id);
  assert.deepEqual([...snap], [1]);
  rt.imports.host.__array_append(id, 2);
  assert.deepEqual([...snap], [1], "independent result must not be a live alias");
  assert.deepEqual([...rt.readArray(id)], [1, 2]);
});

test("hostile: equal raw handle 0 is not identity across kinds or hosts", () => {
  const a = createHostRuntime();
  const b = createHostRuntime();
  const s0 = a.internString("alpha");
  const arr0 = a.internArray([7]);
  const d0 = a.internDecimal("1.00");
  const opt0 = a.imports.host.__option_some_v2(3);
  assert.equal(s0, 0);
  assert.equal(arr0, 0);
  assert.equal(d0, 0);
  assert.equal(opt0, 0);
  assert.equal(a.readString(0), "alpha");
  assert.deepEqual([...a.readArray(0)], [7]);
  assert.equal(a.readDecimal(0), "1.00");
  assert.deepEqual(a.readOption(0), { tag: "some", value: 3 });
  const sB = b.internString("beta");
  assert.equal(sB, 0);
  assert.equal(b.readString(0), "beta");
  assert.equal(a.readString(0), "alpha", "handle 0 is host-local");
});

test("hostile: internArray input mutation after intern does not change the store", () => {
  const rt = createHostRuntime();
  const items = [1, 2, 3];
  const id = rt.internArray(items);
  items.push(99);
  items[0] = 8;
  assert.deepEqual([...rt.readArray(id)], [1, 2, 3]);
});

test("hostile: mutating a readResult copy does not change the interned result", () => {
  const rt = createHostRuntime();
  const id = rt.imports.host.__result_ok(7);
  const snap = rt.readResult(id);
  snap.value = 99;
  snap.tag = "err";
  assert.deepEqual(rt.readResult(id), { tag: "ok", value: 7 });
});

test("hostile: mutating a readOption copy does not change the interned option", () => {
  const rt = createHostRuntime();
  const id = rt.imports.host.__option_some_v2(4);
  const snap = rt.readOption(id);
  snap.value = 99;
  snap.tag = "none";
  assert.deepEqual(rt.readOption(id), { tag: "some", value: 4 });
});

test("positive: complete String/Array/Option/Decimal reads are owned snapshots", () => {
  const rt = createHostRuntime();
  const s = rt.internString("ok");
  const arr = rt.internArray([4, 5]);
  const opt = rt.imports.host.__option_some_v2(9);
  const dec = rt.internDecimal("2.50");
  assert.equal(rt.readString(s), "ok");
  const arrSnap = rt.readArray(arr);
  assert.deepEqual([...arrSnap], [4, 5]);
  assert.throws(() => arrSnap.push(6), /object is not extensible|read only|Cannot add/);
  assert.deepEqual(rt.readOption(opt), { tag: "some", value: 9 });
  assert.equal(rt.readDecimal(dec), "2.50");
});

test("positive: copyArrayRecords copies guest fields not interned pointers", () => {
  const rt = createHostRuntime();
  const mem = new WebAssembly.Memory({ initial: 1 });
  rt.bindMemory(mem);
  const p1 = rt.allocRecord([7, 8]);
  const p2 = rt.allocRecord([9, 10]);
  const id = rt.internArray([p1, p2]);
  const copied = rt.copyArrayRecords(id, 2);
  assert.deepEqual(copied, [[7, 8], [9, 10]]);
  new Int32Array(mem.buffer)[p1 >>> 2] = 99;
  assert.deepEqual(copied, [[7, 8], [9, 10]], "guest mutation after copy must not change the snapshot");
  assert.equal(rt.readArray(id)[0], p1, "readArray remains a handle list");
});

test("hostile: copyArrayRecords of a shared descendant still owns each row", () => {
  const rt = createHostRuntime();
  const mem = new WebAssembly.Memory({ initial: 1 });
  rt.bindMemory(mem);
  const p = rt.allocRecord([7, 8]);
  const id = rt.internArray([p, p]);
  const copied = rt.copyArrayRecords(id, 2);
  assert.deepEqual(copied, [[7, 8], [7, 8]]);
  const view = new Int32Array(mem.buffer);
  view[p >>> 2] = 1;
  view[(p >>> 2) + 1] = 2;
  assert.deepEqual(copied, [[7, 8], [7, 8]]);
  assert.notEqual(copied[0], copied[1]);
});

test("hostile: copyArrayRecords refuses short memory with no partial success", () => {
  const rt = createHostRuntime();
  const mem = new WebAssembly.Memory({ initial: 1 });
  rt.bindMemory(mem);
  const p1 = rt.allocRecord([1, 2]);
  const last = 65532;
  const id = rt.internArray([p1, last]);
  assert.throws(() => rt.copyArrayRecords(id, 8), /FUNGI-WASM-HOST-001.*short memory/);
});

test("hostile: copyArrayRecords refuses an unaligned pointer", () => {
  const rt = createHostRuntime();
  rt.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  const id = rt.internArray([1025]);
  assert.throws(() => rt.copyArrayRecords(id, 1), /FUNGI-WASM-HOST-001.*aligned heap record/);
});

test("hostile: copyArrayRecords refuses fieldCount 0", () => {
  const rt = createHostRuntime();
  rt.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  const id = rt.internArray([rt.allocRecord([1])]);
  assert.throws(() => rt.copyArrayRecords(id, 0), /FUNGI-WASM-HOST-001.*fieldCount=0/);
});

const OUTER = [{ kind: "record", fields: [{ kind: "i32" }] }, { kind: "i32" }];

test("positive: copyArrayRecordsLayout copies nested record fields not inner pointers", () => {
  const rt = createHostRuntime();
  const mem = new WebAssembly.Memory({ initial: 1 });
  rt.bindMemory(mem);
  const inner = rt.allocRecord([7]);
  const outer = rt.allocRecord([inner, 99]);
  const id = rt.internArray([outer]);
  const copied = rt.copyArrayRecordsLayout(id, OUTER);
  assert.deepEqual(copied, [[[7], 99]]);
  new Int32Array(mem.buffer)[inner >>> 2] = 1;
  assert.deepEqual(copied, [[[7], 99]], "nested guest mutation after copy must not change the snapshot");
  assert.equal(rt.readArray(id)[0], outer);
  assert.equal(rt.copyArrayRecords(id, 2)[0][0], inner, "flat copy still yields the inner pointer");
});

test("positive: omitted nested pointer zeros the inner layout", () => {
  const rt = createHostRuntime();
  rt.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  const outer = rt.allocRecord([0, 99]);
  const copied = rt.copyArrayRecordsLayout(rt.internArray([outer]), OUTER);
  assert.deepEqual(copied, [[[0], 99]]);
});

test("hostile: cyclic nested record pointer refuses", () => {
  const rt = createHostRuntime();
  const mem = new WebAssembly.Memory({ initial: 1 });
  rt.bindMemory(mem);
  const outer = rt.allocRecord([0, 1]);
  new Int32Array(mem.buffer)[outer >>> 2] = outer;
  assert.throws(
    () => rt.copyArrayRecordsLayout(rt.internArray([outer]), OUTER),
    /FUNGI-WASM-HOST-001.*cyclic/,
  );
});

test("hostile: nested copy depth above 8 refuses", () => {
  const rt = createHostRuntime();
  rt.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  let layout = { kind: "i32" };
  for (let i = 0; i < 9; i++) layout = { kind: "record", fields: [layout] };
  const id = rt.internArray([rt.allocRecord([0])]);
  assert.throws(() => rt.copyArrayRecordsLayout(id, [layout]), /FUNGI-WASM-HOST-001.*depth/);
});

test("positive: copyArrayRecordsLayout admits exactly MAX_RECORD_COPY_NODES records", () => {
  const rt = createHostRuntime();
  rt.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  const ptrs = [];
  for (let i = 0; i < MAX_RECORD_COPY_NODES; i++) ptrs.push(rt.allocRecord([i & 255]));
  const copied = rt.copyArrayRecordsLayout(rt.internArray(ptrs), [{ kind: "i32" }]);
  assert.equal(copied.length, MAX_RECORD_COPY_NODES);
  assert.deepEqual(copied[0], [0]);
  assert.deepEqual(copied[MAX_RECORD_COPY_NODES - 1], [(MAX_RECORD_COPY_NODES - 1) & 255]);
});

test("hostile: copyArrayRecordsLayout refuses MAX_RECORD_COPY_NODES+1 with no partial success", () => {
  const rt = createHostRuntime();
  rt.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  const ptrs = [];
  for (let i = 0; i < MAX_RECORD_COPY_NODES + 1; i++) ptrs.push(rt.allocRecord([1]));
  const id = rt.internArray(ptrs);
  assert.throws(
    () => rt.copyArrayRecordsLayout(id, [{ kind: "i32" }]),
    /FUNGI-WASM-HOST-001.*node bound/,
  );
  assert.equal(rt.readArray(id).length, MAX_RECORD_COPY_NODES + 1, "interned handles must survive the refused copy");
});

test("hostile: internArray refuses cardinality above MAX_WASM_ARRAY_ITEMS before copy", () => {
  const rt = createHostRuntime();
  const huge = new Array(MAX_WASM_ARRAY_ITEMS + 1);
  assert.throws(() => rt.internArray(huge), /cardinality exceeds the host bound/);
});

test("hostile: unknown __array_append handle refuses instead of sparse-filling", () => {
  const rt = createHostRuntime();
  assert.throws(() => rt.imports.host.__array_append(99, 1), /unknown array handle/);
});

test("hostile: __array_create refuses after MAX_WASM_ARRAYS handles", () => {
  const rt = createHostRuntime();
  const create = rt.imports.host.__array_create;
  for (let i = 0; i < MAX_WASM_ARRAYS; i++) create();
  assert.throws(() => create(), /Array store exceeds the host bound/);
});

test("positive: internString stores a short value", () => {
  const rt = createHostRuntime();
  const id = rt.internString("hi");
  assert.equal(rt.readString(id), "hi");
});

test("hostile: internString refuses above MAX_WASM_STRING_CHARS", () => {
  const rt = createHostRuntime();
  assert.throws(() => rt.internString("x".repeat(MAX_WASM_STRING_CHARS + 1)), /host char bound/);
});

test("hostile: internString refuses after MAX_WASM_STRINGS handles", () => {
  const rt = createHostRuntime();
  for (let i = 0; i < MAX_WASM_STRINGS; i++) rt.internString("a");
  assert.throws(() => rt.internString("b"), /String store exceeds the host bound/);
});

test("hostile: seedString refuses a handle at or above MAX_WASM_STRINGS", () => {
  const rt = createHostRuntime();
  assert.throws(() => rt.seedString(MAX_WASM_STRINGS, "x"), /unknown string handle/);
});

test("hostile: seedString densely fills holes so internString does not skip undefined slots", () => {
  const rt = createHostRuntime();
  rt.seedString(5, "seeded");
  assert.equal(rt.readString(5), "seeded");
  for (let i = 0; i < 5; i++) {
    assert.equal(rt.readString(i), "", `hole ${i} must be a defined empty string`);
  }
  const next = rt.internString("next");
  assert.equal(next, 6);
  assert.equal(rt.readString(6), "next");
});

test("positive: sequential seedString then internString is dense", () => {
  const rt = createHostRuntime();
  rt.seedString(0, "a");
  rt.seedString(1, "b");
  assert.equal(rt.internString("c"), 2);
  assert.equal(rt.readString(0), "a");
  assert.equal(rt.readString(2), "c");
});

test("positive: internDecimal stores a canonical amount", () => {
  const rt = createHostRuntime();
  const id = rt.internDecimal("1.00");
  assert.equal(rt.readDecimal(id), "1.00");
});

test("hostile: __result_ok refuses after MAX_WASM_HOST_RECORDS handles", () => {
  const rt = createHostRuntime();
  const ok = rt.imports.host.__result_ok;
  for (let i = 0; i < MAX_WASM_HOST_RECORDS; i++) ok(i);
  assert.throws(() => ok(0), /Result store exceeds the host bound/);
});

test("hostile: __option_some_v2 refuses after MAX_WASM_HOST_RECORDS handles", () => {
  const rt = createHostRuntime();
  const some = rt.imports.host.__option_some_v2;
  for (let i = 0; i < MAX_WASM_HOST_RECORDS; i++) some(i);
  assert.throws(() => some(0), /Option store exceeds the host bound/);
});

test("hostile: internDecimal refuses after MAX_WASM_HOST_RECORDS handles", () => {
  const rt = createHostRuntime();
  for (let i = 0; i < MAX_WASM_HOST_RECORDS; i++) rt.internDecimal("1.00");
  assert.throws(() => rt.internDecimal("2.00"), /Decimal store exceeds the host bound/);
});

test("hostile: __money_gbp refuses after MAX_WASM_HOST_RECORDS handles", () => {
  const rt = createHostRuntime();
  const amt = rt.internString("1.00");
  const gbp = rt.imports.host.__money_gbp;
  for (let i = 0; i < MAX_WASM_HOST_RECORDS; i++) gbp(amt);
  assert.throws(() => gbp(amt), /Money store exceeds the host bound/);
});

const EMPTY_WASM = bin([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

test("admitAndInstantiate instantiates the snapshot, not a mutated caller buffer", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = Uint8Array.from(EMPTY_WASM);
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const pending = admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });
  wasm[0] = 0xff;
  const admitted = await pending;
  assert.equal(admitted.hash, wasmHash(EMPTY_WASM));
  assert.ok(admitted.instance);
});

test("FAIL-CLOSED: Buffer-backed wasm is not an exclusive Uint8Array snapshot", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = Buffer.from(EMPTY_WASM);
  const attestation = signWasm(Uint8Array.from(EMPTY_WASM), privateKeyPem, "dev");
  await assert.rejects(
    () => admitAndInstantiate({
      wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
    }),
    /exclusively owned Uint8Array/,
  );
});
