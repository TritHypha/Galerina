// wasm-runtime.test.mjs — the border-safe TCB owns this surface, so it verifies it here (not only via the
// compiler's re-export). Covers the admission gate's FAIL-CLOSED contract: deterministic hashing, a genuine
// sign→verify roundtrip, and refusal on a missing / tampered / profile-mismatched attestation.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  wasmHash, generateRunnerKeypair, signWasm, verifyWasm, createHostRuntime,
  admitAndInstantiate, MAX_WASM_ARRAYS, MAX_WASM_ARRAY_ITEMS, MAX_WASM_STRINGS, MAX_WASM_STRING_CHARS, MAX_WASM_HOST_RECORDS,
  MAX_RECORD_COPY_NODES, invokeAdmittedExport,
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

test("internString reuses a canonical handle across repeated host calls", () => {
  const rt = createHostRuntime();
  const first = rt.internString("same immutable string");
  for (let i = 0; i < MAX_WASM_STRINGS; i++) {
    assert.equal(rt.internString("same immutable string"), first);
  }
  assert.equal(rt.readString(first), "same immutable string");
});

test("internString keeps returned values immutable and separate from mutable seed slots", () => {
  const rt = createHostRuntime();
  rt.seedString(0, "A");
  const retained = rt.imports.host.__str_trim(0);
  assert.notEqual(retained, 0, "derived guest-visible strings must not alias mutable seed slots");
  assert.equal(rt.readString(retained), "A");
  rt.seedString(0, "B");
  assert.equal(rt.readString(0), "B");
  assert.equal(rt.readString(retained), "A", "later input replacement must not mutate a retained result");
  assert.throws(() => rt.seedString(retained, "overwritten"), /immutable interned string handle/);
});

test("internString values stay independent of overwritten duplicate seed slots", () => {
  const rt = createHostRuntime();
  rt.seedString(0, "old");
  rt.seedString(1, "old");
  rt.seedString(0, "new");
  const oldValue = rt.internString("old");
  const newValue = rt.internString("new");
  assert.notEqual(oldValue, 0);
  assert.notEqual(oldValue, 1);
  assert.notEqual(newValue, 0);
  assert.notEqual(newValue, 1);
  assert.equal(rt.internString("old"), oldValue);
  assert.equal(rt.internString("new"), newValue);
  assert.equal(rt.readString(oldValue), "old");
  assert.equal(rt.readString(newValue), "new");
  assert.equal(rt.readString(0), "new");
  assert.equal(rt.readString(1), "old");
});

test("hostile: internString refuses above MAX_WASM_STRING_CHARS", () => {
  const rt = createHostRuntime();
  assert.throws(() => rt.internString("x".repeat(MAX_WASM_STRING_CHARS + 1)), /host char bound/);
});

