# Independent audit — Deno WebGPU benchmark spawn no longer interpolates the runner path into a shell command

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources were not edited by
this reviewer. Nothing was committed. This receipt is not the author’s
packet and is not GPT-6 Astra.

Named claim: Deno WebGPU benchmark spawn no longer interpolates the
runner path into a shell command. Scan revision `0f24ca30` used
`_sp(\`"${denoBin}" run --unstable-webgpu "${denoWebGpuRunner}"\`, { shell: true })`.
Current: `denoWebGpuSpawnSpec(denoBin, runnerPath)` returns frozen argv
`["run", "--unstable-webgpu", runnerPath]` and `options.shell === false`.
Call site: `_sp(spec.file, spec.args, spec.options)`. Metacharacters in
`runnerPath` remain one argv element.

This is **not** 124-scan closure (`csf_d87a999abe6e43db3197cc1f` remains
`PARTIAL_THIS_TREE`). Inventory after this slice (assignment label, not
an independent recount): 93 OPEN / 27 PARTIAL / 4 PATCHED_AUDIT_PENDING
(124 IDs). Not Astra. Not production admission.

Node v24.18.0. Windows. Tests import `../src/runner.mjs` (source, not
dist). `runner.mjs` has an `IS_MAIN` guard; importing it from the named
test did not run `main()`.

Dirty slice for this claim: `M`
`packages-ts/galerina-devtools-benchmarks/src/runner.mjs` and untracked
`??` `packages-ts/galerina-devtools-benchmarks/test/deno-spawn-spec.test.mjs`.
Passing tests here are **not** production admission.

HEAD already spawned Deno WebGPU as argv + `shell: false` (HEAD locators
299–300: `_sp(denoBin, ["run", "--unstable-webgpu", denoWebGpuRunner], { … shell: false … })`).
Misleading HEAD comments still talked about quoting a single command
string for `shell:true`. This dirty slice extracts `denoWebGpuSpawnSpec`,
freezes argv/options, refuses empty paths, and changes the call site to
`_sp(spec.file, spec.args, spec.options)`. The scan-shaped
interpolation is absent on both HEAD and this dirty tree.

## Source hashes on this tree

Author hashes confirmed by `crypto.createHash('sha256')` on the dirty
files (match).

| path | sha256 |
|---|---|
| `packages-ts/galerina-devtools-benchmarks/src/runner.mjs` | `65a8b5b3632c29dc79c78f5ea099525c0e00d9aeae86f447a8f1be1613a758ee` |
| `packages-ts/galerina-devtools-benchmarks/test/deno-spawn-spec.test.mjs` | `f66b9b9edb721f1904e377be4cb07e95989a960fd34f332d8eb0fc457004de4e` |

