import type { MatchMode, Progress, ResolvedInclude, SkipEvent } from "../types.js";

/** Serializable configuration sent to every worker through `workerData`. */
export interface WorkerConfig {
    target: string;
    match: MatchMode;
    caseSensitive: boolean;
    include: ResolvedInclude;
    maxDepth: number;
    followSymlinks: boolean;
    concurrency: number;
    ignore: string[];
}

/** A subtree assigned to a worker. */
export interface WorkerTask {
    root: string;
    startDepth: number;
}

export type WorkerCommand = { type: "task"; task: WorkerTask } | { type: "shutdown" };

export interface SerializedError {
    name: string;
    message: string;
    stack: string | undefined;
}

export type WorkerMessage =
    | { type: "match"; path: string }
    | { type: "progress"; progress: Progress }
    | { type: "skip"; event: SkipEvent }
    | { type: "task-done" }
    | { type: "error"; error: SerializedError };

export function serializeError(error: unknown): SerializedError {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    return {
        name: "Error",
        message: String(error),
        stack: undefined,
    };
}

export function deserializeError(error: SerializedError): Error {
    const result = new Error(error.message);
    result.name = error.name;

    if (error.stack !== undefined) {
        result.stack = error.stack;
    }

    return result;
}
