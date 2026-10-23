/**
 * 0014 Fidelity Differential Harness — slices 1-2: tree-walker ≡ bytecode-VM ≡ WASM, BYTE-EXACT.
 *
 * Owner decision (2026-06-18): WASM i32 is the semantic reference tier; all execution tiers must be
 * byte-identical. This is the foundational slice of the 0014 harness: it drives the same flow + input
 * through (a) the reference async tree-walker (executeFlow with NO pureFastPath) and (b) the fast
 * tier (executeFlow with { pureFastPath: true } → bytecode VM / sync fast-path), and asserts the
 * result is byte-identical — return value via Object.is (so a JS `-0` that diverges from `+0` is
 * CAUGHT) and traps by message. The corpus targets exactly the i32 edges hardened this cycle
 * (overflow / div0 / mod0 / the mul sqrt-boundary / INT32_MIN÷-1 / the -0 case).
 *
 * It doubles as the conformance lock for slices 1/3 (cfb72f9) + 2/3 (6542bae): if any future change
 * makes a tier diverge on these edges, this fails. Slice-2 (below) extends the differential to the
 * REAL WASM tier (.fungi → WAT → wabt → #105 admission → instantiate), proving the same i32 conformance
 * end-to-end against the semantic reference. The full 6-component tuple (effect trace, taint/seal,
 * audit record, diagnostics) remains the next harness slice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads"; // slice-6c: watchdogged WASM invoke (a catch can't catch a hang)
import { fileURLToPath } from "node:url";
import { parseProgram, executeFlow, clearBytecodeCache } from "../dist/index.js";
import * as L from "../dist/index.js"; // WASM-tier path (assembleWAT / admitAndInstantiate / …) for slice-2
import { resolveGovernanceMode } from "../dist/governance-mode.js"; // slice-3 (not re-exported from the index barrel)

const MIN = -2147483648;
const MAX = 2147483647;
const int = (v) => ({ __tag: "int", value: v });
const argMap = (names, vals) => new Map(names.map((n, i) => [n, int(vals[i])]));

function invokeWasmInWorker(workerData, watchdogMs = 5000) {
  const workerUrl = new URL("./helpers/wasm-invoke-worker.mjs", import.meta.url);
  return new Promise((resolve) => {
    const worker = new Worker(fileURLToPath(workerUrl), { workerData });
    let done = false;
    let timedOut = false;
    let receivedMessage = false;
    let message;
    let workerError;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      resolve(result);
    };
    const watchdog = setTimeout(() => {
      timedOut = true;
      void worker.terminate().then(
        (exitCode) => finish({ hang: true, workerExited: true, exitCode }),
        (error) => finish({ hang: true, workerExited: false, error: String(error) }),
      );
    }, watchdogMs);
    worker.once("message", (result) => { receivedMessage = true; message = result; });
    worker.once("error", (error) => { workerError = String(error); });
    worker.once("exit", (exitCode) => {
      if (timedOut) {
        finish({ hang: true, workerExited: true, exitCode });
      } else if (workerError !== undefined) {
        finish({ ok: false, error: workerError, workerExited: true, exitCode });
      } else if (!receivedMessage) {
        finish({ ok: false, error: `worker exited (${exitCode}) before posting a result`, workerExited: true, exitCode });
      } else {
        finish({ ...message, workerExited: true, exitCode });
      }
    });
  });
}

function skipWATTrivia(wat, start) {
  let i = start;
  while (i < wat.length) {
    if (/\s/u.test(wat[i])) { i++; continue; }
    if (wat.startsWith(";;", i)) {
      while (i < wat.length && wat[i] !== "\n") i++;
      continue;
    }
    if (wat.startsWith("(;", i)) {
      let depth = 1;
      i += 2;
      while (i < wat.length && depth > 0) {
        if (wat.startsWith("(;", i)) { depth++; i += 2; }
        else if (wat.startsWith(";)", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth > 0) return wat.length;
      continue;
    }
    break;
  }
  return i;
}

function readWATToken(wat, start) {
  let end = start;
  while (end < wat.length && !/[\s()"]/.test(wat[end])
    && !wat.startsWith(";;", end) && !wat.startsWith("(;", end)) end++;
  return wat.slice(start, end);
}

function findWATFunctionStart(wat, name) {
  let inString = false, escaped = false, lineComment = false, blockCommentDepth = 0, parenDepth = 0;
  for (let i = 0; i < wat.length; i++) {
    const char = wat[i], next = wat[i + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (char === "(" && next === ";") { blockCommentDepth++; i++; }
      else if (char === ";" && next === ")") { blockCommentDepth--; i++; }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === ";" && next === ";") { lineComment = true; i++; continue; }
    if (char === "(" && next === ";") { blockCommentDepth = 1; i++; continue; }
    if (char === '"') { inString = true; continue; }
    if (char === "(" && parenDepth === 1) {
      const kindStart = skipWATTrivia(wat, i + 1);
      const kindEnd = kindStart + readWATToken(wat, kindStart).length;
      if (wat.slice(kindStart, kindEnd) === "func") {
        const nameStart = skipWATTrivia(wat, kindEnd);
        if (readWATToken(wat, nameStart) === `$${name}`) return i;
      }
    }
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
  }
  return -1;
}

function extractWATFunction(wat, name) {
  const start = findWATFunctionStart(wat, name);
  assert.ok(start >= 0, `missing emitted function ${name}`);
  let depth = 0, inString = false, lineComment = false, blockCommentDepth = 0;
  for (let i = start; i < wat.length; i++) {
    const char = wat[i], next = wat[i + 1];
    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (char === "(" && next === ";") { blockCommentDepth++; i++; }
      else if (char === ";" && next === ")") { blockCommentDepth--; i++; }
      continue;
    }
    if (inString) {
      if (char === "\\") i++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === ";" && next === ";") { lineComment = true; i++; continue; }
    if (char === "(" && next === ";") { blockCommentDepth = 1; i++; continue; }
    if (char === '"') { inString = true; continue; }
    if (char === "(") depth++;
    else if (char === ")" && --depth === 0) return wat.slice(start, i + 1);
  }
  assert.fail(`unterminated emitted function ${name}`);
}

function stripWATCommentsAndStrings(wat) {
  let code = "", inString = false, lineComment = false, blockCommentDepth = 0;
  for (let i = 0; i < wat.length; i++) {
    const char = wat[i], next = wat[i + 1];
    if (lineComment) {
      if (char === "\n") { lineComment = false; code += "\n"; }
      continue;
    }
    if (blockCommentDepth > 0) {
      if (char === "(" && next === ";") { blockCommentDepth++; i++; }
      else if (char === ";" && next === ")") { blockCommentDepth--; code += " "; i++; }
      else if (char === "\n") code += "\n";
      continue;
    }
    if (inString) {
      if (char === "\\") i++;
      else if (char === '"') { inString = false; code += " "; }
      continue;
    }
    if (char === ";" && next === ";") { lineComment = true; code += " "; i++; continue; }
    if (char === "(" && next === ";") { blockCommentDepth = 1; code += " "; i++; continue; }
    if (char === '"') { inString = true; code += " "; continue; }
    code += char;
  }
  return code;
}

function countWATUnreachableOpcodes(wat) {
  const code = stripWATCommentsAndStrings(wat);
  return [...code.matchAll(/(?:^|[\s()])unreachable(?=$|[\s()])/gu)].length;
}

function assertFuelGuardIsTheOnlyUnreachable(functionWat, label) {
  const opcodes = countWATUnreachableOpcodes(functionWat);
  assert.equal(opcodes, 1, `${label} must have exactly one unreachable opcode, the fuel guard`);
  assert.match(stripWATCommentsAndStrings(functionWat),
    /\(if \(i32\.gt_u \(local\.get \$__while_fuel_0\) \(i32\.const 100000\)\) \(then unreachable\)\)/u,
    `${label} must place its sole trap at the exact fuel guard`);
}

function readWasmU32(bytes, cursor, label) {
  let value = 0;
  let shift = 0;
  for (let count = 0; count < 5; count++) {
    assert.ok(cursor.offset < bytes.length, `${label}: truncated unsigned LEB128`);
    const byte = bytes[cursor.offset++];
    if (count === 4) assert.ok((byte & 0xf0) === 0, `${label}: unsigned LEB128 exceeds u32`);
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value >>> 0;
    shift += 7;
  }
  assert.fail(`${label}: unsigned LEB128 exceeds five bytes`);
}

function skipWasmName(bytes, cursor, label) {
  const length = readWasmU32(bytes, cursor, `${label} length`);
  assert.ok(length <= bytes.length - cursor.offset, `${label}: truncated UTF-8 name`);
  const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(cursor.offset, cursor.offset + length));
  cursor.offset += length;
  return name;
}

function skipWasmLimits(bytes, cursor, label) {
  const flags = readWasmU32(bytes, cursor, `${label} flags`);
  assert.ok((flags & ~0x07) === 0, `${label}: unsupported limits flags`);
  const memory64 = (flags & 0x04) !== 0;
  const readLimit = (part) => {
    if (!memory64) return readWasmU32(bytes, cursor, `${label} ${part}`);
    let value = 0n;
    let shift = 0n;
    for (let count = 0; count < 10; count++) {
      assert.ok(cursor.offset < bytes.length, `${label}: truncated u64 limit`);
      const byte = bytes[cursor.offset++];
      if (count === 9) assert.ok((byte & 0xfe) === 0, `${label}: u64 limit exceeds ten bytes`);
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7n;
    }
    assert.fail(`${label}: u64 limit exceeds ten bytes`);
  };
  readLimit("minimum");
  if ((flags & 0x01) !== 0) readLimit("maximum");
}

function skipWasmValueType(bytes, cursor, label) {
  assert.ok(cursor.offset < bytes.length, `${label}: missing value type`);
  const type = bytes[cursor.offset++];
  if (type === 0x63 || type === 0x64) {
    for (let count = 0; count < 5; count++) {
      assert.ok(cursor.offset < bytes.length, `${label}: truncated heap type`);
      if ((bytes[cursor.offset++] & 0x80) === 0) return;
    }
    assert.fail(`${label}: heap type exceeds five bytes`);
  }
  assert.ok([0x7b, 0x70, 0x6f, 0x7f, 0x7e, 0x7d, 0x7c].includes(type),
    `${label}: unsupported value type 0x${type.toString(16)}`);
}

function locateWasmFunctionBody(wasmBytes, functionIndex, functionName) {
  const bytes = Buffer.from(wasmBytes);
  assert.ok(bytes.length >= 8 && bytes.length <= 16 * 1024 * 1024, "signed WASM module size is bounded");
  assert.deepEqual([...bytes.subarray(0, 8)], [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0],
    "trap attribution requires a core WebAssembly v1 module");

  let importedFunctions = 0;
  let functionExports = new Map();
  let codeBodies;
  const cursor = { offset: 8 };
  let sectionCount = 0;
  while (cursor.offset < bytes.length) {
    assert.ok(++sectionCount <= 128, "WASM section count is bounded");
    const sectionId = bytes[cursor.offset++];
    const sectionSize = readWasmU32(bytes, cursor, "section size");
    const sectionStart = cursor.offset;
    const sectionEnd = sectionStart + sectionSize;
    assert.ok(sectionEnd <= bytes.length, `WASM section ${sectionId} exceeds module bounds`);
    const section = { offset: sectionStart };

    if (sectionId === 2) {
      const imports = readWasmU32(bytes, section, "import count");
      assert.ok(imports <= 100_000, "WASM import count is bounded");
      for (let i = 0; i < imports; i++) {
        skipWasmName(bytes, section, `import ${i} module`);
        skipWasmName(bytes, section, `import ${i} field`);
        assert.ok(section.offset < sectionEnd, `import ${i}: missing external kind`);
        const kind = bytes[section.offset++];
        if (kind === 0) {
          importedFunctions++;
          readWasmU32(bytes, section, `import ${i} function type index`);
        } else if (kind === 1) {
          skipWasmValueType(bytes, section, `import ${i} table element type`);
          skipWasmLimits(bytes, section, `import ${i} table limits`);
        } else if (kind === 2) {
          skipWasmLimits(bytes, section, `import ${i} memory limits`);
        } else if (kind === 3) {
          skipWasmValueType(bytes, section, `import ${i} global type`);
          assert.ok(section.offset < sectionEnd, `import ${i}: missing global mutability`);
          section.offset++;
        } else if (kind === 4) {
          readWasmU32(bytes, section, `import ${i} tag attribute`);
          readWasmU32(bytes, section, `import ${i} tag type index`);
        } else {
          assert.fail(`import ${i}: unsupported external kind ${kind}`);
        }
        assert.ok(section.offset <= sectionEnd, `import ${i}: descriptor exceeds import section`);
      }
    } else if (sectionId === 7) {
      const exports = readWasmU32(bytes, section, "export count");
      assert.ok(exports <= 100_000, "WASM export count is bounded");
      for (let i = 0; i < exports; i++) {
        const name = skipWasmName(bytes, section, `export ${i} name`);
        assert.ok(section.offset < sectionEnd, `export ${i}: missing external kind`);
        const kind = bytes[section.offset++];
        const index = readWasmU32(bytes, section, `export ${i} index`);
        if (kind === 0) functionExports.set(name, index);
      }
    } else if (sectionId === 10) {
      const count = readWasmU32(bytes, section, "code body count");
      assert.ok(count <= 100_000, "WASM code body count is bounded");
      codeBodies = [];
      for (let i = 0; i < count; i++) {
        const bodySize = readWasmU32(bytes, section, `function body ${i} size`);
        const bodyEnd = section.offset + bodySize;
        assert.ok(bodyEnd <= sectionEnd, `function body ${i} exceeds code section`);
        const localGroups = readWasmU32(bytes, section, `function body ${i} local group count`);
        assert.ok(localGroups <= 100_000, `function body ${i} local group count is bounded`);
        for (let group = 0; group < localGroups; group++) {
          readWasmU32(bytes, section, `function body ${i} local group ${group} count`);
          skipWasmValueType(bytes, section, `function body ${i} local group ${group} type`);
        }
        assert.ok(section.offset <= bodyEnd, `function body ${i} local declarations exceed its body`);
        codeBodies.push({ instructionStart: section.offset, bodyEnd });
        section.offset = bodyEnd;
      }
    }

    if ([2, 7, 10].includes(sectionId)) {
      assert.ok(section.offset === sectionEnd, `WASM section ${sectionId} has unparsed bytes`);
    }
    cursor.offset = sectionEnd;
  }

  assert.ok(codeBodies, "WASM module must contain a code section");
  assert.equal(functionExports.get(functionName), functionIndex,
    `runtime function index must identify exported ${functionName}`);
  const codeIndex = functionIndex - importedFunctions;
  assert.ok(Number.isInteger(codeIndex) && codeIndex >= 0 && codeIndex < codeBodies.length,
    `runtime function index ${functionIndex} must map to a defined function body`);
  return { ...codeBodies[codeIndex], bytes };
}

function skipWasmLeb(bytes, cursor, maxBytes, label) {
  for (let count = 0; count < maxBytes; count++) {
    assert.ok(cursor.offset < bytes.length, `${label}: truncated LEB128 immediate`);
    if ((bytes[cursor.offset++] & 0x80) === 0) return;
  }
  assert.fail(`${label}: LEB128 immediate exceeds ${maxBytes} bytes`);
}

function wasmInstructionStarts(bytes, start, end, functionName) {
  const cursor = { offset: start };
  const starts = new Set();
  const readU32 = (label) => readWasmU32(bytes, cursor, `${functionName} ${label}`);
  const skipBytes = (count, label) => {
    assert.ok(count <= end - cursor.offset, `${functionName}: truncated ${label} immediate`);
    cursor.offset += count;
  };
  const skipBlockType = () => {
    assert.ok(cursor.offset < end, `${functionName}: missing block type`);
    const first = bytes[cursor.offset];
    if (first === 0x40 || [0x7b, 0x70, 0x6f, 0x7f, 0x7e, 0x7d, 0x7c].includes(first)) {
      cursor.offset++;
      return;
    }
    if (first === 0x63 || first === 0x64) {
      cursor.offset++;
      skipWasmLeb(bytes, cursor, 5, `${functionName} block heap type`);
      return;
    }
    skipWasmLeb(bytes, cursor, 5, `${functionName} block type index`);
  };
  const skipMemArg = () => {
    readU32("memory alignment");
    readU32("memory offset");
  };

  while (cursor.offset < end) {
    const instructionOffset = cursor.offset;
    const opcode = bytes[cursor.offset++];
    starts.add(instructionOffset);
    if ([0x00, 0x01, 0x05, 0x0b, 0x0f, 0x1a, 0x1b, 0xd1, 0xd3, 0xd4].includes(opcode)
        || (opcode >= 0x45 && opcode <= 0xc4)) {
      continue;
    }
    if (opcode >= 0x02 && opcode <= 0x04) {
      skipBlockType();
    } else if ([0x0c, 0x0d, 0x10, 0x12, 0x14, 0x15, 0x20, 0x21, 0x22, 0x23, 0x24,
      0x25, 0x26, 0xd2, 0xd5, 0xd6].includes(opcode)) {
      readU32(`opcode 0x${opcode.toString(16)} index`);
    } else if (opcode === 0x0e) {
      const count = readU32("branch table count");
      assert.ok(count <= 100_000, `${functionName}: branch table count is bounded`);
      for (let i = 0; i <= count; i++) readU32("branch table target");
    } else if (opcode === 0x11 || opcode === 0x13) {
      readU32("indirect call type index");
      readU32("indirect call table index");
    } else if (opcode === 0x1c) {
      const count = readU32("typed select result count");
      assert.ok(count <= 16, `${functionName}: typed select result count is bounded`);
      for (let i = 0; i < count; i++) skipWasmValueType(bytes, cursor, `${functionName} typed select type`);
    } else if (opcode >= 0x28 && opcode <= 0x3e) {
      skipMemArg();
    } else if (opcode === 0x3f || opcode === 0x40) {
      readU32("memory index");
    } else if (opcode === 0x41) {
      skipWasmLeb(bytes, cursor, 5, `${functionName} i32.const`);
    } else if (opcode === 0x42) {
      skipWasmLeb(bytes, cursor, 10, `${functionName} i64.const`);
    } else if (opcode === 0x43) {
      skipBytes(4, "f32.const");
    } else if (opcode === 0x44) {
      skipBytes(8, "f64.const");
    } else if (opcode === 0xd0) {
      skipWasmLeb(bytes, cursor, 5, `${functionName} ref.null heap type`);
    } else if (opcode === 0xfc) {
      const subopcode = readU32("0xfc subopcode");
      if (subopcode <= 7) continue;
      if (subopcode === 8 || subopcode === 10 || subopcode === 12 || subopcode === 14) {
        readU32("0xfc first index");
        readU32("0xfc second index");
      } else if ([9, 11, 13, 15, 16, 17].includes(subopcode)) {
        readU32("0xfc index");
      } else {
        assert.fail(`${functionName}: unsupported 0xfc subopcode ${subopcode}`);
      }
    } else {
      assert.fail(`${functionName}: unsupported WASM opcode 0x${opcode.toString(16)} in test-only trap decoder`);
    }
    assert.ok(cursor.offset <= end, `${functionName}: instruction immediate exceeds function body`);
  }
  assert.equal(cursor.offset, end, `${functionName}: instructions must end at the function body boundary`);
  return starts;
}

function assertWasmTrapOffsetMapsToOpcode(trapStack, wasmBytes, functionName, expectedOpcode) {
  const frame = /wasm-function\[(\d+)\]:0x([\da-f]+)/iu.exec(trapStack ?? "");
  assert.ok(frame, "the admitted-module trap stack must expose a function index and code offset");
  const functionIndex = Number.parseInt(frame[1], 10);
  const trapOffset = Number.parseInt(frame[2], 16);
  const body = locateWasmFunctionBody(wasmBytes, functionIndex, functionName);
  assert.ok(trapOffset >= body.instructionStart && trapOffset < body.bodyEnd,
    `original signed-module offset 0x${trapOffset.toString(16)} must lie in ${functionName}'s instructions`);
  assert.ok(wasmInstructionStarts(body.bytes, body.instructionStart, body.bodyEnd, functionName).has(trapOffset),
    `original signed-module offset 0x${trapOffset.toString(16)} must be a ${functionName} instruction boundary`);
  const expectedByte = expectedOpcode === "unreachable" ? 0x00 : undefined;
  assert.notEqual(expectedByte, undefined, `unsupported expected WASM opcode ${expectedOpcode}`);
  assert.equal(body.bytes[trapOffset], expectedByte,
    `original signed-module offset 0x${trapOffset.toString(16)} in ${functionName} must encode ${expectedOpcode}`);
}

test("trap attribution rejects a zero byte inside a WASM instruction immediate", () => {
  // i32.const 0; drop; unreachable; end. The first 0x00 is an immediate,
  // not an executable opcode, but the module also has a real unreachable.
  const wasm = Uint8Array.from([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    0x07, 0x05, 0x01, 0x01, 0x66, 0x00, 0x00,
    0x0a, 0x08, 0x01, 0x06, 0x00, 0x41, 0x00, 0x1a, 0x00, 0x0b,
  ]);
  assert.throws(
    () => assertWasmTrapOffsetMapsToOpcode("wasm-function[0]:0x15", wasm, "f", "unreachable"),
    /instruction boundary/u,
    "a matching zero immediate must not be accepted as the trap opcode",
  );
});

test("WAT function extraction ignores fake function headers inside comments", () => {
  const wat = `;; (func $runawayLoop (result i32) unreachable)
(module
  (data (i32.const 0) "(func $runawayLoop (result i32) unreachable)")
  (func $runawayLoop (result i32) (i32.const 7))
  (export "runawayLoop" (func $runawayLoop)))`;
  assert.equal(extractWATFunction(wat, "runawayLoop"),
    '(func $runawayLoop (result i32) (i32.const 7))');
});

test("WAT function extraction skips export references before the function definition", () => {
  const wat = `(module
  (export "runawayLoop" (func $runawayLoop))
  (func $runawayLoop (result i32) (i32.const 7)))`;
  assert.equal(extractWATFunction(wat, "runawayLoop"),
    '(func $runawayLoop (result i32) (i32.const 7))');
});

test("WAT function extraction accepts a newline and comment between func and its name", async () => {
  const wat = `(module
  (func
    ;; legal trivia between the function keyword and identifier
    $runawayLoop (result i32) (i32.const 7)))`;
  const assembled = await L.assembleWAT(wat);
  assert.ok(assembled.valid && assembled.diagnostics.length === 0,
    `split-header WAT must be valid: ${JSON.stringify(assembled.diagnostics)}`);
  assert.match(extractWATFunction(wat, "runawayLoop"), /\(i32\.const 7\)/u);
});

test("WAT function extraction accepts a signature immediately after its name delimiter", async () => {
  const wat = `(module (func $runawayLoop(result i32) (i32.const 7)))`;
  const assembled = await L.assembleWAT(wat);
  assert.ok(assembled.valid && assembled.diagnostics.length === 0,
    `parenthesis-delimited function header must be valid: ${JSON.stringify(assembled.diagnostics)}`);
  assert.match(extractWATFunction(wat, "runawayLoop"), /\(i32\.const 7\)/u);
});

test("WAT opcode counting keeps token boundaries across block comments", () => {
  const wat = '(func $f (result i32) (nop(; comment separates tokens ;)unreachable) (data (i32.const 0) "unreachable"))';
  assert.equal(countWATUnreachableOpcodes(wat), 1);
});

test("WAT opcode counting recognizes an instruction after a folded expression", () => {
  assert.equal(countWATUnreachableOpcodes('(func $f (result i32) (nop)unreachable)'), 1);
});

test("fuel-guard recognition ignores a commented guard beside a real unrelated trap", () => {
  const wat = `(func $f (result i32)
    ;; (if (i32.gt_u (local.get $__while_fuel_0) (i32.const 100000)) (then unreachable))
    unreachable)`;
  assert.throws(() => assertFuelGuardIsTheOnlyUnreachable(wat, "comment-decoy"), /exact fuel guard/u);
});

// Reference tier = tree-walker (no pureFastPath). Candidate tier = bytecode/sync fast-path.
const reference = (prog, flow, args) => executeFlow(flow, args, prog.ast, prog.flows);
const candidate = (prog, flow, args) =>
  executeFlow(flow, args, prog.ast, prog.flows, undefined, undefined, { pureFastPath: true });

const show = (v) =>
  v.__tag === "runtimeError" ? `trap:${v.message}` : v.__tag === "int" ? `int:${v.value}` : v.__tag;

// ── Deterministic fuzz (slice-5): a seeded xorshift32 PRNG so the for-all-inputs gate is
// reproducible + CI-stable (no Math.random). ~30% of samples are drawn from the i32 edge set
// (so overflow / div0 / mod0 / sqrt-boundary / INT32_MIN÷-1 are exercised), the rest uniform i32.
const EDGE = [0, 1, -1, 2, -2, MIN, MAX, MIN + 1, MAX - 1, 46340, 46341, -46340, -46341, 65536, -65536];
function makePRNG(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s; // u32
  };
}
function makeSampler(seed) {
  const rng = makePRNG(seed);
  return () => {
    const r = rng();
    if ((r & 7) < 3) return EDGE[rng() % EDGE.length]; // ~30% edge values
    return r | 0; // uniform i32 (u32 → signed)
  };
}

// [source, flowName, paramNames, [ [args…] … ]] — pure i32 flows over the hardened edge set.
// NOTE: each flow has a UNIQUE name. On the harness's first run a shared name ("f") exposed that the
// GLOBAL bytecode cache keys on flow name, so the fast tier reused the first "f"'s bytecode across
// later same-named flows from SEPARATE compilations (walker=7 vs fast=13 on a sub flow). Real programs
// can't trigger it (the symbol resolver forbids duplicate names), but the persistent cross-compilation
// cache is a real hygiene hazard — the 0014 design's `sourceTag` scoping is the fix. We use unique
// names + clearBytecodeCache() per entry so the differential tests the TIERS, not the cache.
const CORPUS = [
  ["pure flow fAdd(a: Int, b: Int) -> Int contract { effects {} } { return a + b }", "fAdd", ["a", "b"], [[2, 3], [MAX, 1], [MIN, -1]]],
  ["pure flow fSub(a: Int, b: Int) -> Int contract { effects {} } { return a - b }", "fSub", ["a", "b"], [[10, 3], [MIN, 1], [MAX, -1]]],
  ["pure flow fMul(a: Int, b: Int) -> Int contract { effects {} } { return a * b }", "fMul", ["a", "b"], [[6, 7], [46340, 46340], [46341, 46341], [MIN, -1]]],
  ["pure flow fDiv(a: Int, b: Int) -> Int contract { effects {} } { return a / b }", "fDiv", ["a", "b"], [[7, 2], [-1, 2], [10, 0], [MIN, -1]]],
  ["pure flow fMod(a: Int, b: Int) -> Int contract { effects {} } { return a % b }", "fMod", ["a", "b"], [[10, 3], [10, 0], [MIN, -1]]],
  ["pure flow fNeg(a: Int) -> Int contract { effects {} } { return 0 - a }", "fNeg", ["a"], [[5], [MIN]]],
  // #0021: the UNARY-minus operator `-a` (distinct from binary `0 - a`) — the corpus blind spot.
  // -INT32_MIN must TRAP (overflow) on the walker exactly as the VM/WASM do; -0 -> +0.
  ["pure flow fUNeg(a: Int) -> Int contract { effects {} } { return -a }", "fUNeg", ["a"], [[5], [MIN], [MAX], [0]]],
];

test("0014 slice-1: tree-walker ≡ bytecode/fast tier, byte-exact (value + trap) over the i32 edges", async () => {
  for (const [src, flow, params, caseList] of CORPUS) {
    clearBytecodeCache(); // isolate each entry — see the NOTE above (cross-compilation cache hygiene)
    const prog = parseProgram(src, "fid.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, `parse error in "${src}": ${errs.map((d) => d.message).join("; ")}`);
    for (const vals of caseList) {
      const args = argMap(params, vals);
      const ref = (await reference(prog, flow, args)).value;
      const cand = (await candidate(prog, flow, args)).value;
      const ctx = `flow=${flow} args=[${vals}] : walker=${show(ref)} fast=${show(cand)}`;
      // 1. same tag (a value-vs-trap divergence is a fidelity failure)
      assert.equal(ref.__tag, cand.__tag, `tier TAG divergence — ${ctx}`);
      // 2. byte-exact value via Object.is (catches a `-0` that === would hide)
      if (ref.__tag === "int") {
        assert.ok(Object.is(ref.value, cand.value), `tier VALUE divergence (incl. -0) — ${ctx}`);
      }
      // 3. identical trap kind
      if (ref.__tag === "runtimeError") {
        assert.equal(ref.message, cand.message, `tier TRAP divergence — ${ctx}`);
      }
      if (flow === "fUNeg") {
        if (vals[0] === MIN) {
          assert.equal(ref.__tag, "runtimeError", "negating INT32_MIN must fail closed on the reference walker");
        } else {
          const expected = vals[0] === 0 ? 0 : -vals[0]; // Int canonicalizes both signed zeros to 0.
          assert.deepEqual(ref, int(expected), `unary negation known answer for ${vals[0]}`);
        }
      }
    }
  }
});

// ── Slice 2: WASM tier ≡ reference walker (byte-exact value; trap ⟺ trap) ─────────────────────────
// Owner decision (2026-06-18): WASM i32 is the SEMANTIC REFERENCE tier. Slices 1/3 (cfb72f9) + 2/3
// (6542bae) made the walker + bytecode + WASM emitter conform on the i32 edges (checked add/sub/mul →
// trap on overflow; native i32.div_s/rem_s trap on /0 and INT32_MIN÷-1; INT32_MIN%-1 = 0, no trap).
// This slice PROVES that conformance end-to-end: it drives the SAME pure-i32 flows through the reference
// async tree-walker AND through real WASM (.fungi → WAT → real-wabt → #105 Ed25519-attested admission →
// instantiate), asserting the WASM result is byte-identical to the walker. Trap MESSAGES legitimately
// differ across runtimes (walker "integer overflow" vs a WASM `unreachable`/`div_s` trap), so traps are
// compared by KIND (both trapped) and values by Object.is (catches a -0 that === would hide). This
// closes the WASM half of the cross-tier i32 conformance (X1 for these ops) at the artifact level.
const WASM_SRC = CORPUS.map(([src]) => src).join("\n");

test("0014 slice-2: WASM tier ≡ reference walker, byte-exact (value; trap⟺trap) over the i32 edges", async () => {
  const prog = parseProgram(WASM_SRC, "fid-wasm.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse error: ${errs.map((d) => d.message).join("; ")}`);

  // .fungi → WAT → real wabt module → #105 Ed25519-attested admission gate → instantiate (once, all flows).
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "fid", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `module assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem },
    host: L.createHostRuntime(),
  });

  for (const [, flow, params, caseList] of CORPUS) {
    assert.equal(typeof instance.exports[flow], "function", `WASM exports pure flow ${flow}`);
    for (const vals of caseList) {
      // reference tier = governed async tree-walker (the semantic conformance target)
      const ref = (await executeFlow(flow, argMap(params, vals), prog.ast, prog.flows)).value;
      const refTrap = ref.__tag === "runtimeError";
      // candidate tier = real WASM; an overflow / div0 / mod0 trap surfaces as a thrown RuntimeError on invoke
      let wasmTrap = false, wasmVal;
      try { wasmVal = instance.exports[flow](...vals); } catch { wasmTrap = true; }
      const ctx = `flow=${flow} args=[${vals}] : walker=${refTrap ? "trap" : "int:" + ref.value} wasm=${wasmTrap ? "trap" : "int:" + wasmVal}`;
      // 1. trap ⟺ trap (a value-vs-trap split is a fidelity failure)
      assert.equal(refTrap, wasmTrap, `tier TRAP/VALUE divergence — ${ctx}`);
      if (flow === "fUNeg") {
        if (vals[0] === MIN) {
          assert.equal(wasmTrap, true, "negating INT32_MIN must trap in assembled WASM");
        } else {
          const expected = vals[0] === 0 ? 0 : -vals[0];
          assert.equal(wasmVal, expected, `assembled-WASM unary negation known answer for ${vals[0]}`);
        }
      }
      // 2. when both produce a value, byte-exact via Object.is (catches a -0 that === would hide)
      if (!refTrap) {
        assert.equal(ref.__tag, "int", `reference produced a non-int value — ${ctx}`);
        assert.ok(Object.is(ref.value, wasmVal), `WASM value divergence (incl. -0) — ${ctx}`);
      }
    }
  }
});

// ── Slice 3: NEGATIVE corpus — floor-bearing flows are REFUSED lowering (0021 hub deliverable) ─────
// `lean` is the *erasure of enforcement compiler-proved unnecessary*, never a relaxation of an
// enforcement that exists. The monotone-safety invariant in governance-mode.ts proves
// resolveGovernanceMode(...).tier === "lean" ⟹ (effectFree ∧ taintClean). This is the negative half of
// the harness: flows that DECLARE an effect or TOUCH a governed sink must be FORCED to tier `full` —
// never admitted to the faster `lean`/WASM tier. We drive the REAL shipped effect-checker
// (L.checkEffects → EffectCheckerFlags.EffectFree, set only for a pure flow with no declared AND no
// inferred effects) and feed its EffectFree fact to the REAL resolver (resolveGovernanceMode). Each
// effectful flow → effectFree=false → tier `full` under `auto`, AND a safety-override to `full`
// (+ FUNGI-CONFIG-GOV-002) even when `lean` is explicitly requested. taintClean is pinned true to isolate
// the EFFECT floor (the easiest path to lean): proving these still refuse lowering shows the effect floor
// alone suffices. A pure no-effect CONTROL flow is asserted lean-eligible so the test can't pass trivially.
const NEG_GOV_CORPUS = [
  ["secure flow negNet(u: Text) -> Text contract { effects [network.outbound] } { return u }", "negNet", "declared network.outbound effect"],
  ["secure flow negFs(p: Text) -> Text contract { effects [storage.read] } { return p }", "negFs", "declared storage.read effect"],
  ["secure flow negSink(u: Text) -> Text contract { effects [network.outbound] } { return http.get(u) }", "negSink", "touches governed sink http.get → inferred network.outbound"],
  ["guarded flow negAudit(m: Text) -> Text contract { effects [audit.write] } { return m }", "negAudit", "declared audit.write effect"],
];
// Positive control: a pure, effect-free flow that IS lean-eligible — guards against a trivially-passing test.
const POS_GOV_CONTROL = ["pure flow posPure(a: Int) -> Int contract { effects {} } { return a + 1 }", "posPure"];

// EffectCheckerFlags.EffectFree for one parsed flow, via the shipped effect-checker.
const effectFreeOf = (prog, flowName) => {
  const r = L.checkEffects(prog.flows, prog.ast).find((x) => x.flowName === flowName);
  assert.ok(r, `effect-checker produced no result for flow ${flowName}`);
  return (r.checkerFlags & L.EffectCheckerFlags.EffectFree) !== 0;
};

test("0014 slice-3: floor-bearing flows are refused lowering — governance resolver forces full (never lean)", () => {
  // Control: a pure effect-free flow MUST be lean-eligible — proves the corpus below isn't trivially `full`.
  {
    const [src, flow] = POS_GOV_CONTROL;
    const prog = parseProgram(src, "fid-gov-ctrl.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, `control parse error: ${errs.map((d) => d.message).join("; ")}`);
    const ef = effectFreeOf(prog, flow);
    assert.equal(ef, true, `control pure flow ${flow} must be EffectFree`);
    const res = resolveGovernanceMode({ projectDefault: "auto", flowRequest: "auto", effectFree: ef, taintClean: true });
    assert.equal(res.tier, "lean", `control: an EffectFree+taint-clean flow under auto must reach lean — ${res.reason}`);
  }

  // Negative corpus: every effectful / sink-touching flow is forced to full and refused lowering.
  for (const [src, flow, why] of NEG_GOV_CORPUS) {
    const prog = parseProgram(src, "fid-gov.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, `parse error for ${flow} (${why}): ${errs.map((d) => d.message).join("; ")}`);

    // 1. The shipped effect-checker proves this flow is NOT effect-free (the governance floor).
    const ef = effectFreeOf(prog, flow);
    assert.equal(ef, false, `floor: ${flow} (${why}) must NOT be EffectFree`);

    // 2. Under `auto`, a non-effect-free flow resolves to full — not admitted to the faster tier.
    const auto = resolveGovernanceMode({ projectDefault: "auto", flowRequest: "auto", effectFree: ef, taintClean: true });
    assert.equal(auto.tier, "full", `auto: ${flow} (${why}) must resolve full, got ${auto.tier} — ${auto.reason}`);

    // 3. Even an EXPLICIT `lean` request is overridden to full (lean cannot relax an enforcement that exists),
    //    and the resolver must surface the FUNGI-CONFIG-GOV-002 safety-override diagnostic.
    const lean = resolveGovernanceMode({ projectDefault: "lean", flowRequest: "lean", effectFree: ef, taintClean: true });
    assert.equal(lean.tier, "full", `lean-override: ${flow} (${why}) must safety-override to full, got ${lean.tier} — ${lean.reason}`);
    assert.ok(
      lean.diagnostics.some((d) => d.includes("FUNGI-CONFIG-GOV-002")),
      `lean-override: ${flow} (${why}) must emit FUNGI-CONFIG-GOV-002 — got [${lean.diagnostics.join(" | ")}]`,
    );
  }
});

// ── Slice 4: liveness FAIL-CLOSED — runaway loop + deep recursion TRAP (0032 hazard fix, owner Go 2026-06-18) ──
// The two confirmed stability hazards are now fail-closed, locked here: (1) a non-terminating loop TRAPS at the
// iteration cap (was fail-OPEN — truncate at 100k + return SUCCESS with partial state); (2) unbounded recursion
// TRAPS at the depth cap (was an UNCATCHABLE host heap-OOM ~5000 deep, violating Goal C "no system crash").
// Verified with LOW caps via runtimeOptions so the test is fast — the caps default to 100_000 / 2000 in production.
test("0014 slice-4: liveness fail-closed — runaway loop + deep recursion TRAP (not truncate-succeed, not crash)", async () => {
  // (1) infinite while → runtimeError at maxIterations, NOT a successful partial result.
  {
    const prog = parseProgram("guarded flow loopForever() -> Int contract { effects {} } { mut i = 0 while true { i = i + 1 } return i }", "fid-live.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, `parse error: ${errs.map((d) => d.message).join("; ")}`);
    const res = await executeFlow("loopForever", new Map(), prog.ast, prog.flows, undefined, undefined, { maxIterations: 5 });
    assert.equal(res.value.__tag, "runtimeError", "runaway while must fail closed (runtimeError), not succeed with partial state");
    assert.ok(/Loop exceeded/.test(res.value.message ?? ""), `expected a 'Loop exceeded' trap — got ${res.value.message ?? res.value.__tag}`);
  }
  // (2) unbounded self-recursion → runtimeError at maxCallDepth, NOT an uncatchable host crash.
  {
    const prog = parseProgram("guarded flow recur(n: Int) -> Int contract { effects {} } { return recur(n + 1) }", "fid-rec.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, `parse error: ${errs.map((d) => d.message).join("; ")}`);
    const res = await executeFlow("recur", new Map([["n", { __tag: "int", value: 0 }]]), prog.ast, prog.flows, undefined, undefined, { maxCallDepth: 50 });
    assert.equal(res.value.__tag, "runtimeError", "unbounded recursion must fail closed (runtimeError), not crash the host");
    assert.ok(/Recursion depth exceeded/.test(res.value.message ?? ""), `expected a 'Recursion depth exceeded' trap — got ${res.value.message ?? res.value.__tag}`);
  }
});

// ── Slice 5: FUZZ / for-all-inputs gate (0014 + 0048 deliverable) ──────────────────────────────────
// The fixed corpus above proves the KNOWN i32 edges; this slice is the structural guarantee the harness
// was missing — a deterministic property gate that drives MANY random i32 inputs through every tier and
// asserts byte-exact agreement, so a future change that fails-open on some non-hand-picked input is
// caught here (the cross-tier fail-open family memory flags as structurally under-covered). Seeded →
// reproducible; a failure prints the exact seed-derived args so it is debuggable.
test("0014 slice-5a: FUZZ tree-walker ≡ bytecode/fast tier, byte-exact over random i32 inputs", async () => {
  const N = 400;
  const sample = makeSampler(0x9e3779b1);
  for (const [src, flow, params] of CORPUS) {
    clearBytecodeCache(); // isolate each entry from the cross-compilation cache (see the NOTE above)
    const prog = parseProgram(src, "fid-fuzz.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, `parse error in "${src}": ${errs.map((d) => d.message).join("; ")}`);
    for (let i = 0; i < N; i++) {
      const vals = params.map(() => sample());
      const args = argMap(params, vals);
      const ref = (await reference(prog, flow, args)).value;
      const cand = (await candidate(prog, flow, args)).value;
      const ctx = `flow=${flow} args=[${vals}] : walker=${show(ref)} fast=${show(cand)}`;
      assert.equal(ref.__tag, cand.__tag, `FUZZ tier TAG divergence — ${ctx}`);
      if (ref.__tag === "int") assert.ok(Object.is(ref.value, cand.value), `FUZZ tier VALUE divergence (incl. -0) — ${ctx}`);
      if (ref.__tag === "runtimeError") assert.equal(ref.message, cand.message, `FUZZ tier TRAP divergence — ${ctx}`);
    }
  }
});

// ── Slice 6: SHAPE fuzz — loop-bearing generated programs (RD-0316 leg 1; task #29) ────────────────
// Slices 5a/5b randomize only LEAF VALUES over 7 straight-line templates with zero loops — the exact
// corpus gap that let RD-0314 (the WASM runaway-loop hang) need a human to find it by hand. This slice
// randomizes the PROGRAM SHAPE: a seeded-PRNG generator emits small pure flows with a bounded `while`
// loop and a random arithmetic expression tree in the body (params, the accumulator, the induction var,
// edge literals; + - * / % with div/mod trap edges live), then drives them through (6a) walker ≡
// bytecode/fast and (6b) walker ≡ REAL WASM. No new dependency — the same xorshift32 the harness
// already owns (the owner's #29 constraint: seeded-PRNG arbitrary, no fast-check).
function makeFlowGen(seed) {
  const rng = makePRNG(seed);
  const pick = (arr) => arr[rng() % arr.length];
  // Small i32 literals + edges; kept small so bounded loops stay fast.
  const LIT = [0, 1, 2, 3, 5, 7, -1, -2, 46341, MAX, MIN];
  const expr = (depth, vars) => {
    if (depth <= 0 || (rng() & 3) === 0) {
      return (rng() & 1) === 0 ? pick(vars) : String(pick(LIT));
    }
    const op = pick(["+", "-", "*", "/", "%"]);
    return `(${expr(depth - 1, vars)} ${op} ${expr(depth - 1, vars)})`;
  };
  let n = 0;
  return () => {
    n++;
    const flow = `gShape${seed & 0xffff}x${n}`;
    const bound = rng() % 40; // 0..39 iterations — shape variety without slow tests
    const seedExpr = expr(2, ["a", "b"]);
    const bodyExpr = expr(2, ["a", "b", "acc", "i"]);
    const src =
      `pure flow ${flow}(a: Int, b: Int) -> Int contract { effects {} } { ` +
      `mut acc = ${seedExpr} ` +
      `mut i = 0 ` +
      `while i < ${bound} { acc = ${bodyExpr} i = i + 1 } ` +
      `return acc }`;
    return { flow, src };
  };
}

test("0014 slice-6a: SHAPE FUZZ walker ≡ bytecode/fast tier over generated loop-bearing flows", async () => {
  const gen = makeFlowGen(0xa11ce);
  const sample = makeSampler(0xbeefcafe);
  for (let p = 0; p < 12; p++) {
    const { flow, src } = gen();
    clearBytecodeCache();
    const prog = parseProgram(src, "fid-shape.fungi");
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    assert.equal(errs.length, 0, `generated program must parse: "${src}" → ${errs.map((d) => d.message).join("; ")}`);
    for (let i = 0; i < 8; i++) {
      const vals = [sample(), sample()];
      const args = argMap(["a", "b"], vals);
      const ref = (await reference(prog, flow, args)).value;
      const cand = (await candidate(prog, flow, args)).value;
      const ctx = `flow=${flow} args=[${vals}] src="${src}" : walker=${show(ref)} fast=${show(cand)}`;
      assert.equal(ref.__tag, cand.__tag, `SHAPE tier TAG divergence — ${ctx}`);
      if (ref.__tag === "int") assert.ok(Object.is(ref.value, cand.value), `SHAPE tier VALUE divergence — ${ctx}`);
      if (ref.__tag === "runtimeError") assert.equal(ref.message, cand.message, `SHAPE tier TRAP divergence — ${ctx}`);
    }
  }
});

test("0014 slice-6b: SHAPE FUZZ REAL WASM ≡ reference walker over generated loop-bearing flows", async () => {
  const gen = makeFlowGen(0x5eed5);
  const generated = Array.from({ length: 6 }, () => gen());
  const prog = parseProgram(generated.map((g) => g.src).join("\n"), "fid-shape-wasm.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `generated module must parse: ${errs.map((d) => d.message).join("; ")}`);

  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "fidshape", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `generated module assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem },
    host: L.createHostRuntime(),
  });

  const sample = makeSampler(0xf00df00d);
  for (const { flow } of generated) {
    assert.equal(typeof instance.exports[flow], "function", `WASM exports generated flow ${flow}`);
    for (let i = 0; i < 6; i++) {
      const vals = [sample(), sample()];
      const ref = (await executeFlow(flow, argMap(["a", "b"], vals), prog.ast, prog.flows)).value;
      const refTrap = ref.__tag === "runtimeError";
      let wasmTrap = false, wasmVal;
      try { wasmVal = instance.exports[flow](...vals); } catch { wasmTrap = true; }
      const ctx = `flow=${flow} args=[${vals}] : walker=${refTrap ? "trap" : "int:" + ref.value} wasm=${wasmTrap ? "trap" : "int:" + wasmVal}`;
      assert.equal(refTrap, wasmTrap, `SHAPE WASM TRAP/VALUE divergence — ${ctx}`);
      if (!refTrap) assert.ok(Object.is(ref.value, wasmVal), `SHAPE WASM value divergence — ${ctx}`);
    }
  }
});

// ── Slice 6c: WASM runaway-loop LIVENESS — watchdogged, fail-closed (the RD-0314-class detector) ──
// RD-0316's centerpiece gap: no runaway flow was ever routed through the REAL WASM path, and an
// in-process `while true` invoke would freeze the whole harness (a hang never throws). Since then the
// WAT emitter gained the per-loop FUEL CAP (task #22 / RD-0393 ceilings), so today the correct
// behaviour is: `while true` in real WASM TRAPS fail-closed at the fuel cap, quickly. This slice
// proves exactly that — through a worker_threads-isolated invoke with a wall-clock watchdog, so if a
// future emitter change DROPS the fuel cap, the watchdog reclaims the hang and reports the RD-0314
// class as a test failure instead of freezing CI.
test("0014 slice-6c: REAL WASM loop fuel traps only after the exact cap and worker exits (watchdogged)", async () => {
  const src = [
    "pure flow runawayLoop(a: Int) -> Int contract { effects {} } { mut i = 0 while a == 1 { i = i + 1 } return i }",
    "pure flow boundedLoop(limit: Int) -> Int contract { effects {} } { mut i = 0 while i < limit { i = i + 1 } return i }",
  ].join("\n");
  const prog = parseProgram(src, "fid-runaway.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse error: ${errs.map((d) => d.message).join("; ")}`);

  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "fidrun", prog.ast, true));
  assert.match(wat, /__while_fuel_/u, "the compiled runaway flow must contain the loop-fuel counter");
  const runawayWat = extractWATFunction(wat, "runawayLoop");
  const boundedWat = extractWATFunction(wat, "boundedLoop");
  assert.match(runawayWat, /\(if \(i32\.gt_u \(local\.get \$__while_fuel_0\) \(i32\.const 100000\)\) \(then unreachable\)\)/u,
    "the runaway function must contain its per-loop 100000-iteration guard");
  assert.match(boundedWat, /\(if \(i32\.gt_u \(local\.get \$__while_fuel_0\) \(i32\.const 100000\)\) \(then unreachable\)\)/u,
    "the finite boundary-control function must contain its independent 100000-iteration guard");
  assertFuelGuardIsTheOnlyUnreachable(runawayWat, "runawayLoop");
  assertFuelGuardIsTheOnlyUnreachable(boundedWat, "boundedLoop");
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `runaway module assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");

  // The walker side of the differential: same flow, low cap → 'Loop exceeded' trap (fail-closed).
  const walkerRes = await executeFlow("runawayLoop", argMap(["a"], [1]), prog.ast, prog.flows, undefined, undefined, { maxIterations: 50 });
  assert.equal(walkerRes.value.__tag, "runtimeError", "walker: runaway loop must trap at the iteration cap");

  const commonWorkerData = {
    wasmB64: Buffer.from(asm.wasm).toString("base64"),
    attestation: att,
    publicKeyPem: kp.publicKeyPem,
    args: [1],
  };
  const missingExport = await invokeWasmInWorker({ ...commonWorkerData, flow: "missingRunawayLoop" });
  assert.equal(missingExport.ok, false, "a missing-export control must be refused, not counted as a trap");
  assert.match(missingExport.error, /not a callable function/u);
  assert.equal(missingExport.workerExited, true, "the missing-export worker must be observed exiting");
  assert.equal(missingExport.exitCode, 0, "the missing-export worker exits normally after reporting refusal");

  // A function-entry trap or unrelated unreachable must not masquerade as fuel exhaustion.
  const invoke = (flow, value, extraWorkerData = {}) => invokeWasmInWorker({
    ...commonWorkerData,
    flow,
    args: [value],
    ...extraWorkerData,
  });

  const zeroIterations = await invoke("runawayLoop", 0);
  assert.ok(!zeroIterations.hang, "zero-iteration control exceeded the worker watchdog");
  assert.ok(zeroIterations.ok, `worker failed before invoke: ${zeroIterations.error ?? "unknown"}`);
  assert.equal(zeroIterations.callStarted, true, "the worker must verify a callable export before invocation");
  assert.equal(zeroIterations.trapped, false, "zero iterations must return normally, not report an unrelated trap");
  assert.equal(zeroIterations.value, 0, "zero iterations return the initialized value");
  assert.equal(zeroIterations.workerExited, true, "the successful worker must be observed exiting");
  assert.equal(zeroIterations.exitCode, 0, "the successful worker exits normally");

  const atFuelCap = await invoke("boundedLoop", 100000);
  assert.ok(!atFuelCap.hang, "the exact fuel-cap control exceeded the worker watchdog");
  assert.ok(atFuelCap.ok, `worker failed before invoke: ${atFuelCap.error ?? "unknown"}`);
  assert.equal(atFuelCap.trapped, false, "exactly 100000 loop iterations must complete");
  assert.equal(atFuelCap.value, 100000, "the exact-cap control returns its iteration count");
  assert.equal(atFuelCap.workerExited, true, "the exact-cap worker must be observed exiting");
  assert.equal(atFuelCap.exitCode, 0, "the exact-cap worker exits normally");

  const beyondFuelCap = await invoke("boundedLoop", 100001);
  assert.ok(!beyondFuelCap.hang,
    "RD-0314 CLASS REGRESSION: a runaway real-WASM loop exceeded the watchdog; fuel exhaustion must trap first");
  assert.ok(beyondFuelCap.ok, `worker failed before invoke: ${beyondFuelCap.error ?? "unknown"}`);
  assert.equal(beyondFuelCap.callStarted, true, "fuel exhaustion must follow a callable-export invocation");
  assert.equal(beyondFuelCap.trapped, true, "100001 iterations must trap after the 100000-iteration cap");
  assert.match(beyondFuelCap.trapReason, /trap during 'boundedLoop':.*unreachable/u,
    "the over-cap execution must report the guest's WebAssembly unreachable failure");
  assert.equal(beyondFuelCap.workerExited, true, "the trapped worker must be observed exiting");
  assert.equal(beyondFuelCap.exitCode, 0, "the worker exits normally after reporting the guest trap");

  const runaway = await invoke("runawayLoop", 1, { captureWasmStack: true });
  assert.ok(!runaway.hang,
    "RD-0314 CLASS REGRESSION: infinite real-WASM loop exceeded the watchdog; fuel exhaustion must trap first");
  assert.ok(runaway.ok, `worker failed before invoke: ${runaway.error ?? "unknown"}`);
  assert.equal(runaway.callStarted, true, "the runaway path must invoke a real callable export");
  assert.equal(runaway.trapped, true, "the infinite loop must trap at the fuel cap");
  assert.match(runaway.trapReason, /trap during 'runawayLoop':.*unreachable/u);
  assert.match(runaway.trapStack ?? "", /wasm-function\[\d+\]:0x[\da-f]+/u,
    "the exact admitted original module trap must expose its WebAssembly code offset");
  assertWasmTrapOffsetMapsToOpcode(runaway.trapStack, asm.wasm, "runawayLoop", "unreachable");
  assert.throws(
    () => assertWasmTrapOffsetMapsToOpcode(runaway.trapStack, asm.wasm, "boundedLoop", "unreachable"),
    /runtime function index must identify exported boundedLoop/u,
    "the attribution must reject a different exported function",
  );
  const trapFrame = /wasm-function\[(\d+)\]:0x([\da-f]+)/iu.exec(runaway.trapStack);
  assert.ok(trapFrame, "the positive trap frame remains available for the offset negative control");
  const wrongOffset = Number.parseInt(trapFrame[2], 16) + 1;
  const wrongOffsetStack = runaway.trapStack.replace(trapFrame[0],
    `wasm-function[${trapFrame[1]}]:0x${wrongOffset.toString(16)}`);
  assert.throws(
    () => assertWasmTrapOffsetMapsToOpcode(wrongOffsetStack, asm.wasm, "runawayLoop", "unreachable"),
    /must (?:lie in .*instructions|encode unreachable)/u,
    "the attribution must reject an adjacent non-trap code offset",
  );
  assert.equal(runaway.workerExited, true, "the trapped runaway worker must be observed exiting");
  assert.equal(runaway.exitCode, 0, "the runaway worker exits normally after reporting the guest trap");

  // Negative control: an unrelated trap at the top of the loop body has the same generic
  // WebAssembly 'unreachable' runtime reason. The attribution oracle must reject that module.
  const exitBranch = /\(br_if \$while_exit_0 [^\r\n]+\)/u.exec(runawayWat);
  assert.ok(exitBranch, "the runaway function must expose its condition/exit check");
  const bodyTrapInsertAt = exitBranch.index + exitBranch[0].length;
  const bodyTrapRunawayWat = `${runawayWat.slice(0, bodyTrapInsertAt)}\n    (nop)unreachable${runawayWat.slice(bodyTrapInsertAt)}`;
  assert.notEqual(bodyTrapRunawayWat, runawayWat, "the negative control must inject a body-only trap");
  assert.throws(
    () => assertFuelGuardIsTheOnlyUnreachable(bodyTrapRunawayWat, "runawayLoop body-trap mutant"),
    /exactly one unreachable opcode/u,
    "the attribution oracle must fail on a non-fuel trap even when the fuel guard remains present",
  );
  assert.doesNotThrow(
    () => assertFuelGuardIsTheOnlyUnreachable(`${runawayWat}\n    ;; harmless unreachable comment`, "runawayLoop comment control"),
    "a non-executable comment must not be counted as a trap opcode",
  );
  const bodyTrapModuleWat = wat.replace(runawayWat, bodyTrapRunawayWat);
  const bodyTrapAsm = await L.assembleWAT(bodyTrapModuleWat);
  assert.ok(bodyTrapAsm.valid && bodyTrapAsm.diagnostics.length === 0,
    `body-trap negative-control module assembles: ${JSON.stringify(bodyTrapAsm.diagnostics)}`);
  const bodyTrapKeypair = L.generateRunnerKeypair();
  const bodyTrapAttestation = L.signWasm(bodyTrapAsm.wasm, bodyTrapKeypair.privateKeyPem, "dev");
  const bodyTrapCommonWorkerData = {
    wasmB64: Buffer.from(bodyTrapAsm.wasm).toString("base64"),
    attestation: bodyTrapAttestation,
    publicKeyPem: bodyTrapKeypair.publicKeyPem,
  };
  const bodyTrapZeroIterations = await invokeWasmInWorker({
    ...bodyTrapCommonWorkerData,
    flow: "runawayLoop",
    args: [0],
  });
  assert.equal(bodyTrapZeroIterations.ok, true,
    `body-trap zero-iteration control failed before invoke: ${bodyTrapZeroIterations.error ?? "unknown"}`);
  assert.equal(bodyTrapZeroIterations.trapped, false,
    "the injected source-body trap must not run when the loop condition rejects entry");
  assert.equal(bodyTrapZeroIterations.value, 0, "the body-trap mutant preserves the zero-iteration result");
  assert.equal(bodyTrapZeroIterations.workerExited, true, "zero-iteration mutant worker must be observed exiting");
  assert.equal(bodyTrapZeroIterations.exitCode, 0, "zero-iteration mutant worker exits normally");
  const unrelatedTrap = await invokeWasmInWorker({
    ...bodyTrapCommonWorkerData,
    flow: "runawayLoop",
    args: [1],
  });
  assert.equal(unrelatedTrap.ok, true, `body-trap worker failed before invoke: ${unrelatedTrap.error ?? "unknown"}`);
  assert.equal(unrelatedTrap.callStarted, true, "the negative control invokes the admitted callable export");
  assert.equal(unrelatedTrap.trapped, true, "the injected body trap must trap");
  assert.match(unrelatedTrap.trapReason, /trap during 'runawayLoop':.*unreachable/u,
    "the injected body trap deliberately shares the same generic runtime reason");
  assert.equal(unrelatedTrap.workerExited, true, "the negative-control worker must be observed exiting");
  assert.equal(unrelatedTrap.exitCode, 0, "the negative-control worker exits normally after reporting its trap");
});

test("0014 slice-5b: FUZZ WASM tier ≡ reference walker, byte-exact (value; trap⟺trap) over random i32 inputs", async () => {
  const N = 200;
  const prog = parseProgram(WASM_SRC, "fid-fuzz-wasm.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse error: ${errs.map((d) => d.message).join("; ")}`);

  // One assemble + #105-admit + instantiate for all flows (same path as slice-2).
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "fidfuzz", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  assert.ok(asm.valid && asm.diagnostics.length === 0, `module assembles: ${JSON.stringify(asm.diagnostics)}`);
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  const { instance } = await L.admitAndInstantiate({
    wasm: asm.wasm, attestation: att,
    policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem },
    host: L.createHostRuntime(),
  });

  const sample = makeSampler(0x12345677);
  for (const [, flow, params] of CORPUS) {
    assert.equal(typeof instance.exports[flow], "function", `WASM exports pure flow ${flow}`);
    for (let i = 0; i < N; i++) {
      const vals = params.map(() => sample());
      const ref = (await executeFlow(flow, argMap(params, vals), prog.ast, prog.flows)).value;
      const refTrap = ref.__tag === "runtimeError";
      let wasmTrap = false, wasmVal;
      try { wasmVal = instance.exports[flow](...vals); } catch { wasmTrap = true; }
      const ctx = `flow=${flow} args=[${vals}] : walker=${refTrap ? "trap" : "int:" + ref.value} wasm=${wasmTrap ? "trap" : "int:" + wasmVal}`;
      assert.equal(refTrap, wasmTrap, `FUZZ WASM TRAP/VALUE divergence — ${ctx}`);
      if (!refTrap) assert.ok(Object.is(ref.value, wasmVal), `FUZZ WASM value divergence (incl. -0) — ${ctx}`);
    }
  }
});
