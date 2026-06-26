# @galerina/test

The consolidated **Galerina test harness** — one named, consumable package that
folds the repo's scattered test tooling behind a single clean API and CLI, the
way Spring ships `spring-test` and Cargo has `trybuild`.

It does **not** reimplement any runner. Each check **delegates to the existing,
shipped tool** by spawning it, and reports its verdict as a structured
`CheckResult`. The original scripts keep working unchanged.

| Check | Delegates to | What it proves |
|---|---|---|
| **unit** | `scripts/run-all-tests.cjs` | Every test-bearing package's `node:test` suite passes (one exit code, aggregate counts). |
| **e2e** | `node galerina.mjs check` / `build` | Example apps compile end-to-end through the real toolchain (parse → govern → emit → manifest). |
| **conformance** | `tests/r6-corpus/r6-parity.test.mjs` | The R6 bootstrap corpus passes the Stage-A ≡ Stage-B parity gate. |
| **fidelity** | `galerina-core-compiler/tests/fidelity-differential.test.mjs` | The 0014 differential: tree-walker ≡ bytecode-VM ≡ WASM, byte-exact. |

## Security posture

- **Fail-closed.** A missing target, a timeout, or a non-zero child exit is
  reported as `ok: false` with a non-zero `exitCode` — never a silent pass. A
  null exit status (signal kill / timeout) is treated as failure, not success.
- **Least capability.** Zero runtime dependencies. The package only spawns
  `node` subprocesses and reads the filesystem to locate targets.
- **No reimplementation.** Verdicts come from the shipped tools' own exit codes;
  count-parsing is best-effort and never overrides a verdict.

## Install / build

This is a workspace dev-tool package (TypeScript → `dist/`). From the package
directory:

```sh
npm run build       # tsc → dist/
npm test            # node --test tests/*.test.mjs (against dist/)
```

## API

```ts
import { runUnit, runE2e, runConformance, runFidelity, runAll } from "@galerina/test";

const res = await runAll({ core: true });   // CheckResult { kind:"all", ok, exitCode, children, … }
if (!res.ok) process.exit(res.exitCode);
```

Every runner accepts a `rootDir` (the Galerina workspace to target) and a
`timeoutMs`. When `rootDir` is omitted it is auto-detected by locating
`galerina.workspace.json` (from `$GALERINA_ROOT`, then cwd, then this module). A
downstream consumer points `rootDir` at their own workspace.

| Function | Key options |
|---|---|
| `runUnit(opts)` | `core`, `packages: string[]`, `bail` |
| `runE2e(opts)` | `examples: string[]`, `build` |
| `runConformance(opts)` | `corpus` (override the R6 parity test path) |
| `runFidelity(opts)` | `target` (override the differential test path) |
| `runAll(opts)` | all of the above + `bailScope` (stop at first failing check) |

## CLI

```sh
galerina-test [unit|e2e|conformance|fidelity|all] [flags]

  --root <dir>     workspace root (default: auto-detected)
  --core           unit: only the SOT-core packages (fast)
  --build          e2e: also `galerina build`, not just `check`
  --bail           stop at the first failure
  --json           machine-readable result
  --timeout <ms>   per-target spawn timeout
```

No subcommand runs `all`. An unknown subcommand exits non-zero (fail-closed).
The process exit code is the harness verdict.

## Layout

```
src/types.ts     the CheckResult / *Options vocabulary
src/paths.ts     fail-closed workspace-root resolution
src/spawn.ts     the single child-spawn point (timeout + fail-closed exit handling)
src/parse.ts     node:test count parsing (lifted from run-all-tests.cjs)
src/runners.ts   runUnit / runE2e / runConformance / runFidelity / runAll
src/cli.ts       the `galerina-test` front door
tests/           node:test suites (run against dist/)
```
