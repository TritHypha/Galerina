// =============================================================================
// Galerina Phase 25 — WAT Assembler
//
// Assembles WAT (WebAssembly Text Format) source into a binary .wasm module.
//
// Two assembly paths are supported:
//   useSystemWabt=false (default) — minimal JS binary encoder for pure-flow
//                                   WAT patterns (single i32-returning func,
//                                   one memory). Full support: install 'wabt'
//                                   npm package (Phase 26).
//   useSystemWabt=true            — native wabt (wat2wasm) if installed;
//                                   faster for large modules in CI.
//
// Phase 25: minimal binary encoder.
//   Handles the WAT pattern emitted by the Galerina WAT emitter:
//     (module
//       (memory 2 2048)
//       (export "memory" (memory 0))
//       (func $name (result i32) (i32.const 0))
//       (export "name" (func $name))
//     )
//   Produces a real spec-compliant WASM binary for this pattern.
//   `valid` is `true` when the magic header is present.
//
// Phase 26 (planned): install 'wabt' npm package for full WAT support.
// =============================================================================

// WATAssemblerConfig is defined in type-registry to avoid duplication.
// Import it for use in this module, and re-export so callers can import
// from this module directly.
import type { WATAssemblerConfig } from "./type-registry.js";
export type { WATAssemblerConfig } from "./type-registry.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result of assembling a WAT source string into a WASM binary. */
export interface WATAssemblerResult {
  /**
   * The WASM binary.
   *
   * Phase 25: real binary produced by the minimal encoder for supported
   *   WAT patterns (single no-param i32-returning function, one memory).
   *   Downstream consumers MUST check `valid` before treating this as a
   *   genuine WebAssembly binary for unsupported patterns.
   *
   * Phase 26: real binary produced by wat2wasm / wabt npm for all patterns.
   */
  readonly wasm: Uint8Array;

  /** The original WAT source text that was passed to the assembler. */
  readonly sourceWAT: string;

  /**
   * `true`  — `wasm` contains a real, spec-compliant WebAssembly binary.
   * `false` — encoder could not produce a valid binary for this WAT pattern.
   */
  readonly valid: boolean;

  /**
   * Assembler diagnostics.  Non-fatal warnings may appear even when
   * `valid === true`.  Errors imply `valid === false`.
   */
  readonly diagnostics: readonly { readonly message: string }[];
}

// ---------------------------------------------------------------------------
// assembleWAT
// ---------------------------------------------------------------------------

/**
 * Assembles a WAT source string into a WASM binary.
 *
 * Phase 25: Minimal binary encoder for simple pure-flow WAT modules.
 *   Handles: single no-param i32-returning function with i32.const 0 body,
 *   one memory (min=2, max=2048).
 *   Full implementation: install wabt npm package (Phase 26).
 *
 * Phase 26 (planned):
 *   - When `useSystemWabt` is `false` (default): use the `wabt` npm package.
 *     ```ts
 *     import wabt from "wabt";
 *     const w = await wabt();
 *     const mod = w.parseWat("source.wat", watSource);
 *     mod.validate();
 *     return { wasm: mod.toBinary({}).buffer, sourceWAT: watSource, valid: true, diagnostics: [] };
 *     ```
 *   - When `useSystemWabt` is `true`: spawn `wat2wasm --output=- -` and pipe
 *     the WAT source through stdin, reading the binary from stdout.
 *
 * @param watSource - WAT text to assemble.
 * @param config    - Optional assembler configuration.
 * @returns         - Assembly result including the binary, source, validity
 *                   flag, and any diagnostics.
 */
