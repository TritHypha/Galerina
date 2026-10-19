# Queue #45 HOST_ADAPTER_AUDIT

NON_AUTHORIZING. Evidence only. No compiler, runtime, host, or packages-ts source edited. Q31 and Q32 files untouched. SuperGrok does not ACK.

Pinned Galerina HEAD for galerina.mjs and wasm-runtime.ts: `fc7db4db4ba1cb7aed691cfa205ec719746524d4` (queue 31 ACK). Frozen TS HTTP pin: `dc0f9c8c4f1365f0228cda213b2ecd001400463e`. c-boundary.fungi sha256 `7715db227015fcba0f485de8becb6684de40b42ac824e6cbc69137eaa57856bf` blob `a92a3271` unchanged. RD-0778 cited by path + sha256 `07f9803efbc1dbc1a1956b3b3ec5cb1404e20a6bf8476009c1685eef9158bfa7` only.

Verdicts in buffering columns are the closed set YES / NO / UNKNOWN. Unlisted verdicts refuse.

Synthetic identity flow: `packages/fungi/memory/tests/45-host-adapter-audit/echo.fungi` (`pure flow echo(x: Int) -> Int`). Probes: `node --test` 14/14 identical on three runs (see commands.txt). Mutants copy the probe target into temp or `__q45_mutant_galerina.mjs` next to galerina.mjs and delete in `finally`; tracked compiler source is never written.

Folder-guard at this HEAD still allows only `tests/31-body-reader/` and `evidence/31-body-reader/`. Adding the 45 prefixes will FOLDER_REFUSE until Grok extends `scripts/audit-fungi-memory-folder.mjs`. Proposed prefixes: `tests/45-host-adapter-audit/` and `evidence/45-host-adapter-audit/`. Guard not edited.

## Q1 (MB-07) pre-begin output paths

| path | buffering | first-leave point file:line | evidence |
|---|---|---|---|
| WASI `fd_write` as run by `galerina run` | UNKNOWN | none (path absent) | `createHostRuntime` imports are `{ host }` only (`wasm-runtime.ts:922` at `fc7db4db4`). Host keys have no `fd_write`. `echo.wat` has no `import`, no `wasi`, no `fd_write` (54-byte wasm). `galerina.mjs` has no `fd_write`. Mutant injecting `host.fd_write` into a temp copy of `wasm-runtime.js` makes `hasOwnProperty(fd_write)` true (RED vs live absence). This path does not exist, so it is not an in-process adapter. An unaudited later WASI adapter would be OUT_OF_PROCESS_UNBOUND. |
| `galerina run --invoke` return print | YES | `galerina.mjs:2981` `console.log(formatRunOutput(rawOutput, declaredReturn))` at `fc7db4db4` | Marshal admits, `fn(...args)` at `:2979` returns, then `:2981` prints. Measured `echo 1` stdout `1\n` exit 0. The formatted string exists in JS before `console.log`. |
| host `__print` / `__println` via outputSink | YES | `wasm-runtime.ts:569` `else console.log(s)` at `fc7db4db4`; callers `:820` / `:821` | Observer path uses `observe.onOutput`. `galerina run` calls `createHostRuntime()` with no observer, so print hits `console.log`. Live probe: replacing `console.log` after `createHostRuntime` captures `__print("hello-q45")`. echo.wat does not import `__print`; a unit that lowers to print would. |
| Node stdout / libuv after `console.log` | UNKNOWN | Node `WriteStream` / libuv write (outside Galerina source) | Analog pipe probe: child `console.log('PING-Q45')` delivered `PING-Q45\n` on the pipe before process exit (GOT in 105ms). Syscall-level buffering still UNKNOWN from Galerina source. Any adapter that uses this path as pre-begin output counts as OUT_OF_PROCESS_UNBOUND. |
| HTTP POST `/auth/verify` frozen TS | YES | `packages-ts/galerina-framework-api-server/src/index.ts:390` `res.end(Buffer.from(resp.body))` at `dc0f9c8c` | `writeResponse` `:383-392` (`res.writeHead` `:388`, `res.end` `:390`). Body built by `jsonBody` in `packages-ts/galerina-framework-app-kernel/src/auth-verify-route.ts:310` (`Uint8Array`) and used at `:551-554`. Inbound `bufferBody` `:287-312` is request-side, not an output path. 413 path `:795-799` `res.end(PAYLOAD_TOO_LARGE_BODY)`. Default cap `DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024` at `:86`. TCP/kernel after `res.end` is UNKNOWN. This adapter counts as OUT_OF_PROCESS_UNBOUND for pre-begin. |
| `audit.write` / `audit.log` grant | UNKNOWN | handler supplied at `createHostRuntime` grants, else absent | ABI `wasm-runtime.ts:272-276`. `galerina run` does not pass `effectHandlers`. A granted handler is caller-defined; its first-leave is UNKNOWN. Unaudited grant handler counts as OUT_OF_PROCESS_UNBOUND. |