test("hostile: internString refuses a distinct value after MAX_WASM_STRINGS entries", () => {
  const rt = createHostRuntime();
  for (let i = 0; i < MAX_WASM_STRINGS; i++) rt.internString(`value-${i}`);
  assert.equal(rt.internString("value-0"), 0, "an existing canonical value remains usable at capacity");
  assert.throws(() => rt.internString("unique-over-limit"), /String store exceeds the host bound/);
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

test("Option interning reuses an immutable value handle across repeated host calls", () => {
  const rt = createHostRuntime();
  const some = rt.imports.host.__option_some_v2;
  const first = some(-1);
  for (let i = 0; i < MAX_WASM_HOST_RECORDS; i++) {
    assert.equal(some(-1), first, "equal Some values retain a stable handle without growing the store");
  }
  assert.deepEqual(rt.readOption(first), { tag: "some", value: -1 });
});

test("Option interning keeps payload kinds and signed Float zero distinct", () => {
  const rt = createHostRuntime();
  const intSome = rt.imports.host.__option_some_v2;
  const floatSome = rt.imports.host.__option_some_f64_v2;
  const positiveZero = floatSome(0);
  const negativeZero = floatSome(-0);

  assert.notEqual(intSome(0), positiveZero, "equal numeric payloads in different ABI lanes must not alias");
  assert.notEqual(positiveZero, negativeZero, "Float signed zero remains bit-observable");
  assert.equal(floatSome(0), positiveZero);
  assert.equal(floatSome(-0), negativeZero);
  assert.ok(Object.is(rt.readOption(negativeZero).value, -0));
});

test("Option<String> snapshots mutable inputs and canonicalizes equal contents", () => {
  const rt = createHostRuntime();
  const someString = rt.imports.host.__option_some_string_v2;
  assert.equal(typeof someString, "function");

  rt.seedString(50, "same");
  rt.seedString(51, "same");
  const first = someString(50);
  const second = someString(51);
  assert.equal(second, first, "equal String values must reuse an Option value handle");

  const payloadHandle = rt.imports.host.__option_value_v2(first);
  assert.notEqual(payloadHandle, 50, "Option owns an immutable String snapshot, not the caller's mutable slot");
  assert.equal(rt.readString(payloadHandle), "same");
  rt.seedString(50, "changed");
  assert.equal(rt.readString(payloadHandle), "same", "reseeding the source must not mutate the retained Option payload");
  assert.throws(() => rt.seedString(payloadHandle, "changed"), /immutable interned string handle/);
});

test("Option<String> checks bounded stores before allocating either retained value", () => {
  const optionFull = createHostRuntime();
  const some = optionFull.imports.host.__option_some_v2;
  const someString = optionFull.imports.host.__option_some_string_v2;
  optionFull.seedString(50, "new-string");
  for (let i = 0; i < MAX_WASM_HOST_RECORDS; i++) some(i);
  assert.throws(() => someString(50), /Option store exceeds the host bound/);
  assert.equal(optionFull.internString("different-new-string"), 51,
    "a full Option store must refuse before consuming an immutable String slot");

  const stringFull = createHostRuntime();
  const someAtStringFull = stringFull.imports.host.__option_some_v2;
  const someStringAtStringFull = stringFull.imports.host.__option_some_string_v2;
  stringFull.seedString(50, "uninterned");
  for (let i = 0; i < MAX_WASM_STRINGS - 51; i++) stringFull.internString(`capacity-${i}`);
  assert.throws(() => someStringAtStringFull(50), /String store exceeds the host bound/);
  assert.equal(someAtStringFull(7), 0,
    "a full String store must refuse before consuming an Option slot");
});

test("Array<String> Option accessors snapshot valid values and refuse unknown arrays", () => {
  const rt = createHostRuntime();
  rt.seedString(50, "array-value");
  const array = rt.internArray([50]);
  const host = rt.imports.host;
  const fromGet = host.__array_get_option_string_v2(array, 0);
  assert.equal(host.__array_first_option_string_v2(array), fromGet);
  assert.equal(host.__array_last_option_string_v2(array), fromGet);
  const payloadHandle = host.__option_value_v2(fromGet);
  assert.notEqual(payloadHandle, 50);
  assert.equal(rt.readString(payloadHandle), "array-value");
  rt.seedString(50, "changed");
  assert.equal(rt.readString(payloadHandle), "array-value");
  assert.equal(host.__array_get_option_string_v2(array, 1), -1, "out-of-range access to a valid array is None");
  assert.throws(() => host.__array_get_option_string_v2(999, 0), /unknown array handle/);
  assert.throws(() => host.__array_first_option_string_v2(999), /unknown array handle/);
  assert.throws(() => host.__array_last_option_string_v2(999), /unknown array handle/);
});

test("Option<Float> equality compares payload values and refuses invalid handles", () => {
  const rt = createHostRuntime();
  const someFloat = rt.imports.host.__option_some_f64_v2;
  const optionEq = rt.imports.host.__option_eq_f64_v2;
  const positiveZero = someFloat(0);
  const negativeZero = someFloat(-0);
  const other = someFloat(1);
  assert.equal(optionEq(positiveZero, negativeZero), 1);
  assert.equal(optionEq(positiveZero, other), 0);
  assert.equal(optionEq(-1, -1), 1);
  assert.equal(optionEq(-1, positiveZero), 0);
  assert.throws(() => optionEq(-1, 999), /unknown Option handle/);
  assert.throws(() => optionEq(999, -1), /unknown Option handle/);
  const integerOption = rt.imports.host.__option_some_v2(7);
  assert.throws(() => optionEq(-1, integerOption), /payload kind mismatch/);
  assert.throws(() => optionEq(integerOption, -1), /payload kind mismatch/);
});

test("Option<Option<Float>> equality compares its nested Float value and validates lanes", () => {
  const rt = createHostRuntime();
  const someFloat = rt.imports.host.__option_some_f64_v2;
  const someI32 = rt.imports.host.__option_some_v2;
  const nestedEq = rt.imports.host.__option_eq_option_f64_v2;
  const plusZero = someI32(someFloat(0));
  const minusZero = someI32(someFloat(-0));
  const one = someI32(someFloat(1));
  const wrongInnerLane = someI32(someI32(7));
  assert.equal(nestedEq(plusZero, minusZero), 1);
  assert.equal(nestedEq(plusZero, one), 0);
  assert.equal(nestedEq(-1, -1), 1);
  assert.equal(nestedEq(-1, plusZero), 0);
  assert.throws(() => nestedEq(-1, wrongInnerLane), /payload kind mismatch/);
});

test("deep Option<Float> equality validates each nested lane through the admitted depth bound", () => {
  const rt = createHostRuntime();
  const host = rt.imports.host;
  const someFloat = host.__option_some_f64_v2;
  const someI32 = host.__option_some_v2;
  const nestedEq3 = host.__option_eq_f64_depth_3_v2;
  const nestedEq8 = host.__option_eq_f64_depth_8_v2;
  const plusZero3 = someI32(someI32(someFloat(0)));
  const minusZero3 = someI32(someI32(someFloat(-0)));
  const one3 = someI32(someI32(someFloat(1)));
  const someNone3 = someI32(-1);

  assert.equal(nestedEq3(plusZero3, minusZero3), 1);
  assert.equal(nestedEq3(plusZero3, one3), 0);
  assert.equal(nestedEq3(-1, -1), 1);
  assert.equal(nestedEq3(-1, someNone3), 0);
  assert.throws(() => nestedEq3(-1, someI32(someI32(someI32(7)))), /payload kind mismatch/);
  assert.throws(() => nestedEq3(-1, someI32(999)), /unknown Option handle/);

  const wrap = (value) => {
    let handle = value;
    for (let depth = 1; depth < 8; depth++) handle = someI32(handle);
    return handle;
  };
  assert.equal(nestedEq8(wrap(someFloat(0)), wrap(someFloat(-0))), 1);
  assert.equal(host.__option_eq_f64_depth_9_v2, undefined, "the runtime exposes no equality import beyond the compiler type bound");
});

test("hostile: __option_some_v2 refuses a new distinct value after MAX_WASM_HOST_RECORDS entries", () => {
  const rt = createHostRuntime();
  const some = rt.imports.host.__option_some_v2;
  for (let i = 0; i < MAX_WASM_HOST_RECORDS; i++) some(i);
  assert.equal(some(0), 0, "an existing canonical value remains usable at capacity");
  assert.throws(() => some(MAX_WASM_HOST_RECORDS), /Option store exceeds the host bound/);
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

function invocationAndCleanupCounterWasm() {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [2, 0x60, 0, 1, 0x7f, 0x60, 0, 0];
  const functions = [2, 0, 1];
  const globals = [
    2,
    0x7f, 1, 0x41, 0, 0x0b,
    0x7f, 1, 0x41, 0, 0x0b,
  ];
  const exports = [
    4,
    ...encodeName("run"), 0, 0,
    ...encodeName("__fungi_wipe_owned"), 0, 1,
    ...encodeName("guest_calls"), 3, 0,
    ...encodeName("wipe_calls"), 3, 1,
  ];
  const runBody = [0, 0x23, 0, 0x41, 1, 0x6a, 0x24, 0, 0x41, 7, 0x0b];
  const wipeBody = [0, 0x23, 1, 0x41, 1, 0x6a, 0x24, 1, 0x0b];
  const code = [
    2,
    ...encodeU32(runBody.length), ...runBody,
    ...encodeU32(wipeBody.length), ...wipeBody,
  ];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(3, functions),
    ...section(6, globals),
    ...section(7, exports),
    ...section(10, code),
  ]);
}

function reentrantExportWasm({ exposeInnerTable = false, wipeCallsHost = false, gateWipeWithGuestCounter = false } = {}) {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [
    3,
    0x60, 2, 0x7f, 0x7f, 1, 0x7f,
    0x60, 0, 1, 0x7f,
    0x60, 0, 0,
  ];
  const imports = [1, ...encodeName("host"), ...encodeName("audit.write"), 0, 0];
  const functions = [4, 1, 1, 2, 1];
  const memories = [1, 0, 1];
  const globals = [
    2,
    0x7f, 1, 0x41, 0, 0x0b,
    0x7f, 1, 0x41, 0, 0x0b,
  ];
  const exports = [
    exposeInnerTable ? 8 : 7,
    ...encodeName("outer"), 0, 1,
    ...encodeName("inner"), 0, 2,
    ...encodeName("__fungi_wipe_owned"), 0, 3,
    ...encodeName("read_word"), 0, 4,
    ...(exposeInnerTable ? [...encodeName("inner_table"), 1, 0] : []),
    ...encodeName("memory"), 2, 0,
    ...encodeName("guest_calls"), 3, 0,
    ...encodeName("wipe_calls"), 3, 1,
  ];
  const outer = [
    0,
    0x41, 0, 0x41, 42, 0x36, 2, 0,
    ...(gateWipeWithGuestCounter ? [0x23, 0, 0x41, 1, 0x6a, 0x24, 0] : []),
    0x41, 11, 0x41, 13, 0x10, 0, 0x1a,
    0x41, 0, 0x28, 2, 0,
    0x0b,
  ];
  const inner = [0, 0x23, 0, 0x41, 1, 0x6a, 0x24, 0, 0x41, 7, 0x0b];
  const wipe = [
    0,
    ...(wipeCallsHost ? [0x41, 0, 0x41, 0, 0x10, 0, 0x1a] : []),
    ...(gateWipeWithGuestCounter
      ? [0x23, 0, 0x04, 0x40, 0x41, 0, 0x41, 0, 0x36, 2, 0, 0x0b]
      : [0x41, 0, 0x41, 0, 0x36, 2, 0]),
    0x23, 1, 0x41, 1, 0x6a, 0x24, 1,
    0x0b,
  ];
  const readWord = [0, 0x41, 0, 0x28, 2, 0, 0x0b];
  const code = [
    4,
    ...encodeU32(outer.length), ...outer,
    ...encodeU32(inner.length), ...inner,
    ...encodeU32(wipe.length), ...wipe,
    ...encodeU32(readWord.length), ...readWord,
  ];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(2, imports),
    ...section(3, functions),
    ...(exposeInnerTable ? [
      ...section(4, [1, 0x70, 0, 2]),
    ] : []),
    ...section(5, memories),
    ...section(6, globals),
    ...section(7, exports),
    ...(exposeInnerTable ? [
      ...section(9, [1, 0, 0x41, 0, 0x0b, 2, 2, 3]),
    ] : []),
    ...section(10, code),
  ]);
}

function secretHeapResultWithAuditWasm({ growDuringWordsMetadata = false } = {}) {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [
    3,
    0x60, 2, 0x7f, 0x7f, 1, 0x7f,
    0x60, 0, 1, 0x7f,
    0x60, 0, 0,
  ];
  const imports = [1, ...encodeName("host"), ...encodeName("audit.write"), 0, 0];
  const functions = [4, 1, 1, 2, 1];
  const memories = [1, 0, 1];
  const exports = [
    5,
    ...encodeName("run"), 0, 1,
    ...encodeName("__fungi_ret_is_heap_get"), 0, 2,
    ...encodeName("__fungi_wipe_owned"), 0, 3,
    ...encodeName("__fungi_ret_words_get"), 0, 4,
    ...encodeName("memory"), 2, 0,
  ];
  const run = [
    0,
    0x41, 0x80, 0x08, 0x41, 0xb4, 0x24, 0x36, 2, 0,
    0x41, 11, 0x41, 13, 0x10, 0, 0x1a,
    0x41, 0x80, 0x08, 0x0b,
  ];
  const heapResult = [0, 0x41, 1, 0x0b];
  const wipe = [0, 0x41, 0x80, 0x08, 0x41, 0, 0x36, 2, 0, 0x0b];
  const words = growDuringWordsMetadata
    ? [0, 0x41, 1, 0x40, 0, 0x1a, 0x41, 1, 0x0b]
    : [0, 0x41, 1, 0x0b];
  const code = [
    4,
    ...encodeU32(run.length), ...run,
    ...encodeU32(heapResult.length), ...heapResult,
    ...encodeU32(wipe.length), ...wipe,
    ...encodeU32(words.length), ...words,
  ];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(2, imports),
    ...section(3, functions),
    ...section(5, memories),
    ...section(7, exports),
    ...section(10, code),
  ]);
}

