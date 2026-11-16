import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { clearCache, findAll, find } from "../dist/es/index.mjs";

const WIDTH = Number(process.env.BENCH_WIDTH ?? 6);
const DEPTH = Number(process.env.BENCH_DEPTH ?? 4);
const FILES = Number(process.env.BENCH_FILES ?? 6);
const RUNS = Number(process.env.BENCH_RUNS ?? 3);

function createTree(root) {
    const queue = [{ dir: root, depth: 0 }];
    let dirs = 0;
    let files = 0;

    while (queue.length > 0) {
        const current = queue.pop();

        if (current === undefined) {
            break;
        }

        dirs += 1;

        for (let index = 0; index < FILES; index += 1) {
            fs.writeFileSync(path.join(current.dir, `file-${index}.txt`), "x");
            files += 1;
        }

        if (current.depth >= DEPTH) {
            continue;
        }

        for (let index = 0; index < WIDTH; index += 1) {
            const child = path.join(current.dir, `d${current.depth}-${index}`);
            fs.mkdirSync(child);
            queue.push({ dir: child, depth: current.depth + 1 });
        }
    }

    return { dirs, files };
}

function deepLeaf(root) {
    let current = root;

    for (let level = 0; level < DEPTH; level += 1) {
        current = path.join(current, `d${level}-0`);
    }

    return current;
}

function summarize(label, samples, metadata) {
    samples.sort((left, right) => left - right);
    const median = samples[Math.floor(samples.length / 2)];

    return {
        label,
        median,
        dirsPerSecond: Math.round(metadata.dirs / (median / 1000)),
        filesPerSecond: Math.round(metadata.files / (median / 1000)),
    };
}

async function measure(label, run, metadata) {
    await run();

    const samples = [];

    for (let index = 0; index < RUNS; index += 1) {
        const startedAt = performance.now();
        await run();
        samples.push(performance.now() - startedAt);
    }

    return summarize(label, samples, metadata);
}

async function measureColdCache(label, run, metadata) {
    const samples = [];

    for (let index = 0; index < RUNS; index += 1) {
        await clearCache({ dir: cacheDir });
        const startedAt = performance.now();
        await run();
        samples.push(performance.now() - startedAt);
    }

    return summarize(label, samples, metadata);
}

function printTable(title, rows) {
    console.log(`\n${title}`);
    console.log("-".repeat(78));
    console.log(
        `${"scenario".padEnd(30)}${"median ms".padStart(12)}${"dirs/s".padStart(14)}${"files/s".padStart(16)}`,
    );

    for (const row of rows) {
        console.log(
            `${row.label.padEnd(30)}${row.median.toFixed(1).padStart(12)}${String(row.dirsPerSecond).padStart(14)}${String(row.filesPerSecond).padStart(16)}`,
        );
    }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "fsfind-bench-"));
const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "fsfind-bench-cache-"));

try {
    const createdAt = performance.now();
    const tree = createTree(root);
    const createMs = performance.now() - createdAt;
    const leaf = deepLeaf(root);
    const targetName = "bench-target-unique.txt";
    fs.writeFileSync(path.join(leaf, targetName), "x");

    const missing = "bench-missing-unique.txt";
    const base = { roots: [root], caseSensitive: true, useDefaultIgnores: false };

    console.log(
        `tree: ${tree.dirs} dirs, ${tree.files} files, width ${WIDTH}, depth ${DEPTH}, created in ${createMs.toFixed(0)} ms`,
    );
    console.log(`runs per scenario: ${RUNS} (median reported, one warmup run skipped)`);

    const serialRows = [];

    for (const concurrency of [1, 4, 8, 16, 32, 64]) {
        serialRows.push(
            await measure(
                `serial concurrency=${concurrency}`,
                () => find(missing, { ...base, concurrency }),
                tree,
            ),
        );
    }

    printTable("Full scan without worker threads (find, no match)", serialRows);

    const parallelRows = [];

    for (const workers of [2, 4, 8]) {
        parallelRows.push(
            await measure(
                `workers=${workers} concurrency=16`,
                () => find(missing, { ...base, workers, concurrency: 16 }),
                tree,
            ),
        );
    }

    printTable("Full scan with worker threads (find, no match)", parallelRows);

    const parallelConcurrencyRows = [];

    for (const concurrency of [4, 8, 16, 32]) {
        parallelConcurrencyRows.push(
            await measure(
                `workers=4 concurrency=${concurrency}`,
                () => find(missing, { ...base, workers: 4, concurrency }),
                tree,
            ),
        );
    }

    printTable("Worker threads: per-worker concurrency", parallelConcurrencyRows);

    const hitRows = [];

    hitRows.push(
        await measure(
            "serial find hit",
            () => find(targetName, { ...base, concurrency: 16 }),
            tree,
        ),
    );
    hitRows.push(
        await measure(
            "parallel find hit",
            () => find(targetName, { ...base, workers: 4, concurrency: 16 }),
            tree,
        ),
    );

    printTable("Early exit on the first match", hitRows);

    const cacheRows = [];
    const cacheOptions = { ...base, cache: { dir: cacheDir, ttlMs: 60_000 } };

    cacheRows.push(
        await measureColdCache(
            "cache miss (findAll)",
            () => findAll(targetName, cacheOptions),
            tree,
        ),
    );

    await findAll(targetName, cacheOptions);
    cacheRows.push(
        await measure("cache hit (findAll)", () => findAll(targetName, cacheOptions), tree),
    );

    printTable("Result cache", cacheRows);

    const serialScan = serialRows.find((row) => row.label === "serial concurrency=32");
    const cacheHit = cacheRows[1];

    if (serialScan !== undefined && cacheHit !== undefined) {
        console.log(
            `\ncache hit is ${(serialScan.median / cacheHit.median).toFixed(0)}x faster than a cold serial scan`,
        );
    }

    const tinyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fsfind-bench-tiny-"));
    fs.mkdirSync(path.join(tinyRoot, "empty"));
    const tiny = { roots: [tinyRoot], caseSensitive: true, useDefaultIgnores: false };

    const overheadRows = [
        await measure("tiny serial", () => find(missing, tiny), { dirs: 2, files: 0 }),
        await measure("tiny workers=4", () => find(missing, { ...tiny, workers: 4 }), {
            dirs: 2,
            files: 0,
        }),
    ];

    fs.rmSync(tinyRoot, { recursive: true, force: true });

    printTable("Worker startup overhead on a tiny tree", overheadRows);
} finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(cacheDir, { recursive: true, force: true });
}
