# Independent audit — Native benchmark compilation does not interpolate repository paths into a shell command

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: native benchmark compilation does not interpolate repository
paths into a shell command.

- Scan revision `0f24ca30` used
  `execSync(\`rustc -O -o "${join(dir, ...)}" "${rs}"\`)` (shell string).
- Current: `nativeCompileSpawnSpec(file, args)` returns frozen argv and
  `options.shell === false`. `tryCmd` uses
  `spawnSync(spec.file, spec.args, { ...spec.options, ...opts })`.
- Metacharacters in a directory name stay one argv element.
- Top-level compile loop is behind `IS_MAIN` so importing the helper
  does not compile the suite.

Tests: `packages-ts/galerina-devtools-benchmarks/test/native-compile-spawn.test.mjs`
import `../src/build-native.mjs` (source, not dist).

Scan `csf_231c9774990ce1458711c40d` is **PARTIAL_THIS_TREE**. Inventory
**86 OPEN / 34 PARTIAL / 4 PATCHED** was recorded as assigned scan
context and matches `docs/reports/scan-0f6063dd-inventory-2026-09-22.json`
on this tree; it was **not** independently re-counted here. This is
**not** 124-scan closure. Not Astra. Not production admission.

Node v24.18.0. Windows win32. This reviewer did not rebuild.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-devtools-benchmarks/src/build-native.mjs` and
untracked `??`
`packages-ts/galerina-devtools-benchmarks/test/native-compile-spawn.test.mjs`.
HEAD already spawned compilers as argv + `shell: false` (`tryCmd` →
`spawnSync(file, args, { … shell: false … })`) but ran the compile loop
at module top-level (no `IS_MAIN`). Scan `0f24ca30` interpolated paths
into `execSync` command strings. This dirty slice extracts
`nativeCompileSpawnSpec`, freezes argv/options, refuses empty file/args,
guards `main()` with `IS_MAIN`, and routes `tryCmd` through the spec.

## Source hashes on this tree

Author hashes confirmed by `crypto.createHash('sha256')` on the dirty
files (match).

| path | sha256 |
|---|---|
| `packages-ts/galerina-devtools-benchmarks/src/build-native.mjs` | `72736c8671b66ae0323ac300c56c17b6876e34578e03f3322a31f69eaba39627` |
| `packages-ts/galerina-devtools-benchmarks/test/native-compile-spawn.test.mjs` | `e77635673e675408e1bde1b012a974bd428e11a8c20efb5d3624c3519745525f` |

HEAD pin: `91b4dec08fe4376febc9494a8023bd02912b8695`
(`2026-09-22 15:27:14 +0100` `fix(security): enforce host grants and checkpoint bounded owner decisions`).
HEAD blob of `build-native.mjs` is `34506e11bf2f241dc1d2cd8002085422b4019b99`
(no `nativeCompileSpawnSpec`, no `IS_MAIN`; compile loop at import).
Working-tree git hash-object of the dirty helper is
`df5d146174a4a2172602760faae35c59d539762b`. Test is untracked.

Inventory file sha256
`85bc123d435a89092f585d32d7fbe7c8a61954ba46a7c2bfc82a7510b201cb33`
(`n=124`, `OPEN_ON_SCAN_SNAPSHOT=86`, `PARTIAL_THIS_TREE=34`,
`PATCHED_AUDIT_PENDING=4`). Finding
`csf_231c9774990ce1458711c40d` title
`Native benchmark compilation interprets repository paths as shell syntax`,
medium, path
`packages-ts/galerina-devtools-benchmarks/src/build-native.mjs`,
disposition `PARTIAL_THIS_TREE`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `nativeCompileSpawnSpec` returns frozen argv | source `build-native.mjs` 6–24; named test; independent probe `argsFrozen=true`, `argsVector=["-O","-o",out,src]` |
| `options.shell === false` | source 18; named test; independent probe `shellFalse=true` |
| `tryCmd` is 3-arg `spawnSync` (not a command string) | source 51–53: `spawnSync(spec.file, spec.args, { ...spec.options, ...opts })` |
| No `execSync` interpolation of repository paths | current file has no `execSync`; scan `0f24ca30` did |
| Metacharacters in a directory name stay one argv element | named hostile test; independent probe `hostileArgs2Exact=true` for `bench"; calc.exe &` as `args[2]` |
| Empty file / empty args throw `REFUSED` | source 7–12; named test; independent probes `emptyFile` / `emptyArgs` |
| Compile loop behind `IS_MAIN` | source 101–103; named test import and independent import produced no compile-loop logs |
| Scan-shaped `execSync` string would concatenate `calc.exe` | independent reconstruction (below) |
| rustc/g++ argv interpretation / filesystem paths | **not this claim**; residual |
| 124-finding scan closure | **not this claim** |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-devtools-benchmarks/test/native-compile-spawn.test.mjs`
   → **3/3 pass**, 0 fail, `duration_ms 123.7142`.
   - `native compile spawn uses an argv vector with shell disabled` — **green**
   - `hostile: metacharacters in a repository path stay one argv element` — **green**
   - `empty compiler or argv is refused` — **green**
   Import of `../src/build-native.mjs` from the test printed no
   `=== … ===` / `[ok]` / `[skip]` compile-loop lines.

Independent extra probes (eval only; temp
`%TEMP%\native-compile-spawn-probe.mjs`, not production; dynamic
`import()` of source `build-native.mjs`):

- `shellFalse=true`; `argsVector=["-O","-o","C:\\bench\\ok\\bench-native-rust.exe","C:\\bench\\ok\\bench.rs"]`; `file="rustc"`
- `argsFrozen=true`; `optionsFrozen=true`; `specFrozen=false`; `encoding="utf8"`; `timeout=120000`; `windowsHide=true`; `stdio="pipe"`
- hostile dir `'bench"; calc.exe &'` → `args[2]` exact
  `bench"; calc.exe &\bench-native-rust.exe`; `args.length=4`;
  `options.shell=false`; `file="rustc"`; `args.includes("calc.exe")=false`;
  `file` does not contain `calc.exe`