export async function assembleWAT(
  watSource: string,
  config?: WATAssemblerConfig,
): Promise<WATAssemblerResult> {
  // Phase 27: Use wabt npm package for real binary assembly.
  // This replaces the Phase 25 minimal encoder and handles all WAT patterns
  // emitted by the Galerina WAT emitter (arithmetic, locals, if/else, while loops).
  // Distinguish "wabt not installed" from "wabt installed but REJECTED this WAT"
  // (e.g. undefined function references). The old code collapsed both into a
  // misleading "wabt not available" diagnostic — which masked invalid modules as
  // valid minimal-encoder stubs. Load wabt first, THEN attempt assembly separately.
  let wabtModule: unknown = null;
  try { wabtModule = await loadWabt(); } catch { wabtModule = null; }
  let wabtError: unknown = null;
  if (wabtModule !== null) {
    try {
      return assembleWithWabt(watSource, wabtModule);
    } catch (e) {
      // wabt is present but could not assemble THIS module → genuine compile failure,
      // NOT "unavailable". The minimal-encoder stub below is NOT a faithful compile.
      wabtError = e;
    }
  }

  // Fallback: Phase 25 minimal binary encoder (handles simple constant/identity patterns).
  try {
    const binary = encodeMinimalWASM(watSource);
    const valid = binary.length > 8
      && binary[0] === 0x00 && binary[1] === 0x61
      && binary[2] === 0x73 && binary[3] === 0x6d;
    const wabtRejected = wabtError !== null;
    const stubMsg = wabtRejected
      ? `wabt REJECTED this WAT (module does not link — e.g. undefined functions): ${((wabtError as Error)?.message ?? String(wabtError)).slice(0, 180)} — minimal-encoder STUB returned; this is NOT a faithful compile`
      : "wabt not available — using minimal encoder (limited WAT support)";
    return {
      wasm: binary,
      sourceWAT: watSource,
      valid,
      diagnostics: valid
        ? [{ message: stubMsg }]
        : [{ message: "Minimal encoder: complex WAT patterns not yet supported; install wabt npm package" }],
    };
  } catch (err) {
    return {
      wasm: new Uint8Array(0),
      sourceWAT: watSource,
      valid: false,
      diagnostics: [{ message: String(err) }],
    };
  }
}

// ---------------------------------------------------------------------------
// Phase 27 — wabt npm package integration
// ---------------------------------------------------------------------------

// Build-isolation finding (2026-07-16, R&D-adjudicated): wabt is an Emscripten artifact that
// holds internal state across calls — its linear-memory arena, parsed-module registry, and
// feature flags — so a SHARED cached instance made `assembleWAT` non-re-entrant: a bundle that
// links cleanly as the FIRST build in a process non-deterministically failed ("module does not
// link — undefined functions") as one of a BATCH (observed on the largest DSS supervisor
// bundle). Fix = fresh toolkit instance per build; only the module FACTORY is cached (the
// import). Measured cost: ~3 ms per instantiation after first load — negligible against the
// correctness win. `parsed.destroy()` below stays (frees per-module handles promptly).
// Conformance: tests/wat-assembler-isolation.test.mjs (two different bundles, one process,
// both link); real-world detector: scripts/audit-dss-wasm-build.mjs ratchet.
let _wabtFactory: (() => Promise<unknown>) | null = null;

/**
 * Loads the wabt npm package and returns a FRESH toolkit instance per call
 * (no cross-build residue). Returns null if the package is not installed.
 */
async function loadWabt(): Promise<unknown> {
  try {
    if (_wabtFactory === null) {
      // Dynamic import — wabt is an optional peer dependency
      _wabtFactory = (await import("wabt" as string)).default as () => Promise<unknown>;
    }
    return await _wabtFactory();
  } catch {
    return null;
  }
}

/**
 * Phase 27: Assembles WAT using the wabt npm package.
 * Produces real spec-compliant WASM for all WAT patterns:
 *   - arithmetic (i32.add, i32.sub, i32.mul, etc.)
 *   - local variables (local.set, local.get)
 *   - control flow (if/else, block/loop/br_if)
 *   - memory operations
 */
function assembleWithWabt(watSource: string, wabtMod: unknown): WATAssemblerResult {
  const m = wabtMod as {
    parseWat: (name: string, src: string, opts: object) => {
      validate: () => void;
      toBinary: (opts: object) => { buffer: ArrayBuffer };
      destroy: () => void;
    };
  };

  const parsed = m.parseWat("galerina.wat", watSource, {});
  try {
    parsed.validate();
    const { buffer } = parsed.toBinary({});
    const wasm = new Uint8Array(buffer);
    const valid = wasm.length > 4
      && wasm[0] === 0x00 && wasm[1] === 0x61
      && wasm[2] === 0x73 && wasm[3] === 0x6d;
    return { wasm, sourceWAT: watSource, valid, diagnostics: [] };
  } finally {
    parsed.destroy();
  }
}

// ---------------------------------------------------------------------------
// Phase 27 — WASM execution
// ---------------------------------------------------------------------------

/**
 * Phase 27: Result of executing a pure flow inside a WASM module.
 */