function nestedSecretRecordResultWasm({ cyclic = false, heapTagged = true, includeWipe = true } = {}) {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [
    4,
    0x60, 0, 1, 0x7f,
    0x60, 0, 1, 0x7f,
    0x60, 0, 0,
    0x60, 0, 1, 0x7f,
  ];
  const functions = [4, 0, 1, 2, 3];
  const memories = [1, 0, 1];
  const exports = [
    includeWipe ? 5 : 4,
    ...encodeName("run"), 0, 0,
    ...encodeName("__fungi_ret_is_heap_get"), 0, 1,
    ...(includeWipe ? [...encodeName("__fungi_wipe_owned"), 0, 2] : []),
    ...encodeName("__fungi_heap_get"), 0, 3,
    ...encodeName("memory"), 2, 0,
  ];
  const store = (address, value) => [
    0x41, ...encodeU32(address), 0x41, ...encodeU32(value), 0x36, 2, 0,
  ];
  const run = [
    0,
    ...store(1024, 7),
    ...store(1028, cyclic ? 1024 : 1032),
    ...store(1032, 11),
    ...store(1036, 13),
    0x41, ...encodeU32(1024), 0x0b,
  ];
  const heapResult = [0, 0x41, heapTagged ? 1 : 0, 0x0b];
  const wipe = [0, ...store(1024, 0), ...store(1028, 0), ...store(1032, 0), ...store(1036, 0), 0x0b];
  const heapEnd = [0, 0x41, ...encodeU32(1040), 0x0b];
  const code = [
    4,
    ...encodeU32(run.length), ...run,
    ...encodeU32(heapResult.length), ...heapResult,
    ...encodeU32(wipe.length), ...wipe,
    ...encodeU32(heapEnd.length), ...heapEnd,
  ];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(3, functions),
    ...section(5, memories),
    ...section(7, exports),
    ...section(10, code),
  ]);
}

function funcrefGlobalWasm(exportName = "callback") {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [1, 0x60, 0, 0];
  const functions = [2, 0, 0];
  const global = [1, 0x70, 1, 0xd0, 0x70, 0x0b]; // mutable funcref, populated by the start function
  const exports = [1, ...encodeName(exportName), 3, 0];
  const start = [1];
  const elements = [1, 3, 0, 1, 0]; // declaratively declares function 0 for ref.func
  const callback = [0, 0x0b];
  const initialize = [0, 0xd2, 0, 0x24, 0, 0x0b]; // global[0] = ref.func 0
  const code = [2, ...encodeU32(callback.length), ...callback, ...encodeU32(initialize.length), ...initialize];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(3, functions),
    ...section(6, global),
    ...section(7, exports),
    ...section(8, start),
    ...section(9, elements),
    ...section(10, code),
  ]);
}

function helperTableWasm() {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [1, 0x60, 0, 0];
  const functions = [1, 0];
  const tables = [1, 0x70, 0, 1];
  const exports = [1, ...encodeName("__fungi_heap_get"), 1, 0];
  const elements = [1, 0, 0x41, 0, 0x0b, 1, 0];
  const body = [0, 0x0b];
  const code = [1, ...encodeU32(body.length), ...body];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(3, functions),
    ...section(4, tables),
    ...section(7, exports),
    ...section(9, elements),
    ...section(10, code),
  ]);
}

function mutableNumericGlobalWasm() {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const globals = [1, 0x7f, 1, 0x41, 7, 0x0b];
  const exports = [1, ...encodeName("counter"), 3, 0];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(6, globals),
    ...section(7, exports),
  ]);
}

function funcrefReturnWasm(exportName = "return_ref") {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [1, 0x60, 0, 1, 0x70];
  const functions = [1, 0];
  const tables = [1, 0x70, 0, 1];
  const exports = [1, ...encodeName(exportName), 0, 0];
  const elements = [1, 0, 0x41, 0, 0x0b, 1, 0];
  const body = [0, 0x41, 0, 0x25, 0, 0x0b]; // return table[0] as funcref
  const code = [1, ...encodeU32(body.length), ...body];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(3, functions),
    ...section(4, tables),
    ...section(7, exports),
    ...section(9, elements),
    ...section(10, code),
  ]);
}

function multiValueFuncrefReturnWasm() {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [2, 0x60, 0, 2, 0x7f, 0x70, 0x60, 0, 0]; // pair result; void target
  const functions = [2, 0, 1];
  const tables = [1, 0x70, 0, 1];
  const exports = [1, ...encodeName("return_pair"), 0, 0];
  const elements = [1, 3, 0, 1, 1]; // declaratively declares function 1 for ref.func
  const pair = [0, 0x41, 7, 0xd2, 1, 0x0b]; // i32.const 7; ref.func 1
  const target = [0, 0x0b];
  const code = [2, ...encodeU32(pair.length), ...pair, ...encodeU32(target.length), ...target];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(3, functions),
    ...section(4, tables),
    ...section(7, exports),
    ...section(9, elements),
    ...section(10, code),
  ]);
}

function funcrefResultImportWasm() {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [
    3,
    0x60, 1, 0x70, 1, 0x7f, // (funcref) -> i32
    0x60, 0, 0,             // () -> ()
    0x60, 0, 1, 0x7f,       // () -> i32
  ];
  const imports = [1, ...encodeName("host"), ...encodeName("__result_ok"), 0, 0];
  // Defined function indices: 1 = attack, 2 = wipe, 3 = the returned payload.
  const functions = [3, 2, 1, 1];
  const memories = [1, 0, 1];
  const exports = [
    3,
    ...encodeName("attack"), 0, 1,
    ...encodeName("__fungi_wipe_owned"), 0, 2,
    ...encodeName("memory"), 2, 0,
  ];
  const declaredPayload = [1, 3, 0, 1, 3];
  const attack = [0, 0xd2, 3, 0x10, 0, 0x0b]; // return __result_ok(ref.func payload)
  const wipe = [0, 0x41, 0, 0x41, 0, 0x36, 2, 0, 0x0b];
  const payload = [0, 0x41, 0, 0x41, 0xb4, 0x24, 0x36, 2, 0, 0x0b]; // memory[0] = 0x1234
  const code = [
    3,
    ...encodeU32(attack.length), ...attack,
    ...encodeU32(wipe.length), ...wipe,
    ...encodeU32(payload.length), ...payload,
  ];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(2, imports),
    ...section(3, functions),
    ...section(5, memories),
    ...section(7, exports),
    ...section(9, declaredPayload),
    ...section(10, code),
  ]);
}

function trappingHeapGetterWasm() {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const types = [
    3,
    0x60, 2, 0x7f, 0x7f, 1, 0x7f,
    0x60, 0, 0,
    0x60, 0, 1, 0x7f,
  ];
  const functions = [3, 1, 1, 2];
  const memories = [1, 0, 1];
  const exports = [
    4,
    ...encodeName("__fungi_heap_get"), 0, 0,
    ...encodeName("__fungi_wipe_owned"), 0, 1,
    ...encodeName("read_word"), 0, 2,
    ...encodeName("memory"), 2, 0,
  ];
  const getter = [0, 0x41, 0, 0x41, 23, 0x36, 2, 0, 0x00, 0x0b];
  const wipe = [0, 0x41, 0, 0x41, 0, 0x36, 2, 0, 0x0b];
  const read = [0, 0x41, 0, 0x28, 2, 0, 0x0b];
  const code = [3, ...encodeU32(getter.length), ...getter, ...encodeU32(wipe.length), ...wipe, ...encodeU32(read.length), ...read];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, types),
    ...section(3, functions),
    ...section(5, memories),
    ...section(7, exports),
    ...section(10, code),
  ]);
}

function encodeU32(value) {
  const bytes = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 0x80);
    if (remaining !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0);
  return bytes;
}

function encodeName(value) {
  const bytes = [...new TextEncoder().encode(value)];
  return [...encodeU32(bytes.length), ...bytes];
}

function auditImportWasm(importName) {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const type = [1, 0x60, 2, 0x7f, 0x7f, 1, 0x7f];
  const importedFunction = [1, ...encodeName("host"), ...encodeName(importName), 0, 0];
  const definedFunction = [1, 0];
  const exportedFunction = [1, ...encodeName("invoke"), 0, 1];
  const body = [0, 0x20, 0, 0x20, 1, 0x10, 0, 0x0b];
  const code = [1, ...encodeU32(body.length), ...body];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, type),
    ...section(2, importedFunction),
    ...section(3, definedFunction),
    ...section(7, exportedFunction),
    ...section(10, code),
  ]);
}

function auditStartTrapWasm(importName) {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const type = [2, 0x60, 2, 0x7f, 0x7f, 1, 0x7f, 0x60, 0, 0];
  const importedFunction = [1, ...encodeName("host"), ...encodeName(importName), 0, 0];
  const definedFunction = [1, 1];
  const start = [1];
  const body = [0, 0x41, 1, 0x41, 2, 0x10, 0, 0x1a, 0x00, 0x0b];
  const code = [1, ...encodeU32(body.length), ...body];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, type),
    ...section(2, importedFunction),
    ...section(3, definedFunction),
    ...section(8, start),
    ...section(10, code),
  ]);
}

function auditStartCatchesGateFailureWasm(importName) {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const type = [2, 0x60, 2, 0x7f, 0x7f, 1, 0x7f, 0x60, 0, 0];
  const importedFunction = [1, ...encodeName("host"), ...encodeName(importName), 0, 0];
  const definedFunction = [1, 1];
  const start = [1];
  const body = [0, 0x06, 0x40, 0x41, 1, 0x41, 2, 0x10, 0, 0x1a, 0x19, 0x0b, 0x0b];
  const code = [1, ...encodeU32(body.length), ...body];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, type),
    ...section(2, importedFunction),
    ...section(3, definedFunction),
    ...section(8, start),
    ...section(10, code),
  ]);
}

