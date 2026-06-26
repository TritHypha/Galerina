# Galerina Target JS

> **Status: PLANNED — NOT ENFORCED.** This package has **no `src/`** yet — it defines target
> *planning contracts* (the intended shape of JS output), not running code. In particular the
> security-relevant items below (**server-only import blocking**, **secret/environment access
> denial for browser JS**) are **described, not enforced**: there is no compiler pass or runtime
> that applies them today. Do **not** rely on this package as a JS-output security control. The
> enforcing implementation is future work; until it ships + is tested, treat these as design intent.

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
