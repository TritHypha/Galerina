// ─────────────────────────────────────────────────────────────────────────────
// record-abi.ts — the WASM record-layout ABI: the ONE contract shared between the
// WAT emitter (which lays records out) and the WASM runtime TCB (which stages/reads
// them). Extracted from wat-emitter.ts so the TCB (wasm-runtime.ts) no longer imports
// the EMITTER for its layout constants.
//
// This is the first brick of the #143 TCB extraction (RD-0361 R4): authoritative twin
// execution needs the WASM executor to live in a border-safe home the kernel can reach
// (the kernel may depend on core-runtime but NEVER the compiler — the Hardened Border).
// The executor cannot drag the emitter across that border just to know a record's
// layout, so the layout becomes its own dependency-free, relocatable contract.
//
// Dependency-free and side-effect-free by construction: two integers and their meaning.
// A single source of truth means a host-staged record (wasm-runtime allocRecord) and a
// module-built one (the emitter) share exactly one layout — no drift. wat-emitter
// re-exports these so existing `from "./wat-emitter.js"` importers are unchanged.
// ─────────────────────────────────────────────────────────────────────────────

/** Records bump-allocate above this byte offset; the low region stays reserved
 *  scratch/null (so a 0 handle never collides with a real record base). */
export const WAT_HEAP_BASE = 1024;

/** Every record field occupies one i32 slot (a number or an opaque i32 handle). */
export const WAT_REC_FIELD_SIZE = 4;
