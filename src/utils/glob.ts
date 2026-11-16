const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/;

function escapeRegExpChar(char: string): string {
    return REGEXP_SPECIAL.test(char) ? `\\${char}` : char;
}

/**
 * Converts a glob pattern into a regular expression source fragment.
 * `*` matches within a path segment, `**` matches across segments and `?`
 * matches a single character.
 */
export function globToSource(pattern: string): string {
    let source = "";

    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index];

        if (char === "*") {
            if (pattern[index + 1] === "*") {
                source += ".*";
                index += 1;
            } else {
                source += "[^/]*";
            }
        } else if (char === "?") {
            source += "[^/]";
        } else {
            source += escapeRegExpChar(char);
        }
    }

    return source;
}

export function globToRegExp(pattern: string, caseSensitive: boolean): RegExp {
    return new RegExp(`^${globToSource(pattern)}$`, caseSensitive ? "" : "i");
}