function printlnStartWasm() {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const type = [2, 0x60, 1, 0x7f, 1, 0x7f, 0x60, 0, 0];
  const importedFunction = [1, ...encodeName("host"), ...encodeName("__println"), 0, 0];
  const definedFunction = [1, 1];
  const start = [1];
  const body = [0, 0x41, 0, 0x10, 0, 0x1a, 0x0b];
  const code = [1, ...encodeU32(body.length), ...body];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, type),
    ...section(2, importedFunction),
    ...section(3, definedFunction),
    ...section(8, start),
    ...section(10, code),
  ]);
}

function arrayCreateWasm({ start }) {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const type = start
    ? [2, 0x60, 0, 1, 0x7f, 0x60, 0, 0]
    : [1, 0x60, 0, 1, 0x7f];
  const importedFunction = [1, ...encodeName("host"), ...encodeName("__array_create"), 0, 0];
  const definedFunction = start ? [1, 1] : [1, 0];
  const exportedFunction = [1, ...encodeName("invoke"), 0, 1];
  const body = start ? [0, 0x10, 0, 0x1a, 0x0b] : [0, 0x10, 0, 0x0b];
  const code = [1, ...encodeU32(body.length), ...body];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, type),
    ...section(2, importedFunction),
    ...section(3, definedFunction),
    ...(start ? section(8, [1]) : section(7, exportedFunction)),
    ...section(10, code),
  ]);
}

function externrefGlobalImportWasm() {
  const section = (id, payload) => [id, ...encodeU32(payload.length), ...payload];
  const type = [1, 0x60, 0, 0];
  const importedGlobal = [1, ...encodeName("host"), ...encodeName("__array_create"), 3, 0x6f, 0];
  const definedFunction = [1, 0];
  const exports = [2, ...encodeName("capability"), 3, 0, ...encodeName("invoke"), 0, 0];
  const body = [0, 0x0b];
  const code = [1, ...encodeU32(body.length), ...body];
  return bin([
    0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, type),
    ...section(2, importedGlobal),
    ...section(3, definedFunction),
    ...section(7, exports),
    ...section(10, code),
  ]);
}

test("an audit.write effect grant supplies every ABI import name for that effect", async () => {
  const wasm = auditImportWasm("audit.log");
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const hostCalls = [];
  const admitted = await admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(
      { onHostCall: (name, args, ret) => hostCalls.push({ name, args, ret }) },
      { effectHandlers: { "audit.write": (left, right) => left + right } },
    ),
  });

  assert.equal(admitted.instance.exports.invoke(7, 9), 16);
  assert.deepEqual(hostCalls, [{ name: "audit.log", args: [7, 9], ret: 16 }]);
});

test("an import-specific audit.log grant keeps its handler distinct from audit.write", async () => {
  const calls = [];
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  for (const [name, expected] of [["audit.write", 13], ["audit.log", 5]]) {
    const host = createHostRuntime({ onHostCall: (callName, args, ret) => calls.push({ name: callName, args, ret }) }, {
      effectHandlers: {
        "audit.write": (left, right) => left + right,
        "audit.log": (left, right) => left - right,
      },
    });
    const wasm = auditImportWasm(name);
    const attestation = signWasm(wasm, privateKeyPem, "dev");
    const admitted = await admitAndInstantiate({
      wasm,
      attestation,
      policy: { requireSigned: true, publicKeyPem },
      host,
    });
    assert.equal(admitted.instance.exports.invoke(9, 4), expected);
  }

  assert.deepEqual(calls, [
    { name: "audit.write", args: [9, 4], ret: 13 },
    { name: "audit.log", args: [9, 4], ret: 5 },
  ]);
});

test("a trapping WASM start function cannot invoke a granted host effect", async () => {
  const wasm = auditStartTrapWasm("audit.write");
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  let hostCalls = 0;
  const host = createHostRuntime(undefined, {
    effectHandlers: { "audit.write": () => { hostCalls++; return 3; } },
  });

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host,
  }), /CRITICAL_SECURITY_VIOLATION: instantiation failed/i);
  assert.equal(hostCalls, 0, "the effect handler remains unavailable until instantiation succeeds");
});

test("a WASM start cannot catch a denied host effect and then complete admission", async () => {
  const wasm = auditStartCatchesGateFailureWasm("audit.write");
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const hostCalls = [];
  const host = createHostRuntime(undefined, {
    effectHandlers: { "audit.write": (...args) => { hostCalls.push(args); return 3; } },
  });

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  }), /CRITICAL_SECURITY_VIOLATION: module startup attempted a host import/i);
  assert.deepEqual(hostCalls, [], "startup cannot invoke the denied host effect");
});

test("a WASM start function cannot emit output before admission completes", async () => {
  const wasm = printlnStartWasm();
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const attestation = signWasm(wasm, privateKeyPem, "dev");
  const output = [];

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation,
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime({ onOutput: (line) => output.push(line) }),
  }), /CRITICAL_SECURITY_VIOLATION: instantiation failed/i);
  assert.deepEqual(output, [], "startup output is unavailable until instantiation succeeds");
});

test("a failed WASM start quarantines its single-admission host", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const calls = [];
  const host = createHostRuntime({ onHostCall: (name) => calls.push(name) });
  const startWasm = arrayCreateWasm({ start: true });

  await assert.rejects(admitAndInstantiate({
    wasm: startWasm,
    attestation: signWasm(startWasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  }), /CRITICAL_SECURITY_VIOLATION: instantiation failed: host import host\.__array_create invoked before module admission completed/);
  assert.deepEqual(calls, [], "the failed start has not reached a host helper or its observer");

  const invokeWasm = arrayCreateWasm({ start: false });
  await assert.rejects(admitAndInstantiate({
    wasm: invokeWasm,
    attestation: signWasm(invokeWasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  }), /host runtime is already claimed or consumed/i);
  const retryHost = createHostRuntime({ onHostCall: (name) => calls.push(name) });
  const admitted = await admitAndInstantiate({
    wasm: invokeWasm,
    attestation: signWasm(invokeWasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: retryHost,
  });
  assert.equal(admitted.instance.exports.invoke(), 0, "a fresh runtime initializes a clean host registry");
  assert.deepEqual(calls, ["__array_create"]);
});

test("a function-only host capability cannot be imported as an externref global", async () => {
  const wasm = externrefGlobalImportWasm();
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  }), /CRITICAL_SECURITY_VIOLATION:.*import kind.*function/i);
});

test("inherited effect handlers do not grant an import", async () => {
  let hostCalls = 0;
  const effectHandlers = Object.create({ "audit.write": () => { hostCalls++; return 1; } });
  const host = createHostRuntime(undefined, { effectHandlers });
  const wasm = auditImportWasm("audit.write");
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  }), /import host\.audit\.write \(function\) is not provided/);
  assert.equal(hostCalls, 0);
});

test("effect handler accessors are read once and the validated handler is installed", async () => {
  let getterCalls = 0;
  let firstCalls = 0;
  let secondCalls = 0;
  const effectHandlers = {};
  Object.defineProperty(effectHandlers, "audit.log", {
    enumerable: true,
    get() {
      getterCalls++;
      return getterCalls === 1
        ? () => { firstCalls++; return 17; }
        : () => { secondCalls++; return 99; };
    },
  });
  const host = createHostRuntime(undefined, { effectHandlers });
  const wasm = auditImportWasm("audit.log");
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  assert.equal(admitted.instance.exports.invoke(10, 7), 17);
  assert.equal(getterCalls, 1);
  assert.equal(firstCalls, 1);
  assert.equal(secondCalls, 0);
});

