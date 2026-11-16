import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["dist/**", "node_modules/**", "tests/**", "build/**", "*.config.mjs"],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts"],
        rules: {
            "no-undef": "off",
            "no-constant-condition": ["error", { checkLoops: false }],
        },
    },
);
