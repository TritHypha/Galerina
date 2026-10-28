import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, "..");
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const SOURCE = join(PACKAGE_ROOT, "src", "self-hosted", "k3-wire.fungi");
const PACKAGE = join(PACKAGE_ROOT, "package.json");
const VECTORS = join(
  REPO_ROOT,
  "packages-ts",
  "galerina-core-runtime",
  "native",
  "vok-authority",
  "vectors",
  "k3-wire-vectors.rows.txt",
);
const LABEL_INT = Object.freeze({
  ADMIT: 1,
  REFUSE: -1,
  UNKNOWN: 0,
  INVALID: 2,
  BARE_LEGACY_ZERO: 2,
  LEGACY_CLOSED: 3,
});
const ALERT_INT = Object.freeze({
  NONE: 0,
  FIRST_SEEN: 1,
  CAP_REACHED: 2,
});
const COMPILER_DIR = join(PACKAGE_ROOT, "..", "galerina-core-compiler", "dist");
const COMPILER = join(COMPILER_DIR, "index.js");

const STEP5 = Object.freeze([
  [
    "packages-ts/galerina-core-network/src/self-hosted/cert-gate.fungi",
    "9947aa624a08d63901006f3520c6a72ae06fb247",
  ],
  [
    "packages-ts/galerina-core-network/src/self-hosted/admission-feedback.fungi",
    "e20c9dadda1b4bab1d4a8ecbae281cbef451e7b1",
  ],
  [
    "packages/fungi/products/galerina-core-network/admission-feedback.fungi",
    "e20c9dadda1b4bab1d4a8ecbae281cbef451e7b1",
  ],
  [
    "packages-ts/galerina-tower-citizen/src/self-hosted/governance-decisions.fungi",
    "d0140f6daab28831c90266dfbe1b3551e28e1ca7",
  ],
]);

const TRI_OPS_FUNGI = "39609a37472ec648891ebd7816720acf6faf95dd";
const TRI_OPS_TS = "7f5af1919986fdf9bb62a0f8a86223c2ca848d5a";

const LOAD8_BYTES = Object.freeze([0x01, 0xff, 0x80, 0x00, 0x7f, 0x81]);
const LOAD8_S = Object.freeze([1, -1, -128, 0, 127, -127]);
const LOAD8_U = Object.freeze([1, 255, 128, 0, 127, 129]);

function gitBlob(path) {
  const git = process.platform === "win32" ? "git.exe" : "git";
  return execFileSync(git, ["-C", REPO_ROOT, "rev-parse", `HEAD:${path}`], {
    encoding: "utf8",
  }).trim();
}

function gitBlobWorktree(path) {
  const git = process.platform === "win32" ? "git.exe" : "git";
  return execFileSync(git, ["-C", REPO_ROOT, "hash-object", path], {
    encoding: "utf8",
  }).trim();
}

function fixtureRows(section) {
  const text = readFileSync(VECTORS, "utf8").replace(/^\uFEFF/u, "");
  const rows = [];
  for (const line of text.split("\n")) {
    if (line.length === 0 || !line.startsWith(`${section}|`)) {
      continue;
    }
    const first = line.indexOf("|");
    const second = line.indexOf("|", first + 1);
    rows.push({
      input: line.slice(first + 1, second),
      expected: line.slice(second + 1),
      line,
    });
  }
  return rows;
}

function parseFrameInput(input) {
  const out = { version: 0, epoch: 0, value: 0, nowUnixSeconds: 0, readsSoFar: 0 };
  for (const field of input.split(",")) {
    const eq = field.indexOf("=");
    assert.ok(eq > 0, `frame field ${field}`);
    const key = field.slice(0, eq);
    const value = Number(field.slice(eq + 1));
    assert.equal(Number.isInteger(value), true, `frame ${key}`);
    if (key === "version") {
      out.version = value;
    } else if (key === "epoch") {
      out.epoch = value;
    } else if (key === "value") {
      out.value = value;
    } else if (key === "nowUnixSeconds") {
      out.nowUnixSeconds = value;
    } else if (key === "readsSoFar") {
      out.readsSoFar = value;
    } else {
      assert.fail(`unknown frame key ${key}`);
    }
  }
  return out;
}