test("an import-name-only grant does not authorize its sibling ABI alias", async () => {
  let hostCalls = 0;
  const host = createHostRuntime(undefined, {
    effectHandlers: { "audit.log": () => { hostCalls++; return 17; } },
  });
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const deniedWasm = auditImportWasm("audit.write");

  await assert.rejects(admitAndInstantiate({
    wasm: deniedWasm,
    attestation: signWasm(deniedWasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  }), /import host\.audit\.write \(function\) is not provided/);
  assert.equal(hostCalls, 0);

  const allowedWasm = auditImportWasm("audit.log");
  const allowedHost = createHostRuntime(undefined, {
    effectHandlers: { "audit.log": () => { hostCalls++; return 17; } },
  });
  const admitted = await admitAndInstantiate({
    wasm: allowedWasm,
    attestation: signWasm(allowedWasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: allowedHost,
  });
  assert.equal(admitted.instance.exports.invoke(10, 7), 17);
  assert.equal(hostCalls, 1);
});

test("invokeAdmittedExport refuses a transparent Proxy alias before guest execution or cleanup", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = invocationAndCleanupCounterWasm();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });
  const direct = invokeAdmittedExport(admitted.instance, "run", []);
  assert.deepEqual(direct, { ok: true, result: 7 }, "the exact admitted wrapper remains callable");
  assert.equal(admitted.instance.exports.guest_calls.value, 1, "the positive control entered the guest once");
  assert.equal(admitted.instance.exports.wipe_calls.value, 1, "the positive control wiped once");

  let proxyGetTraps = 0;
  const alias = new Proxy(admitted.instance, {
    get(target, property, receiver) {
      proxyGetTraps++;
      return Reflect.get(target, property, receiver);
    },
  });

  const result = invokeAdmittedExport(alias, "run", []);

  assert.equal(result.ok, false, "an unregistered alias must not be treated as a raw admitted instance");
  assert.match(result.reason, /proxy instance refused/i);
  assert.equal(proxyGetTraps, 0, "refusal occurs before touching the proxy target");
  assert.equal(admitted.instance.exports.guest_calls.value, 1, "refusal did not re-enter the guest");
  assert.equal(admitted.instance.exports.wipe_calls.value, 1, "refusal did not repeat cleanup");

  let nestedProxyGetTraps = 0;
  const nestedAlias = new Proxy(alias, {
    get(target, property, receiver) {
      nestedProxyGetTraps++;
      return Reflect.get(target, property, receiver);
    },
  });
  const nestedResult = invokeAdmittedExport(nestedAlias, "run", []);
  assert.equal(nestedResult.ok, false);
  assert.equal(nestedProxyGetTraps, 0, "nested proxy refusal does not execute either proxy trap");
  assert.equal(admitted.instance.exports.guest_calls.value, 1);
  assert.equal(admitted.instance.exports.wipe_calls.value, 1);

  let revokedProxyGetTraps = 0;
  const revocable = Proxy.revocable(admitted.instance, {
    get(target, property, receiver) {
      revokedProxyGetTraps++;
      return Reflect.get(target, property, receiver);
    },
  });
  revocable.revoke();
  const revokedResult = invokeAdmittedExport(revocable.proxy, "run", []);
  assert.equal(revokedResult.ok, false, "revoked proxy refusal is a normal deny result");
  assert.equal(revokedProxyGetTraps, 0, "revoked proxy refusal does not invoke traps");
  assert.equal(admitted.instance.exports.guest_calls.value, 1);
  assert.equal(admitted.instance.exports.wipe_calls.value, 1);
});

test("one admitted instance refuses re-entry without wiping the active outer call", async (t) => {
  for (const outerRoute of ["wrapped export", "invokeAdmittedExport"]) {
    for (const nestedRoute of ["wrapped export", "invokeAdmittedExport"]) {
      await t.test(`${outerRoute} -> ${nestedRoute}`, async () => {
        const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
        let admitted;
        let nestedOutcome;
        let memoryReadRefused;
        let hostMemoryRefusals;
        let retainedHostSnapshot;
        let guestCallsAfterNested;
        let wipeCallsAfterNested;
        const host = createHostRuntime(undefined, {
          effectHandlers: {
            "audit.write": () => {
              if (nestedRoute === "wrapped export") {
                try {
                  admitted.instance.exports.inner();
                  nestedOutcome = { ok: true };
                } catch (error) {
                  nestedOutcome = { ok: false, reason: error instanceof Error ? error.message : String(error) };
                }
              } else {
                nestedOutcome = invokeAdmittedExport(admitted.instance, "inner", []);
              }
              const hostMemoryOperations = [
                ["snapshotMemory", () => host.snapshotMemory()],
                ["readRecordField", () => host.readRecordField(0, 0)],
                ["copyArrayRecords", () => host.copyArrayRecords(hostArrayHandle, 1)],
                ["copyArrayRecordsLayout", () => host.copyArrayRecordsLayout(hostArrayHandle, [{ kind: "i32" }])],
                ["allocRecord", () => host.allocRecord([1])],
              ];
              hostMemoryRefusals = Object.fromEntries(hostMemoryOperations.map(([name, operation]) => {
                try {
                  const result = operation();
                  if (name === "snapshotMemory") retainedHostSnapshot = result;
                  return [name, false];
                } catch (error) {
                  return [name, error instanceof Error && /FUNGI-WASM-MEMORY-001/.test(error.message)];
                }
              }));
              const exports = admitted.instance.exports;
              try {
                void exports.memory.buffer;
              } catch (error) {
                memoryReadRefused = error instanceof Error && /FUNGI-WASM-MEMORY-001/.test(error.message);
              }
              guestCallsAfterNested = exports.guest_calls.value;
              wipeCallsAfterNested = exports.wipe_calls.value;
              return 17;
            },
          },
        });
        const wasm = reentrantExportWasm();
        const hostArrayHandle = host.internArray([0]);
        admitted = await admitAndInstantiate({
          wasm,
          attestation: signWasm(wasm, privateKeyPem, "dev"),
          policy: { requireSigned: true, publicKeyPem },
          host,
        });

        let outerOutcome;
        if (outerRoute === "wrapped export") {
          outerOutcome = admitted.instance.exports.outer();
        } else {
          outerOutcome = invokeAdmittedExport(admitted.instance, "outer", []);
        }

        assert.equal(nestedOutcome.ok, false, "nested export must be refused");
        assert.match(nestedOutcome.reason, /FUNGI-WASM-REENTRANT-001/);
        assert.deepEqual(hostMemoryRefusals, {
          snapshotMemory: true,
          readRecordField: true,
          copyArrayRecords: true,
          copyArrayRecordsLayout: true,
          allocRecord: true,
        }, "every host memory read/copy/write surface refuses during the active guest call");
        assert.equal(retainedHostSnapshot, undefined, "no guest-memory copy escapes through the host callback");
        assert.equal(memoryReadRefused, true, "the active-call callback cannot inspect guest memory");
        assert.equal(guestCallsAfterNested, 0, "nested refusal must happen before entering guest code");
        assert.equal(wipeCallsAfterNested, 0, "nested refusal must not run cleanup during the outer call");
        assert.equal(
          new DataView(host.snapshotMemory().buffer).getInt32(0, true),
          0,
          "host memory inspection is available only after the outer call's cleanup has cleared the test secret",
        );
        if (outerRoute === "wrapped export") {
          assert.equal(outerOutcome, 42, "the outer call must read its original value after the callback");
        } else {
          assert.deepEqual(outerOutcome, { ok: true, result: 42 });
        }
        assert.equal(admitted.instance.exports.wipe_calls.value, 1, "the outer call cleans exactly once after it returns");
        assert.equal(admitted.instance.exports.read_word(), 0, "owned bytes are wiped before the next public call");
        assert.equal(admitted.instance.exports.wipe_calls.value, 2, "the scalar probe is itself cleaned once");
      });
    }
  }
});

test("admitted exports refuse direct secret cleanup during an active guest call", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let admitted;
  let wipeHelperType;
  let wipeHelperRefusal;
  let memoryReadRefused = false;
  let wipeCallsAfterCallback;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        const helper = admitted.instance.exports.__fungi_wipe_owned;
        wipeHelperType = typeof helper;
        if (typeof helper === "function") {
          try {
            helper();
          } catch (error) {
            wipeHelperRefusal = error instanceof Error ? error.message : String(error);
          }
        }
        try {
          void admitted.instance.exports.memory.buffer;
        } catch (error) {
          memoryReadRefused = error instanceof Error && /FUNGI-WASM-MEMORY-001/.test(error.message);
        }
        wipeCallsAfterCallback = admitted.instance.exports.wipe_calls.value;
        return 17;
      },
    },
  });
  const wasm = reentrantExportWasm();
  admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  const outerResult = admitted.instance.exports.outer();

  assert.equal(wipeHelperType, "function", "the helper remains available for compatibility");
  assert.match(wipeHelperRefusal, /FUNGI-WASM-REENTRANT-001/, "active-call cleanup must refuse before the raw helper runs");
  assert.equal(memoryReadRefused, true, "host callback cannot inspect bytes before the active guest call returns");
  assert.equal(wipeCallsAfterCallback, 0, "host callback cannot invoke cleanup during the active guest call");
  assert.equal(outerResult, 42, "outer guest call still reads its original bytes after the callback");
  assert.equal(admitted.instance.exports.wipe_calls.value, 1, "the runtime performs cleanup once after outer completion");
  assert.equal(admitted.instance.exports.read_word(), 0, "owned bytes are wiped before the next public call");
  assert.equal(admitted.instance.exports.wipe_calls.value, 2, "the scalar probe is itself cleaned once");
});

