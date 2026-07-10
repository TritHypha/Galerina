# Galerina Examples

> **✍️ Writing or AI-generating contracts? Follow the [Contract Authoring Guide](../../../../ZTF-Knowledge-Bases/galerina-contract-authoring-guide.md).**
> `types` / `request` / `response` are **not** globally mandatory — omit on pure/internal flows
> (only API/route flows need `request`/`response`). `effects` is **deny-by-default** (omitted ⇒
> strictly pure). An AI may only **propose** widening `authority` / `effects` / `secrets`, never
> apply it (propose → compiler-verify → policy → human-approve).

These examples are source fixtures for the prototype CLI, package tests and
documentation. The directory currently contains 24 `.fungi` fixtures covering the
v1 syntax subset and target/report planning examples.

Run from `packages-galerina/galerina-core`:

```bash
node compiler/galerina.js check examples --exclude source-map-error.fungi
node compiler/galerina.js build examples --exclude source-map-error.fungi --out build/examples
node compiler/galerina.js verify build/examples
```

`source-map-error.fungi` intentionally contains an invalid compute-block file read
so `Galerina explain --for-ai` can demonstrate target compatibility diagnostics.

```bash
node compiler/galerina.js explain examples/source-map-error.fungi --for-ai
```

## Contract Examples

Galerina contracts are source declarations that tools can validate, report and
explain. In the current examples, contracts are represented by:

- typed request/response records such as `ContractOrderRequest` and
  `ContractOrderResponse`
- API route declarations such as `api OrdersApi` in `api-orders.fungi`
- flow signatures such as
  `secure flow createContractOrder(...) -> Result<..., ...>`
- explicit effects such as `effects [database.write]`
- strict comments such as `/// @purpose`, `/// @input`, `/// @output`,
  `/// @request`, `/// @response` and `/// @effects`

The focused example is `contracts.fungi`. It shows how typed data shapes, a secure
flow contract, recoverable errors, strict comments and effect declarations fit
together. `api-orders.fungi` shows the route-level API contract form.

## Four-Digit Guess Benchmark

`four-digit-guess-benchmark.fungi` is a Galerina-style local-only benchmark contract
for finding a four-digit code. The companion runnable scripts do the same work
and print JSON reports with elapsed time, attempt rate, CPU and memory fields.
The default mode is `sequential` so every runtime performs the same number of
attempts for a given target:

```bash
node packages-galerina/galerina-core/compiler/galerina.js run packages-galerina/galerina-core/examples/four-digit-guess-benchmark.fungi
node packages-galerina/galerina-core/examples/four-digit-guess-benchmark.node.js --target 9999 --max 100000 --mode sequential
python packages-galerina/galerina-core/examples/four-digit-guess-benchmark.py --target 9999 --max 100000 --mode sequential
```

Use a four-digit `--target` only. This intentionally does not guess full UUIDs.

## Arithmetic Threshold Benchmark

`arithmetic-threshold-benchmark.fungi` is a deterministic local benchmark. It
repeatedly performs:

```text
total += i
i += 1
total += i
i += 1
```

until `total` is greater than `100_000_000_000_000`. The companion Node.js and
Python scripts perform the same loop and emit JSON reports with elapsed time,
addition rate, CPU and memory fields:

```bash
node packages-galerina/galerina-core/compiler/galerina.js run packages-galerina/galerina-core/examples/arithmetic-threshold-benchmark.fungi
node packages-galerina/galerina-core/examples/arithmetic-threshold-benchmark.node.js --threshold 100000000000000
python packages-galerina/galerina-core/examples/arithmetic-threshold-benchmark.py --threshold 100000000000000
```

For Python raw loop speed without allocation tracing overhead:

```bash
python packages-galerina/galerina-core/examples/arithmetic-threshold-benchmark.py --threshold 100000000000000 --no-tracemalloc
```

## Compute Mix Throughput Benchmark

`compute-mix-throughput-benchmark.fungi` is the fairer timed benchmark fixture. It
runs a deterministic UInt32 workload with addition, multiplication, shift, xor,
branching and checksum output. The default measured window is 20 seconds after a
2 second warm-up:

