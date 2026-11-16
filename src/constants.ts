export const DEFAULT_CONCURRENCY = 16;

export const MAX_CONCURRENCY = 64;

export const MAX_WORKERS = 16;

export const MAX_AUTO_WORKERS = 4;

export const DRIVE_PROBE_TIMEOUT_MS = 250;

export const PROGRESS_THROTTLE_MS = 100;

export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export const DEFAULT_CACHE_MAX_ENTRIES = 200;

/**
 * Directory names that are skipped unless `useDefaultIgnores` is set to `false`.
 * System directories such as `C:\Windows` are intentionally not ignored so that
 * the "find anywhere" contract is preserved.
 */
export const DEFAULT_IGNORED_DIRS: readonly string[] = [
    "node_modules",
    ".git",
    ".hg",
    ".svn",
    "$recycle.bin",
    "system volume information",
    ".trash",
    ".trashes",
    "lost+found",
];

/** Pseudo file systems that must never be traversed on POSIX systems. */
export const POSIX_IGNORED_PATHS: readonly string[] = ["/proc", "/sys", "/dev", "/run"];