test("admitted exports refuse re-entry through an exported WebAssembly table", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let admitted;
  let nestedOutcome;
  let tableWipeOutcome;
  let guestCallsAfterCallback;
  let wipeCallsAfterCallback;
  let memoryReadRefused = false;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        try {
          nestedOutcome = { ok: true, result: admitted.instance.exports.inner_table.get(0)() };
        } catch (error) {
          nestedOutcome = { ok: false, reason: error instanceof Error ? error.message : String(error) };
        }
        try {
          admitted.instance.exports.inner_table.get(1)();
          tableWipeOutcome = { ok: true };
        } catch (error) {
          tableWipeOutcome = { ok: false, reason: error instanceof Error ? error.message : String(error) };
        }
        const exports = admitted.instance.exports;
        guestCallsAfterCallback = exports.guest_calls.value;
        wipeCallsAfterCallback = exports.wipe_calls.value;
        try {
          void exports.memory.buffer;
        } catch (error) {
          memoryReadRefused = error instanceof Error && /FUNGI-WASM-MEMORY-001/.test(error.message);
        }
        return 17;
      },
    },
  });
  const wasm = reentrantExportWasm({ exposeInnerTable: true });
  admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  const outerResult = admitted.instance.exports.outer();

  assert.equal(nestedOutcome.ok, false, "table-held raw guest functions must not execute through the public table");
  assert.match(nestedOutcome.reason, /FUNGI-WASM-REENTRANT-001/);
  assert.equal(tableWipeOutcome.ok, false, "a table-held raw cleanup function must not bypass the gate");
  assert.match(tableWipeOutcome.reason, /FUNGI-WASM-REENTRANT-001/);
  assert.equal(guestCallsAfterCallback, 0, "table re-entry is refused before guest code");
  assert.equal(wipeCallsAfterCallback, 0, "table re-entry does not clean up during the outer call");
  assert.equal(memoryReadRefused, true, "table callback cannot inspect active guest memory");
  assert.equal(outerResult, 42, "outer call completes using its original value");
  assert.equal(admitted.instance.exports.wipe_calls.value, 1, "outer cleanup occurs once after return");
  assert.equal(admitted.instance.exports.read_word(), 0, "owned bytes are wiped before the next public call");
  assert.equal(admitted.instance.exports.wipe_calls.value, 2, "the scalar probe is itself cleaned once");
});

test("an exported table accessor cannot reveal its raw table during an active call", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let admitted;
  let accessorRefused = false;
  let nestedGuestCalls = -1;
  let wipesDuringCallback = -1;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        const table = admitted.instance.exports.inner_table;
        try {
          Object.defineProperty(table, "rawSelf", { configurable: true, get() { return this; } });
          const rawTable = table.rawSelf;
          const rawInner = WebAssembly.Table.prototype.get.call(rawTable, 0);
          rawInner();
          const rawWipe = WebAssembly.Table.prototype.get.call(rawTable, 1);
          rawWipe();
        } catch {
          accessorRefused = true;
        }
        nestedGuestCalls = admitted.instance.exports.guest_calls.value;
        wipesDuringCallback = admitted.instance.exports.wipe_calls.value;
        return 17;
      },
    },
  });
  const wasm = reentrantExportWasm({ exposeInnerTable: true });
  admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  assert.equal(admitted.instance.exports.outer(), 42, "raw table references cannot wipe the active outer value");
  assert.equal(accessorRefused, true, "unmediated table properties are refused");
  assert.equal(nestedGuestCalls, 0, "raw inner functions cannot re-enter the guest");
  assert.equal(wipesDuringCallback, 0, "raw wipe helpers cannot run during the active export");
  assert.equal(admitted.instance.exports.wipe_calls.value, 1, "outer cleanup occurs exactly once");
});

test("admitted exports refuse host-side table mutation even while idle", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = reentrantExportWasm({ exposeInnerTable: true });
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(undefined, { effectHandlers: { "audit.write": () => 17 } }),
  });
  const table = admitted.instance.exports.inner_table;

  assert.throws(() => table.set(0, null), /FUNGI-WASM-TABLE-001/);
  assert.throws(() => table.grow(1, null), /FUNGI-WASM-TABLE-001/);
  assert.equal(table.get(0)(), 7, "the attested table entry remains callable through its wrapper");
});

test("admitted exports do not let the host mutate a cleanup-control global", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let admitted;
  const wasm = reentrantExportWasm({ gateWipeWithGuestCounter: true });
  let mutationRefused = false;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        try {
          admitted.instance.exports.guest_calls.value = 0;
        } catch (error) {
          mutationRefused = error instanceof Error && /FUNGI-WASM-GLOBAL-001/.test(error.message);
        }
        return 17;
      },
    },
  });
  admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  assert.equal(admitted.instance.exports.outer(), 42);
  assert.equal(mutationRefused, true, "the exported guest control global is read-only to the host");
  assert.equal(admitted.instance.exports.guest_calls.value, 1, "the host cannot reset guest cleanup state");
  assert.equal(admitted.instance.exports.wipe_calls.value, 1, "the outer call performs cleanup once");
  assert.equal(admitted.instance.exports.read_word(), 0, "cleanup must not trust host-mutable guest control state");
  assert.equal(admitted.instance.exports.wipe_calls.value, 2, "the scalar probe is itself cleaned once");
});

test("admitted exports never expose a live WebAssembly memory buffer", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let admitted;
  let callbackReadRefused = false;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        try {
          void admitted.instance.exports.memory.buffer;
        } catch (error) {
          callbackReadRefused = error instanceof Error && /FUNGI-WASM-MEMORY-001/.test(error.message);
        }
        return 17;
      },
    },
  });
  const wasm = reentrantExportWasm();
  admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });
  const memory = admitted.instance.exports.memory;

  assert.equal(memory instanceof WebAssembly.Memory, true, "the export keeps its recognizable memory type");
  assert.throws(() => memory.buffer, /FUNGI-WASM-MEMORY-001/, "the caller cannot obtain a live or copied buffer");
  assert.throws(
    () => Object.getOwnPropertyDescriptor(WebAssembly.Memory.prototype, "buffer").get.call(memory),
    TypeError,
    "calling the native accessor on the facade must not reveal its target",
  );
  assert.equal(admitted.instance.exports.outer(), 42, "refusing public memory access does not break execution");
  assert.equal(callbackReadRefused, true, "a same-stack host callback cannot inspect active guest memory");
});

test("__range uses a captured memory accessor when a granted callback tampers with the prototype", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let admitted;
  let bufferGetterCalls = 0;
  let capturedMemory;
  let rangeResult;
  const originalDescriptor = Object.getOwnPropertyDescriptor(WebAssembly.Memory.prototype, "buffer");
  assert.equal(typeof originalDescriptor?.get, "function");
  const originalGetter = originalDescriptor.get;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        Object.defineProperty(WebAssembly.Memory.prototype, "buffer", {
          ...originalDescriptor,
          get() {
            bufferGetterCalls++;
            capturedMemory = this;
            return originalGetter.call(this);
          },
        });
        try {
          rangeResult = host.imports.host.__range(0, 1);
        } finally {
          Object.defineProperty(WebAssembly.Memory.prototype, "buffer", originalDescriptor);
        }
        return 17;
      },
    },
  });
  const wasm = reentrantExportWasm();
  admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  assert.equal(admitted.instance.exports.outer(), 42);
  assert.equal(rangeResult, 0);
  assert.deepEqual(host.readArray(rangeResult), [0], "the legitimate bounded range result remains available");
  assert.equal(bufferGetterCalls, 0, "host memory sizing must not dispatch through a callback-mutated prototype getter");
  assert.equal(capturedMemory, undefined, "the callback must not capture the private raw Memory receiver");
});

test("__range does not expose the private guest buffer through a replaced byteLength getter", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let admitted;
  let escapedReceiver;
  let escapedCopy;
  let rangeResult;
  const byteLengthDescriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength");
  assert.equal(typeof byteLengthDescriptor?.get, "function");
  const originalByteLength = byteLengthDescriptor.get;
  const OriginalUint8Array = Uint8Array;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        Object.defineProperty(ArrayBuffer.prototype, "byteLength", {
          ...byteLengthDescriptor,
          get() {
            escapedReceiver = this;
            const size = Reflect.apply(originalByteLength, this, []);
            const source = new OriginalUint8Array(this);
            escapedCopy = new OriginalUint8Array(size);
            for (let index = 0; index < size; index++) escapedCopy[index] = source[index];
            return size;
          },
        });
        try {
          rangeResult = host.imports.host.__range(0, 1);
        } finally {
          Object.defineProperty(ArrayBuffer.prototype, "byteLength", byteLengthDescriptor);
        }
        return 17;
      },
    },
  });
  const wasm = reentrantExportWasm();
  admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  assert.equal(admitted.instance.exports.outer(), 42);
  assert.deepEqual(host.readArray(rangeResult), [0]);
  assert.equal(escapedReceiver, undefined, "runtime must not dispatch through a mutable buffer property getter");
  assert.equal(escapedCopy, undefined, "no copied secret bytes may survive the guest-memory cleanup");
});

