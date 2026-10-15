import js from "@eslint/js";
import tseslint from "typescript-eslint";
export default [
  {
    ignores: [
      "**/node_modules/**",
      "apps/web/.next/**",
      "**/*.d.ts",
      ".cache/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: "readonly",
        AbortSignal: "readonly",
        AbortController: "readonly",
        performance: "readonly",
        process: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Response: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { caughtErrors: "none", argsIgnorePattern: "^_" },
      ],
    },
  },
];