- empty `file` → throw `REFUSED: compiler executable path is missing`
- empty `args` → throw `REFUSED: compiler argv is not a non-empty string vector`
- `null` / `undefined` file → same missing-path `REFUSED`
- non-array args / non-string arg element → argv `REFUSED`
- whitespace-only `file` (`" "`) → **not refused** (`threw=false`)
- importing the helper with `process.argv[1]` = the probe script:
  `importDidNotCompileSuite=true`; `capturedCompileLogs=[]`
- Scan-shaped reconstruction (below) concatenates the hostile path into
  one command line
- Current argv vector does **not** concatenate:
  `argvDoesNotConcatenate=true`
- Probe printed `PROBE_OK`. Node v24.18.0. No live `execSync` /
  `shell:true` spawn. `calc.exe` was not executed.

## Challenge 1 — does current compile still interpolate repository paths into an `execSync` / `shell:true` command string?

**No. CONFIRMED refused** on the native compile call site.
Locator: `build-native.mjs` 6–24 and 51–53.

```6:24:packages-ts/galerina-devtools-benchmarks/src/build-native.mjs
export function nativeCompileSpawnSpec(file, args) {
  if (typeof file !== "string" || file.length === 0) {
    throw new Error("REFUSED: compiler executable path is missing");
  }
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string") || args.length < 1) {
    throw new Error("REFUSED: compiler argv is not a non-empty string vector");
  }
  return {
    file,
    args: Object.freeze([...args]),
    options: Object.freeze({
      encoding: "utf8",
      shell: false,
      windowsHide: true,
      timeout: 120_000,
      stdio: "pipe",
    }),
  };
}
```

```51:53:packages-ts/galerina-devtools-benchmarks/src/build-native.mjs
function tryCmd(label, file, args, opts = {}) {
  const spec = nativeCompileSpawnSpec(file, args);
  const result = spawnSync(spec.file, spec.args, { ...spec.options, ...opts });
```