export interface WASMExecutionResult {
  readonly flowName:    string;
  readonly args:        readonly number[];
  readonly result:      number | bigint | null;
  readonly error?:      string;
  readonly execMs:      number;
  readonly binaryBytes: number;
}

/**
 * Phase 27: Compiles a Galerina pure flow to binary WASM and executes it.
 *
 * Full pipeline:
 *   1. Assemble WAT → binary WASM via wabt
 *   2. WebAssembly.instantiate(binary)
 *   3. Call the exported function with args
 *   4. Return the result
 *
 * @param watSource - WAT module source (from renderWAT).
 * @param flowName  - Name of the exported function to call.
 * @param args      - Integer arguments to pass (must match the function signature).
 * @returns         - Execution result including the return value and timing.
 */
export async function executeWASMFlow(
  watSource: string,
  flowName: string,
  args: readonly number[],
): Promise<WASMExecutionResult> {
  const assembled = await assembleWAT(watSource);
  // #163 defense-in-depth: a wabt-REJECTED module falls back to the minimal-encoder
  // STUB with `valid:true` + a "NOT a faithful compile" diagnostic. Gating on `valid`
  // ALONE would RUN that stub and return a WRONG VALUE instead of trapping (the exact
  // fail-open behind the comment-swallows-paren bug). A faithful wabt assembly returns
  // `diagnostics:[]` (see assembleWithWabt); the stub always carries a diagnostic — so
  // treat ANY diagnostic as a decline. This is the pervasive `valid && diagnostics
  // .length===0` convention already used across the test suite.
  if (!assembled.valid || assembled.diagnostics.length > 0) {
    return {
      flowName,
      args,
      result: null,
      error: assembled.diagnostics.map(d => d.message).join("; "),
      execMs: 0,
      binaryBytes: assembled.wasm.byteLength,
    };
  }

  try {
    const t0 = performance.now();
    const wasmResult: unknown = await WebAssembly.instantiate(assembled.wasm);
    const instance = (wasmResult as { instance: WebAssembly.Instance }).instance
                  ?? (wasmResult as unknown as WebAssembly.Instance);
    const fn = (instance.exports as Record<string, unknown>)[flowName];
    if (typeof fn !== "function") {
      return {
        flowName, args, result: null,
        error: `Export '${flowName}' not found. Available: ${Object.keys(instance.exports).join(", ")}`,
        execMs: performance.now() - t0,
        binaryBytes: assembled.wasm.byteLength,
      };
    }
    const result = (fn as (...a: number[]) => number | bigint)(...args);
    const execMs = performance.now() - t0;
    return { flowName, args, result: result as number | bigint, execMs, binaryBytes: assembled.wasm.byteLength };
  } catch (err) {
    return {
      flowName, args, result: null,
      error: String(err),
      execMs: 0,
      binaryBytes: assembled.wasm.byteLength,
    };
  }
}

// ---------------------------------------------------------------------------
// encodeMinimalWASM — internal binary encoder
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WAT value-type string → WASM type byte
// ---------------------------------------------------------------------------

/**
 * Maps a WAT value type string to its WASM binary type byte.
 *   i32       → 0x7f
 *   i64       → 0x7e
 *   f32       → 0x7d
 *   f64       → 0x7c
 *   externref → 0x6f
 *   funcref   → 0x70
 */
function watTypeToByte(t: string): number {
  switch (t.trim()) {
    case "i32":       return 0x7f;
    case "i64":       return 0x7e;
    case "f32":       return 0x7d;
    case "f64":       return 0x7c;
    case "externref": return 0x6f;
    case "funcref":   return 0x70;
    default:          return 0x7f; // fallback: i32
  }
}

// ---------------------------------------------------------------------------
// Parse function signatures from WAT text
// ---------------------------------------------------------------------------

interface WATFuncSignature {
  readonly name: string;
  /** Param type bytes in order (empty for zero-param functions). */
  readonly paramTypes: readonly number[];
  /** Result type bytes (we always emit i32 as the single result). */
  readonly resultTypes: readonly number[];
  /** True when the body uses local.get $p0 (return-first-param pattern). */
  readonly usesLocalGet: boolean;
}

/**
 * Parses function signatures from WAT text.
 *
 * Matches WAT function blocks of the form:
 *   (func $name (param $p0 i32) (param $p1 externref) (result i32)
 *     (local.get $p0)
 *   )
 *
 * For Phase 24/25, we support the patterns emitted by renderWAT:
 *   - Zero params + (i32.const 0) body
 *   - One or more params + (local.get $p0) body
 *   - unreachable body
 */
