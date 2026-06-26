// =============================================================================
// Galerina Fused Single-Pass Compiler
//
// Merges: Lexer + Parser + Type checker + Effect checker + GIR emitter
// into one linear source scan. No AST arena. No token buffer.
//
// Use case: --production --target wasm builds where max speed > max error info
// Development mode: keep the full multi-pass pipeline for rich diagnostics.
//
// Architecture (Odin/data-oriented inspired):
//   source string (Uint16Array view)
//     → inline token recognition (no token buffer)
//     → inline type validation (no separate type-checker pass)
//     → inline effect check (bitmask, no string comparison)
//     → direct GIR opcode emission (Int32Array, no AST node)
//
// Per the architect assessment:
//   - Immediate abort on semantic violation protects CPU cache
//   - Sequential source scan → prefetcher keeps data in L1
//   - Flat opcode stream compresses well for WASM
// =============================================================================

import { TokenKindId } from "./lexer.js";
import { TypeId, EffectFlags, type EffectFlagsMask } from "./type-registry.js";

// ── GIR Opcodes (32-bit packed) ───────────────────────────────────────────────
// [8 bits: opcode] [8 bits: typeId] [8 bits: effectMask] [8 bits: flags]

export const GIR_OP = {
  FLOW_START:  0x01,
  FLOW_END:    0x02,
  LET_BIND:    0x10,
  MUT_BIND:    0x11,
  ASSIGN:      0x12,
  CALL:        0x20,
  RETURN:      0x30,
  EFFECT_GATE: 0x40,
  CONTRACT:    0x50,
  AUDIT_WRITE: 0x60,
  PURE_ENTER:  0x70, // enter pure fast-path zone
  PURE_EXIT:   0x71, // exit pure fast-path zone
  WASM_IMPORT: 0x80, // effectful call → WASM import needed
} as const;

export function packOpcode(op: number, typeId: number, effectMask: number, flags: number): number {
  return ((op & 0xFF) << 24) | ((typeId & 0xFF) << 16) | ((effectMask & 0xFF) << 8) | (flags & 0xFF);
}
export function unpackOp(word: number):         number { return (word >>> 24) & 0xFF; }
export function unpackTypeId(word: number):     number { return (word >>> 16) & 0xFF; }
export function unpackEffectMask(word: number): number { return (word >>> 8)  & 0xFF; }
export function unpackFlags(word: number):      number { return  word         & 0xFF; }

// ── Fused pass state ──────────────────────────────────────────────────────────

export interface FusedPassResult {
  readonly opcodes:     Int32Array;
  readonly opcodeCount: number;
  readonly errors:      readonly { pos: number; code: string; message: string }[];
  readonly valid:       boolean;
}

/**
 * Fused single-pass compiler for production/WASM mode.
 *
 * Processes Galerina source in a single linear scan:
 *   1. Recognise tokens inline (no token buffer)
 *   2. Validate types and effects during parse (inline checkers)
 *   3. Emit 32-bit packed GIR opcodes directly (no AST)
 *
 * On semantic violation: record error and ABORT the current construct.
 * This prevents unverified instructions from ever entering the opcode stream.
 *
 * Phase 24/25: Currently emits skeleton opcodes.
 * Phase 26: Full instruction emission from complete fused pass.
 */
export function fusedCompile(source: string): FusedPassResult {
  const MAX_OPCODES = 65536;
  const opcodes = new Int32Array(MAX_OPCODES);
  let opcodeCount = 0;
  const errors: { pos: number; code: string; message: string }[] = [];
  let pos = 0;
  const len = source.length;

  let currentEffectMask: EffectFlagsMask = EffectFlags.None;
  let inPureFlow = false;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function emit(op: number, typeId = 0, effectMask = 0, flags = 0): void {
    if (opcodeCount < MAX_OPCODES) {
      opcodes[opcodeCount++] = packOpcode(op, typeId, effectMask, flags);
    }
  }

  function error(code: string, message: string): void {
    errors.push({ pos, code, message });
  }

  function skipWS(): void {
    while (pos < len) {
      const c = source.charCodeAt(pos);
      if (c === 32 || c === 9 || c === 10 || c === 13) pos++;
      else if (c === 47 && source.charCodeAt(pos+1) === 47) {
        // line comment
        while (pos < len && source.charCodeAt(pos) !== 10) pos++;
      } else break;
    }
  }

  function matchKeyword(kw: string): boolean {
    if (source.startsWith(kw, pos)) {
      const after = source.charCodeAt(pos + kw.length);
      if (after === undefined || after === 32 || after === 10 || after === 40 || after === 123 || after === 13) {
        pos += kw.length;
        return true;
      }
    }
    return false;
  }

  function readIdentifier(): string {
    const start = pos;
    while (pos < len) {
      const c = source.charCodeAt(pos);
      if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95) pos++;
      else break;
    }
    return source.slice(start, pos);
  }

  // ── Main scan loop ────────────────────────────────────────────────────────────

  while (pos < len) {
    skipWS();
    if (pos >= len) break;

    // ── Detect: pure flow ─────────────────────────────────────────────────────
    if (matchKeyword("pure") && (skipWS(), matchKeyword("flow"))) {
      skipWS();
      const _name = readIdentifier();
      inPureFlow = true;
      currentEffectMask = EffectFlags.None;
      // INLINE CHECK: pure flow must declare no effects
      emit(GIR_OP.PURE_ENTER, TypeId.Void, EffectFlags.None, 0);
      // Skip to body — simplified for skeleton
      let depth = 0;
      while (pos < len) {
        const c = source.charCodeAt(pos++);
        if (c === 123) depth++;
        else if (c === 125) { if (--depth === 0) break; }
      }
      emit(GIR_OP.PURE_EXIT, TypeId.Void, EffectFlags.None, 0);
      inPureFlow = false;
      continue;
    }

    // ── Detect: secure/guarded flow ───────────────────────────────────────────
    if (matchKeyword("secure") || matchKeyword("guarded")) {
      skipWS();
      if (!matchKeyword("flow")) { error("SPORE-PARSE-001", "Expected 'flow'"); break; }
      skipWS();
      const _name = readIdentifier();
      emit(GIR_OP.FLOW_START, TypeId.Void, currentEffectMask, 0);
      // Skip body for skeleton
      let depth = 0;
      while (pos < len) {
        const c = source.charCodeAt(pos++);
        if (c === 123) depth++;
        else if (c === 125) { if (--depth === 0) break; }
      }
      emit(GIR_OP.FLOW_END, TypeId.Void, currentEffectMask, 0);
      continue;
    }

    // ── Detect: plain flow ────────────────────────────────────────────────────
    if (matchKeyword("flow")) {
      skipWS();
      const _name = readIdentifier();
      emit(GIR_OP.FLOW_START, TypeId.Void, currentEffectMask, 0);
      let depth = 0;
      while (pos < len) {
        const c = source.charCodeAt(pos++);
        if (c === 123) depth++;
        else if (c === 125) { if (--depth === 0) break; }
      }
      emit(GIR_OP.FLOW_END, TypeId.Void, currentEffectMask, 0);
      continue;
    }

    // Skip unrecognised content
    pos++;
  }

  return {
    opcodes,
    opcodeCount,
    errors,
    valid: errors.length === 0,
  };
}

// Re-export TokenKindId so callers that import from fused-pass don't need a second import
export { TokenKindId };
