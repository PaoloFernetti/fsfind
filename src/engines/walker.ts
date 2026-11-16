import fs from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";

import { MAX_CONCURRENCY, PROGRESS_THROTTLE_MS } from "../constants.js";
import type { Progress, ResolvedOptions, SkipEvent } from "../types.js";
import {
    getErrorCode,
    getErrorMessage,
    isSkippableError,
    SearchTimeoutError,
} from "../utils/errors.js";
import type { IgnoreMatcher } from "../utils/ignore.js";
import type { Matcher } from "./matcher.js";

export interface WalkRequest {
    target: string;
    options: ResolvedOptions;
    matcher: Matcher;
    isIgnored: IgnoreMatcher;
    /** Depth assigned to the initial roots, used when a worker receives a subtree. */
    startDepth?: number;
    /** When `false`, matches are delivered through `onMatch` instead of the result array. */
    collect?: boolean;
    /** Called for every match. Returning `false` stops the traversal. */
    onMatch?: (matchPath: string) => boolean;
}

interface QueueEntry {
    dir: string;
    depth: number;
}

interface WalkState {
    visitedDirs: number;
    visitedEntries: number;
    lastProgressAt: number;
    startedAt: number;
}

function createState(): WalkState {
    return {
        visitedDirs: 0,
        visitedEntries: 0,
        lastProgressAt: 0,
        startedAt: Date.now(),
    };
}

function ensureRunning(options: ResolvedOptions, state: WalkState): void {
    options.signal?.throwIfAborted();

    if (options.timeoutMs !== undefined && Date.now() - state.startedAt >= options.timeoutMs) {
        throw new SearchTimeoutError(options.timeoutMs);
    }
}

function reportSkip(options: ResolvedOptions, targetPath: string, error: unknown): void {
    if (options.onSkip === undefined) {
        return;
    }

    const event: SkipEvent = {
        path: targetPath,
        code: getErrorCode(error) ?? "UNKNOWN",
        message: getErrorMessage(error),
    };

    options.onSkip(event);
}

function reportProgress(
    options: ResolvedOptions,
    state: WalkState,
    currentPath: string,
    matches: number,
    force: boolean,
): void {
    if (options.onProgress === undefined) {
        return;
    }

    const now = Date.now();
    if (!force && now - state.lastProgressAt < PROGRESS_THROTTLE_MS) {
        return;
    }

    state.lastProgressAt = now;

    const progress: Progress = {
        visitedDirs: state.visitedDirs,
        visitedEntries: state.visitedEntries,
        currentPath,
        elapsedMs: now - state.startedAt,
        matches,
    };

    options.onProgress(progress);
}

function canDescend(options: ResolvedOptions, entry: QueueEntry): boolean {
    return entry.depth + 1 <= options.maxDepth;
}

/**
 * Asynchronous traversal. Directories are processed by a bounded worker pool,
 * the work queue is an explicit LIFO stack and every result is checked against
 * the abort signal, the timeout and the result limit.
 */
export async function walk(request: WalkRequest): Promise<string[]> {
    const { options, matcher, isIgnored } = request;
    const startDepth = request.startDepth ?? 0;
    const collect = request.collect ?? true;
    const state = createState();
    const results: string[] = [];
    const stack: QueueEntry[] = options.roots.map((dir) => ({ dir, depth: startDepth }));
    const visitedRealPaths = new Set<string>();
    const sleepers: Array<() => void> = [];

    let matchCount = 0;
    let activeTasks = 0;
    let stopped = false;
    let failure: unknown;

    if (options.followSymlinks) {
        for (const root of options.roots) {
            try {
                visitedRealPaths.add(await fs.promises.realpath(root));
            } catch (error) {
                if (isSkippableError(error)) {
                    reportSkip(options, root, error);
                } else {
                    throw error;
                }
            }
        }
    }

    const wake = (): void => {
        for (const resolve of sleepers.splice(0, sleepers.length)) {
            resolve();
        }
    };

    const processDirectory = async (entry: QueueEntry): Promise<void> => {
        ensureRunning(options, state);

        let entries: Dirent[];

        try {
            entries = await fs.promises.readdir(entry.dir, { withFileTypes: true });
        } catch (error) {
            if (isSkippableError(error)) {
                reportSkip(options, entry.dir, error);
                return;
            }

            throw error;
        }

        state.visitedDirs += 1;

        for (const dirent of entries) {
            if (stopped) {
                return;
            }

            ensureRunning(options, state);

            const name = dirent.name;
            const fullPath = path.join(entry.dir, name);
            state.visitedEntries += 1;

            const isLink = dirent.isSymbolicLink();
            let isDirectory = dirent.isDirectory();
            let matchesAsFile = dirent.isFile();

            if (isIgnored(fullPath, name, isDirectory)) {
                continue;
            }

            if (isLink) {
                if (options.followSymlinks) {
                    try {
                        const stats = await fs.promises.stat(fullPath);
                        isDirectory = stats.isDirectory();
                        matchesAsFile = stats.isFile();
                    } catch (error) {
                        if (isSkippableError(error)) {
                            reportSkip(options, fullPath, error);
                            continue;
                        }

                        throw error;
                    }

                    if (stopped) {
                        return;
                    }
                } else {
                    isDirectory = false;
                    matchesAsFile = true;
                }
            }

            const included =
                (isDirectory && options.include.dirs) || (matchesAsFile && options.include.files);

            if (included && matcher(name)) {
                if (stopped) {
                    return;
                }

                matchCount += 1;
                if (collect) {
                    results.push(fullPath);
                }
                reportProgress(options, state, fullPath, matchCount, true);

                if (request.onMatch !== undefined && request.onMatch(fullPath) === false) {
                    stopped = true;
                    return;
                }

                if (collect && results.length >= options.limit) {
                    stopped = true;
                    return;
                }
            }

            if (!isDirectory || !canDescend(options, entry)) {
                continue;
            }

            if (options.followSymlinks) {
                try {
                    const realPath = await fs.promises.realpath(fullPath);
                    if (visitedRealPaths.has(realPath)) {
                        continue;
                    }

                    visitedRealPaths.add(realPath);
                } catch (error) {
                    if (isSkippableError(error)) {
                        reportSkip(options, fullPath, error);
                        continue;
                    }

                    throw error;
                }

                if (stopped) {
                    return;
                }
            }

            stack.push({ dir: fullPath, depth: entry.depth + 1 });
        }

        reportProgress(options, state, entry.dir, matchCount, false);
    };

    const worker = async (): Promise<void> => {
        for (;;) {
            if (stopped || failure !== undefined) {
                return;
            }

            const next = stack.pop();

            if (next === undefined) {
                if (activeTasks === 0) {
                    return;
                }

                await new Promise<void>((resolve) => {
                    sleepers.push(resolve);
                });
                continue;
            }

            activeTasks += 1;

            try {
                await processDirectory(next);
            } catch (error) {
                failure = error;
                stopped = true;
                wake();
                return;
            } finally {
                activeTasks -= 1;
                wake();
            }
        }
    };

    const workerCount = Math.max(1, Math.min(Math.floor(options.concurrency), MAX_CONCURRENCY));
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    if (failure !== undefined) {
        throw failure;
    }

    return results.slice(0, options.limit);
}

