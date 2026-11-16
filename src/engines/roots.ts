import fs from "node:fs";
import type { Stats } from "node:fs";
import path from "node:path";

import { DRIVE_PROBE_TIMEOUT_MS } from "../constants.js";

const DRIVE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function toRootKey(root: string): string {
    return process.platform === "win32" ? root.toLowerCase() : root;
}

function dedupeRoots(roots: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const root of roots) {
        const key = toRootKey(root);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(root);
    }

    return result;
}

async function probeDrive(drive: string): Promise<string | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
        const stats = await Promise.race([
            fs.promises.stat(drive),
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`timed out probing ${drive}`)),
                    DRIVE_PROBE_TIMEOUT_MS,
                );
            }),
        ]);

        return stats.isDirectory() ? drive : undefined;
    } catch {
        return undefined;
    } finally {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    }
}

async function validateRoots(roots: readonly string[]): Promise<string[]> {
    if (roots.length === 0) {
        throw new TypeError("roots must not be empty");
    }

    const resolved = dedupeRoots(roots.map((root) => path.resolve(root)));

    for (const root of resolved) {
        let stats: Stats;

        try {
            stats = await fs.promises.stat(root);
        } catch {
            throw new Error(`root does not exist: ${root}`);
        }

        if (!stats.isDirectory()) {
            throw new Error(`root is not a directory: ${root}`);
        }
    }

    return resolved;
}

function validateRootsSync(roots: readonly string[]): string[] {
    if (roots.length === 0) {
        throw new TypeError("roots must not be empty");
    }

    const resolved = dedupeRoots(roots.map((root) => path.resolve(root)));

    for (const root of resolved) {
        let stats: Stats;

        try {
            stats = fs.statSync(root);
        } catch {
            throw new Error(`root does not exist: ${root}`);
        }

        if (!stats.isDirectory()) {
            throw new Error(`root is not a directory: ${root}`);
        }
    }

    return resolved;
}

/**
 * Resolves search roots. When `roots` is omitted every mounted drive is probed
 * on Windows, and `/` is used on POSIX systems.
 */
export async function resolveRoots(
    roots: readonly string[] | undefined,
    signal?: AbortSignal,
): Promise<string[]> {
    if (roots !== undefined) {
        return validateRoots(roots);
    }

    signal?.throwIfAborted();

    if (process.platform === "win32") {
        const probed = await Promise.all(DRIVE_LETTERS.map((letter) => probeDrive(`${letter}:/`)));
        const drives = dedupeRoots(probed.filter((drive): drive is string => drive !== undefined));

        if (drives.length === 0) {
            throw new Error("no accessible file system roots were found");
        }

        return drives;
    }

    return ["/"];
}

export function resolveRootsSync(roots?: readonly string[]): string[] {
    if (roots !== undefined) {
        return validateRootsSync(roots);
    }

    if (process.platform === "win32") {
        const drives: string[] = [];

        for (const letter of DRIVE_LETTERS) {
            const drive = `${letter}:/`;

            try {
                if (fs.statSync(drive).isDirectory()) {
                    drives.push(drive);
                }
            } catch {
                // The drive is not mounted.
            }
        }

        if (drives.length === 0) {
            throw new Error("no accessible file system roots were found");
        }

        return drives;
    }

    return ["/"];
}