function parseFuncSignatures(wat: string): WATFuncSignature[] {
  const signatures: WATFuncSignature[] = [];

  // Match each "(func $name ..." block.  We use a simple line-by-line scan
  // rather than a full parser — sufficient for the patterns renderWAT emits.
  const lines = wat.split("\n");
  let currentFunc: {
    name: string;
    paramTypes: number[];
    resultTypes: number[];
    bodyLines: string[];
  } | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect func declaration line: "  (func $name (param ...) (result ...)".
    // Exclude export-reference lines like "(export "x" (func $x))".
    const funcMatch = trimmed.match(/^\(func \$([\w_]+)(.*)/);
    if (funcMatch !== null && !trimmed.includes("(export")) {
      if (currentFunc !== undefined) {
        signatures.push(finaliseFunc(currentFunc));
      }
      const name = funcMatch[1] ?? "unknown";
      const rest = funcMatch[2] ?? "";

      // Parse (param $px TYPE) entries from the rest of the signature line.
      const paramTypes: number[] = [];
      for (const paramMatch of rest.matchAll(/\(param\s+\$\w+\s+([\w]+)\)/g)) {
        paramTypes.push(watTypeToByte(paramMatch[1] ?? "i32"));
      }

      // Parse (result TYPE) entry.
      const resultTypes: number[] = [];
      const resultMatch = rest.match(/\(result\s+([\w]+)\)/);
      if (resultMatch?.[1] !== undefined) {
        resultTypes.push(watTypeToByte(resultMatch[1]));
      } else {
        resultTypes.push(0x7f); // default result: i32
      }

      currentFunc = { name, paramTypes, resultTypes, bodyLines: [] };
      continue;
    }

    // Accumulate body lines for the current function.
    if (currentFunc !== undefined) {
      // Detect end of function block (closing paren at func indentation level).
      if (trimmed === ")" || trimmed.startsWith(";; ") === false && trimmed === ")") {
        signatures.push(finaliseFunc(currentFunc));
        currentFunc = undefined;
      } else {
        currentFunc.bodyLines.push(trimmed);
      }
    }
  }

  if (currentFunc !== undefined) {
    signatures.push(finaliseFunc(currentFunc));
  }

  return signatures;
}

function finaliseFunc(f: {
  name: string;
  paramTypes: number[];
  resultTypes: number[];
  bodyLines: string[];
}): WATFuncSignature {
  // Detect local.get pattern in body lines (ignoring comment-only lines).
  const usesLocalGet = f.bodyLines.some(
    (l) => l.includes("local.get") && !l.startsWith(";;"),
  );
  return {
    name: f.name,
    paramTypes: f.paramTypes,
    resultTypes: f.resultTypes,
    usesLocalGet,
  };
}

/**
 * Encodes a minimal WASM binary for a module with:
 *   - one memory (min=2, max=2048)
 *   - one function per "func $name" declaration
 *   - correct type section entries (supports params and results)
 *   - real body: local.get 0 when usesLocalGet, else i32.const 0
 *   - exports for memory and each function
 *
 * Phase 24: handles the parameter patterns emitted by emitWATBody —
 *   "(local.get $p0) ;; return first param" and "(i32.const 0) ;; default return".
 *
 * Returns an 8-byte module (magic + version only) for "(module)" with no funcs.
 */
