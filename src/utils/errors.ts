const SKIPPABLE_CODES: ReadonlySet<string> = new Set([
    "EACCES",
    "EPERM",
    "EBUSY",
    "ENOENT",
    "ELOOP",
    "ENOTDIR",
    "ENAMETOOLONG",
    "EINVAL",
    "ENOTSUP",
    "EOPNOTSUPP",
    "EIO",
    "ENODEV",
    "ENXIO",
    "EROFS",
    "ERR_ACCESS_DENIED",
    "UNKNOWN",
]);

export class SearchTimeoutError extends Error {
    readonly timeoutMs: number;

    constructor(timeoutMs: number) {
        super(`search timed out after ${timeoutMs}ms`);
        this.name = "SearchTimeoutError";
        this.timeoutMs = timeoutMs;
    }
}

export function getErrorCode(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null) {
        return undefined;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

export function isAbortError(error: unknown): boolean {
    if (typeof error !== "object" || error === null) {
        return false;
    }

    return (error as { name?: unknown }).name === "AbortError";
}

/**
 * File system errors that should not interrupt a full-machine scan.
 * Unknown error shapes are treated as skippable because the search is best-effort.
 */
export function isSkippableError(error: unknown): boolean {
    if (isAbortError(error)) {
        return false;
    }

    const code = getErrorCode(error);
    if (code === undefined) {
        return true;
    }

    return SKIPPABLE_CODES.has(code);
}
