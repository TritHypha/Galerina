import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const MEM = join(HERE, "..", "..");
const REPO = join(MEM, "..", "..", "..");
const RUNTIME_JS = join(REPO, "packages-ts", "galerina-core-runtime-wasm", "dist", "wasm-runtime.js");

async function loadHostFactory(url) {
  const mod = await import(url);
  assert.equal(typeof mod.createHostRuntime, "function");
  return mod.createHostRuntime;
}

async function freshHost() {
  const createHostRuntime = await loadHostFactory(pathToFileURL(RUNTIME_JS).href);
  const host = createHostRuntime();
  host.bindMemory(new WebAssembly.Memory({ initial: 1 }));
  return host;
}

function withPatchedFn(obj, key, stub, body) {
  const orig = obj[key];
  obj[key] = stub;
  try {
    return body();
  } finally {
    obj[key] = orig;
  }
}

function copyDistMutant(mutateText) {
  const dir = mkdtempSync(join(tmpdir(), "q45-mut-"));
  const distSrc = join(REPO, "packages-ts", "galerina-core-runtime-wasm", "dist");
  const names = readdirSync(distSrc);
  let i = 0;
  while (i < names.length) {
    copyFileSync(join(distSrc, names[i]), join(dir, names[i]));
    i = i + 1;
  }
  const copy = join(dir, "wasm-runtime.js");
  const orig = readFileSync(copy, "utf8");
  const next = mutateText(orig);
  assert.notEqual(next, orig, "mutant must change dist");
  writeFileSync(copy, next);
  return { dir, copy };
}

