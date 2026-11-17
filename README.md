# File System Finder

![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/PaoloFernetti/fsfind/ci.yml) ![GitHub package.json version](https://img.shields.io/github/package-json/v/PaoloFernetti/fsfind)
![GitHub Created At](https://img.shields.io/github/created-at/PaoloFernetti/fsfind) ![GitHub Release Date](https://img.shields.io/github/release-date/PaoloFernetti/fsfind)![NPM Downloads](https://img.shields.io/npm/d18m/%40paolofernetti%2Ffsfind)


Cross-platform file system finder. Locate a file or directory anywhere on the machine with an
asynchronous, cancellable walker.

- Asynchronous traversal that does not block the event loop.
- Automatic root detection: every mounted drive on Windows, `/` on POSIX systems.
- Exact, glob and regex name matching with platform-aware case sensitivity.
- Cancellation through `AbortSignal`, result limits, depth limits and timeouts.
- Progress and skipped-path callbacks.
- Symbolic link handling with cycle protection.

## Requirements

Node.js 18 or newer.

## Installation

```shell
npm install @paolofernetti/fsfind
```

## Quick start

ES modules:

```js
import find from "@paolofernetti/fsfind";

const result = await find("report.pdf");

console.log(result); // Absolute path or undefined
```

CommonJS:

```js
const { find } = require("@paolofernetti/fsfind");

const result = await find("report.pdf");
```

Find every match:

```js
import { findAll } from "@paolofernetti/fsfind";

const results = await findAll("*.log", { match: "glob" });
```

## API

### `find(target, options?)`

Returns a `Promise<string | undefined>` with the first matching path.

### `findAll(target, options?)`

Returns a `Promise<string[]>` with every matching path. The default `limit` is `Infinity`.

### `findSync(target, options?)`

Blocking variant of `find`. It is useful for CLI bootstrap code and tests, but it blocks the event
loop for the whole scan. Prefer `find` in applications.

### `createFinder(options?)` and `FsFinder`

```js
import { createFinder } from "@paolofernetti/fsfind";

const finder = createFinder({ roots: ["D:/projects"], caseSensitive: false });

const first = await finder.find("tsconfig.json");
const all = await finder.findAll("tsconfig.json");
```

Constructor options act as defaults. Options passed to a method replace the constructor values for
that call. `include` and `ignore` are replaced as whole objects, not merged.

### `clearCache(cache?)`

Removes cached results. Accepts the same value as the `cache` option: `true` or no argument clears
the default directory, `{ dir }` clears a custom directory and `false` is a no-op.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `roots` | `string[]` | all drives / `/` | Directories to start from |
| `match` | `"exact" \| "glob" \| "regex"` | `"exact"` | How `target` is interpreted |
| `caseSensitive` | `boolean` | `false` on Windows and macOS, `true` elsewhere | Name comparison mode |
| `include` | `{ files?: boolean; dirs?: boolean }` | both `true` | Which entry kinds are returned |
| `maxDepth` | `number` | `Infinity` | Maximum depth relative to each root |
| `limit` | `number` | `1` for `find`, `Infinity` for `findAll` | Maximum number of results |
| `followSymlinks` | `boolean` | `false` | Follow symbolic links and junctions |
| `concurrency` | `number` | `16` | Directories processed in parallel (capped at 64) |
| `workers` | `number \| "auto"` | `0` | Worker threads for parallel scanning (capped at 16) |
| `cache` | `boolean \| CacheOptions` | `false` | On-disk result cache for repeated searches |
| `signal` | `AbortSignal` | `undefined` | Cancels the search |
| `ignore` | `string[]` | `[]` | Extra ignore patterns, supports `!` and trailing `/` |
| `useDefaultIgnores` | `boolean` | `true` | Apply the built-in ignore list |
| `timeoutMs` | `number` | `undefined` | Fail with `SearchTimeoutError` after the given time |
| `onProgress` | `(progress: Progress) => void` | `undefined` | Periodic traversal statistics |
| `onSkip` | `(event: SkipEvent) => void` | `undefined` | Called for unreadable paths |

`Progress` contains `visitedDirs`, `visitedEntries`, `currentPath`, `elapsedMs` and `matches`.
`SkipEvent` contains `path`, `code` and `message`.

### Matching modes

```js
await find("README.md");                                   // exact
await find("*.md", { match: "glob" });                     // glob, * and ** supported
await find("^readme\\.md$", { match: "regex" });           // regular expression
```

`target` must be a name, not a path, for `exact` and `glob` modes. `regex` targets may contain
escapes such as `\.`.

### Default roots

- **Windows:** every accessible drive letter (`A:/` to `Z:/`), probed with a 250 ms timeout so that
  disconnected network drives and optical drives cannot stall the search.
- **POSIX:** `/`. Pseudo file systems `/proc`, `/sys`, `/dev` and `/run` are skipped.

### Default ignores

`node_modules`, `.git`, `.hg`, `.svn`, `$Recycle.Bin`, `System Volume Information`, `.Trash`,
`.Trashes` and `lost+found`. System directories such as `C:\Windows` and `Program Files` are **not**
ignored by default so that the "find anywhere" contract holds. Disable the list with
`useDefaultIgnores: false` or extend it with `ignore`.

Patterns are evaluated in order and the last matching pattern wins:

- a pattern without a slash matches the entry name;
- a pattern with a slash matches an absolute path prefix;
- a leading `!` re-includes a previously ignored entry;
- a trailing `/` restricts the pattern to directories;
- `*`, `**` and `?` are supported.

```js
await findAll("*.log", {
    ignore: ["**/cache", "C:/Windows/Temp", "*.log", "!important.log"],
});
```

A negated pattern cannot re-include an entry inside a directory that was already ignored, because
ignored directories are never traversed.

### Cancellation, timeout and progress

```js
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

const result = await find("big.iso", {
    signal: controller.signal,
    timeoutMs: 30_000,
    onProgress: ({ visitedDirs, elapsedMs }) => {
        console.log(`${visitedDirs} directories in ${elapsedMs} ms`);
    },
});
```

`signal` and `timeoutMs` are checked before every directory and every entry, so cancellation is
responsive even on large trees.

### Error handling

Unreadable paths (`EACCES`, `EPERM`, `EBUSY`, `ENOENT`, `ELOOP`, `ENOTDIR` and similar) never abort a
scan. They are reported through `onSkip` when provided:

```js
await findAll("config.json", {
    onSkip: ({ path, code }) => console.warn(`skipped ${path}: ${code}`),
});
```

Invalid input is rejected with a `TypeError` or `RangeError`. A timeout throws
`SearchTimeoutError`, an aborted search rejects with the abort reason.

### Limits and performance

See [PERFORMANCE.md](PERFORMANCE.md) for reproducible benchmarks and tuning guidance.

- `find` stops as soon as the first match is found.
- `findAll` returns all matches unless `limit` is set.
- `maxDepth` bounds traversal when the target is known to be shallow.
- Directories are read with `readdir(..., { withFileTypes: true })`, so entry types come from a
  single syscall.
- The walker uses an explicit stack and a bounded worker pool, so deep trees do not overflow the
  call stack.
- Scanning an entire drive is I/O bound. On spinning disks it can take minutes; use `roots`,
  `maxDepth`, `ignore` and `signal` to keep it predictable.

### Parallel scanning

Set `workers` to split subdirectories of every root across worker threads:

```js
const results = await findAll("*.ts", { match: "glob", workers: 4 });
const automatic = await findAll("*.ts", { match: "glob", workers: "auto" });
```

- `0` (the default) keeps scanning on the main thread.
- `"auto"` selects up to four workers based on the CPU count.
- Direct root entries are evaluated on the main thread; subdirectories are distributed across workers.
- The worker count is capped at 16 and at the number of top-level subdirectories.
- Worker startup costs roughly 15-20 ms. On small trees serial scanning is faster; worker threads
  pay off on large or slow file systems. See [PERFORMANCE.md](PERFORMANCE.md).
- `onProgress` aggregates counters from all workers.
- `findSync` ignores `workers` because it is synchronous.
- Worker threads require the Node.js file loader, so the option is unavailable when the package is
  bundled into a single file by another bundler.

### Result cache

`cache` stores completed searches on disk:

```js
await find("report.pdf", { cache: { ttlMs: 60_000 } });
await find("report.pdf", { cache: true }); // served from the cache
```

- Disabled by default; `true` uses the OS temp directory, a 5 minute TTL and 200 files.
- The key covers roots, target, match mode, case sensitivity, include, `maxDepth`, `limit`, symlink
  policy and ignore patterns.
- Entries are individual JSON files written atomically and pruned by modification time.
- Cached paths can be stale until the TTL expires; use `clearCache()` to drop them immediately.
- `findSync` bypasses the cache, and a cache hit does not call `onProgress`.

## Benchmarks

Synthetic tree with 9,331 directories and 55,986 files on Windows 11, Intel Core Ultra 9 285K,
Node.js 24.22 and a local SSD. Median of five runs after one warmup; `find` with a non-existent name
performs a full scan. Methodology and reproduction steps are in [PERFORMANCE.md](PERFORMANCE.md).

| Scenario | Median | Dirs/s |
|---|---|---|
| serial, `concurrency: 1` | 482.9 ms | 19,324 |
| serial, `concurrency: 4` | 134.2 ms | 69,532 |
| serial, `concurrency: 16` (default) | 114.7 ms | 81,340 |
| serial, `concurrency: 32` | 114.4 ms | 81,535 |
| `workers: 2` | 96.0 ms | 97,219 |
| `workers: 4` | 95.0 ms | 98,249 |
| `workers: 8` | 95.8 ms | 97,418 |
| `find` hit, serial | 83.0 ms | — |
| `find` hit, `workers: 4` | 58.2 ms | — |
| cache miss | 115.2 ms | — |
| cache hit | 0.2 ms | — |

On a 1,555-directory tree the same settings take 18.1 ms serial versus 35.9 ms with four workers.
Worker startup costs about 19 ms and only pays off beyond roughly 3,000-5,000 directories.

Practical defaults:

- `concurrency: 16` sits at the plateau; values from 8 to 32 are equivalent.
- Keep `workers: 0` for small or unknown trees and use `workers: 2`-`4` or `"auto"` for large scans.
- Enable `cache` for repeated identical queries; a cache hit is roughly 659x faster than a cold scan.

## Platform notes

- Case sensitivity follows the platform by default. Override it with `caseSensitive`.
- Symbolic links and Windows junctions are matched as entries but are not traversed unless
  `followSymlinks` is enabled. Cycles are prevented with a real path set.
- Network drives and optical drives are probed with a timeout during automatic root detection.
- `findSync` performs the same traversal synchronously, including drive probing.

## Migration from 1.x

See [MIGRATION.md](MIGRATION.md). Version 2.0.0 is a breaking release: `find` is asynchronous and the
`"Unsupported OS"` return value is gone.

## Contact

| Type           | Detail                                      |
|----------------|---------------------------------------------|
| Email          | paolofernetti@yandex.ru                     |
| Github Profile | https://github.com/PaoloFernetti            |
| Repository     | https://github.com/PaoloFernetti/fsfind.git |
