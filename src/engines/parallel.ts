import fs from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { MAX_WORKERS } from "../constants.js";
import type { Progress, ResolvedOptions, SkipEvent } from "../types.js";
import {
    getErrorCode,
    getErrorMessage,
    isSkippableError,
    SearchTimeoutError,
} from "../utils/errors.js";
import type { IgnoreMatcher } from "../utils/ignore.js";
import type { Matcher } from "./matcher.js";
import type { WalkRequest } from "./walker.js";
import type { WorkerCommand, WorkerConfig, WorkerMessage, WorkerTask } from "./worker-protocol.js";
import { deserializeError } from "./worker-protocol.js";

interface SplitResult {
    matches: string[];
    tasks: WorkerTask[];
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

async function inspectRoot(
    root: string,
    options: ResolvedOptions,
    matcher: Matcher,
    isIgnored: IgnoreMatcher,
): Promise<{ matches: string[]; dirs: string[] }> {
    let entries: Dirent[];

    try {
        entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch (error) {
        if (isSkippableError(error)) {
            reportSkip(options, root, error);
            return { matches: [], dirs: [] };
        }

        throw error;
    }

    const matches: string[] = [];
    const dirs: string[] = [];

    for (const dirent of entries) {
        options.signal?.throwIfAborted();

        const name = dirent.name;
        const fullPath = path.join(root, name);
        const isLink = dirent.isSymbolicLink();
        let isDirectory = dirent.isDirectory();
        let matchesAsFile = dirent.isFile();

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
            } else {
                isDirectory = false;
                matchesAsFile = true;
            }
        }

        if (isIgnored(fullPath, name, isDirectory)) {
            continue;
        }

        const included =
            (isDirectory && options.include.dirs) || (matchesAsFile && options.include.files);

        if (included && matcher(name)) {
            matches.push(fullPath);
        }

        if (isDirectory && 1 <= options.maxDepth) {
            dirs.push(fullPath);
        }
    }

    return { matches, dirs };
}

/**
 * Evaluates direct entries of every root and turns their subdirectories into
 * independent worker tasks. Depth is preserved so `maxDepth` keeps the same
 * meaning in serial and parallel modes.
 */
async function splitRoots(
    options: ResolvedOptions,
    matcher: Matcher,
    isIgnored: IgnoreMatcher,
): Promise<SplitResult> {
    const matches: string[] = [];
    const tasks: WorkerTask[] = [];

    for (const root of options.roots) {
        options.signal?.throwIfAborted();

        const result = await inspectRoot(root, options, matcher, isIgnored);
        matches.push(...result.matches);

        if (matches.length >= options.limit) {
            break;
        }

        for (const dir of result.dirs) {
            tasks.push({ root: dir, startDepth: 1 });
        }
    }

    return { matches: matches.slice(0, options.limit), tasks };
}

function resolveWorkerFile(): string {
    if (typeof __filename !== "string") {
        throw new Error("parallel scanning requires the Node.js file system loader");
    }

    const extension = __filename.endsWith(".mjs") ? "worker.mjs" : "worker.js";
    return path.join(path.dirname(__filename), extension);
}

/**
 * Parallel variant of `walk`. Direct root entries are evaluated on the main
 * thread, subdirectories are distributed across a pool of worker threads.
 * Workers stream matches, progress and skipped paths back to the main thread.
 */
