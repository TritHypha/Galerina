# Benchmark Success Plan

## Purpose

Galerina benchmark results must be repeatable, correctly interpreted and labelled
honestly. The current compute-mix benchmark is useful for comparing the Galerina
prototype runner with direct Node.js and Python, but it must not be presented as
native Galerina compiler performance.

## Benchmark Position

The compute-mix benchmark compares:

- Galerina prototype runner
- direct Node.js
- direct Python

The current Galerina prototype runs through a Node.js-based runner. The benchmark
therefore measures:

```text
Galerina prototype runner overhead compared with direct Node.js
```

It does not yet prove:

```text
native Galerina compiler speed
```

Reports must use:

```json
{
  "runtime": "galerina-prototype",
  "executionMode": "nodejs-runner",
  "comparisonType": "prototype-runner-overhead"
}
```

## Main Success Rule

Warm-up must not mutate the state used for the measured run.

Incorrect design:

```text
create state
warm up using state
measure using the same state
```

Correct design:

```text
create warm-up state
warm up using warm-up state
discard warm-up state

create measured state from the same seed
start timer
measure using measured state
```

This rule applies to:

- Galerina benchmark fixture handler
- Node.js benchmark implementation
- Python benchmark implementation

## Validation Mode

Fixed-operation mode is for correctness validation, not official speed ranking.

Validation mode must use:

- fixed operation count
- same seed
- same batch size
- no measured-state mutation during warm-up
- matching checksums across runtimes

Recommended command:

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --validate --runs 3 --operations 5000000 --batch-size 100000 --buffer-size 65536
```

Pass condition:

```text
Galerina checksum = Node.js checksum = Python checksum
```

If fixed-operation checksums do not match, the benchmark is invalid.

## Timed Throughput Mode

Timed mode is the official speed comparison mode.

Recommended command:

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 5 --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536
```

Official score:

```text
median operations per second
```

Timed mode checksums are expected to differ because each runtime completes a
different number of operations in the fixed time window.

## Short-Run Interpretation

Very short fixed-operation runs are useful for checksum validation but weak for
speed ranking.

| Elapsed time | Interpretation |
| ---: | --- |
| under 100ms | checksum validation only |
| under 1000ms | weak speed signal |
| 10000-30000ms | fair timed speed comparison |

## Required Summary Fields

Benchmark summaries should include:

```json
{
  "validation": {
    "mode": "timed-throughput",
    "fixedOperationChecksumsMatch": null,
    "timedModeChecksumsExpectedToDiffer": true,
    "speedRankingAllowed": true,
    "officialScore": "median operations per second"
  },
  "relativePerformance": {
    "galerinaVsNode": 0.8759,
    "galerinaVsPython": 82.51,
    "nodeVsPython": 94.2
  },
  "runOrder": [
    { "run": 1, "runtime": "galerina-prototype" },
    { "run": 1, "runtime": "nodejs" },
    { "run": 1, "runtime": "python" }
  ]
}
```

## Run Order

The benchmark runner should use round-robin ordering by default:

```text
Galerina run 1
Node.js run 1
Python run 1
Galerina run 2
Node.js run 2
Python run 2
```

This reduces bias from CPU boost, heat and background scheduling compared with
running all attempts for one runtime before moving to the next.

## Statistics

Each runtime summary should report:

- best operations per second
- worst operations per second
- mean operations per second
- median operations per second
- standard deviation
- coefficient of variation
- median elapsed time
- checksum values
- short-run warnings

The official score remains the median operations per second from timed mode.

## Public Result Wording

Use cautious wording:

```text
The Galerina prototype runner can execute this benchmark in the same broad
performance range as direct Node.js for this workload. The benchmark should be
interpreted as prototype runner overhead, not native Galerina compiler speed.
```

Do not claim:

```text
Galerina is faster than Node.js.
```

unless a longer timed benchmark consistently supports that claim and the
execution backend is clearly identified.

## Future Environment Evidence

Public benchmark reports should eventually include:

- CPU model
- CPU core count
- RAM
- OS version
- Node.js version
- Python version
- power mode
- whether the machine is plugged in
- Git commit hash
- benchmark file hash
- timestamp

These fields are important on Windows because scheduling, power state and
background activity can affect measured throughput.
