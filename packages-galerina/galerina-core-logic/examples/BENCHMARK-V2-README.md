# Galerina Strong Benchmark v2

This benchmark replaces the earlier simple arithmetic benchmark with a stronger and fairer workload.

## What it measures

`compute-mix-throughput-v2` measures deterministic CPU/runtime throughput using:

- UInt32 multiply/add/xor/shift operations
- data-dependent branching
- ring-buffer memory reads/writes
- checksum output
- fixed-operation validation mode
- 10-30 second timed throughput mode

It is intentionally not just:

```txt
total = total + i
```

The previous arithmetic benchmark was useful, but it was too simple and could favour a runtime that optimises a clean addition loop very well.

## Important interpretation

The Galerina prototype currently runs through a Node.js-based runner.

Therefore, this benchmark measures:

```txt
Galerina prototype runner overhead compared with direct Node.js
```

It does **not** yet prove native Galerina compiler speed.

## Recommended timed run

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 5 --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536
```

This takes roughly:

```txt
runs × runtimes × (warmup + target)
5 × 3 × 22 seconds = about 5.5 minutes
```

## Faster validation run

Use this to confirm all runtimes produce the same checksum:

```powershell
node packages-galerina\galerina-core\examples\benchmark-runner.node.js --runs 3 --operations 5000000 --warmup-ms 1000 --batch-size 100000 --buffer-size 65536
```

In fixed-operation mode, matching checksums matter.

In timed-throughput mode, checksums do not need to match because each runtime completes a different number of operations.

## Individual runtime commands

Galerina prototype:

```powershell
node packages-galerina\galerina-core\compiler\galerina.js run packages-galerina\galerina-core\examples\compute-mix-throughput-benchmark.spore --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536
```

Direct Node.js:

```powershell
node packages-galerina\galerina-core\examples\compute-mix-throughput-benchmark.node.js --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536
```

Python:

```powershell
python packages-galerina\galerina-core\examples\compute-mix-throughput-benchmark.py --target-ms 20000 --warmup-ms 2000 --batch-size 100000 --buffer-size 65536 --no-tracemalloc
```

## Official score

Use:

```txt
median operations per second
```

Do not use only the best run.

## Recommended result wording

```md
The Galerina prototype benchmark currently measures the overhead of the Galerina Node.js runner compared with equivalent direct Node.js code. It should not be treated as native compiler performance.

The official score is the median operations per second across multiple runs. Fixed-operation mode is used to verify checksum consistency. Timed-throughput mode is used to measure throughput over a 10-30 second compute window.
```
