import { createHash } from "node:crypto";
import fs from "node:fs";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";

import { DEFAULT_CACHE_MAX_ENTRIES, DEFAULT_CACHE_TTL_MS } from "./constants.js";
import type { CacheOptions, ResolvedCacheOptions, ResolvedOptions } from "./types.js";

interface CacheEntry {
    version: number;
    key: string;
    createdAt: number;
    expiresAt: number;
    results: string[];
}

const CACHE_VERSION = 1;

export function resolveCacheOptions(
    cache: boolean | CacheOptions | undefined,
): ResolvedCacheOptions | undefined {
    if (cache === undefined || cache === false) {
        return undefined;
    }

    const config = cache === true ? {} : cache;
    const ttlMs = config.ttlMs ?? DEFAULT_CACHE_TTL_MS;

    if (!(ttlMs > 0)) {
        throw new RangeError("cache.ttlMs must be greater than 0");
    }

    const maxEntries = config.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES;
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
        throw new RangeError("cache.maxEntries must be a positive integer");
    }

    return {
        dir:
            config.dir !== undefined
                ? path.resolve(config.dir)
                : path.join(os.tmpdir(), "fsfind-cache"),
        ttlMs,
        maxEntries,
    };
}

function normalizeRoot(root: string): string {
    const resolved = path.resolve(root);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function numberKey(value: number): number | "inf" {
    return Number.isFinite(value) ? value : "inf";
}

/**
 * Builds a stable cache key from every option that can change the result set.
 * Worker count, concurrency and callbacks are intentionally excluded.
 */
export function createCacheKey(options: ResolvedOptions, target: string): string {
    const payload = {
        version: CACHE_VERSION,
        platform: process.platform,
        target,
        match: options.match,
        caseSensitive: options.caseSensitive,
        include: options.include,
        maxDepth: numberKey(options.maxDepth),
        limit: numberKey(options.limit),
        followSymlinks: options.followSymlinks,
        ignore: options.ignore,
        roots: [...options.roots].map(normalizeRoot).sort(),
    };

    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function cacheFile(options: ResolvedCacheOptions, key: string): string {
    return path.join(options.dir, `${key}.json`);
}

function isCacheEntry(value: unknown): value is CacheEntry {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const entry = value as Partial<CacheEntry>;

    return (
        entry.version === CACHE_VERSION &&
        typeof entry.key === "string" &&
        typeof entry.expiresAt === "number" &&
        Array.isArray(entry.results) &&
        entry.results.every((item: unknown) => typeof item === "string")
    );
}

export async function readCache(
    options: ResolvedCacheOptions,
    key: string,
): Promise<string[] | undefined> {
    try {
        const text = await fs.promises.readFile(cacheFile(options, key), "utf8");
        const parsed: unknown = JSON.parse(text);

        if (!isCacheEntry(parsed) || parsed.key !== key || parsed.expiresAt <= Date.now()) {
            return undefined;
        }

        return parsed.results;
    } catch {
        return undefined;
    }
}

async function prune(options: ResolvedCacheOptions): Promise<void> {
    let entries: Dirent[];

    try {
        entries = await fs.promises.readdir(options.dir, { withFileTypes: true });
    } catch {
        return;
    }

    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

    if (files.length <= options.maxEntries) {
        return;
    }

    const stats: Array<{ file: string; mtime: number }> = [];

    for (const entry of files) {
        const file = path.join(options.dir, entry.name);

        try {
            const info = await fs.promises.stat(file);
            stats.push({ file, mtime: info.mtimeMs });
        } catch {
            // The entry disappeared while pruning.
        }
    }

    stats.sort((left, right) => left.mtime - right.mtime);

    for (const item of stats.slice(0, Math.max(0, stats.length - options.maxEntries))) {
        try {
            await fs.promises.unlink(item.file);
        } catch {
            // Another process may have removed the file.
        }
    }
}

export async function writeCache(
    options: ResolvedCacheOptions,
    key: string,
    results: readonly string[],
): Promise<void> {
    const now = Date.now();
    const entry: CacheEntry = {
        version: CACHE_VERSION,
        key,
        createdAt: now,
        expiresAt: now + options.ttlMs,
        results: [...results],
    };
    const target = cacheFile(options, key);
    const temporary = `${target}.${process.pid}.${now}.tmp`;

    try {
        await fs.promises.mkdir(options.dir, { recursive: true });
        await fs.promises.writeFile(temporary, JSON.stringify(entry), "utf8");
        await fs.promises.rename(temporary, target);
        await prune(options);
    } catch {
        try {
            await fs.promises.unlink(temporary);
        } catch {
            // The temporary file was never created or was already renamed.
        }
    }
}

/**
 * Removes cached search results. Passing `false` is a no-op, `true` or no
 * argument clears the default cache directory.
 */
export async function clearCache(cache?: boolean | CacheOptions): Promise<void> {
    const resolved = resolveCacheOptions(cache ?? true);

    if (resolved === undefined) {
        return;
    }

    try {
        await fs.promises.rm(resolved.dir, { recursive: true, force: true });
    } catch {
        // Cache cleanup is best effort.
    }
}
