// =============================================================================
// Galerina Phase 23D — StringView, BytesView, TensorView
//
// Zero-copy views into an existing buffer.
// Maps to WASM linear memory layout: (ptr: i32, len: i32)
// No allocation — the underlying buffer owns the memory.
//
// Phase 23D: type definitions + runtime helper stubs.
// Full implementation: uses WASM linear memory via SharedArrayBuffer.
// =============================================================================

// ---------------------------------------------------------------------------
// View types
//
// Views are NOT owners — they are windows into an existing ArrayBuffer.
// The underlying buffer must outlive all views into it.
//
// WASM linear memory mapping:
//   StringView  → (ptr: i32, byteLen: i32, encoding: i32)
//   BytesView   → (ptr: i32, byteLen: i32)
//   TensorView  → (ptr: i32, elementByteSize: i32, elementCount: i32, shape: ptr)
// ---------------------------------------------------------------------------

/**
 * A zero-copy view into a string region of an ArrayBuffer.
 * The view describes a byte range; decoding is done on access.
 */
export interface StringView {
  readonly startOffset: number;
  readonly byteLength: number;
  readonly encoding: "utf8" | "utf16";
}

/**
 * A zero-copy view into a raw byte region of an ArrayBuffer.
 * Used for binary data, protocol buffers, and untyped payloads.
 */
export interface BytesView {
  readonly startOffset: number;
  readonly byteLength: number;
}

/**
 * A zero-copy view into a typed tensor region of an ArrayBuffer.
 * The tensor occupies [startOffset, startOffset + elementByteSize * elementCount).
 * Shape describes the logical dimensions of the tensor.
 *
 * @template T - Element value type (default: number)
 */
export interface TensorView<T = number> {
  readonly startOffset: number;
  readonly elementByteSize: number;
  readonly elementCount: number;
  readonly shape: readonly number[];
  readonly elementType: "f32" | "f64" | "i8" | "i16" | "i32" | "i64";
}

// ---------------------------------------------------------------------------
// WASM linear memory layout descriptor
// ---------------------------------------------------------------------------

/**
 * Describes the layout of WASM linear memory for a compiled module.
 * All values are byte offsets from the start of linear memory (page 0).
 *
 * Layout (low → high):
 *   [0, stackBase)         — reserved / zero page
 *   [stackBase, heapBase)  — call stack (grows down in WASM convention)
 *   [heapBase, tensorBase) — general heap (arena allocator)
 *   [tensorBase, ...)      — tensor region (TypedArray-backed)
 */
export interface WASMLinearMemoryLayout {
  readonly totalPages: number;
  readonly stackBase: number;
  readonly heapBase: number;
  readonly tensorRegionBase: number;
}

// ---------------------------------------------------------------------------
// Runtime helpers
//
// Phase 23D: stubs — validate arguments and return view descriptors.
// Full implementation: uses WASM linear memory via DataView + SharedArrayBuffer.
// ---------------------------------------------------------------------------

/**
 * Creates a StringView over a region of an ArrayBuffer.
 *
 * Stub: Phase 23D — validates bounds and returns a descriptor.
 * Full implementation: maps to WASM linear memory pointer + length encoding.
 *
 * @throws RangeError if offset + byteLength exceeds the buffer size.
 */
export function createStringView(
  buffer: ArrayBuffer,
  offset: number,
  byteLength: number,
  encoding: "utf8" | "utf16" = "utf8",
): StringView {
  if (offset < 0 || byteLength < 0 || offset + byteLength > buffer.byteLength) {
    throw new RangeError(
      `StringView out of bounds: buffer.byteLength=${buffer.byteLength}, offset=${offset}, byteLength=${byteLength}`,
    );
  }
  return { startOffset: offset, byteLength, encoding };
}

/**
 * Creates a BytesView over a region of an ArrayBuffer.
 *
 * Stub: Phase 23D — validates bounds and returns a descriptor.
 * Full implementation: maps to WASM linear memory pointer + length encoding.
 *
 * @throws RangeError if offset + byteLength exceeds the buffer size.
 */
export function createBytesView(
  buffer: ArrayBuffer,
  offset: number,
  byteLength: number,
): BytesView {
  if (offset < 0 || byteLength < 0 || offset + byteLength > buffer.byteLength) {
    throw new RangeError(
      `BytesView out of bounds: buffer.byteLength=${buffer.byteLength}, offset=${offset}, byteLength=${byteLength}`,
    );
  }
  return { startOffset: offset, byteLength };
}

/**
 * Returns a sub-view of a StringView over a character range [startChar, endChar).
 *
 * Stub: Phase 23D — computes byte offsets assuming single-byte characters (UTF-8 ASCII).
 * Full implementation: uses Unicode scalar value counting for multi-byte characters.
 *
 * @param view      - Source StringView to slice
 * @param startChar - Start character index (inclusive)
 * @param endChar   - End character index (exclusive); defaults to end of view
 */
export function sliceStringView(
  view: StringView,
  startChar: number,
  endChar?: number,
): StringView {
  const charCount = view.byteLength; // Phase 23D stub: assumes 1 byte per char (ASCII/UTF-8)
  const resolvedEnd = endChar ?? charCount;

  const clampedStart = Math.max(0, Math.min(startChar, charCount));
  const clampedEnd   = Math.max(clampedStart, Math.min(resolvedEnd, charCount));

  const byteStart  = view.startOffset + clampedStart;
  const byteLength = clampedEnd - clampedStart;

  return {
    startOffset: byteStart,
    byteLength,
    encoding: view.encoding,
  };
}
