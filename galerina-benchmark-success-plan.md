# Galerina Benchmark Success Plan and Result Interpretation

## Purpose

This document explains what needs to change for the current Galerina benchmark to become a credible, repeatable speed comparison between:

- Galerina prototype runner
- direct Node.js
- direct Python

It also explains whether the current results show Galerina is genuinely faster, or whether the benchmark is hiding something.

---

## Current benchmark status

The benchmark is now much better than the original simple arithmetic loop because it uses:

- repeated operations
- checksum validation
- multiple runs
- timed 20-second throughput mode
- fixed-operation mode
- comparison against Node.js and Python

However, it is not yet ready to be used as a public claim that Galerina is faster than Node.js or Python.

The current benchmark is useful, but it must be interpreted carefully.

---

## Key result 1: fixed-operation validation with warm-up failed

This command was used:

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 3 --operations 5000000 --warmup-ms 1000 --batch-size 100000 --buffer-size 65536
```

The result produced different checksums across runs and runtimes.

Example:

```txt
Galerina checksums: 3981586964, 777427328, 2080574034
Node.js checksums: 2852004030, 1325628506, 1551981680
Python checksums: 1584684364, 3275311352
```

For a fixed-operation deterministic benchmark, this is a problem.

A fixed-operation benchmark should normally produce the same checksum when the following are the same:

```txt
same seed
same operation count
same algorithm
same starting state
same buffer size
```

### Most likely cause

The most likely cause is that warm-up is changing the internal benchmark state before the measured fixed-operation run begins.

Because warm-up is time-based, each warm-up run may execute a different number of operations. That means the measured 5,000,000 operations start from a different seed/checksum/buffer state each time.

That makes the checksum different, even if the measured operation count is fixed.

---

## Key result 2: fixed-operation validation with no warm-up passed

This command was used:

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 3 --operations 5000000 --warmup-ms 0 --batch-size 100000 --buffer-size 65536
```

This produced the same checksum for all runtimes:

```txt
checksum = 889735480
```

That is a very important result.

It means the core benchmark algorithm can be deterministic and equivalent across Galerina, Node.js and Python when warm-up does not mutate the measured starting state.

This proves that the benchmark can succeed, but the warm-up design needs changing.

---

## Key result 3: timed 20-second benchmark is useful, but not proof on its own