Three-argument `spawnSync` + `options.shell === false` does not pass a
concatenated command line to `cmd.exe`. Detector can go red: named test
`assert.equal(spec.options.shell, false)`. `tryCmd` spreads
`spec.options` then `opts` (MSVC site passes `{ cwd: dir }` only). That
is not string interpolation.

HEAD `91b4dec0` already used argv + `shell: false`. Scan `0f24ca30`
used `execSync(cmd)` with interpolated path strings. The scan-shaped
interpolation is absent on both HEAD and this dirty tree.

## Challenge 2 — do metacharacters in a directory name remain one argv element?

**Yes. CONFIRMED.** Named hostile test uses `bench"; calc.exe &`.
Independent probe: `args[2]` is the hostile `join` result exactly;
`calc.exe` is not its own argv element; `file` is `"rustc"`;
`shell === false`.

## Challenge 3 — do empty compiler / empty argv throw `REFUSED`?

**Yes. CONFIRMED.** Named test and independent probes throw
`REFUSED: compiler executable path is missing` /
`REFUSED: compiler argv is not a non-empty string vector`.

## Challenge 4 — is the compile loop behind `IS_MAIN` so import does not compile the suite?

**Yes. CONFIRMED.** Locator: `build-native.mjs` 101–103.

```101:103:packages-ts/galerina-devtools-benchmarks/src/build-native.mjs
const IS_MAIN = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (IS_MAIN) main();
```

Named test import and independent probe import both left
`capturedCompileLogs=[]`. HEAD ran the `readdirSync` / `tryCmd` loop at
module top-level (import would compile).

## Challenge 5 — would the scan-shaped `execSync` string concatenate `calc.exe` into the command line?

**Yes. Reconstruction only** (no live `execSync` / `shell:true` spawn,
no `calc.exe` execution). Scan `0f24ca30` shape:

`execSync(\`rustc -O -o "${join(dir, "bench-native-rust.exe")}" "${rs}"\`)`

With `dir = bench"; calc.exe &` on win32 `join` that template yields
one command line:

```
rustc -O -o "bench"; calc.exe &\bench-native-rust.exe" "bench"; calc.exe &\bench.rs"
```

Independent probe: `scanShapedCommand` equals that string;
`scanShapedContainsCalc=true`; `scanShapedBreaksQuote=true`;
`scanShapedWouldConcatenateHostile=true`. The `";` after `bench`
closes the quoted `-o` path and leaves ` calc.exe &` on the same
shell command string. Current argv spawn does not build this string.

## Residuals (not findings against the named spawn-spec claim)

- `rustc` / `g++` / `clang++` / `cl` still interpret their own argv
  (not a shell). Directory names from `readdirSync` are still used as
  filesystem paths inside `-o` / source argv elements
  (`join(dir, "bench-native-rust.exe")`, `join(dir, "bench.rs")`).
- `tryCmd` spreads `{ ...spec.options, ...opts }`, so a future `opts.shell`
  could override. Current call sites pass no `shell` override (MSVC
  `{ cwd: dir }` only).
- Returned spec object itself is not frozen; `args` and `options` are.
  Call site uses the spec immediately.
- Whitespace-only compiler `file` is not refused (`length > 0` is
  enough). Not in the named suite.
- Live rustc/g++ compile of the benchmark suite was **not executed**
  in this review (`IS_MAIN` prevented it on import). Native binary
  correctness is outside the named claim.
- Scan ID `csf_231c9774990ce1458711c40d` stays `PARTIAL_THIS_TREE`
  (native benchmark compile command interpolation; argv/`shell:false`
  + `IS_MAIN` closed on this dirty tree; compiler argv / filesystem
  path residuals remain).
- Inventory after this slice: 86 OPEN / 34 PARTIAL /
  4 PATCHED_AUDIT_PENDING (124 IDs). Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim that native benchmark
compilation does not interpolate repository paths into a shell command.
Detector is not invalid. Evidence is sufficient for argv +
`shell: false` + hostile path-as-one-arg + empty file/args `REFUSED` +
`IS_MAIN` import guard; insufficient for compiler-argv hardening,
filesystem-path hostility, live native builds, scan closure, and
production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
