import os from "node:os";

import { resolveCacheOptions } from "./cache.js";
import {
    DEFAULT_CONCURRENCY,
    DEFAULT_IGNORED_DIRS,
    MAX_AUTO_WORKERS,
    MAX_WORKERS,
    POSIX_IGNORED_PATHS,
} from "./constants.js";
import type { FinderOptions, MatchMode, ResolvedOptions } from "./types.js";

const MATCH_MODES: readonly MatchMode[] = ["exact", "glob", "regex"];

export function defaultCaseSensitive(): boolean {
    return process.platform !== "win32" && process.platform !== "darwin";
}

function resolveWorkers(workers: number | "auto" | undefined): number {
    if (workers === undefined) {
        return 0;
    }

    if (workers === "auto") {
        return Math.max(1, Math.min(os.cpus().length - 1, MAX_AUTO_WORKERS));
    }

    if (typeof workers !== "number" || !Number.isInteger(workers) || workers < 0) {
        throw new RangeError('workers must be a non-negative integer or "auto"');
    }

    return Math.min(workers, MAX_WORKERS);
}

/**
 * Merges user options with defaults and validates numeric ranges.
 * Roots are resolved separately because auto-detection is asynchronous.
 */
export function resolveOptions(
    options: FinderOptions,
    roots: string[],
    defaultLimit: number,
): ResolvedOptions {
    const match = options.match ?? "exact";

    if (!MATCH_MODES.includes(match)) {
        throw new TypeError(`unsupported match mode: ${String(match)}`);
    }

    const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
    if (!(maxDepth >= 0)) {
        throw new RangeError("maxDepth must be a non-negative number");
    }

    const limit = options.limit ?? defaultLimit;
    if (!(limit >= 1)) {
        throw new RangeError("limit must be at least 1");
    }

    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    if (!(concurrency >= 1)) {
        throw new RangeError("concurrency must be at least 1");
    }

    const workers = resolveWorkers(options.workers);

    const timeoutMs = options.timeoutMs;
    if (timeoutMs !== undefined && !(timeoutMs > 0)) {
        throw new RangeError("timeoutMs must be greater than 0");
    }

    const useDefaultIgnores = options.useDefaultIgnores ?? true;
    const ignore = [
        ...(useDefaultIgnores ? DEFAULT_IGNORED_DIRS : []),
        ...(useDefaultIgnores && process.platform !== "win32" ? POSIX_IGNORED_PATHS : []),
        ...(options.ignore ?? []),
    ];

    return {
        roots,
        match,
        caseSensitive: options.caseSensitive ?? defaultCaseSensitive(),
        include: {
            files: options.include?.files ?? true,
            dirs: options.include?.dirs ?? true,
        },
        maxDepth,
        limit,
        followSymlinks: options.followSymlinks ?? false,
        concurrency,
        workers,
        cache: resolveCacheOptions(options.cache),
        ignore,
        timeoutMs,
        signal: options.signal,
        onProgress: options.onProgress,
        onSkip: options.onSkip,
    };
}
