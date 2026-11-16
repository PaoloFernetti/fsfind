import { globToSource } from "./glob.js";

export type IgnoreMatcher = (fullPath: string, name: string, isDirectory: boolean) => boolean;

interface CompiledIgnore {
    readonly matchPath: boolean;
    readonly regex: RegExp;
    readonly negated: boolean;
    readonly dirOnly: boolean;
}

function normalizeSlashes(value: string): string {
    return value.replace(/\\/g, "/");
}

function compilePattern(rawPattern: string, caseSensitive: boolean): CompiledIgnore | undefined {
    let pattern = rawPattern.trim();

    if (pattern.length === 0) {
        return undefined;
    }

    const negated = pattern.startsWith("!");
    if (negated) {
        pattern = pattern.slice(1).trim();
    }

    if (pattern.length === 0) {
        return undefined;
    }

    const normalized = normalizeSlashes(pattern);
    const dirOnly = normalized.endsWith("/");
    const bodyPattern = dirOnly ? normalized.slice(0, -1) : normalized;

    if (bodyPattern.length === 0) {
        return undefined;
    }

    const flags = caseSensitive ? "" : "i";
    const matchPath = bodyPattern.includes("/");
    const body = globToSource(bodyPattern);

    if (matchPath) {
        return {
            matchPath: true,
            regex: new RegExp(`^${body}(?:/.*)?$`, flags),
            negated,
            dirOnly,
        };
    }

    return {
        matchPath: false,
        regex: new RegExp(`^${body}$`, flags),
        negated,
        dirOnly,
    };
}

/**
 * Compiles ignore patterns into a predicate.
 *
 * Patterns without a slash match the entry name, patterns with a slash match an
 * absolute path prefix. A leading `!` negates a pattern, a trailing slash
 * restricts it to directories. Patterns are evaluated in order and the last
 * matching pattern wins.
 */
export function createIgnoreMatcher(
    patterns: readonly string[],
    caseSensitive: boolean,
): IgnoreMatcher {
    const compiled: CompiledIgnore[] = [];

    for (const pattern of patterns) {
        const entry = compilePattern(pattern, caseSensitive);
        if (entry !== undefined) {
            compiled.push(entry);
        }
    }

    if (compiled.length === 0) {
        return () => false;
    }

    return (fullPath, name, isDirectory) => {
        const normalizedPath = normalizeSlashes(fullPath);
        let ignored = false;

        for (const entry of compiled) {
            if (entry.dirOnly && !isDirectory) {
                continue;
            }

            const subject = entry.matchPath ? normalizedPath : name;
            if (entry.regex.test(subject)) {
                ignored = !entry.negated;
            }
        }

        return ignored;
    };
}