test("secret result copying does not pass guest memory to a replaced Int32Array constructor", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let escapedGuestCopy;
  const OriginalInt32Array = globalThis.Int32Array;
  const OriginalArrayBuffer = globalThis.ArrayBuffer;
  const OriginalUint8Array = globalThis.Uint8Array;
  const OriginalDataView = globalThis.DataView;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        globalThis.Int32Array = new Proxy(OriginalInt32Array, {
          construct(target, args, newTarget) {
            const buffer = args[0];
            if (buffer instanceof OriginalArrayBuffer) {
              const source = new OriginalUint8Array(buffer);
              const copy = new OriginalUint8Array(source.length);
              for (let index = 0; index < source.length; index++) copy[index] = source[index];
              escapedGuestCopy = copy;
            }
            return Reflect.construct(target, args, newTarget);
          },
        });
        return 17;
      },
    },
  });
  const wasm = secretHeapResultWithAuditWasm();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  let result;
  try {
    result = admitted.instance.exports.run();
  } finally {
    globalThis.Int32Array = OriginalInt32Array;
  }

  assert.equal(result, 0x1234);
  assert.equal(escapedGuestCopy, undefined, "the host callback must not copy private guest bytes before wipe");
  assert.equal(
    new OriginalDataView(host.snapshotMemory().buffer).getInt32(1024, true),
    0,
    "the synthetic secret word is wiped after result copying",
  );
});

test("admitted nested secret results are deeply copied before owned-memory wipe", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const host = createHostRuntime();
  const wasm = nestedSecretRecordResultWasm();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
    returnLayouts: {
      run: [
        { kind: "i32" },
        { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] },
      ],
    },
  });

  const result = admitted.instance.exports.run();
  const memoryAfterWipe = host.snapshotMemory();

  assert.deepEqual(result, [7, [11, 13]]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[1]), true);
  const view = new DataView(memoryAfterWipe.buffer);
  for (const address of [1024, 1028, 1032, 1036]) {
    assert.equal(view.getInt32(address, true), 0, `guest-owned result word at ${address} is wiped`);
  }
});

test("strict owned-return admission copies the attested nested schema before wiping guest memory", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const host = createHostRuntime();
  const metadata = JSON.stringify({
    version: 1,
    exports: {
      run: {
        kind: "record",
        fields: [
          { kind: "i32" },
          { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] },
        ],
      },
    },
  });
  const customPayload = [
    ...encodeName("fungi.owned-returns.v1"),
    ...new TextEncoder().encode(metadata),
  ];
  const customSection = [0, ...encodeU32(customPayload.length), ...customPayload];
  const wasm = bin([...nestedSecretRecordResultWasm(), ...customSection]);
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
    requireOwnedReturnSchemas: true,
  });

  const result = admitted.instance.exports.run();
  const memoryAfterWipe = host.snapshotMemory();

  assert.deepEqual(result, [7, [11, 13]]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[1]), true);
  const view = new DataView(memoryAfterWipe.buffer);
  for (const address of [1024, 1028, 1032, 1036]) {
    assert.equal(view.getInt32(address, true), 0, `attested guest-owned result word at ${address} is wiped`);
  }
});

test("strict owned-return admission refuses modules without attested return metadata", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = nestedSecretRecordResultWasm();

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
    requireOwnedReturnSchemas: true,
  }), /strict admission requires attested owned-return metadata/i);
});

test("strict owned-return admission refuses an unknown or malformed return schema", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const malformed = JSON.stringify({
    version: 1,
    exports: { run: { kind: "guest-object", fields: [] } },
  });
  const customPayload = [
    ...encodeName("fungi.owned-returns.v1"),
    ...new TextEncoder().encode(malformed),
  ];
  const customSection = [0, ...encodeU32(customPayload.length), ...customPayload];
  const wasm = bin([...nestedSecretRecordResultWasm(), ...customSection]);

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
    requireOwnedReturnSchemas: true,
  }), /owned-return schema contains unknown kind or fields/i);
});

test("admitted nested secret result refuses a cyclic guest record and still wipes owned memory", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const host = createHostRuntime();
  const wasm = nestedSecretRecordResultWasm({ cyclic: true });
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
    returnLayouts: {
      run: [
        { kind: "i32" },
        { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] },
      ],
    },
  });

  assert.throws(() => admitted.instance.exports.run(), /cyclic record pointer/);
  const memoryAfterRefusal = host.snapshotMemory();
  const view = new DataView(memoryAfterRefusal.buffer);
  for (const address of [1024, 1028, 1032, 1036]) {
    assert.equal(view.getInt32(address, true), 0, `guest-owned result word at ${address} is wiped after refusal`);
  }
});

test("declared nested result refuses a scalar-shaped guest result instead of returning its pointer", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const host = createHostRuntime();
  const wasm = nestedSecretRecordResultWasm({ heapTagged: false });
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
    returnLayouts: {
      run: [{ kind: "i32" }, { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] }],
    },
  });

  assert.throws(() => admitted.instance.exports.run(), /FUNGI-WASM-RET-001: incomplete secret return copy/);
  const view = new DataView(host.snapshotMemory().buffer);
  for (const address of [1024, 1028, 1032, 1036]) {
    assert.equal(view.getInt32(address, true), 0, `guest-owned result word at ${address} is wiped after refusal`);
  }
});

test("declared nested result refuses admission when the owned-memory wipe helper is absent", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = nestedSecretRecordResultWasm({ includeWipe: false });

  await assert.rejects(
    admitAndInstantiate({
      wasm,
      attestation: signWasm(wasm, privateKeyPem, "dev"),
      policy: { requireSigned: true, publicKeyPem },
      host: createHostRuntime(),
      returnLayouts: {
        run: [{ kind: "i32" }, { kind: "record", fields: [{ kind: "i32" }, { kind: "i32" }] }],
      },
    }),
    /FUNGI-WASM-RET-001: declared result layout requires owned-memory cleanup/,
  );
});

test("snapshotMemory does not pass guest memory to a replaced ArrayBuffer slice method", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let escapedReceiver;
  const sliceDescriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "slice");
  assert.equal(typeof sliceDescriptor?.value, "function");
  const originalSlice = sliceDescriptor.value;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        Object.defineProperty(ArrayBuffer.prototype, "slice", {
          ...sliceDescriptor,
          value(...args) {
            escapedReceiver = this;
            return Reflect.apply(originalSlice, this, args);
          },
        });
        return 17;
      },
    },
  });
  const wasm = secretHeapResultWithAuditWasm();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  try {
    admitted.instance.exports.run();
    assert.ok(host.snapshotMemory() instanceof Uint8Array);
  } finally {
    Object.defineProperty(ArrayBuffer.prototype, "slice", sliceDescriptor);
  }

  assert.equal(escapedReceiver, undefined, "snapshotting must not dispatch through a mutable method on the private buffer");
});

test("secret result finalization does not pass raw memory to a replaced Symbol.hasInstance", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let escapedMemory;
  let escapedCopy;
  const memoryBufferGetter = Object.getOwnPropertyDescriptor(WebAssembly.Memory.prototype, "buffer")?.get;
  const byteLengthGetter = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")?.get;
  assert.equal(typeof memoryBufferGetter, "function");
  assert.equal(typeof byteLengthGetter, "function");
  const priorHasInstance = Object.getOwnPropertyDescriptor(WebAssembly.Memory, Symbol.hasInstance);
  const OriginalUint8Array = Uint8Array;
  const OriginalDataView = DataView;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": () => {
        Object.defineProperty(WebAssembly.Memory, Symbol.hasInstance, {
          configurable: true,
          value(candidate) {
            let buffer;
            try {
              buffer = Reflect.apply(memoryBufferGetter, candidate, []);
            } catch {
              return false;
            }
            escapedMemory = candidate;
            const size = Reflect.apply(byteLengthGetter, buffer, []);
            const source = new OriginalUint8Array(buffer);
            escapedCopy = new OriginalUint8Array(size);
            for (let index = 0; index < size; index++) escapedCopy[index] = source[index];
            return true;
          },
        });
        return 17;
      },
    },
  });
  const wasm = secretHeapResultWithAuditWasm();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  let result;
  try {
    result = admitted.instance.exports.run();
  } finally {
    if (priorHasInstance === undefined) delete WebAssembly.Memory[Symbol.hasInstance];
    else Object.defineProperty(WebAssembly.Memory, Symbol.hasInstance, priorHasInstance);
  }

  assert.equal(result, 0x1234);
  assert.equal(escapedMemory, undefined, "the mutable brand hook must not receive raw guest Memory");
  assert.equal(escapedCopy, undefined, "the mutable brand hook must not retain pre-wipe secret bytes");
  assert.equal(
    new OriginalDataView(host.snapshotMemory().buffer).getInt32(1024, true),
    0,
    "the synthetic secret word is wiped after finalization",
  );
});

test("secret result finalization does not reuse a view after guest metadata grows memory", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const host = createHostRuntime(undefined, { effectHandlers: { "audit.write": () => 17 } });
  const wasm = secretHeapResultWithAuditWasm({ growDuringWordsMetadata: true });
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  const result = admitted.instance.exports.run();
  const memoryAfterWipe = host.snapshotMemory();

  assert.equal(result, 0x1234, "the complete owned result survives metadata-driven memory growth");
  assert.equal(memoryAfterWipe?.byteLength, 2 * 64 * 1024, "the controlled guest helper grew memory by one page");
  assert.equal(
    new DataView(memoryAfterWipe.buffer).getInt32(1024, true),
    0,
    "cleanup wipes the result from the grown memory",
  );
});