function parseFrameExpected(expected) {
  let label = "";
  let readsAfter = 0;
  let alert = "NONE";
  for (const field of expected.split(";")) {
    if (field.startsWith("readsAfter=")) {
      readsAfter = Number(field.slice("readsAfter=".length));
    } else if (field.startsWith("alert=")) {
      alert = field.slice("alert=".length);
    } else {
      label = field;
    }
  }
  return { label, readsAfter, alert };
}

function latticeOrRefuse(fn, args) {
  try {
    const value = fn(...args);
    if (value === -1 || value === 0 || value === 1) {
      return { ok: true, value };
    }
    return { ok: false, value };
  } catch {
    return { ok: false, trap: true };
  }
}

async function loadCompiler() {
  assert.ok(existsSync(COMPILER), "core compiler must be built before core-logic");
  // Same functions re-exported by dist/index.js (tri-ops conversion path).
  // Load the owner modules so a scratch clone without the full compiler
  // dependency graph can still parse, emit GIR, render WAT and assemble.
  const parser = await import(pathToFileURL(join(COMPILER_DIR, "parser.js")).href);
  const effects = await import(pathToFileURL(join(COMPILER_DIR, "effect-checker.js")).href);
  const gir = await import(pathToFileURL(join(COMPILER_DIR, "gir-emitter.js")).href);
  const wat = await import(pathToFileURL(join(COMPILER_DIR, "wat-emitter.js")).href);
  const assembler = await import(pathToFileURL(join(COMPILER_DIR, "wat-assembler.js")).href);
  return {
    parseProgram: parser.parseProgram,
    checkEffects: effects.checkEffects,
    emitGIR: gir.emitGIR,
    renderWAT: wat.renderWAT,
    buildWATModuleFromGIR: wat.buildWATModuleFromGIR,
    assembleWAT: assembler.assembleWAT,
  };
}

async function compileK3() {
  assert.ok(existsSync(SOURCE), "k3-wire.fungi must exist");
  const compiler = await loadCompiler();
  const source = readFileSync(SOURCE, "utf8").replace(/^\uFEFF/u, "");
  const program = compiler.parseProgram(source, "k3-wire.fungi");
  assert.deepEqual(
    (program.diagnostics ?? []).filter((diagnostic) => diagnostic.severity === "error"),
    [],
    "k3-wire.fungi must parse without errors",
  );
  const effects = compiler.checkEffects(program.flows, program.ast);
  const { gir } = compiler.emitGIR(program.ast, program.flows, effects);
  const wat = compiler.renderWAT(
    compiler.buildWATModuleFromGIR(gir, undefined, "core-logic-k3-wire", program.ast, true),
  );
  const assembled = await compiler.assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  assert.deepEqual(assembled.diagnostics, []);
  const instance = await WebAssembly.instantiate(assembled.wasm, {});
  return { compiler, exports: instance.instance.exports, source };
}

async function compileLoad8(compiler) {
  const wat = `(module
  (memory (export "memory") 1)
  (func (export "load8_s") (param i32) (result i32)
    local.get 0
    i32.load8_s)
  (func (export "load8_u") (param i32) (result i32)
    local.get 0
    i32.load8_u)
)`;
  const assembled = await compiler.assembleWAT(wat);
  assert.equal(assembled.valid, true, JSON.stringify(assembled.diagnostics));
  const instance = await WebAssembly.instantiate(assembled.wasm, {});
  const memory = new Uint8Array(instance.instance.exports.memory.buffer);
  for (let i = 0; i < LOAD8_BYTES.length; i += 1) {
    memory[i] = LOAD8_BYTES[i];
  }
  return instance.instance.exports;
}

