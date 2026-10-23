# SuperGrok re-entrant export review reply

- Route: existing SuperGrok conversation, “RD-1413 Memory Security Review”
- Conversation ID: `f86ab403-89ee-455c-9782-93e4aee90e12`
- Response ID: `7ef98455-3f72-4626-bf43-36dc21695d74`
- Model metadata exposed in the UI: `Heavy`
- Response timestamp: not exposed by the browser accessibility view; captured 2026-10-12 (UTC capture 09:48:01)
- Prompt artifact in the separate Codex coordinating workspace: `outputs/supergrok-reentrant-export-review-20261012.md`
- Prompt SHA-256: `A9E38E29A7BA84EC3C8D38285D3B7DAB6F6368F132F6A15F9144E9FA3957B55C`
- Report is advisory. The reviewer stated the dirty files were not opened and the supplied test results were not rerun.

## Complete response text captured from the browser

Both questions are PARTIAL. The dirty files were not opened: raw paths at 59b23502 returned 404 and did not match the supplied hashes. The 105/105 results are supplied, not mine.

Q1. PARTIAL. The described WeakMap, keyed by the raw WebAssembly.Instance and checked in both wrapAdmittedExports and invokeAdmittedExport, covers the four admitted nesting routes if both entries use that same key. The matrix shows each nested admitted call refused before guest entry, with the outer still reading 42 and wiping once.

CONFIRMED as a supplied observation only. It does not prove every reachable route. The strongest bypass is the raw export: a host callback that calls the unwrapped WebAssembly export never enters either check. A second wrapper or proxy keyed to a different object would also miss the flag. The smallest extra test is two wrappers of one instance, outer through A and the callback through B, expecting FUNGI-WASM-REENTRANT-001 and the outer still reading 42. If the raw export remains reachable, call it from the callback. Entry there is a bypass.

Q2. PARTIAL. Nested refusal before creating cleanup is the right order for the described success path. A callback that catches FUNGI-WASM-REENTRANT-001 can continue the outer call. That is acceptable only if the flag stays set until the outer finally. The strongest failure is a path that sets active and returns without finally, leaving the instance stuck, or nested refusal still running cleanup and wiping the outer 42. The smallest tests are a caught refusal where the outer still reads 42 and wipes once, plus a guest trap and a wipe failure that both clear the flag so a later call is not stuck. Asynchronous continuation after finally is NOT VERIFIABLE. The narrow change is safe to retain as a bootstrap guard pending independent source review. It does not establish Fungi semantics, FFI or host isolation, physical erasure, or RD closure.

