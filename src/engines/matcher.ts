import type { MatchMode } from "../types.js";
import { getErrorMessage } from "../utils/errors.js";
import { globToRegExp } from "../utils/glob.js";

export type Matcher = (name: string) => boolean;

const PATH_SEPARATORS = /[\\/]/;

export function validateTarget(target: string): void {
    if (typeof target !== "string" || target.length === 0) {
        throw new TypeError("target must be a non-empty string");
    }
}

function assertNameOnly(target: string, mode: MatchMode): void {
    if (mode !== "regex" && PATH_SEPARATORS.test(target)) {
        throw new TypeError(`target must be a name, not a path: "${target}"`);
    }
}

export function createMatcher(target: string, mode: MatchMode, caseSensitive: boolean): Matcher {
    validateTarget(target);
    assertNameOnly(target, mode);

    if (mode === "exact") {
        if (caseSensitive) {
            return (name) => name === target;
        }

        const normalizedTarget = target.toLowerCase();
        return (name) => name.toLowerCase() === normalizedTarget;
    }

    if (mode === "glob") {
        const regex = globToRegExp(target, caseSensitive);
        return (name) => regex.test(name);
    }

    if (mode === "regex") {
        let regex: RegExp;

        try {
            regex = new RegExp(target, caseSensitive ? "" : "i");
        } catch (error) {
            throw new TypeError(`invalid regex target "${target}": ${getErrorMessage(error)}`, {
                cause: error,
            });
        }

        return (name) => regex.test(name);
    }

    throw new TypeError(`unsupported match mode: ${String(mode)}`);
}