export async function walkParallel(request: WalkRequest, workers: number): Promise<string[]> {
    const { options, matcher, isIgnored } = request;
    const timeoutMs = options.timeoutMs;
    const deadline = timeoutMs !== undefined ? Date.now() + timeoutMs : undefined;

    options.signal?.throwIfAborted();

    const split = await splitRoots(options, matcher, isIgnored);
    const results = split.matches.slice(0, options.limit);

    if (results.length >= options.limit || split.tasks.length === 0) {
        return results;
    }

    if (deadline !== undefined && Date.now() >= deadline) {
        throw new SearchTimeoutError(timeoutMs ?? 0);
    }

    const workerCount = Math.max(1, Math.min(workers, split.tasks.length, MAX_WORKERS));
    const config: WorkerConfig = {
        target: request.target,
        match: options.match,
        caseSensitive: options.caseSensitive,
        include: options.include,
        maxDepth: options.maxDepth,
        followSymlinks: options.followSymlinks,
        concurrency: options.concurrency,
        ignore: [...options.ignore],
    };

    const queue = [...split.tasks];
    const workerFile = resolveWorkerFile();

    return await new Promise<string[]>((resolve, reject) => {
        const workersList: Worker[] = [];
        const progressByWorker = new Map<number, Progress>();

        let activeTasks = 0;
        let completedTasks = 0;
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const cleanup = (): void => {
            if (timer !== undefined) {
                clearTimeout(timer);
            }

            options.signal?.removeEventListener("abort", onAbort);

            for (const worker of workersList) {
                void worker.terminate();
            }
        };

        const settle = (error?: unknown): void => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();

            if (error !== undefined) {
                reject(error);
                return;
            }

            resolve(results.slice(0, options.limit));
        };

        const onAbort = (): void => {
            settle(options.signal?.reason ?? new Error("search aborted"));
        };

        const emitProgress = (latest: Progress): void => {
            if (options.onProgress === undefined) {
                return;
            }

            let visitedDirs = 0;
            let visitedEntries = 0;
            let elapsedMs = 0;

            for (const progress of progressByWorker.values()) {
                visitedDirs += progress.visitedDirs;
                visitedEntries += progress.visitedEntries;
                elapsedMs = Math.max(elapsedMs, progress.elapsedMs);
            }

            options.onProgress({
                visitedDirs,
                visitedEntries,
                currentPath: latest.currentPath,
                elapsedMs,
                matches: results.length,
            });
        };

        const assignNext = (worker: Worker): void => {
            if (settled) {
                return;
            }

            const task = queue.shift();

            if (task === undefined) {
                worker.postMessage({ type: "shutdown" } satisfies WorkerCommand);
                return;
            }

            activeTasks += 1;
            worker.postMessage({ type: "task", task } satisfies WorkerCommand);
        };

        const handleMessage = (index: number, worker: Worker, message: WorkerMessage): void => {
            if (settled) {
                return;
            }

            switch (message.type) {
                case "match":
                    results.push(message.path);

                    if (results.length >= options.limit) {
                        settle();
                    }

                    return;
                case "progress":
                    progressByWorker.set(index, message.progress);
                    emitProgress(message.progress);
                    return;
                case "skip":
                    options.onSkip?.(message.event);
                    return;
                case "task-done":
                    activeTasks -= 1;
                    completedTasks += 1;
                    assignNext(worker);

                    if (completedTasks === split.tasks.length && activeTasks === 0) {
                        settle();
                    }

                    return;
                case "error":
                    settle(deserializeError(message.error));
                    return;
            }
        };

        if (options.signal !== undefined) {
            options.signal.addEventListener("abort", onAbort, { once: true });
        }

        if (deadline !== undefined) {
            timer = setTimeout(
                () => settle(new SearchTimeoutError(timeoutMs ?? 0)),
                Math.max(0, deadline - Date.now()),
            );
        }

        try {
            for (let index = 0; index < workerCount; index += 1) {
                const worker = new Worker(workerFile, { workerData: config });
                workersList.push(worker);

                worker.on("message", (message: WorkerMessage) => {
                    handleMessage(index, worker, message);
                });
                worker.on("error", (error) => {
                    settle(error);
                });
                worker.on("exit", (code) => {
                    if (!settled && code !== 0) {
                        settle(new Error(`worker exited with code ${code}`));
                    }
                });

                assignNext(worker);
            }
        } catch (error) {
            settle(error);
        }
    });
}
