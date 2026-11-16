import path from "node:path";
import { fileURLToPath } from "node:url";

import typescript from "@rollup/plugin-typescript";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const input = {
    index: path.join(rootDir, "src/index.ts"),
    worker: path.join(rootDir, "src/engines/worker.ts"),
};

const esBanner = [
    'import { fileURLToPath as __fsfindFileURLToPath } from "node:url";',
    "const __filename = __fsfindFileURLToPath(import.meta.url);",
].join("\n");

function createPlugins() {
    return [
        typescript({
            tsconfig: path.join(rootDir, "tsconfig.json"),
            declaration: false,
            declarationMap: false,
            sourceMap: true,
        }),
    ];
}

function isExternal(id) {
    return id.startsWith("node:");
}

export default [
    {
        input,
        external: isExternal,
        output: {
            dir: path.join(rootDir, "dist/cjs"),
            format: "cjs",
            exports: "named",
            entryFileNames: "[name].js",
            chunkFileNames: "[name]-[hash].js",
            sourcemap: true,
        },
        plugins: createPlugins(),
    },
    {
        input,
        external: isExternal,
        output: {
            dir: path.join(rootDir, "dist/es"),
            format: "es",
            entryFileNames: "[name].mjs",
            chunkFileNames: "[name]-[hash].mjs",
            sourcemap: true,
            banner: esBanner,
        },
        plugins: createPlugins(),
    },
];
