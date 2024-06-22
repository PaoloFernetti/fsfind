import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const options = {
    input: path.join(__dirname, "../src/index.ts"),
    es: path.join(__dirname, "../dist/es/index.mjs")
}


export default {
    input: options.input,
    output: {
        file: options.es,
        format: "es",
        exports: "named"
    },
    plugins: [
        json(),
        resolve({
            preferBuiltins: true
        }),
        commonjs(),
        typescript()
    ]
}