test("admission refuses reference-valued global exports", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = funcrefGlobalWasm();

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  }), /FUNGI-WASM-REFERENCE-001/);
});

test("admission refuses a guest reference passed into the numeric Result import", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = funcrefResultImportWasm();
  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  }), /FUNGI-WASM-REFERENCE-001/);
});

test("admission refuses a reference-valued global even under a reserved secret-helper name", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = funcrefGlobalWasm("__fungi_heap_get");

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  }), /FUNGI-WASM-REFERENCE-001/);
});

test("admission refuses a table exported under a reserved secret-helper name", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = helperTableWasm();

  await assert.rejects(admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  }), /FUNGI-WASM-REFERENCE-001/);
});

test("admitted numeric globals do not expose their raw target through inherited getters", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = mutableNumericGlobalWasm();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });
  const key = "__testRawGlobalEscape";
  const prior = Object.getOwnPropertyDescriptor(WebAssembly.Global.prototype, key);
  Object.defineProperty(WebAssembly.Global.prototype, key, {
    configurable: true,
    get() { return this; },
  });
  try {
    const proxy = admitted.instance.exports.counter;
    assert.equal(proxy[key], undefined, "unknown global properties stay outside the admitted facade");
    assert.equal(proxy.value, 7, "the approved numeric value remains readable");
  } finally {
    if (prior === undefined) delete WebAssembly.Global.prototype[key];
    else Object.defineProperty(WebAssembly.Global.prototype, key, prior);
  }
});

test("admitted exports refuse function-valued results instead of returning raw guest functions", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = funcrefReturnWasm();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });

  assert.throws(() => admitted.instance.exports.return_ref(), /FUNGI-WASM-REFERENCE-001/);
});

test("secret helper exports refuse function-valued results", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = funcrefReturnWasm("__fungi_heap_get");
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });

  assert.throws(() => admitted.instance.exports.__fungi_heap_get(), /FUNGI-WASM-REFERENCE-001/);
});

test("admitted exports refuse multi-value results containing a function reference", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = multiValueFuncrefReturnWasm();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });

  assert.throws(() => admitted.instance.exports.return_pair(), /FUNGI-WASM-REFERENCE-001/);
});

test("a trapping secret helper wipes then quarantines the admitted instance", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = trappingHeapGetterWasm();
  const rawFixture = new WebAssembly.Instance(new WebAssembly.Module(wasm));
  assert.throws(() => rawFixture.exports.__fungi_heap_get(), /unreachable/);
  assert.equal(new Int32Array(rawFixture.exports.memory.buffer)[0], 23, "the fixture confirms partial secret state before cleanup");
  rawFixture.exports.__fungi_wipe_owned();
  assert.equal(new Int32Array(rawFixture.exports.memory.buffer)[0], 0, "the fixture wipe helper clears the partial state");

  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });

  assert.throws(() => admitted.instance.exports.__fungi_heap_get(), /unreachable/);
  assert.throws(() => admitted.instance.exports.memory.buffer, /FUNGI-WASM-MEMORY-001/);
  assert.throws(() => admitted.instance.exports.__fungi_heap_get(), /FUNGI-WASM-QUARANTINED-001/);
  assert.throws(() => admitted.instance.exports.read_word(), /FUNGI-WASM-QUARANTINED-001/);
});

test("direct idle secret cleanup holds the instance gate while invoking the raw helper", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  let admitted;
  let firstWipeCallback = true;
  let nestedOutcome;
  const host = createHostRuntime(undefined, {
    effectHandlers: {
      "audit.write": (a, b) => {
        if (a === 0 && b === 0 && firstWipeCallback) {
          firstWipeCallback = false;
          try {
            admitted.instance.exports.inner();
            nestedOutcome = { ok: true };
          } catch (error) {
            nestedOutcome = { ok: false, reason: error instanceof Error ? error.message : String(error) };
          }
        }
        return 17;
      },
    },
  });
  const wasm = reentrantExportWasm({ wipeCallsHost: true });
  admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host,
  });

  admitted.instance.exports.__fungi_wipe_owned();
  const laterCall = admitted.instance.exports.inner();

  assert.equal(nestedOutcome.ok, false, "a cleanup import cannot re-enter while direct cleanup is active");
  assert.match(nestedOutcome.reason, /FUNGI-WASM-REENTRANT-001/);
  assert.equal(laterCall, 7, "the active state is released after idle cleanup returns");
  assert.equal(admitted.instance.exports.guest_calls.value, 1, "the blocked nested call did not enter guest code");
  assert.equal(admitted.instance.exports.wipe_calls.value, 2, "direct and later-call cleanup each run once");
});

test("invokeAdmittedExport refuses an inherited wrapper alias before re-entry or repeated cleanup", async () => {
  const { publicKeyPem, privateKeyPem } = generateRunnerKeypair();
  const wasm = invocationAndCleanupCounterWasm();
  const admitted = await admitAndInstantiate({
    wasm,
    attestation: signWasm(wasm, privateKeyPem, "dev"),
    policy: { requireSigned: true, publicKeyPem },
    host: createHostRuntime(),
  });
  const direct = invokeAdmittedExport(admitted.instance, "run", []);
  assert.deepEqual(direct, { ok: true, result: 7 });
  assert.equal(admitted.instance.exports.guest_calls.value, 1);
  assert.equal(admitted.instance.exports.wipe_calls.value, 1);

  const inheritedAlias = Object.create(admitted.instance);
  const result = invokeAdmittedExport(inheritedAlias, "run", []);

  assert.equal(result.ok, false, "an object inheriting an admitted wrapper is not a genuine raw instance");
  assert.match(result.reason, /genuine WebAssembly\.Instance/i);
  assert.equal(admitted.instance.exports.guest_calls.value, 1, "the alias did not re-enter the guest");
  assert.equal(admitted.instance.exports.wipe_calls.value, 1, "the alias did not repeat cleanup");
});

test("invokeAdmittedExport refuses ordinary and forged instances before reading exports", () => {
  let ordinaryGetterCalls = 0;
  const ordinary = Object.defineProperty({}, "exports", {
    get() {
      ordinaryGetterCalls++;
      throw new Error("ordinary exports getter must not run");
    },
  });
  const ordinaryResult = invokeAdmittedExport(ordinary, "run", []);
  assert.equal(ordinaryResult.ok, false);
  assert.match(ordinaryResult.reason, /genuine WebAssembly\.Instance/i);
  assert.equal(ordinaryGetterCalls, 0);

  let forgedGetterCalls = 0;
  const forged = Object.create(WebAssembly.Instance.prototype);
  Object.defineProperty(forged, "exports", {
    get() {
      forgedGetterCalls++;
      throw new Error("forged exports getter must not run");
    },
  });
  const forgedResult = invokeAdmittedExport(forged, "run", []);
  assert.equal(forgedResult.ok, false);
  assert.match(forgedResult.reason, /genuine WebAssembly\.Instance/i);
  assert.equal(forgedGetterCalls, 0);
});

test("invokeAdmittedExport refuses a genuine but unadmitted instance after prototype tampering", () => {
  const wasm = invocationAndCleanupCounterWasm();
  const raw = new WebAssembly.Instance(new WebAssembly.Module(wasm));
  const originalPrototype = Object.getPrototypeOf(raw);
  const originalExportsDescriptor = Object.getOwnPropertyDescriptor(originalPrototype, "exports");
  const originalApplyDescriptor = Object.getOwnPropertyDescriptor(Reflect, "apply");
  let hostileGetterCalls = 0;
  let hostileApplyCalls = 0;
  let result;
  let guestCalls;
  let wipeCalls;

  try {
    Object.setPrototypeOf(raw, null);
    Object.defineProperty(raw, "exports", {
      configurable: true,
      get() {
        hostileGetterCalls++;
        throw new Error("overridden exports getter must not run");
      },
    });
    Object.defineProperty(Reflect, "apply", {
      ...originalApplyDescriptor,
      value() {
        hostileApplyCalls++;
        throw new Error("replacement Reflect.apply must not run");
      },
    });

    result = invokeAdmittedExport(raw, "run", []);
    const exports = originalExportsDescriptor.get.call(raw);
    guestCalls = exports.guest_calls.value;
    wipeCalls = exports.wipe_calls.value;
  } finally {
    Object.defineProperty(Reflect, "apply", originalApplyDescriptor);
    Object.setPrototypeOf(raw, originalPrototype);
    delete raw.exports;
  }

  assert.equal(result.ok, false);
  assert.match(result.reason, /instance has not completed admission/i);
  assert.equal(hostileGetterCalls, 0);
  assert.equal(hostileApplyCalls, 0);
  assert.equal(guestCalls, 0, "an unadmitted raw instance must not enter guest code");
  assert.equal(wipeCalls, 0, "refusal must happen before cleanup or guest invocation");
});

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