This command was used:

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 5 --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536
```

The 20-second benchmark produced these median results:

| Runtime | Median operations/sec |
|---|---:|
| Galerina prototype | 216,055,810.68 |
| Node.js | 246,679,331.50 |
| Python | 2,618,440.60 |

In this timed run, direct Node.js was faster than Galerina.

Approximate comparison:

| Comparison | Result |
|---|---:|
| Node.js faster than Galerina | about 14.2% |
| Galerina faster than Python | about 82.5x |
| Node.js faster than Python | about 94.2x |

This result is more meaningful than the very short fixed-operation run, because it lasts around 20 seconds per runtime.

However, the timed checksums are expected to be different because each runtime completes a different number of operations in 20 seconds.

---

## Why Galerina sometimes appears faster than Node.js

In the fixed-operation no-warm-up run, Galerina appeared faster than direct Node.js:

| Runtime | Median operations/sec |
|---|---:|
| Galerina prototype | 220,146,000.83 |
| Node.js | 203,191,735.79 |
| Python | 2,465,327.51 |

In that short validation run, Galerina was about 8.3% faster than Node.js.

However, this run only took around 20–25 milliseconds for the Node-based runtimes.

That is too short to make a serious speed claim.

At that scale, results can be affected by:

- Windows process scheduling
- CPU boost state
- V8 JIT state
- cache effects
- antivirus/background processes
- timer precision
- first-run compilation effects
- whether the Galerina runner is executing a pre-wired benchmark fixture

So this result is useful for validation, but not strong enough for ranking speed.

---

## Is Galerina really faster?

At the moment, the honest answer is:

```txt
Not proven yet.
```

The current benchmark proves something useful, but different from “Galerina is faster than Node.js”.

It currently proves:

```txt
The Galerina prototype runner can execute the benchmark in the same broad performance range as direct Node.js.
```

That is still a good result.

But because the Galerina prototype currently runs through a Node.js-based runner, the benchmark mostly compares:

```txt
Galerina runner overhead vs direct Node.js
```

It does not yet compare:

```txt
native Galerina compiler vs JavaScript engine
```

Until Galerina has a native compiler or a clearly separate execution backend, claims should be cautious.

Recommended wording:

```md
The benchmark shows that the Galerina prototype runner currently has low overhead compared with an equivalent direct Node.js benchmark. It does not yet prove native Galerina compiler performance.
```

---

## What the results may be hiding

### 1. Galerina is still using Node.js/V8 underneath

The Galerina prototype is currently running through a Node.js runner.

That means both Galerina and direct Node.js benefit from the same JavaScript engine.

So if Galerina is faster in one run, it may not mean the Galerina language is faster. It may mean the Galerina benchmark path generated or executed JavaScript that V8 optimised slightly better.

### 2. The Galerina benchmark may be a fixture, not full language execution

The output says the benchmark is executed by the Galerina prototype runner.

If the runner recognises this benchmark and dispatches to a JavaScript fixture, then the test is not measuring full Galerina parsing, type checking, effect checking, security checking, or general language execution.

That is acceptable for a runtime fixture benchmark, but it must be labelled honestly.

Use:

```json
"comparisonType": "prototype-runner-overhead"
```

Do not call it:

```json
"comparisonType": "native-compiler-speed"
```

### 3. Warm-up currently contaminates fixed-operation validation

The failed warm-up validation strongly suggests that warm-up is changing the measured state.

Warm-up should help JIT optimisation, but it should not change the starting state of the measured benchmark.

### 4. Very short fixed-operation runs are unstable

The fixed-operation run with 5,000,000 operations completed in only about 20–25ms for Galerina and Node.js.

That is too short for a serious performance ranking.

It is fine for checksum validation, but not for final speed comparison.

### 5. Timed mode has different checksums by design

In 20-second mode, each runtime completes a different number of operations.

Therefore different checksums are expected.

Timed mode should be judged by:

```txt
median operations per second
standard deviation
CPU usage
memory usage
run stability
```

not matching checksum.

---

## Required changes for the benchmark to succeed

## 1. Separate warm-up state from measured state

Warm-up must not mutate the state used for the measured run.

Bad design:

```txt
create state
warm up using state
measure using same state
```

Good design:

```txt
create warm-up state
warm up using warm-up state
discard warm-up state

create fresh measured state from same seed
start timer
measure using fresh state
```

This should be done in:

```txt
compute-mix-throughput-benchmark.node.js
compute-mix-throughput-benchmark.py
Galerina benchmark fixture handler
```

---

## 2. Add a strict validation mode

Add a dedicated mode:

```powershell
--mode validate
```

or:

```powershell
--validate
```

Validation mode should use:

```txt
warmup = 0
fixed operations
same seed
same buffer size
same batch size
same expected checksum
```

Example:

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --validate --operations 5000000 --warmup-ms 0 --batch-size 100000 --buffer-size 65536
```

Expected result:

```txt
Galerina checksum = Node.js checksum = Python checksum
```

If validation fails, the benchmark runner should print:

```txt
BENCHMARK INVALID: checksums do not match in fixed-operation mode.
```

---

## 3. Do not use the fixed-operation validation run as the main speed score

The 5,000,000-operation run is too short for Node.js and Galerina.

Use it only for correctness validation.