```bash
node packages-galerina/galerina-core/compiler/galerina.js run packages-galerina/galerina-core/examples/compute-mix-throughput-benchmark.fungi --target-ms 20000 --warmup-ms 2000 --batch-size 100000
node packages-galerina/galerina-core/examples/compute-mix-throughput-benchmark.node.js --target-ms 20000 --warmup-ms 2000 --batch-size 100000
python packages-galerina/galerina-core/examples/compute-mix-throughput-benchmark.py --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --no-tracemalloc
```

For a quick correctness smoke test, use fixed-work mode. With `--warmup-ms 0`,
all runtimes should produce the same checksum for the same operation count:

```bash
node packages-galerina/galerina-core/compiler/galerina.js run packages-galerina/galerina-core/examples/compute-mix-throughput-benchmark.fungi --operations 100000 --warmup-ms 0 --batch-size 10000
node packages-galerina/galerina-core/examples/compute-mix-throughput-benchmark.node.js --operations 100000 --warmup-ms 0 --batch-size 10000
python packages-galerina/galerina-core/examples/compute-mix-throughput-benchmark.py --operations 100000 --warmup-ms 0 --batch-size 10000 --no-tracemalloc
```

For strict validation through the comparison runner, use `--validate`. Validation
mode forces a fresh measured state and treats fixed-operation checksums as the
pass/fail condition:

```bash
node packages-galerina/galerina-core/examples/benchmark-runner.node.js --validate --runs 3 --operations 5000000 --batch-size 100000 --buffer-size 65536
```

Run the three runtimes repeatedly and write a local JSON result summary:

```bash
node packages-galerina/galerina-core/examples/benchmark-runner.node.js --runs 5 --target-ms 20000 --warmup-ms 2000 --batch-size 100000
```

Results are written under `benchmark-results/`. These files are machine-local
benchmark outputs and should not be treated as language source.

Interpret fixed-operation output as checksum validation only when elapsed time is
very short. The official speed score is the median operations per second from a
10-30 second timed run. Galerina prototype results currently measure Node.js
runner overhead, not native compiler performance.

### Benchmark Fairness Rules

1. Each runtime must use the same algorithm.
2. Each runtime must use the same seed.
3. Each runtime must produce a checksum.
4. The measured section must exclude file loading where possible.
5. The benchmark must include a warm-up phase.
6. The benchmark must run for 10-30 seconds.
7. The clock must not be checked inside every operation.
8. Memory tracing must not be enabled during speed tests.
9. Each benchmark should be run at least 5 times.
10. The median result is the official score.
11. Results must include CPU, memory, runtime version, OS, architecture and timestamp.
12. Galerina prototype results must state that the current backend is a Node.js runner.
13. Warm-up must use separate throwaway state and must not mutate the measured state.
14. Fixed-operation mode validates checksums; timed mode ranks speed.
15. Summary reports should include validation status, relative performance and run order.

Current fixtures:

- `ai-context.fungi`
- `api-orders.fungi`
- `arithmetic-threshold-benchmark.fungi` - deterministic arithmetic threshold benchmark contract
- `boot.fungi`
- `browser-form.fungi`
- `compute-block.fungi`
- `compute-mix-throughput-benchmark.fungi` - timed deterministic UInt32 throughput benchmark
- `contracts.fungi` - typed flow contract with strict comments, `Result` errors and effects
- `decision.fungi`
- `gpu-plan.fungi`
- `four-digit-guess-benchmark.fungi` - local-only four-digit benchmark contract with runtime metrics
- `hello.fungi`
- `json-decode.fungi`
- `logic-review-scale.fungi`
- `option.fungi`
- `parallel-api-calls.fungi`
- `payment-webhook.fungi`
- `photonic-plan.fungi`
- `result.fungi` - `Result<T, E>` return and `match result { Ok(...) ... Err(...) ... }`
- `rollback.fungi`
- `source-map-error.fungi`
- `strict-types.fungi`
- `ternary-sim.fungi`
- `workers.fungi`
