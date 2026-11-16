import { createCacheKey, readCache, writeCache } from "./cache.js";
import { createMatcher, validateTarget } from "./engines/matcher.js";
import { walkParallel } from "./engines/parallel.js";
import { resolveRoots, resolveRootsSync } from "./engines/roots.js";
import { walk, walkSync } from "./engines/walker.js";
import type { WalkRequest } from "./engines/walker.js";
import { resolveOptions } from "./options.js";
import type { FinderOptions } from "./types.js";
import { createIgnoreMatcher } from "./utils/ignore.js";

function mergeOptions(base: FinderOptions, override: FinderOptions | undefined): FinderOptions {
    if (override === undefined) {
        return base;
    }

    return { ...base, ...override };
}

/**
 * Reusable finder. Constructor options are used as defaults and can be
 * overridden per call. Per-call `include` and `ignore` values replace the
 * constructor values instead of being merged.
 */
export class FsFinder {
    private readonly options: FinderOptions;

    constructor(options: FinderOptions = {}) {
        this.options = { ...options };
    }

    async find(target: string, options?: FinderOptions): Promise<string | undefined> {
        const matches = await this.run(target, options, 1);
        return matches[0];
    }

    async findAll(target: string, options?: FinderOptions): Promise<string[]> {
        return this.run(target, options, Number.POSITIVE_INFINITY);
    }

    findSync(target: string, options?: FinderOptions): string | undefined {
        validateTarget(target);

        const merged = mergeOptions(this.options, options);
        const roots = resolveRootsSync(merged.roots);
        const resolved = resolveOptions(merged, roots, 1);
        const matcher = createMatcher(target, resolved.match, resolved.caseSensitive);
        const isIgnored = createIgnoreMatcher(resolved.ignore, resolved.caseSensitive);

        return walkSync({ target, options: resolved, matcher, isIgnored })[0];
    }

    private async run(
        target: string,
        options: FinderOptions | undefined,
        limit: number,
    ): Promise<string[]> {
        validateTarget(target);

        const merged = mergeOptions(this.options, options);
        const roots = await resolveRoots(merged.roots, merged.signal);
        const resolved = resolveOptions(merged, roots, limit);
        resolved.signal?.throwIfAborted();

        const matcher = createMatcher(target, resolved.match, resolved.caseSensitive);
        const isIgnored = createIgnoreMatcher(resolved.ignore, resolved.caseSensitive);
        const cacheKey =
            resolved.cache !== undefined ? createCacheKey(resolved, target) : undefined;

        if (cacheKey !== undefined && resolved.cache !== undefined) {
            const cached = await readCache(resolved.cache, cacheKey);

            if (cached !== undefined) {
                return cached;
            }
        }

        const request: WalkRequest = { target, options: resolved, matcher, isIgnored };
        const results =
            resolved.workers > 0
                ? await walkParallel(request, resolved.workers)
                : await walk(request);

        if (cacheKey !== undefined && resolved.cache !== undefined) {
            await writeCache(resolved.cache, cacheKey, results);
        }

        return results;
    }
}

export function createFinder(options: FinderOptions = {}): FsFinder {
    return new FsFinder(options);
}

/** Returns the first matching path or `undefined`. */
export function find(target: string, options?: FinderOptions): Promise<string | undefined> {
    return new FsFinder().find(target, options);
}

/** Returns every matching path. */
export function findAll(target: string, options?: FinderOptions): Promise<string[]> {
    return new FsFinder().findAll(target, options);
}

/** Blocking variant of `find`. Prefer `find` in applications. */
export function findSync(target: string, options?: FinderOptions): string | undefined {
    return new FsFinder().findSync(target, options);
}
