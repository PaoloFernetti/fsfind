# Migration guide: 1.x to 2.0.0

Version 2.0.0 is a breaking release focused on correctness, cross-platform support and long-running
scans.

## `find` is asynchronous

The synchronous singleton is replaced by named exports.

Before:

```js
const fsfind = require("@paolofernetti/fsfind");
const result = fsfind.find("report.pdf");
```

After:

```js
const { find } = require("@paolofernetti/fsfind");

const result = await find("report.pdf");
```

`find` now returns a `Promise<string | undefined>`.

## Synchronous usage moved to `findSync`

```js
import { findSync } from "@paolofernetti/fsfind";

const result = findSync("report.pdf");
```

`findSync` blocks the event loop for the whole scan. Prefer `find` in applications.

## Non-Windows systems are supported

Version 1.x returned the string `"Unsupported OS"` outside Windows. Version 2.0 searches from `/`
on POSIX systems and skips `/proc`, `/sys`, `/dev` and `/run`.

## Case sensitivity follows the platform

On Windows and macOS names are compared case-insensitively by default. Set `caseSensitive: true` to
restore the 1.x behavior:

```js
await find("README.md", { caseSensitive: true });
```

## CommonJS export shape

The package now exposes named exports. The default export is the `find` function:

```js
const fsfind = require("@paolofernetti/fsfind");

await fsfind.find("report.pdf");
await fsfind.default("report.pdf");
```

## `findAll` and per-call options

```js
import { findAll, createFinder } from "@paolofernetti/fsfind";

const results = await findAll("*.log", { match: "glob", limit: 100 });

const finder = createFinder({ roots: ["D:/projects"] });
const configs = await finder.findAll("tsconfig.json");
```

## Error handling

Unreadable directories no longer throw. They are skipped and can be observed through `onSkip`.
Invalid options throw `TypeError` or `RangeError`, and `timeoutMs` failures throw
`SearchTimeoutError`.

## Release note

Publish with a `BREAKING CHANGE:` footer so that `semantic-release` produces `2.0.0`.
