import { parentPort, workerData } from "node:worker_threads";
import type { MessagePort } from "node:worker_threads";

import type { ResolvedOptions } from "../types.js";
import { createIgnoreMatcher } from "../utils/ignore.js";
import { createMatcher } from "./matcher.js";
import { walk } from "./walker.js";
import type { WorkerCommand, WorkerConfig, WorkerMessage, WorkerTask } from "./worker-protocol.js";
import { serializeError } from "./worker-protocol.js";

function getPort(): MessagePort {
    if (parentPort === null) {
        throw new Error("fsfind worker must be started through worker_threads");
    }

    return parentPort;
}

const port = getPort();

const config = workerData as WorkerConfig;
const matcher = createMatcher(config.target, config.match, config.caseSensitive);
const isIgnored = createIgnoreMatcher(config.ignore, config.caseSensitive);

function post(message: WorkerMessage): void {
    port.postMessage(message);
}

function createOptions(task: WorkerTask): ResolvedOptions {
    return {
        roots: [task.root],
        match: config.match,
        caseSensitive: config.caseSensitive,
        include: config.include,
        maxDepth: config.maxDepth,
        limit: Number.POSITIVE_INFINITY,
        followSymlinks: config.followSymlinks,
        concurrency: config.concurrency,
        workers: 0,
        cache: undefined,
        ignore: config.ignore,
        timeoutMs: undefined,
        signal: undefined,
        onProgress: (progress) => post({ type: "progress", progress }),
        onSkip: (event) => post({ type: "skip", event }),
    };
}

async function runTask(task: WorkerTask): Promise<void> {
    try {
        await walk({
            target: config.target,
            options: createOptions(task),
            matcher,
            isIgnored,
            startDepth: task.startDepth,
            collect: false,
            onMatch: (matchPath) => {
                post({ type: "match", path: matchPath });
                return true;
            },
        });

        post({ type: "task-done" });
    } catch (error) {
        post({ type: "error", error: serializeError(error) });
    }
}

port.on("message", (message: WorkerCommand) => {
    if (message.type === "shutdown") {
        port.close();
        return;
    }

    void runTask(message.task);
});