describe("core-logic k3-wire.fungi conversion", () => {
  it("tracks the exact source as a governed package asset", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE, "utf8"));
    assert.ok(
      packageJson.packageGraph.loadedAssets.includes("src/self-hosted/k3-wire.fungi"),
    );
  });

  it("does not import the four Step-5 fungi files", () => {
    const source = readFileSync(SOURCE, "utf8");
    for (const [path] of STEP5) {
      assert.equal(source.includes(path), false, `must not import ${path}`);
    }
    assert.equal(source.includes("import "), false, "k3-wire.fungi has no imports");
  });

  it("pins the four Step-5 fungi consumers after k3-wire import", () => {
    for (const [path, blob] of STEP5) {
      assert.equal(gitBlobWorktree(path), blob, path);
    }
    assert.equal(STEP5[1][1], STEP5[2][1], "admission-feedback twins share one blob");
  });

  it("Step-5 consumers import k3-wire.fungi and have no bare wire literal", () => {
    for (const [path] of STEP5) {
      const source = readFileSync(join(REPO_ROOT, path), "utf8");
      assert.match(source, /k3-wire\.fungi/, `${path} imports k3-wire.fungi`);
      assert.match(source, /k3UnknownWire\(\)/, `${path} calls k3UnknownWire`);
      assert.equal(source.includes("-128"), false, `${path} has no -128`);
    }
  });

  it("does not change tri-ops.fungi or the TypeScript reference", () => {
    assert.equal(
      gitBlob("packages-ts/galerina-core-logic/src/self-hosted/tri-ops.fungi"),
      TRI_OPS_FUNGI,
    );
    assert.equal(
      gitBlob("packages-ts/galerina-core-logic/src/tri/tri-ops.ts"),
      TRI_OPS_TS,
    );
  });

  it("has a single -128 literal bound as K3_UNKNOWN_WIRE", async () => {
    const { source, exports } = await compileK3();
    const matches = source.match(/-128/g) ?? [];
    assert.equal(matches.length, 1, "exactly one -128 literal");
    assert.match(source, /K3_UNKNOWN_WIRE|-128/);
    assert.equal(typeof exports.k3UnknownWire, "function");
    assert.equal(exports.k3UnknownWire(), -128);
  });

  it("encode lattice 0 emits 128 never 0", async () => {
    const { exports } = await compileK3();
    assert.equal(exports.k3EncodeLattice(0), 128);
    assert.notEqual(exports.k3EncodeLattice(0), 0);
    assert.equal(exports.k3EncodeLattice(-1), 255);
    assert.equal(exports.k3EncodeLattice(1), 1);
  });

  it("decode wire -128 returns lattice 0", async () => {
    const { exports } = await compileK3();
    assert.equal(exports.k3DecodeWire(-128), 0);
  });

  it("decode wire 0 refuses", async () => {
    const { exports } = await compileK3();
    const got = latticeOrRefuse(exports.k3DecodeWire, [0]);
    assert.equal(got.ok, false, "decode wire 0 must refuse");
  });

  it("u8 reader refuses 0x00", async () => {
    const { exports } = await compileK3();
    const got = latticeOrRefuse(exports.k3DecodeByte, [0]);
    assert.equal(got.ok, false, "reader must refuse 0x00");
  });

  it("signed wrapper refuses 255 and 128", async () => {
    const { exports } = await compileK3();
    assert.equal(latticeOrRefuse(exports.k3DecodeWire, [255]).ok, false);
    assert.equal(latticeOrRefuse(exports.k3DecodeWire, [128]).ok, false);
  });

  it("frame unknown version refuses", async () => {
    const { exports } = await compileK3();
    const open = 1793059200;
    const label = exports.k3DecodeLegacyFrame(3, 0, 0, open, 0);
    assert.notEqual(label, 0, "unknown version must not admit UNKNOWN");
    assert.notEqual(label, 1);
    assert.notEqual(label, -1);
    assert.equal(exports.k3DecodeLegacyFrameReadsAfter(3, 0, 0, open, 7), 7);
    assert.equal(exports.k3DecodeLegacyFrameAlert(3, 0, 0, open, 0), 0);
  });

  it("legacy zero first-seen, cap, and expiry", async () => {
    const { exports } = await compileK3();
    const open = 1793059200;
    const last = 1798761599;
    const closed = 1798761600;
    assert.equal(exports.k3DecodeLegacyFrame(1, open, 0, open, 0), 0);
    assert.equal(exports.k3DecodeLegacyFrameReadsAfter(1, open, 0, open, 0), 1);
    assert.equal(exports.k3DecodeLegacyFrameAlert(1, open, 0, open, 0), 1);
    assert.equal(exports.k3DecodeLegacyFrameAlert(1, open, 0, open, 1), 0);
    assert.equal(exports.k3DecodeLegacyFrame(1, open, 0, last, 0), 0, "last second accepts");
    assert.equal(exports.k3DecodeLegacyFrame(1, open, 0, closed, 0), 3, "clock closed");
    assert.equal(exports.k3DecodeLegacyFrameReadsAfter(1, open, 0, closed, 4), 4);
    assert.equal(exports.k3DecodeLegacyFrameAlert(1, open, 0, closed, 0), 0);
    assert.equal(exports.k3DecodeLegacyFrame(1, open, 0, open, 1000000), 3);
    assert.equal(exports.k3DecodeLegacyFrameReadsAfter(1, open, 0, open, 1000000), 1000000);
    assert.equal(exports.k3DecodeLegacyFrameAlert(1, open, 0, open, 1000000), 2);
    assert.equal(exports.k3DecodeLegacyFrame(2, 0, 0, open, 0), 2, "v2 value 0 is invalid");
    assert.equal(exports.k3DecodeLegacyFrame(2, 0, -128, open, 4), 0);
    assert.equal(exports.k3DecodeLegacyFrameReadsAfter(2, 0, -128, open, 4), 4);
  });

  it("u8 reader range and named byte constants", async () => {
    const { exports } = await compileK3();
    assert.equal(exports.k3ByteAdmit(), 1);
    assert.equal(exports.k3ByteDeny(), 255);
    assert.equal(exports.k3ByteUnknown(), 128);
    assert.equal(latticeOrRefuse(exports.k3DecodeByte, [-1]).ok, false);
    assert.equal(latticeOrRefuse(exports.k3DecodeByte, [256]).ok, false);
    assert.equal(exports.k3DecodeByte(1), 1);
    assert.equal(exports.k3DecodeByte(255), -1);
    assert.equal(exports.k3DecodeByte(128), 0);
  });

  it("load8_s feeds the signed wrapper and load8_u feeds the u8 reader", async () => {
    const { compiler, exports } = await compileK3();
    const load8 = await compileLoad8(compiler);
    for (let i = 0; i < LOAD8_BYTES.length; i += 1) {
      const signed = load8.load8_s(i);
      const unsigned = load8.load8_u(i);
      assert.equal(signed, LOAD8_S[i], `load8_s[${i}]`);
      assert.equal(unsigned, LOAD8_U[i], `load8_u[${i}]`);
      if (signed === 1 || signed === -1 || signed === -128) {
        const lattice = signed === -128 ? 0 : signed;
        assert.equal(exports.k3DecodeWire(signed), lattice, `wrapper load8_s[${i}]`);
      } else {
        assert.equal(
          latticeOrRefuse(exports.k3DecodeWire, [signed]).ok,
          false,
          `wrapper refuses load8_s[${i}]=${signed}`,
        );
      }
      if (unsigned === 1 || unsigned === 255 || unsigned === 128) {
        const lattice = unsigned === 1 ? 1 : unsigned === 255 ? -1 : 0;
        assert.equal(exports.k3DecodeByte(unsigned), lattice, `reader load8_u[${i}]`);
      } else {
        assert.equal(
          latticeOrRefuse(exports.k3DecodeByte, [unsigned]).ok,
          false,
          `reader refuses load8_u[${i}]=${unsigned}`,
        );
      }
    }
    assert.equal(
      latticeOrRefuse(exports.k3DecodeWire, [load8.load8_u(1)]).ok,
      false,
      "wrapper refuses load8_u of 0xFF (255)",
    );
    assert.equal(
      latticeOrRefuse(exports.k3DecodeWire, [load8.load8_u(2)]).ok,
      false,
      "wrapper refuses load8_u of 0x80 (128)",
    );
  });

  it("signed wrapper matches shared fixture rows", async () => {
    const { exports } = await compileK3();
    const rows = fixtureRows("signedWrapper");
    assert.ok(rows.length >= 14, `signedWrapper rows ${rows.length}`);
    for (const row of rows) {
      const signed = Number(row.input);
      const want = LABEL_INT[row.expected];
      assert.equal(typeof want, "number", `unknown label ${row.expected}`);
      assert.equal(exports.k3DecodeWire(signed), want, row.line);
    }
  });

  it("u8 reader matches shared fixture rows", async () => {
    const { exports } = await compileK3();
    const rows = fixtureRows("u8");
    assert.equal(rows.length, 256, "fixture u8 oracle is exhaustive");
    for (const row of rows) {
      const byte = Number(row.input);
      const want = LABEL_INT[row.expected];
      assert.equal(typeof want, "number", `unknown label ${row.expected}`);
      assert.equal(exports.k3DecodeByte(byte), want, row.line);
    }
  });

  it("encode lattice matches shared fixture rows", async () => {
    const { exports } = await compileK3();
    const rows = fixtureRows("encodeLattice");
    assert.equal(rows.length, 3, "encodeLattice rows");
    for (const row of rows) {
      assert.equal(exports.k3EncodeLattice(Number(row.input)), Number(row.expected), row.line);
    }
  });

  it("legacy frames match shared fixture rows including A2-F unix clock", async () => {
    const { exports } = await compileK3();
    const rows = fixtureRows("frames");
    assert.ok(rows.length >= 20, `fixture frame rows, got ${rows.length}`);
    for (const row of rows) {
      const frame = parseFrameInput(row.input);
      const expect = parseFrameExpected(row.expected);
      const wantLabel = LABEL_INT[expect.label];
      const wantAlert = ALERT_INT[expect.alert];
      assert.equal(typeof wantLabel, "number", expect.label);
      assert.equal(typeof wantAlert, "number", expect.alert);
      assert.equal(
        exports.k3DecodeLegacyFrame(
          frame.version,
          frame.epoch,
          frame.value,
          frame.nowUnixSeconds,
          frame.readsSoFar,
        ),
        wantLabel,
        row.line,
      );
      assert.equal(
        exports.k3DecodeLegacyFrameReadsAfter(
          frame.version,
          frame.epoch,
          frame.value,
          frame.nowUnixSeconds,
          frame.readsSoFar,
        ),
        expect.readsAfter,
        `${row.line} readsAfter`,
      );
      assert.equal(
        exports.k3DecodeLegacyFrameAlert(
          frame.version,
          frame.epoch,
          frame.value,
          frame.nowUnixSeconds,
          frame.readsSoFar,
        ),
        wantAlert,
        `${row.line} alert`,
      );
    }
  });

  it("explicit unix clock range and v1 non-zero frames", async () => {
    const { exports } = await compileK3();
    const open = 1793059200;
    const closedUnix = [0, -1, 1798761600, 2147483647];
    for (const nowUnixSeconds of closedUnix) {
      assert.equal(
        exports.k3DecodeLegacyFrame(1, open, 0, nowUnixSeconds, 0),
        3,
        `nowUnixSeconds=${nowUnixSeconds} must close`,
      );
      assert.equal(exports.k3DecodeLegacyFrameReadsAfter(1, open, 0, nowUnixSeconds, 0), 0);
      assert.equal(exports.k3DecodeLegacyFrameAlert(1, open, 0, nowUnixSeconds, 0), 0);
    }
    assert.equal(exports.k3DecodeLegacyFrame(1, open, 0, 1798761599, 0), 0, "last second accepts");
    assert.equal(exports.k3YmdInRange(20260231), 0, "ymd helper stays off golden path");
    assert.equal(exports.k3YmdInRange(20261027), 1);
    assert.equal(exports.k3ExpiryUnixS(), 1798761600);
    assert.equal(exports.k3DecodeLegacyFrame(1, 0, 5, open, 0), 2, "v1 value=5 invalid");
    assert.equal(exports.k3DecodeLegacyFrameReadsAfter(1, 0, 5, open, 0), 0);
    assert.equal(exports.k3DecodeLegacyFrameAlert(1, 0, 5, open, 0), 0);
    assert.equal(exports.k3DecodeLegacyFrame(1, 0, -1, open, 0), -1, "v1 value=-1 deny");
    assert.equal(exports.k3DecodeLegacyFrameReadsAfter(1, 0, -1, open, 0), 0);
    assert.equal(exports.k3DecodeLegacyFrameAlert(1, 0, -1, open, 0), 0);
  });

  it("K3-EP epoch admission date edges and unix floor", async () => {
    const { exports } = await compileK3();
    const open = 1793059200;
    assert.equal(exports.k3EpochYmdMin(), 20261027);
    assert.equal(exports.k3EpochYmdMax(), 20991231);
    assert.equal(exports.k3TrustedClockFloorUnixS(), 1790812800);
    assert.equal(exports.k3YmdTransitional(20261026), 0);
    assert.equal(exports.k3YmdTransitional(20261027), 1);
    assert.equal(exports.k3YmdTransitional(20260230), 0);
    assert.equal(exports.k3YmdTransitional(20991231), 1);
    assert.equal(exports.k3YmdTransitional(21000101), 0);
    assert.equal(exports.k3EpochAdmitted(0), 0);
    assert.equal(exports.k3EpochAdmitted(-1), 0);
    assert.equal(exports.k3EpochAdmitted(20261026), 0);
    assert.equal(exports.k3EpochAdmitted(20261027), 1);
    assert.equal(exports.k3EpochAdmitted(20260230), 0);
    assert.equal(exports.k3EpochAdmitted(20991231), 1);
    assert.equal(exports.k3EpochAdmitted(21000101), 0);
    assert.equal(exports.k3EpochAdmitted(1790812800), 1);
    assert.equal(exports.k3EpochAdmitted(1790812799), 0);
    assert.equal(exports.k3DecodeLegacyFrame(1, 0, 0, open, 0), 3, "epoch 0 fails closed");
    assert.equal(exports.k3DecodeLegacyFrame(1, 20261027, 0, open, 0), 0);
    assert.equal(exports.k3DecodeLegacyFrame(1, 20261026, 0, open, 0), 3);
    assert.equal(exports.k3DecodeLegacyFrame(1, 20260230, 0, open, 0), 3);
    assert.equal(exports.k3DecodeLegacyFrame(1, 20991231, 0, open, 0), 3);
    assert.equal(exports.k3DecodeLegacyFrame(1, 21000101, 0, open, 0), 3);
    assert.equal(exports.k3DecodeLegacyFrame(3, 20261027, 0, open, 0), 2, "unknown version");
  });

  it("K3-CW frame-side expiry, WASI Int limit, serial instant pin", async () => {
    const { exports } = await compileK3();
    const open = 1793059200;
    assert.equal(exports.k3EpochYmdExpiryMin(), 20270101);
    assert.equal(exports.k3YmdToUnixS(20261027), 1793059200);
    assert.equal(exports.k3LegacyZeroFrameEpochOpen(1798761599), 1);
    assert.equal(exports.k3LegacyZeroFrameEpochOpen(1798761600), 0);
    assert.equal(exports.k3LegacyZeroFrameEpochOpen(20261231), 1);
    assert.equal(exports.k3LegacyZeroFrameEpochOpen(20270101), 0);
    assert.equal(exports.k3DecodeLegacyFrame(1, 1798761599, 0, open, 0), 0);
    assert.equal(exports.k3DecodeLegacyFrame(1, 1798761600, 0, open, 0), 3);
    assert.equal(exports.k3DecodeLegacyFrame(1, 20270101, 0, open, 0), 3);
    assert.equal(exports.k3WasiRealtimeNsToUnixS(0), 0);
    assert.equal(exports.k3WasiRealtimeNsToUnixS(1000000000), 0);
    assert.equal(exports.k3WasiRealtimeNsToUnixS(2147483647), 0);
    assert.equal(exports.k3SerialInstantUnixS(2026, 10, 27, 15, 45, 0), 1793115900);
    assert.equal(exports.k3SerialInstantUnixS(2026, 2, 30, 15, 45, 0), 0);
    assert.equal(exports.k3SerialWindowContains(1793115900, 1793115960, 1793115900), 1);
    assert.equal(exports.k3SerialWindowContains(1793115900, 1793115960, 1793115960), 0);
    assert.equal(exports.k3SerialWindowContains(1793115960, 1793115900, 1793115900), 0);
  });

  it("K3-AL display ymd, sunset dry-run, N-e/N-f, alert record", async () => {
    const { exports } = await compileK3();
    const open = 1793059200;
    assert.equal(exports.k3UnixSToYmd(1798761599), 20261231);
    assert.equal(exports.k3UnixSToYmd(1798761600), 20270101);
    assert.equal(exports.k3UnixSToYmd(1793115900), 20261027);
    assert.equal(exports.k3UnixSToYmd(0), 0);
    assert.equal(exports.k3UnixSToYmd(1790812799), 0);
    assert.equal(exports.k3DecodeLegacyFrame(1, 20261231, 0, open, 0), 0, "N-e 20261231 open");
    assert.equal(exports.k3DecodeLegacyFrame(1, 20270101, 0, open, 0), 3, "N-e 20270101 closed");
    assert.equal(exports.k3DecodeLegacyFrameWithBridge(1, 20261027, 0, open, 0, 0), 3, "sunset dry-run");
    assert.equal(exports.k3DecodeLegacyFrameWithBridge(1, 20261027, 0, open, 0, 1), 0);
    assert.equal(exports.k3DecodeLegacyFrameReadsAfterWithBridge(1, 20261027, 0, open, 0, 0), 0);
    assert.equal(exports.k3DecodeLegacyFrameAlertWithBridge(1, 20261027, 0, open, 0, 0), 0);
    assert.equal(exports.k3WasiRealtimeNsToUnixS(0), 0);
    assert.equal(exports.k3WasiRealtimeNsToUnixS(2147483647), 0);
    assert.equal(exports.k3FrameHeaderVersion(), 1);
    assert.equal(exports.k3AlertSinkUnknownNoAudit(), 0);
    assert.equal(exports.k3AlertRecordAlert(1, open, 0, open, 0), 1);
    assert.equal(exports.k3AlertRecordReadsAfter(1, open, 0, open, 0), 1);
    const src = readFileSync(SOURCE, "utf8");
    const kindStart = src.indexOf("pure flow k3LegacyZeroKindWithBridge");
    const kindEnd = src.indexOf("pure flow k3LegacyZeroKind(", kindStart + 1);
    const kindBody = src.slice(kindStart, kindEnd);
    assert.equal(kindBody.includes("k3UnixSToYmd"), false);
    assert.match(src, /UNKNOWN\(fungi-int-cannot-hold-wasi-ns\)/);
  });

  it("K3-RC strict bridge 2/-1 closed, recorder tally unknown", async () => {
    const { exports } = await compileK3();
    const open = 1793059200;
    assert.equal(exports.k3DecodeLegacyFrameWithBridge(1, 20261027, 0, open, 0, 2), 3);
    assert.equal(exports.k3DecodeLegacyFrameWithBridge(1, 20261027, 0, open, 0, -1), 3);
    assert.equal(exports.k3DecodeLegacyFrameWithBridge(1, 20261027, 0, open, 0, 0), 3);
    assert.equal(exports.k3DecodeLegacyFrameWithBridge(1, 20261027, 0, open, 0, 1), 0);
    assert.equal(exports.k3AlertRecorderCap(), 64);
    assert.equal(exports.k3AlertRecorderTallyUnknown(), 0);
    const src = readFileSync(SOURCE, "utf8");
    assert.match(src, /UNKNOWN\(fungi-alert-recorder-is-tally\)/);
    const kindStart = src.indexOf("pure flow k3LegacyZeroKindWithBridge");
    const kindEnd = src.indexOf("pure flow k3LegacyZeroKind(", kindStart + 1);
    const kindBody = src.slice(kindStart, kindEnd);
    assert.equal(kindBody.includes("if bridge != 1"), true);
  });

  it("K3-RX evidence unknown, recorder cap stays 64", async () => {
    const { exports } = await compileK3();
    assert.equal(exports.k3AlertEvidenceUnknownReason(), 4);
    assert.equal(exports.k3AlertEvidenceUnknown(), 4);
    assert.notEqual(exports.k3AlertEvidenceUnknown(), 0);
    assert.equal(exports.k3AlertRecorderCap(), 64);
    const src = readFileSync(SOURCE, "utf8");
    assert.match(src, /UNKNOWN\(fungi-cannot-sha256-alert-evidence\)/);
  });

  it("K3-MK strong Kleene AND/OR/NOT/gate and DENY-sticky triples", async () => {
    const { exports } = await compileK3();
    const D = -1;
    const U = -128;
    const A = 1;
    const and = [
      [D, D, D], [D, U, D], [D, A, D],
      [U, D, D], [U, U, U], [U, A, U],
      [A, D, D], [A, U, U], [A, A, A],
    ];
    const or = [
      [D, D, D], [D, U, U], [D, A, A],
      [U, D, U], [U, U, U], [U, A, A],
      [A, D, A], [A, U, A], [A, A, A],
    ];
    for (const [a, b, e] of and) {
      assert.equal(exports.k3WireAnd(a, b), e, `${a} AND ${b}`);
    }
    for (const [a, b, e] of or) {
      assert.equal(exports.k3WireOr(a, b), e, `${a} OR ${b}`);
    }
    assert.equal(exports.k3WireNot(D), A);
    assert.equal(exports.k3WireNot(U), U);
    assert.equal(exports.k3WireNot(A), D);
    assert.equal(exports.k3WireGate(U), D);
    assert.equal(exports.k3WireGate(A), A);
    assert.equal(exports.k3WireGate(D), D);
    for (const x of [D, U, A]) {
      for (const y of [D, U, A]) {
        for (const z of [D, U, A]) {
          const got = exports.k3WireAnd3(x, y, z);
          if ([x, y, z].includes(D)) assert.equal(got, D, `${x},${y},${z}`);
          assert.equal(got === A, x === A && y === A && z === A);
        }
      }
    }
  });
});
