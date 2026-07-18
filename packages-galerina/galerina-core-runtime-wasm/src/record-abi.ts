// ─────────────────────────────────────────────────────────────────────────────
// record-abi.ts — the WASM record-layout ABI: the ONE contract shared between the
// WAT emitter (which lays records out) and the WASM runtime TCB (which stages/reads
// them).
//
// It lives in @galerina/core-runtime-wasm — the border-safe TCB home (RD-0361 R4 /
// #143) — so the TCB knows its own record layout without importing the compiler's
// emitter, and the emitter imports the layout FROM here (compiler → border-safe home,
// the allowed direction; the kernel may reach this package but never the compiler).
//
// Dependency-free and side-effect-free by construction: two integers and their meaning.
// A single source of truth means a host-staged record (wasm-runtime allocRecord) and a
// module-built one (the emitter) share exactly one layout — no drift.
// ─────────────────────────────────────────────────────────────────────────────

/** Records bump-allocate above this byte offset; the low region stays reserved
 *  scratch/null (so a 0 handle never collides with a real record base). */
export const WAT_HEAP_BASE = 1024;

/** Every record field occupies one i32 slot (a number or an opaque i32 handle). */
export const WAT_REC_FIELD_SIZE = 4;
