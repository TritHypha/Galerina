# @galerina/devtools-benchmarks

Runtime comparison benchmarks for the Galerina language runtime. A suite of compute, memory, string, crypto, and real-world workloads (Computer Language Benchmarks Game classics plus Galerina-specific tests) runs across every runtime present on the machine — Node.js, Python, Rust, C++, **Galerina→WASM**, and the Galerina interpreter (governed / manifest / passive) — measuring raw throughput and the overhead of Galerina's governance and manifest-verification layers. The runner skips any runtime whose toolchain isn't installed, so a partial toolchain still produces a valid (smaller) comparison.

---

## What the benchmarks measure

Each benchmark is a tight numerical loop that exercises a different mix of CPU operations:

| Benchmark | What it exercises |
|---|---|
| **compute-mix** | 2x LCG steps, 2x xorshift mix, float `sqrt`, 4-way branch. Stresses integer arithmetic, floating-point, and branch prediction together. |
| **arithmetic-threshold** | Unrolled double-step addition loop with a modular-multiply + XOR checksum. Pure integer throughput with a stopping condition. |
| **six-digit-guess** | Sequential sweep of all 6-digit codes with a full bulls-and-cows score computed per attempt. Stresses string/array comparison and loop overhead. |

All benchmarks produce a JSON result object on stdout, making them easy to pipe into the runner and compare.

---

## The runtimes

The runner probes for each of these per benchmark and includes whichever are present:

| Runtime | What it represents |
|---|---|
| **Rust** | Native optimised binary (`rustc -O`), plus AVX2 / AVX-512 variants where the CPU supports them. The ceiling for single-thread throughput on this machine. |
| **C++** | Native optimised binary (`g++ -O2 -march=native`). Comparable to Rust; shows compiler-specific tuning differences. |
| **Node.js** | V8 JIT. The baseline for "fast scripting" — well-optimised after warmup, but not native-speed. |
| **Python** | CPython interpreted. The lower-bound reference. Typically 5x–30x slower than Node.js on these workloads. |
| **Galerina→WASM** | `.fungi` compiled to a real WebAssembly module, run on Node's built-in engine — governance compiled in as inline assertions, no JS tree-walker on the hot path. The fast Galerina path. |
| **Galerina (manifest)** | `.fungi` compiled to an AST, effect-checked, governance-verified, then executed on the interpreter. Static proof checks before execution begins. |
| **Galerina (governed)** | Same as manifest but the interpreter enforces governance contracts continuously during execution — the strictest, most overhead-heavy mode. |
| **Galerina (passive)** | The interpreter with governance observation but no continuous enforcement — isolates the tree-walker's warm-path overhead. |
| **Deno-WebGPU** | *(optional, needs Deno)* a GPU-shaped workload on real WebGPU where available. |

---

## How to run

### Prerequisites

**Required**

