# [2.0.0](https://github.com/PaoloFernetti/fsfind/compare/v1.1.1...v2.0.0) (2026-11-17)


### Features

* prepare the 2.0.0 release ([8b513f2](https://github.com/PaoloFernetti/fsfind/commit/8b513f2c37d9bc07d76a9a55a785aa72f822b0f5))


### BREAKING CHANGES

* find() is asynchronous and returns Promise<string | undefined>.
findSync() replaces the synchronous behavior, POSIX systems are searched from /
instead of returning "Unsupported OS", and CommonJS consumers receive named
exports with find as the default export.

## [1.1.1](https://github.com/PaoloFernetti/fsfind/compare/v1.1.0...v1.1.1) (2026-11-16)


### Bug Fixes

* **ci:** normalize line endings and verify release tokens ([0e098da](https://github.com/PaoloFernetti/fsfind/commit/0e098da79d7446f4fdf79b03233568c4d22b3592))

# [1.1.0](https://github.com/PaoloFernetti/fsfind/compare/v1.0.1...v1.1.0) (2025-11-22)


### Features

* replacing functions with class ([5a807a8](https://github.com/PaoloFernetti/fsfind/commit/5a807a89ffd1cd0d1d1f3c73ff42f9bd33cbd80a))

## [1.0.1](https://github.com/PaoloFernetti/fsfind/compare/v1.0.0...v1.0.1) (2024-06-22)


### Bug Fixes

* renaming package with scope ([4948ebe](https://github.com/PaoloFernetti/fsfind/commit/4948ebef9cbdea2701022938cf42df488c5cf8c0))

# 1.0.0 (2024-06-22)


### Features

* added method to find file or directory ([8ff20c7](https://github.com/PaoloFernetti/fsfind/commit/8ff20c744e88603f93cb3fddbbdbe90850ec7be2))