/**
 * Synchronous variant used by `findSync`. Prefer `find`/`findAll` in
 * applications because this implementation blocks the event loop.
 */
export function walkSync(request: WalkRequest): string[] {
    const { options, matcher, isIgnored } = request;
    const startDepth = request.startDepth ?? 0;
    const collect = request.collect ?? true;
    const state = createState();
    const results: string[] = [];
    const stack: QueueEntry[] = options.roots.map((dir) => ({ dir, depth: startDepth }));
    const visitedRealPaths = new Set<string>();
    let matchCount = 0;

    if (options.followSymlinks) {
        for (const root of options.roots) {
            try {
                visitedRealPaths.add(fs.realpathSync(root));
            } catch (error) {
                if (isSkippableError(error)) {
                    reportSkip(options, root, error);
                } else {
                    throw error;
                }
            }
        }
    }

    while (stack.length > 0) {
        ensureRunning(options, state);

        const entry = stack.pop();
        if (entry === undefined) {
            break;
        }

        let entries: Dirent[];

        try {
            entries = fs.readdirSync(entry.dir, { withFileTypes: true });
        } catch (error) {
            if (isSkippableError(error)) {
                reportSkip(options, entry.dir, error);
                continue;
            }

            throw error;
        }

        state.visitedDirs += 1;

        for (const dirent of entries) {
            ensureRunning(options, state);

            const name = dirent.name;
            const fullPath = path.join(entry.dir, name);
            state.visitedEntries += 1;

            const isLink = dirent.isSymbolicLink();
            let isDirectory = dirent.isDirectory();
            let matchesAsFile = dirent.isFile();

            if (isIgnored(fullPath, name, isDirectory)) {
                continue;
            }

            if (isLink) {
                if (options.followSymlinks) {
                    try {
                        const stats = fs.statSync(fullPath);
                        isDirectory = stats.isDirectory();
                        matchesAsFile = stats.isFile();
                    } catch (error) {
                        if (isSkippableError(error)) {
                            reportSkip(options, fullPath, error);
                            continue;
                        }

                        throw error;
                    }
                } else {
                    isDirectory = false;
                    matchesAsFile = true;
                }
            }

            const included =
                (isDirectory && options.include.dirs) || (matchesAsFile && options.include.files);

            if (included && matcher(name)) {
                matchCount += 1;
                if (collect) {
                    results.push(fullPath);
                }
                reportProgress(options, state, fullPath, matchCount, true);

                if (request.onMatch !== undefined && request.onMatch(fullPath) === false) {
                    return results.slice(0, options.limit);
                }

                if (collect && results.length >= options.limit) {
                    return results.slice(0, options.limit);
                }
            }

            if (!isDirectory || !canDescend(options, entry)) {
                continue;
            }

            if (options.followSymlinks) {
                try {
                    const realPath = fs.realpathSync(fullPath);
                    if (visitedRealPaths.has(realPath)) {
                        continue;
                    }

                    visitedRealPaths.add(realPath);
                } catch (error) {
                    if (isSkippableError(error)) {
                        reportSkip(options, fullPath, error);
                        continue;
                    }

                    throw error;
                }
            }

            stack.push({ dir: fullPath, depth: entry.depth + 1 });
        }

        reportProgress(options, state, entry.dir, matchCount, false);
    }

    return results.slice(0, options.limit);
}