## Q2 (MB-13) invoke-ABI integer wrap

Wrap site at `fc7db4db4`:

1. `galerina.mjs:2882-2891` — CLI tokens: `true`/`false` to 1/0; else `Number(a)`; `Number.isFinite(n)` false exits 2 `not a valid Int or Bool`; else the JS Number is kept.
2. `galerina.mjs:2979` — `const rawOutput = fn(...args)` — WebAssembly JS API ToInt32 on i32 params. No `| 0` in the CLI.

Measured by `galerina run tests/45-host-adapter-audit/echo.fungi --invoke echo <input>` (identity flow; stdout is the i32 the function received).

| input | WASM received | admitted or refused | evidence |
|---|---|---|---|
| `0` | 0 | admitted | stdout `0\n` exit 0 |
| `1` | 1 | admitted | stdout `1\n` exit 0 |
| `-1` | -1 | admitted | stdout `-1\n` exit 0 |
| `2147483647` | 2147483647 | admitted | stdout `2147483647\n` exit 0 |
| `2147483648` | -2147483648 | admitted | stdout `-2147483648\n` exit 0 |
| `-2147483648` | -2147483648 | admitted | stdout `-2147483648\n` exit 0 |
| `-2147483649` | 2147483647 | admitted | stdout `2147483647\n` exit 0 |
| `4294967295` | -1 | admitted | stdout `-1\n` exit 0 |
| `4294967296` | 0 | admitted | stdout `0\n` exit 0 |
| `4294967300` | 4 | admitted | stdout `4\n` exit 0 |
| `9007199254740991` (2^53-1) | -1 | admitted | stdout `-1\n` exit 0 |
| `9007199254740992` (2^53) | 0 | admitted | stdout `0\n` exit 0 |
| `9223372036854775807` (2^63-1 text) | 0 | admitted | `Number(...)` is `9223372036854776000`; ToInt32 0; stdout `0\n` exit 0 |
| `abc` | (never called) | refused | exit 2; stderr `invoke argument #1 = "abc" is not a valid Int or Bool.` |
| `1.5` | 1 | admitted | stdout `1\n` exit 0 |
| empty string | 0 | admitted | `Number("")===0`; stdout `0\n` exit 0 |

Red mutant: temp copy of `galerina.mjs` inserts `if (n > 2147483647) { process.exit(2); }` after `const n = Number(a);`. Live `4294967300` stays admitted 4; mutant exits 2.

Fix location (text only; not applied): `galerina.mjs:2882-2891` admission plus `galerina.mjs:2979` ToInt32. `createHostRuntime` lives under frozen `packages-ts`. HOST_ADAPTER_PRESENCE is CARRIED_UNKNOWN. Touching the invoke host needs Phillip's yes.

## Q3 (MB-17) live versus captured intrinsics

Host glue for `galerina run`: `galerina.mjs` marshal + `WebAssembly.instantiate(assembled.wasm, host.imports)` at `:2959` with `m.createHostRuntime()` (`packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts:457`). Import table frozen at `:922`.

