// webassembly-shim.d.ts — ambient WebAssembly namespace for cross-package d.ts checking.
//
// WHY THIS EXISTS
// ---------------
// This package compiles with `lib: ["ES2022"]` (no DOM) by design: it is a Node-only
// devtools package and must not gain ambient browser globals that could mask non-portable
// code. The `WebAssembly` namespace, however, is declared ONLY in TypeScript's
// `lib.dom.d.ts` / `lib.webworker.d.ts`, and `@types/node` does not provide it.
//
// `@galerina/core-compiler` is a `file:`-linked sibling, so its emitted `dist/*.d.ts`
// resolve OUTSIDE `node_modules` and are therefore type-checked as ordinary program
// files (unlike node_modules declarations, whose errors TS suppresses). Its
// `wasm-runtime.d.ts` references `WebAssembly.Imports`, `WebAssembly.Memory`, and
// `WebAssembly.Instance`, which otherwise fail to resolve here (error TS2503).
//
// Rather than pull in the entire DOM lib or disable declaration checking
// (`skipLibCheck`), we PROVIDE exactly the narrow `WebAssembly` type surface those
// declarations reference. This package never instantiates WebAssembly itself; these
// types exist purely so the consumed compiler declarations type-check. Shapes mirror
// TypeScript's own `lib.dom.d.ts`. (Mirrors the shim added to @galerina/devtools-security.)

declare namespace WebAssembly {
  /** Linear memory of a module instance (WebAssembly.Memory). */
  interface Memory {
    readonly buffer: ArrayBuffer;
    grow(delta: number): number;
  }

  /** An instantiated WebAssembly module (WebAssembly.Instance). */
  interface Instance {
    readonly exports: Record<string, unknown>;
  }

  /** Closed import object handed to instantiate: { moduleName: { importName: value } }. */
  type Imports = Record<string, Record<string, unknown>>;
}