- **Node.js ≥ 18** — runs the harness, the Node.js column, and (via V8's built-in `WebAssembly` engine) the **Galerina→WASM** column.

**Optional** — each adds one comparison column; the runner **skips any runtime it can't find**, so none of these block a run:

| Toolchain | Column it enables | Install on Windows |
|---|---|---|
| **Python 3** | Python | `winget install Python.Python.3.12` (or python.org) |
| **Rust** (`rustc` + `cargo`) | Rust native (+ AVX2/AVX-512 where the CPU supports it) | `winget install Rustlang.Rustup`, then `rustup default stable` |
| **C++** (`g++` / `clang++`) | C++ native | MSYS2/MinGW (real GCC) — see the note below · or `winget install LLVM.LLVM` for `clang++` |
| **Deno** | WebGPU (`bench-deno-webgpu.ts`) | `winget install DenoLand.Deno` |

**WASM needs no extra install.** The Galerina→WASM column compiles `.fungi → WAT → binary WASM` using the **`wat-wasm` / `wabt` npm packages** (pulled in by `npm install`) and runs it on Node's built-in `WebAssembly` engine. You do **not** need the standalone `wat2wasm` / WABT CLI — nothing in the build or the benchmark calls it. (See *Installing the WABT CLI* below only if you want it for hand-assembling `.wat` at the terminal.)

**Installing g++ on Windows (MSYS2 — the real GCC toolchain, for the C++ column).**

1. `winget install MSYS2.MSYS2`
2. Open **Start menu → "MSYS2 UCRT64"** (or run `C:\msys64\ucrt64.exe`), then run `pacman -S mingw-w64-ucrt-x86_64-gcc`. Note: `pacman` is **not** on the Windows PATH — run it from that shell, or invoke `C:\msys64\usr\bin\pacman.exe` directly from PowerShell.
3. Add `C:\msys64\ucrt64\bin` to your PATH (System → Environment Variables), open a fresh terminal, and `g++ --version` should work. `npm run build:native` also accepts `clang++` (LLVM) if you prefer.

> **Dev-box note (2026-07-11):** g++ is installed on this machine at `C:\msys64\ucrt64\bin\g++.exe` but is **not yet on PATH** — add `C:\msys64\ucrt64\bin` (or run the benchmark from the *MSYS2 UCRT64* shell) so the **next benchmark run picks up the C++ column**. The standalone `wat2wasm` (WABT CLI) is also available now for hand-assembling `.wat`, though the Galerina→WASM column already assembles via the `wat-wasm`/`wabt` npm packages and needs nothing extra.

### Install dependencies

```
npm install
```

This also installs the WASM toolchain (`wat-wasm`, `wabt`) the Galerina→WASM column uses.

### Rebuild the runtime (the Galerina + WASM execution engine)

The `.fungi` and WASM benchmarks **compile at run time** against the compiler's `dist/`. After pulling changes (or on a fresh checkout), rebuild that chain so the numbers reflect the current compiler:

```
node ../../scripts/build-core-chain.mjs
```

Fail-closed and topological (leaves first); a build failure aborts the whole chain rather than leaving a half-built runtime. Skip it if the compiler `dist/` is already current.

### Run all benchmarks

```
npm run run          # full suite, publication-fidelity timing
npm run run:quick    # full suite, reduced iteration counts for the time-based benchmarks (faster)
```

Runs every benchmark across all available runtimes and writes results to `results/latest.json`. The runner also emits a **unit-alignment check** — every comparable benchmark must report one matching unit across all runtimes (a mismatch fails the run).

### Run a single benchmark

```
npm run run:compute-mix
npm run run:arithmetic
npm run run:guess
```

### Print a comparison table

```
npm run compare
```

Reads `results/latest.json` and prints a Markdown table showing throughput for each runtime and cross-runtime ratios.

### Two views + a chart

```
npm run report      # writes results/benchmark-report-latest.{md,json} AND …-chart-latest.html
npm run chart       # (re)render just the chart from the existing report JSON
```

`report` derives two views — the cross-language table (current run) and the diff-from-the-last-snapshot —
and, as its last step, renders **`results/benchmark-chart-latest.html`**: a **self-contained SVG chart** (no CDN,
no `<script>`, no dependency — opens offline in any browser, adapts to light/dark). View 1 is *where the
production path lands* (WASM ÷ Node per benchmark, log scale, teal = WASM faster); view 2 is the notable movers vs
the last snapshot. Read the movers against the noise floor — single-run cross-session diffs are dominated by
machine variance (untouched native controls routinely swing ±20–28%), not code. Regression-gated by
`test/chart.test.mjs` (self-contained, escaping, and derived-count invariants).

### Build native binaries

```
npm run build:native
```

Compiles the C++ and Rust implementations for every benchmark that ships a `bench.cpp` / `bench.rs`. Skips gracefully if a compiler is not available. Binaries are placed alongside the source files in each benchmark directory (many are already committed pre-built).

### Installing the WABT CLI (optional — NOT required)

Galerina's WASM path does not use the standalone `wat2wasm` binary (it uses the `wat-wasm`/`wabt` npm packages above), so you only need this if you want to hand-assemble `.wat` files at the terminal. WABT isn't on `winget`, and `choco`/`scoop` are third-party managers you may not have — the reliable no-package-manager route is a direct download from the official releases:

```powershell
# Latest WABT Windows build → C:\wabt  (tar ships with Windows 10+)
$rel   = Invoke-RestMethod https://api.github.com/repos/WebAssembly/wabt/releases/latest
$asset = $rel.assets | Where-Object name -match 'windows' | Select-Object -First 1
$zip   = Join-Path $env:TEMP $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $zip
New-Item -ItemType Directory -Force C:\wabt | Out-Null
tar -xf $zip -C C:\wabt
$bin = (Get-ChildItem C:\wabt -Recurse -Filter wat2wasm.exe | Select-Object -First 1).DirectoryName
$env:Path += ";$bin"     # session-only; add via System > Environment Variables to persist
wat2wasm --version
```

---

## Understanding the results

The comparison table shows operations per second (or additions/attempts per second, depending on benchmark). Higher is faster.

The final column — **Node/Galerina** — shows how many times faster Node.js is compared to the Galerina governed runtime. This ratio is the primary signal for Galerina runtime optimisation work.

Typical result shape on a mid-range desktop:

- Rust and C++ are 2x–5x faster than Node.js
- Node.js is 10x–40x faster than Python
- Galerina (manifest) is slower than Node.js due to parse + effect-check overhead per run
- Galerina (governed) is slower still due to continuous contract enforcement during execution

All three workloads are designed so the algorithm is identical across all runtimes. Checksum fields let you verify correctness — matching checksums across runtimes confirm the implementations are equivalent.

---

## The governance overhead story

Galerina's governed runtime deliberately trades throughput for safety guarantees:

**Manifest mode** adds a static pre-flight phase before execution:
- Parse the `.fungi` source and build an AST
- Run the effect checker to classify all side-effects
- Run the governance verifier to confirm the program meets its declared contracts
- Then execute

**Governed mode** adds continuous enforcement:
- All of the above, plus
- Runtime capability checks at each effect boundary
- Audit-log emission for every governed operation
- Rate-limit enforcement if declared in the flow contract

This overhead is intentional. Galerina programs operating under governance get proofs that would otherwise require external audit tools.

The benchmark numbers make the cost of that guarantee visible: if Galerina governed runs at 1/20th of Node.js throughput, that gap is the price of continuous governance enforcement on this hardware.

---

## The WASM column (shipped)

Alongside the tree-walking interpreter (the governed / manifest / passive Galerina columns), the compiler emits a real **WebAssembly** target and the benchmark's **Galerina→WASM** column runs it:

1. The compiler emits a WebAssembly module (`.fungi → WAT → binary WASM`) from the typed, effect-annotated AST.
2. Governance checks are compiled into the module as inline assertions rather than interpreted per-operation checks.
3. The module runs on Node's built-in `WebAssembly` engine — pure WASM, no JS tree-walker on the hot path.

This is live today (no Deno, GPU, or external assembler required — see Prerequisites). For compute-bound workloads the WASM path closes most of the interpreter's gap to Node.js, turning governance overhead into a static compile-time cost rather than a per-operation interpreted cost. `results/latest.json` is forward-compatible: the runner skips any runtime whose binary/module is not present.

---

## File layout

```
benchmarks/                 ~30 benchmark dirs (compute-mix, nbody, mandelbrot, binary-trees,
  <benchmark>/              matrix-multiply, crypto-ops, json-parse, spore-container, …)
    node.mjs                Node.js ESM benchmark (always present)
    python.py               Python benchmark        (optional column)
    bench.cpp / bench.rs    C++ / Rust source       (native columns; many committed pre-built)
    bench-wasm.mjs          Galerina→WASM harness    (compiles benchmark.fungi to WASM at run time)
    benchmark.fungi         Galerina source         (governed / manifest / passive columns)
    bench-deno-webgpu.ts    optional WebGPU harness  (needs Deno)
src/
  runner.mjs                Orchestration — runs every runtime, writes results/latest.json
  compare.mjs               Reads results/latest.json, prints the Markdown comparison table
  build-native.mjs          Compiles the C++ / Rust binaries
  galerina-runner.mjs       Galerina interpreter bridge (governed / manifest / passive)
  wasm-runner.mjs           Galerina→WASM bridge (.fungi → WAT → binary WASM → WebAssembly.instantiate)
  throughput-units.mjs      Normalises every runtime to one inner-ops/sec unit per benchmark
results/
  latest.json               Written by `npm run run` (gitignored except .gitkeep)
```

> Note: this suite has grown well beyond the original three compute workloads — the runner's `BENCHMARKS` array in `src/runner.mjs` is the source of truth for the current set.