| intrinsic | captured or live | file:line at `fc7db4db4` | probe |
|---|---|---|---|
| `Number` / `Number.isFinite` | live at marshal, captured into `args` before instantiate | `galerina.mjs:2885-2886` | Replacing `Number` after instantiate cannot change already-marshaled args. Empty string and `1.5` admitted at this site. |
| WebAssembly JS API ToInt32 | live at `fn(...args)` | `galerina.mjs:2979` | Wrap table. Not a replaceable JS global. |
| `console.log` (return print) | live at print | `galerina.mjs:2981` | Return of echo is printed here. |
| `console.log` (outputSink) | live at `__print` / `__println` | `wasm-runtime.ts:569` | After instantiate, replace `console.log`; `__print` of interned `"hello-q45"` hits the replacement. RED live-read. |
| `Math.floor` | live at `__range` | `wasm-runtime.ts:850` | After instantiate+`bindMemory`, `__range(0,4)` returns `[0,1,2,3]`. `Math.floor = () => 0` then `__range(0,4)` throws `Array.range: cardinality exceeds guest memory`. Temp copy replacing live `Math.floor(...)` with identity makes the patch a no-op (RED vs live). Also used at `encodeWasmU32` `:287` during grant compile. |
| `String` | live at `__int_to_str` | `wasm-runtime.ts:636` `String(n \| 0)` | After instantiate, `String = () => "MUTATED"` makes `__int_to_str(42)` intern `"MUTATED"`. RED live-read. |
| `TextEncoder` | live at grant-module compile; not on echo call | `wasm-runtime.ts:295` `encodeWasmName` | Hits 0 during `createHostRuntime()` + `__int_to_str`. Hits >0 when creating with `effectHandlers["audit.write"]`. After that create, calling `audit.write` does not re-read `TextEncoder` (cached `effectGrantSignatureModules`). |
| `Date.now` | not read on this path | (absent from wasm-runtime.ts run helpers) | Replacement during `createHostRuntime` + `__int_to_str` + `__range`: 0 hits. |
| `performance.now` | not read | (absent) | Source scan of wasm-runtime.ts and galerina run path. |
| `JSON.*` | not read on galerina run --invoke | (absent from that path) | Blacklist JSON.stringify elsewhere in galerina.mjs is not this path. |
| `Object.freeze` | at create, not at call | `wasm-runtime.ts:922` | Assigning `host.imports.host.__print` throws `TypeError`. Import table captured. Closures still read live globals. |
| `Object.defineProperty` | not read | (absent) | Source scan. |
| `Symbol.species` | not read | (absent) | Source scan. |
| `Array.prototype.push` | live inside `__array_append` | `wasm-runtime.ts:618` `arr.push(item)` | Host uses the live array method. echo does not call it. |
| `Uint8Array` / `Array.from` | live at grant name encode | `wasm-runtime.ts:295` | Same window as `TextEncoder`. |

### .fungi naming of a JS prototype

| form | check | build | run --invoke | exact diagnostic |
|---|---|---|---|---|
| `pure flow bad(x: Array.prototype) -> Int` | refused exit 1 | refused exit 1 | (not reached) | `FUNGI-PARSE-001: Expected parameter name, got ".".` also `FUNGI-TYPE-009: Generic type 'Array' expects 1 type argument but received 0.` |
| `let x: Int = Array.prototype` | admitted exit 0 | admitted exit 0 | trap exit 1 | WAT `(unreachable) (; unresolved member: prototype — fail-closed (emitter cannot lower; #128-sibling) ;)` stderr `unreachable` |
| `return Math.floor(x)` | admitted exit 0 | refused exit 1 | (not reached) | `FUNGI-WAT-METHOD-001: method 'floor' is not lowered to WASM. WAT emission refuses rather than emit an (unreachable) stub or an undefined callee (fail-closed).` |

A .fungi file cannot bind the JS `Array.prototype` object. The type-position spelling is refused by check. The member spelling emits fail-closed `unreachable` and traps at invoke.

## UNKNOWN list

- Node libuv / OS stdout buffering after `console.log` (UNKNOWN; adapter OUT_OF_PROCESS_UNBOUND).
- TCP/kernel after HTTP `res.end` (UNKNOWN; HTTP adapter OUT_OF_PROCESS_UNBOUND).
- Body of an `audit.write` grant handler (UNKNOWN; unaudited handler OUT_OF_PROCESS_UNBOUND).
- HOST_ADAPTER_PRESENCE for the invoke wrap fix (CARRIED_UNKNOWN; packages-ts frozen; Phillip's yes required).
- Folder-guard allow-list for 45 prefixes (not edited; will FOLDER_REFUSE until Grok extends).
- LINEAR_SECRET / cleanup-evidence binding remain as previously carried; this brief does not discharge them.

## Mutants

| claim | mutant target (temp copy) | live | mutant |
|---|---|---|---|
| wrap admits `4294967300` as 4 | `__q45_mutant_galerina.mjs` refuse `n > 2147483647` | exit 0 value 4 | exit 2 |
| `Math.floor` live at `__range` | temp dist `wasm-runtime.js` identity instead of `Math.floor` | patch throws guest-memory | patch no-op |
| WASI `fd_write` absent | temp dist inject `host.fd_write` | `hasOwnProperty` false | true |
