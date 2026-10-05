# Galerina Target JS

> **Status: PLAN-TIME VALIDATORS SHIPPED (2026-07-10) — compiler-pass wiring still future.**
> `src/index.ts` now carries the planning contracts **plus fail-closed plan-time validators**:
> **server-only import blocking** (`FUNGI-JS-007`, deny-by-default
> module list incl. every `node:` specifier) and **secret/environment access denial for browser
> JS** (`FUNGI-JS-008` / `FUNGI-JS-009`) — tested in
> `tests/js-target-contracts.test.mjs`. Honest scope: these run when a caller validates a
> `JsOutputPlan`; the **compiler pass that derives plans from real emitted JS does not exist
> yet**, so do not treat the package as an end-to-end JS-output security control until that
> pass ships. Bundle reports derive their check outcomes from validation — a leaking plan
> cannot produce a passing report.

`galerina-target-js` defines JavaScript output target planning contracts.

Use this package for (planning contracts — see status note above):

```text
browser JavaScript output planning
Node.js JavaScript output planning
ES module output metadata
source map output rules
server-only import blocking for JS targets
secret and environment access denial for browser JS
JavaScript bundle report contracts
framework adapter output metadata
```

It must not become a JavaScript runtime, bundler, browser engine, Node API clone,
Express clone or frontend framework. It describes where Galerina output goes and
which safety checks must be reported.

`galerina-target-js` should work with `galerina-target-wasm` for hybrid browser
output: JavaScript for browser integration and WebAssembly for heavy
browser-safe compute.

For server-side JavaScript, Node.js support should be treated as an optional
target. It may emit Node-compatible module metadata, source maps and server
bundle reports, but Galerina applications must not be required to run on Node.js.

## Build modes, layout and source maps (W01 G3)

Plan-time contracts only; nothing here writes, moves or deletes build output.

- `JsOutputPlan.buildMode` (optional): `debug` or `release`. `jsBuildModePolicy(mode)`
  returns the frozen policy: debug uses an external map, no minification and allows a
  test report; release ships no map by default and never an inline one.
  Release rules: `FUNGI-JS-019` production flag must match the mode,
  `FUNGI-JS-020` inline map refused, `FUNGI-JS-021` an external map must be written
  outside the shipped folder (`sourceMap.outsideShippedOutput: true`),
  `FUNGI-JS-022` no `sourcesContent`. `FUNGI-JS-018` unknown mode.
- `FUNGI-JS-011` (inline map in a production browser bundle) is now an **error**
  (was a warning; owner may revisit).
- `jsBuildLayout(mode)` records `build/<mode>/` (`app.js`, `app.source-map.json` in
  debug, manifests and reports). The existing `build/debug/` compiler artifacts are
  recorded, not modified.
- `validateJsSourceMap(value)` checks `app.source-map.json` v1:
  `{ version: 1, file, sources, mappings: [{ generated, source, original }] }`.
  Sources must be relative `.fungi` paths (no absolute, `..`, scheme, backslash or
  duplicate); positions are safe integers (line >= 1, column >= 0); at most 100,000
  mappings, sorted by generated position with no duplicates (`FUNGI-JS-023`..`027`).
- `mapBinaryError(map, { line, column })` binary-searches the nearest preceding
  mapping on the same generated line and returns `unmapped` rather than guessing
  across lines; invalid maps fail closed.

