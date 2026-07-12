# Galerina Target JS

> **Status: PLAN-TIME VALIDATORS SHIPPED (2026-07-10) — compiler-pass wiring still future.**
> `src/index.ts` now carries the planning contracts **plus fail-closed plan-time validators**:
> **server-only import blocking** (`Galerina_JS_SERVER_ONLY_IMPORT_IN_BROWSER`, deny-by-default
> module list incl. every `node:` specifier) and **secret/environment access denial for browser
> JS** (`Galerina_JS_BROWSER_SECRET_ACCESS_DENIED` / `_ENVIRONMENT_ACCESS_DENIED`) — tested in
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
