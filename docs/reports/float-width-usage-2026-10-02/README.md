# Float32Array / Float16Array / Math.fround / Math.f16round usage audit (2026-10-02)

Status: read-only audit, input to E5 (narrow float) option B. Not an authority.

Tool: `node scripts/symbol-usage-search.mjs --preset float-width [--json] [--check <snapshot>]`
(added in 565f30099). It scans every file type that git lists as tracked or untracked-but-not-ignored. It excludes node_modules, .worktrees, build, dist, target, coverage and .next, and skips binary files and files over 8 MiB.

Snapshot: base 0d06d6c1f (origin/main) plus the tool commit. `float-width-usage.json` is the `--json` output, and can be passed to `--check` to detect drift. `float-width-usage.txt` is the grouped human view.

## Findings on main
- 101 matches in 39 files. 65 matches are benchmark result data (JSON/CSV) in galerina-devtools-benchmarks.
- All 14 `new Float32Array` constructs are benchmark harness code:
  - `benchmarks/hardware-targets/node.mjs`
  - `benchmarks/matrix-multiply/node.mjs`
  - `benchmarks/matrix-multiply/bench-deno-webgpu.ts`
- Compiler semantic sites:
  - `src/lowering-plan.ts:23/35/64`: the Float32 type lowers to the "Float32Array" storage name.
  - `src/wat-emitter.ts:5011`: the Float32Array TypedArray hint for Tensor<Float32>.
  - `tests/type-registry/lowering-plan.test.mjs`: tests of the above.
- `scripts/audit-arithmetic-conformance.mjs:142`: the Math.fround truth pin for the f32 conformance cases.
- There is no Float16Array or Math.f16round anywhere on main, and no runtime or host use of Float32Array.
- The tool's own files match themselves (scripts/symbol-usage-search.mjs and its test).

## Comparison with the VS Code export (Float32Array.code-search.md)
- The export had 559 results under 259 file headers, but these were only 8 unique repository paths repeated across worktrees. The export excluded json/md/mjs/fungi/js.
- 4 export paths are ignored `.myco/*.bak` files, so the scan does not cover them by design.
- The scan found 35 paths the export missed because of its type exclusions (benchmark .mjs, docs JSON/MD, tests).

## Other worktrees
73 worktrees were scanned (`worktree-only.md`). The only paths with matches that are not on main are the E5 option B files on grok/wat-parked-memory-20261002.
