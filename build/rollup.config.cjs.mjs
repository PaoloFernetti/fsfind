import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const options = {
    input: path.join(__dirname, "../src/index.ts"),
    cjs: path.join(__dirname, "../dist/cjs/index.js")
}


export default {
    input: options.input,
    output: {
        file: options.cjs,
        format: "cjs"
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