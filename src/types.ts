export type MatchMode = "exact" | "glob" | "regex";

export interface IncludeOptions {
    files?: boolean;
    dirs?: boolean;
}

export interface CacheOptions {
    /** Directory for cache files. Defaults to a `fsfind-cache` directory in the OS temp folder. */
    dir?: string;
    /** Time to live in milliseconds. Defaults to 5 minutes. */
    ttlMs?: number;
    /** Maximum number of cache files kept on disk. Defaults to 200. */
    maxEntries?: number;
}

export interface ResolvedCacheOptions {
    dir: string;
    ttlMs: number;
    maxEntries: number;
}

export interface FinderOptions {
    /** Directories to start the search from. Defaults to every mounted drive or `/`. */
    roots?: string[];
    /** How `target` is interpreted. Defaults to `"exact"`. */
    match?: MatchMode;
    /** Defaults to `false` on Windows and macOS, `true` elsewhere. */
    caseSensitive?: boolean;
    /** Which entry kinds are returned. Defaults to files and directories. */
    include?: IncludeOptions;
    /** Maximum directory depth relative to each root. Defaults to `Infinity`. */
    maxDepth?: number;
    /** Maximum number of results. Defaults to `1` for `find` and `Infinity` for `findAll`. */
    limit?: number;
    /** Follow symbolic links while walking. Defaults to `false`. */
    followSymlinks?: boolean;
    /** Number of directories processed in parallel. Defaults to `16`. */
    concurrency?: number;
    /**
     * Number of worker threads used to scan subdirectories in parallel.
     * `0` disables worker threads and is the default. `"auto"` picks up to four
     * workers based on the CPU count. Ignored by `findSync`.
     */
    workers?: number | "auto";
    /**
     * Enables the on-disk result cache. `true` uses the default settings.
     * Ignored by `findSync`.
     */
    cache?: boolean | CacheOptions;
    /** Aborts the search. */
    signal?: AbortSignal;
    /**
     * Extra ignore patterns matched against entry names or absolute paths.
     * A leading `!` negates a pattern, a trailing `/` restricts it to directories.
     */
    ignore?: string[];
    /** Apply the built-in ignore list. Defaults to `true`. */
    useDefaultIgnores?: boolean;
    /** Fails the search with `SearchTimeoutError` after the given number of milliseconds. */
    timeoutMs?: number;
    /** Called periodically with traversal statistics. */
    onProgress?: (progress: Progress) => void;
    /** Called for every path that could not be read. */
    onSkip?: (event: SkipEvent) => void;
}

export interface Progress {
    visitedDirs: number;
    visitedEntries: number;
    currentPath: string;
    elapsedMs: number;
    matches: number;
}

export interface SkipEvent {
    path: string;
    code: string;
    message: string;
}

export interface ResolvedInclude {
    files: boolean;
    dirs: boolean;
}

export interface ResolvedOptions {
    roots: string[];
    match: MatchMode;
    caseSensitive: boolean;
    include: ResolvedInclude;
    maxDepth: number;
    limit: number;
    followSymlinks: boolean;
    concurrency: number;
    workers: number;
    cache: ResolvedCacheOptions | undefined;
    ignore: readonly string[];
    timeoutMs: number | undefined;
    signal: AbortSignal | undefined;
    onProgress: ((progress: Progress) => void) | undefined;
    onSkip: ((event: SkipEvent) => void) | undefined;
}