test("F1 Number.isInteger is live at __array_append after createHostRuntime", async () => {
  const host = await freshHost();
  const id = host.imports.host.__array_create();
  const orig = Number.isInteger;
  Number.isInteger = () => false;
  let liveMsg = "NO_THROW";
  try {
    host.imports.host.__array_append(id, 1);
  } catch (e) {
    liveMsg = String(e && e.message ? e.message : e);
  } finally {
    Number.isInteger = orig;
  }
  assert.match(liveMsg, /unknown array handle/);

  const { dir, copy } = copyDistMutant((js) =>
    "const __capIsInteger = Number.isInteger;\n" + js.split("Number.isInteger").join("__capIsInteger"),
  );
  try {
    const createCaptured = await loadHostFactory(pathToFileURL(copy).href);
    const host2 = createCaptured();
    host2.bindMemory(new WebAssembly.Memory({ initial: 1 }));
    const id2 = host2.imports.host.__array_create();
    Number.isInteger = () => false;
    let capturedMsg = "NO_THROW";
    try {
      host2.imports.host.__array_append(id2, 1);
    } catch (e) {
      capturedMsg = String(e && e.message ? e.message : e);
    } finally {
      Number.isInteger = orig;
    }
    assert.equal(capturedMsg, "NO_THROW");
    assert.notEqual(capturedMsg, liveMsg);
  } finally {
    Number.isInteger = orig;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F1 Number.isSafeInteger is live at __range", async () => {
  const host = await freshHost();
  const orig = Number.isSafeInteger;
  Number.isSafeInteger = () => false;
  let liveMsg = "NO_THROW";
  try {
    host.imports.host.__range(0, 4);
  } catch (e) {
    liveMsg = String(e && e.message ? e.message : e);
  } finally {
    Number.isSafeInteger = orig;
  }
  assert.match(liveMsg, /not a finite progressing interval/);

  const { dir, copy } = copyDistMutant((js) =>
    "const __capSafe = Number.isSafeInteger;\n" + js.split("Number.isSafeInteger").join("__capSafe"),
  );
  try {
    const createCaptured = await loadHostFactory(pathToFileURL(copy).href);
    const host2 = createCaptured();
    host2.bindMemory(new WebAssembly.Memory({ initial: 1 }));
    Number.isSafeInteger = () => false;
    let capturedMsg = "NO_THROW";
    try {
      host2.imports.host.__range(0, 4);
    } catch (e) {
      capturedMsg = String(e && e.message ? e.message : e);
    } finally {
      Number.isSafeInteger = orig;
    }
    assert.equal(capturedMsg, "NO_THROW");
  } finally {
    Number.isSafeInteger = orig;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F1 Number.isFinite is live at __float_to_str", async () => {
  const host = await freshHost();
  const orig = Number.isFinite;
  Number.isFinite = () => false;
  let liveMsg = "NO_THROW";
  try {
    host.imports.host.__float_to_str(1.5);
  } catch (e) {
    liveMsg = String(e && e.message ? e.message : e);
  } finally {
    Number.isFinite = orig;
  }
  assert.equal(liveMsg, "NonFiniteFloat");
});

test("F1 parseInt and Number.isNaN are live at __str_to_int", async () => {
  const host = await freshHost();
  const h = host.internString("12");
  const origParse = globalThis.parseInt;
  const origIsNaN = Number.isNaN;
  globalThis.parseInt = () => 99;
  const parsed = host.imports.host.__str_to_int(h);
  globalThis.parseInt = origParse;
  assert.equal(parsed, 99);

  Number.isNaN = () => true;
  const asNone = host.imports.host.__str_to_int(h);
  Number.isNaN = origIsNaN;
  assert.equal(asNone, -1);
});

test("F1 String.fromCodePoint / toUpperCase / toLowerCase / codePointAt are live", async () => {
  const host = await freshHost();
  const origFrom = String.fromCodePoint;
  String.fromCodePoint = () => "Z";
  const origUpper = String.prototype.toUpperCase;
  const origLower = String.prototype.toLowerCase;
  const origCpa = String.prototype.codePointAt;
  try {
    String.prototype.toUpperCase = function () { return "Z"; };
    const up = host.imports.host.__char_to_upper(97);
    assert.equal(up, 90);

    const s = host.internString("ab");
    String.prototype.toLowerCase = function () { return "zz"; };
    const low = host.imports.host.__str_to_lower(s);
    assert.equal(host.readString(low), "zz");

    String.prototype.codePointAt = function () { return 65; };
    const cp = host.imports.host.__str_char_at(s, 0);
    assert.equal(cp, 65);
  } finally {
    String.fromCodePoint = origFrom;
    String.prototype.toUpperCase = origUpper;
    String.prototype.toLowerCase = origLower;
    String.prototype.codePointAt = origCpa;
  }
});

test("F1 String indexOf and slice are live at __str_index_of / __str_slice", async () => {
  const host = await freshHost();
  const s = host.internString("abcd");
  const p = host.internString("b");
  const origIndex = String.prototype.indexOf;
  const origSlice = String.prototype.slice;
  try {
    String.prototype.indexOf = function () { return 7; };
    assert.equal(host.imports.host.__str_index_of(s, p), 7);
    String.prototype.slice = function () { return "MUT"; };
    const sl = host.imports.host.__str_slice(s, 0, 2);
    assert.equal(host.readString(sl), "MUT");
  } finally {
    String.prototype.indexOf = origIndex;
    String.prototype.slice = origSlice;
  }
});

test("F1 String.prototype[Symbol.iterator] is live at __str_length spread", async () => {
  const host = await freshHost();
  const s = host.internString("ab");
  const orig = String.prototype[Symbol.iterator];
  String.prototype[Symbol.iterator] = function () {
    return ["x", "y", "z"][Symbol.iterator]();
  };
  try {
    assert.equal(host.imports.host.__str_length(s), 3);
  } finally {
    String.prototype[Symbol.iterator] = orig;
  }
});

test("F1 Array.prototype.push is live at __array_append", async () => {
  const host = await freshHost();
  const id = host.imports.host.__array_create();
  const orig = Array.prototype.push;
  Array.prototype.push = function () { return orig.call(this, 99); };
  try {
    host.imports.host.__array_append(id, 1);
    assert.deepEqual(host.readArray(id), [99]);
  } finally {
    Array.prototype.push = orig;
  }
});

test("F2 Array[Symbol.species] is live at internArray items.slice during __range", async () => {
  const host = await freshHost();
  const desc = Object.getOwnPropertyDescriptor(Array, Symbol.species);
  let hits = 0;
  Object.defineProperty(Array, Symbol.species, {
    configurable: true,
    enumerable: false,
    get() {
      hits += 1;
      return Array;
    },
  });
  try {
    host.imports.host.__range(0, 4);
    assert.equal(hits >= 1, true, "species getter must fire: " + String(hits));
  } finally {
    if (desc) {
      Object.defineProperty(Array, Symbol.species, desc);
    }
  }

  const { dir, copy } = copyDistMutant((js) =>
    js.split("items.slice()").join("(function(src){var o=[];for(var i=0;i<src.length;i++)o.push(src[i]);return o;})(items)"),
  );
  try {
    const createCaptured = await loadHostFactory(pathToFileURL(copy).href);
    const host2 = createCaptured();
    host2.bindMemory(new WebAssembly.Memory({ initial: 1 }));
    let capturedHits = 0;
    Object.defineProperty(Array, Symbol.species, {
      configurable: true,
      enumerable: false,
      get() {
        capturedHits += 1;
        return Array;
      },
    });
    try {
      host2.imports.host.__range(0, 4);
      assert.equal(capturedHits, 0, "concat mutant must skip species: " + String(capturedHits));
    } finally {
      if (desc) {
        Object.defineProperty(Array, Symbol.species, desc);
      }
    }
  } finally {
    if (desc) {
      Object.defineProperty(Array, Symbol.species, desc);
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("F1 Map.prototype.get is live at moneyCtor", async () => {
  const host = await freshHost();
  const amt = host.internString("1.00");
  const orig = Map.prototype.get;
  Map.prototype.get = function () { return undefined; };
  let liveMsg = "NO_THROW";
  try {
    host.imports.host.__money_usd(amt);
  } catch (e) {
    liveMsg = String(e && e.message ? e.message : e);
  } finally {
    Map.prototype.get = orig;
  }
  assert.equal(liveMsg, "UnknownCurrency");
});

test("F1 Error constructor is live on unknown-handle refusal", async () => {
  const host = await freshHost();
  const Orig = globalThis.Error;
  let hits = 0;
  globalThis.Error = class extends Orig {
    constructor(msg) {
      hits += 1;
      super(msg);
    }
  };
  try {
    host.imports.host.__array_append(99, 1);
  } catch (e) {
    assert.equal(hits >= 1, true, "Error hits " + String(hits));
    assert.match(String(e && e.message ? e.message : e), /unknown array handle/);
  } finally {
    globalThis.Error = Orig;
  }
});

test("F2 JSON.stringify and Object.defineProperty are not observed on probed host helpers", async () => {
  const host = await freshHost();
  const origJS = JSON.stringify;
  const origDef = Object.defineProperty;
  let jsonHits = 0;
  let defHits = 0;
  JSON.stringify = function (...a) {
    jsonHits += 1;
    return origJS.apply(this, a);
  };
  Object.defineProperty = function (...a) {
    defHits += 1;
    return origDef.apply(this, a);
  };
  try {
    const s = host.internString("x");
    host.imports.host.__int_to_str(1);
    host.imports.host.__range(0, 2);
    host.imports.host.__str_length(s);
    host.imports.host.__array_create();
  } finally {
    JSON.stringify = origJS;
    Object.defineProperty = origDef;
  }
  assert.equal(jsonHits, 0);
  assert.equal(defHits, 0);
});

test("F2 Symbol.toPrimitive is not observed on interned-string helpers", async () => {
  const host = await freshHost();
  const orig = String.prototype[Symbol.toPrimitive];
  let hits = 0;
  String.prototype[Symbol.toPrimitive] = function (hint) {
    hits += 1;
    if (orig) return orig.call(this, hint);
    return String.prototype.toString.call(this);
  };
  try {
    const a = host.internString("a");
    const b = host.internString("b");
    host.imports.host.__int_to_str(3);
    host.imports.host.__str_concat(a, b);
    host.imports.host.__str_compare(a, b);
  } finally {
    if (orig) String.prototype[Symbol.toPrimitive] = orig;
    else delete String.prototype[Symbol.toPrimitive];
  }
  assert.equal(hits, 0);
});
