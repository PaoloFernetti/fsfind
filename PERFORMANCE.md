# Performance and tuning

This document records reproducible benchmarks for `@paolofernetti/fsfind` and the tuning decisions
that follow from them.

## Environment

| Item | Value |
|---|---|
| OS | Windows 11, x64 |
| CPU | Intel Core Ultra 9 285K, 24 logical CPUs |
| RAM | 95.4 GB |
| Node.js | 24.22.0 |
| File system | local SSD |

The numbers are machine-specific. Re-run the benchmark on the target hardware before changing
defaults.

## Method

[`benchmarks/run.mjs`](benchmarks/run.mjs) creates a synthetic tree in the OS temp directory:

- width 6, depth 5, 6 files per directory;
- 9,331 directories and 55,986 files, created in about 6.4 seconds;
- `find` with a non-existent name measures a full traversal;
- each scenario runs one warmup pass and five measured passes; the median is reported;
- the tree is removed after the run.

Reproduce with:

```shell
npm run bench
```

Override the shape on Windows:

```shell
set "BENCH_WIDTH=6" && set "BENCH_DEPTH=5" && set "BENCH_FILES=6" && set "BENCH_RUNS=5" && node benchmarks/run.mjs
```

On POSIX:

```shell
BENCH_WIDTH=6 BENCH_DEPTH=5 BENCH_FILES=6 BENCH_RUNS=5 node benchmarks/run.mjs
```

## Results: 9,331 directories

### Serial traversal

| Concurrency | Median | Dirs/s |
|---|---|---|
| 1 | 482.9 ms | 19,324 |
| 4 | 134.2 ms | 69,532 |
| 8 | 113.4 ms | 82,291 |
| 16 (default) | 114.7 ms | 81,340 |
| 32 | 114.4 ms | 81,535 |
| 64 | 115.0 ms | 81,135 |

Concurrency 8 through 64 forms a plateau. The default of 16 sits in the middle of it, and going
above 32 does not help.

### Worker threads

| Workers | Median | Dirs/s |
|---|---|---|
| 2 | 96.0 ms | 97,219 |
| 4 | 95.0 ms | 98,249 |
| 8 | 95.8 ms | 97,418 |

Per-worker concurrency (workers = 4):

| Concurrency | Median | Dirs/s |
|---|---|---|
| 4 | 97.3 ms | 95,860 |
| 8 | 94.6 ms | 98,592 |
| 16 | 94.1 ms | 99,209 |
| 32 | 94.6 ms | 98,588 |

Two to four workers give a consistent 17-20% improvement over the serial default. Eight workers do
not add anything on a single drive.

### Early exit

`find` with a target that exists somewhere in the tree:

| Mode | Median |
|---|---|
| Serial, concurrency 16 | 83.0 ms |
| Workers 4, concurrency 16 | 58.2 ms |

Parallel scanning is about 30% faster here because the target is found in one worker's subtree while
the others continue. The exact result depends on where the target lives.

### Result cache

| Scenario | Median |
|---|---|
| Cold cache, `findAll` | 115.2 ms |
| Cache hit, `findAll` | 0.2 ms |

A cache hit is roughly 659x faster than a cold serial scan. Writing the cache adds no measurable
overhead to the cold run.

### Worker startup

| Scenario | Median |
|---|---|
| Tiny tree, serial | 0.2 ms |
| Tiny tree, workers 4 | 19.2 ms |

Worker startup costs about 19 ms, which dominates small searches.

## Small tree comparison

On a 1,555-directory tree the picture flips:

| Scenario | 1,555 dirs | 9,331 dirs |
|---|---|---|
| Serial, concurrency 16 | 18.1 ms | 114.7 ms |
| Workers 4, concurrency 16 | 35.9 ms | 95.0 ms |
| Speedup | 0.50x | 1.21x |

The crossover is roughly 3,000-5,000 directories on this machine.

## Tuning guidance

1. Keep `concurrency` at the default `16` unless you have measurements that say otherwise. Values
   from 8 to 32 are equivalent on the test machine; `1` and `4` are noticeably slower.
2. Leave `workers` at `0` for small or unknown trees. Use `workers: 2` or `workers: 4` for large
   scans, slow disks or network shares.
3. `workers: "auto"` resolves to `min(cpus - 1, 4)`, which matches the measured sweet spot. It is a
   good default when the caller knows the scan is large but not the hardware.
4. `concurrency` applies per worker in parallel mode, so the total number of in-flight directory
   reads is roughly `workers * concurrency`. `4 x 16` and `4 x 8` were within noise of each other.
5. Enable `cache` for repeated identical queries. The key includes roots, target, matching options
   and ignore patterns, so unrelated searches never collide.
6. Use `maxDepth`, `roots` and `ignore` before reaching for worker threads. They reduce the amount
   of work instead of parallelising it.

## Caveats

- The synthetic tree stays in the OS page cache after the warmup, so real disks with cold caches may
  show larger gains from worker threads.
- Antivirus and indexing services can dominate timings on Windows.
- The benchmark measures directory traversal and name matching, not the cost of opening files.
- Worker threads are unavailable when the package is bundled into a single file by another bundler.
