import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

/**
 * Shared ESLint flat config for AS Finance LMS.
 *
 * Usage in workspace packages:
 *   import baseConfig from "@as-finance/config/eslint";
 *   export default [...baseConfig, { /* package overrides * / }];
 */
const baseConfig = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      // --- TypeScript strict rules for finance application ---
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "warn",

      // --- General quality rules ---
      "no-console": "warn",
      "no-debugger": "error",
      "no-duplicate-imports": "off", // handled by consistent-type-imports
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "no-throw-literal": "off", // superseded by TS rule
      "@typescript-eslint/only-throw-error": "error",
    },
  },
  {
    // Relaxed rules for test files
    files: [
      "**/*.spec.ts",
      "**/*.test.ts",
      "**/*.spec.tsx",
      "**/*.test.tsx",
      "**/test/**",
      "**/tests/**",
      "**/__tests__/**",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".next/**",
      "coverage/**",
      "*.js",
      "*.mjs",
      "*.cjs",
    ],
  }
);

export default baseConfig;