function encodeMinimalWASM(wat: string): Uint8Array {
  const bytes: number[] = [];

  // Magic + version
  bytes.push(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00);

  // Parse function signatures from WAT.
  const funcs = parseFuncSignatures(wat);

  if (funcs.length === 0) {
    return new Uint8Array(bytes); // Minimal module — magic + version only
  }

  // ---------------------------------------------------------------------------
  // Type section
  //
  // We build one type entry per unique signature (paramTypes + resultTypes).
  // For simple WAT modules each function may have a unique type.
  // We map each function to a type index.
  // ---------------------------------------------------------------------------
  const typeEntries: { paramTypes: readonly number[]; resultTypes: readonly number[] }[] = [];
  const funcTypeIndices: number[] = [];
  // Dedup type entries via a signature-keyed index — the old structural findIndex was
  // O(funcs × distinct-types). The key encodes both type-byte lists (numbers, comma-joined,
  // `|`-separated) so it is 1:1 with the (paramTypes, resultTypes) pair the findIndex compared.
  const typeIdxByKey = new Map<string, number>();

  for (const f of funcs) {
    // Find or create a matching type entry (keyed by its param/result type lists).
    const key = `${f.paramTypes.join(",")}|${f.resultTypes.join(",")}`;
    let typeIdx = typeIdxByKey.get(key);
    if (typeIdx === undefined) {
      typeIdx = typeEntries.length;
      typeEntries.push({ paramTypes: f.paramTypes, resultTypes: f.resultTypes });
      typeIdxByKey.set(key, typeIdx);
    }
    funcTypeIndices.push(typeIdx);
  }

  const typeSection: number[] = [typeEntries.length];
  for (const t of typeEntries) {
    typeSection.push(0x60); // func type
    typeSection.push(t.paramTypes.length, ...t.paramTypes);
    typeSection.push(t.resultTypes.length, ...t.resultTypes);
  }

  bytes.push(0x01); // section id: type
  pushLEB128Length(bytes, typeSection);
  bytes.push(...typeSection);

  // Function section: N functions, each pointing to its type index.
  const funcSection: number[] = [funcs.length, ...funcTypeIndices];
  bytes.push(0x03); // section id: function
  pushLEB128Length(bytes, funcSection);
  bytes.push(...funcSection);

  // Memory section: 1 memory, min=2, max=2048
  // limits byte 0x01 = has max; min=2; max=2048 as LEB128 unsigned = 0x80 0x10
  const memSection = [0x01, 0x01, 0x02, 0x80, 0x10];
  bytes.push(0x05); // section id: memory
  pushLEB128Length(bytes, memSection);
  bytes.push(...memSection);

  // Export section: memory + each function
  const exportBytes: number[] = [];
  const exportCount = 1 + funcs.length;
  exportBytes.push(exportCount);

  // Export "memory"
  const memStr = encodeString("memory");
  exportBytes.push(...memStr, 0x02, 0x00); // extern kind: memory (0x02), index 0

  // Export each function
  funcs.forEach((f, i) => {
    const nameBytes = encodeString(f.name);
    exportBytes.push(...nameBytes, 0x00, i); // extern kind: func (0x00), index i
  });

  bytes.push(0x07); // section id: export
  pushLEB128Length(bytes, exportBytes);
  bytes.push(...exportBytes);

  // ---------------------------------------------------------------------------
  // Code section
  //
  // For each function:
  //   - usesLocalGet=true  → body: local.get 0 (0x20 0x00) + end (0x0b)
  //   - usesLocalGet=false → body: i32.const 0 (0x41 0x00) + end (0x0b)
  //
  // Body encoding: [body_size (LEB128), local_decl_count=0, ...instructions, end]
  // ---------------------------------------------------------------------------
  const codeEntries: number[] = [funcs.length];
  for (const f of funcs) {
    // Instructions: either local.get 0 or i32.const 0, then end.
    const instructions: number[] = f.usesLocalGet
      ? [0x20, 0x00]  // local.get 0
      : [0x41, 0x00]; // i32.const 0

    // Body = [local_decl_count=0, ...instructions, end]
    const bodyContent = [0x00, ...instructions, 0x0b];
    // Encode body size as LEB128, then the body itself.
    const bodyLeb: number[] = [];
    pushLEB128Value(bodyLeb, bodyContent.length);
    codeEntries.push(...bodyLeb, ...bodyContent);
  }

  bytes.push(0x0a); // section id: code
  pushLEB128Length(bytes, codeEntries);
  bytes.push(...codeEntries);

  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a UTF-8 string as WASM name bytes: [length, ...utf8bytes]. */
function encodeString(s: string): number[] {
  const enc = new TextEncoder().encode(s);
  return [enc.length, ...enc];
}

/**
 * Push the byte-length of `section` into `bytes` as a LEB128 unsigned integer.
 * Supports section payloads of any size.
 */
function pushLEB128Length(bytes: number[], section: number[]): void {
  pushLEB128Value(bytes, section.length);
}

/**
 * Push an unsigned integer value into `bytes` as a LEB128-encoded sequence.
 * Handles values of any magnitude (not limited to two bytes).
 */
function pushLEB128Value(bytes: number[], value: number): void {
  let v = value;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) {
      byte |= 0x80; // more bytes follow
    }
    bytes.push(byte);
  } while (v !== 0);
}