HEAD pin: `91b4dec08fe4376febc9494a8023bd02912b8695`
(`2026-09-22 15:27:14 +0100` `fix(security): enforce host grants and checkpoint bounded owner decisions`).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `denoWebGpuSpawnSpec` returns frozen argv `["run", "--unstable-webgpu", runnerPath]` | source `runner.mjs` 129–141; named test; independent probe `argsVector` + `argsFrozen=true` |
| `options.shell === false` | source 139; named test; independent probe `shellFalse=true` |
| Call site is `_sp(spec.file, spec.args, spec.options)` (3-arg spawn, not a command string) | source 309–311 |
| No `shell: true` interpolation of the runner path | source search: no `shell: true` spawn of `denoWebGpuRunner`; only a historical comment at 144 about `resolveDenoBin` preferring a real `.exe` |
| Metacharacters in `runnerPath` remain one argv element | named hostile test; independent probe `hostileArgs2Exact=true` for `bench.ts"; calc.exe &` |
| Empty `denoBin` / `runnerPath` throw `REFUSED` | source 130–135; named test; independent probes `emptyDeno` / `emptyRunner` |
| Scan-shaped `shell:true` string would concatenate the hostile path | independent reconstruction (below) |
| Live Deno/WebGPU spawn | **not this claim**; not executed. Deno binary is present on this host; two runner files exist. Residual. |
| 124-finding scan closure | **not this claim** |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-devtools-benchmarks/test/deno-spawn-spec.test.mjs`
   → **3/3 pass**, 0 fail, `duration_ms 131.4581`.
   - `deno WebGPU spawn uses an argv vector with shell disabled` — **green**
   - `hostile: metacharacters in the runner path stay one argv element` — **green**
   - `empty deno or runner paths are refused` — **green**

Independent extra probes (eval only; import of `denoWebGpuSpawnSpec`
from source `runner.mjs`; not production):

- `shellFalse=true`; `argsVector=["run","--unstable-webgpu","C:\\bench\\bench-deno-webgpu.ts"]`; `file="C:\\deno\\deno.exe"`
- `argsFrozen=true`; `optionsFrozen=true`; `encoding="utf8"`; `timeout=60000`; `windowsHide=true`
- hostile `runnerPath='bench.ts"; calc.exe &'` → `args[2]` exact match; `args.length=3`; `options.shell=false`; `file="deno"`; `file` does not contain `calc.exe`
- empty `denoBin` → throw `REFUSED: deno executable path is missing`
- empty `runnerPath` → throw `REFUSED: deno runner path is missing`
- `null` / `undefined` deno or runner → same `REFUSED` throws
- Scan-shaped reconstruction (below) concatenates the hostile path into one command line
- Current argv vector does **not** concatenate: `argvDoesNotConcatenate=true`

## Challenge 1 — does current spawn still interpolate the runner path into a `shell:true` command string?

**No. CONFIRMED refused** on the Deno WebGPU call site.
Locator: `runner.mjs` 129–141 and 304–316.

```129:141:packages-ts/galerina-devtools-benchmarks/src/runner.mjs
export function denoWebGpuSpawnSpec(denoBin, runnerPath) {
  if (typeof denoBin !== "string" || denoBin.length === 0) {
    throw new Error("REFUSED: deno executable path is missing");
  }
  if (typeof runnerPath !== "string" || runnerPath.length === 0) {
    throw new Error("REFUSED: deno runner path is missing");
  }
  return {
    file: denoBin,
    args: Object.freeze(["run", "--unstable-webgpu", runnerPath]),
    options: Object.freeze({ encoding: "utf8", timeout: 60000, shell: false, windowsHide: true }),
  };
}
```

```304:316:packages-ts/galerina-devtools-benchmarks/src/runner.mjs
  const denoWebGpuRunner = join(dir, "bench-deno-webgpu.ts");
  if (existsSync(denoWebGpuRunner)) {
    console.log(`  deno-webgpu...`);
    try {
      const { spawnSync: _sp } = await import("node:child_process");
      const spec = denoWebGpuSpawnSpec(resolveDenoBin(), denoWebGpuRunner);
      const dr = _sp(spec.file, spec.args, spec.options);
```

`_sp` is `spawnSync`. Three-argument form + `options.shell === false`
does not pass a concatenated command line to `cmd.exe`. Detector can
go red: named test `assert.equal(spec.options.shell, false)`.

## Challenge 2 — do metacharacters in `runnerPath` remain one argv element?

**Yes. CONFIRMED.** Named hostile test uses
`bench-deno-webgpu.ts"; calc.exe &`. Independent probe uses the
requested `bench.ts"; calc.exe &`. Both: `args[2]` is the hostile
string exactly; `file` is the deno executable path; `shell === false`.

## Challenge 3 — do empty paths throw `REFUSED`?

**Yes. CONFIRMED.** Named test and independent probes throw
`REFUSED: deno executable path is missing` / `REFUSED: deno runner path is missing`.

## Challenge 4 — would the scan-shaped `shell:true` string concatenate the hostile path?

**Yes. Reconstruction only** (no live `shell:true` spawn, no `calc.exe`
execution). Scan shape:

`_sp(\`"${denoBin}" run --unstable-webgpu "${runnerPath}"\`, { shell: true })`

With `denoBin = C:\deno\deno.exe` and
`runnerPath = bench.ts"; calc.exe &` that template yields one command
line:

```
"C:\deno\deno.exe" run --unstable-webgpu "bench.ts"; calc.exe &"
```

Independent probe: `scanShapedCommand` equals that string;
`scanShapedContainsCalc=true`; `scanShapedBreaksQuote=true`;
`scanShapedWouldConcatenateHostile=true`. The `";` after `bench.ts`
closes the quoted path and leaves ` calc.exe &` on the same shell
command line. Current argv spawn does not build this string.

## Residuals (not findings against the named spawn-spec claim)

- `resolveDenoBin` still uses `execSync("where deno")` on win32 /
  `execSync("command -v deno")` otherwise for **discovery of the deno
  executable**, not the runner path (`runner.mjs` 146–163). String
  `execSync` uses the platform shell. Constant command, not
  interpolation of `runnerPath`. Same pattern exists for `resolveGoBin`
  (`where go` / `command -v go`).
- Live Deno/WebGPU spawn was **not executed** in this review. Deno
  binaries are present on this host (`<LOCAL_DENO_BIN>/deno.exe`
  exists; `where deno` also listed npm shims and
  `<LOCAL_WINGET_LINKS>/deno.exe`).
  Runner files exist at
  `packages-ts/galerina-devtools-benchmarks/benchmarks/gpu-compute/bench-deno-webgpu.ts`
  and `…/matrix-multiply/bench-deno-webgpu.ts`. GPU/WebGPU correctness
  is outside the named claim and remains unverified here.
- Whitespace-only paths are not refused (`length > 0` is enough). Not
  in the named suite.
- Returned spec object itself is not frozen; `args` and `options` are.
  Call site uses the spec immediately.
- Scan ID `csf_d87a999abe6e43db3197cc1f` stays `PARTIAL_THIS_TREE`
  (Deno WebGPU spawn command interpolation; argv/`shell:false` closed
  on this dirty tree, discovery `execSync` and live GPU lane remain).
- Inventory after this slice: 93 OPEN / 27 PARTIAL /
  4 PATCHED_AUDIT_PENDING (124 IDs). Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim that Deno WebGPU benchmark
spawn no longer interpolates the runner path into a shell command.
Detector is not invalid. Evidence is sufficient for argv +
`shell: false` + hostile path-as-one-arg + empty-path `REFUSED`;
insufficient for live WebGPU execution, `resolveDenoBin` shell
discovery hardening, scan closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