The official speed result should come from timed mode:

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 5 --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536
```

Official score:

```txt
median operations per second
```

---

## 4. Add a minimum elapsed-time warning

If any fixed-operation run completes too quickly, the benchmark runner should warn:

```txt
WARNING: elapsed time below 1000ms. Use this run for validation only, not speed ranking.
```

Suggested rules:

| Elapsed time | Meaning |
|---:|---|
| under 100ms | checksum validation only |
| under 1000ms | weak speed signal |
| 10,000–30,000ms | fair speed comparison |

---

## 5. Report whether the benchmark is valid

The summary should include:

```json
{
  "validation": {
    "fixedOperationChecksumsMatch": true,
    "timedModeChecksumsExpectedToDiffer": true,
    "speedRankingAllowed": true
  }
}
```

For fixed-operation mode:

```txt
checksums should match
```

For timed-throughput mode:

```txt
checksums are expected to differ
```

---

## 6. Add relative performance fields

The summary should include direct comparisons:

```json
{
  "relativePerformance": {
    "logicnVsNode": 0.8759,
    "logicnVsPython": 82.51,
    "nodeVsPython": 94.20
  }
}
```

This avoids manually calculating the differences each time.

---

## 7. Label Galerina correctly

The report should keep this kind of wording:

```json
{
  "runtime": "galerina-prototype",
  "executionMode": "nodejs-runner",
  "comparisonType": "prototype-runner-overhead"
}
```

This is important.

It prevents people from misunderstanding the result as native compiler performance.

---

## 8. Add benchmark environment details

For stronger public reporting, include:

```txt
CPU model
CPU core count
RAM
OS version
Node.js version
Python version
power mode
laptop plugged in or battery
Git commit hash
benchmark file hash
timestamp
```

This is especially important on Windows, where background activity and power mode can affect benchmark results.

---

## 9. Add run-order control

The current runner appears to run all Galerina tests, then all Node.js tests, then all Python tests.

That can bias the result because the CPU may heat up or boost differently.

Better options:

```txt
round-robin order:
Galerina run 1
Node run 1
Python run 1
Galerina run 2
Node run 2
Python run 2
...
```

Even better:

```txt
optional randomized order
```

The summary should record the run order.

---

## 10. Add outlier handling

The Galerina fixed-operation run had a noticeably slow run:

```txt
183,753,270.81 ops/sec
```

The timed run also had one much faster Galerina run:

```txt
241,646,195.28 ops/sec
```

The benchmark should report:

```txt
median
mean
best
worst
standard deviation
coefficient of variation
```

The official score should remain:

```txt
median
```

---

## Recommended benchmark workflow

## Step 1: validation

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 3 --operations 5000000 --warmup-ms 0 --batch-size 100000 --buffer-size 65536
```

Pass condition:

```txt
all checksumValues arrays contain the same single checksum
```

Current result:

```txt
PASS: checksum 889735480
```

## Step 2: speed test

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 5 --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536
```

Pass condition:

```txt
each runtime runs for around 20 seconds
runner reports median operations per second
runner clearly labels Galerina as nodejs-runner/prototype-runner-overhead
```

## Step 3: publish cautious result

Suggested wording:

```md
In the current benchmark, direct Node.js achieved the highest median throughput in the 20-second timed run. The Galerina prototype runner operated in the same broad performance range as Node.js, which suggests the prototype runner overhead is not excessive. Python was significantly slower for this integer-heavy workload.

The benchmark should be interpreted as a prototype runner overhead comparison, not as native Galerina compiler performance.
```

---

## Current interpretation of your latest results

## Validation run with no warm-up

This passed.

| Runtime | Median ops/sec | Checksum |
|---|---:|---:|
| Galerina prototype | 220,146,000.83 | 889735480 |
| Node.js | 203,191,735.79 | 889735480 |
| Python | 2,465,327.51 | 889735480 |

This proves the runtimes can execute the same deterministic algorithm.

However, because this run only lasted around 20–25ms for Galerina and Node.js, it should not be used as the official speed result.

## Timed 20-second run

| Runtime | Median ops/sec |
|---|---:|
| Galerina prototype | 216,055,810.68 |
| Node.js | 246,679,331.50 |
| Python | 2,618,440.60 |

This is the better speed result.

It shows:

```txt
Node.js is faster than Galerina in this run.
Galerina is much faster than Python in this workload.
Galerina is still in the same broad performance class as Node.js.
```

---

## Final conclusion

The benchmark is close to succeeding.

The most important fix is:

```txt
Warm-up must not mutate the measured benchmark state.
```

The second most important fix is:

```txt
Fixed-operation mode should be treated as validation, not the official speed test.
```

The third most important fix is:

```txt
Galerina results must be labelled as Node.js runner/prototype overhead until a native compiler exists.
```

Based on the current results, the honest claim is not:

```txt
Galerina is faster than Node.js.
```

The honest claim is:

```txt
The Galerina prototype runner can execute this benchmark in the same broad performance range as direct Node.js, while Python is much slower for this specific integer-heavy workload.
```

That is still a very positive early result.
