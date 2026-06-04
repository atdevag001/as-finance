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
      // Critical safety: keep as errors
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",

      // Type-safety from strict-typeChecked: downgraded to warn (noisy in
      // existing NestJS/Prisma codebase where DI/repository patterns
      // legitimately surface `any`-shaped values).
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-enum-comparison": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/restrict-template-expressions": [
        "warn",
        {
          allowNumber: true,
          allowBoolean: true,
          allowNullish: true,
          allowRegExp: true,
        },
      ],
      "@typescript-eslint/restrict-plus-operands": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/unbound-method": "warn",
      "@typescript-eslint/no-confusing-void-expression": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unnecessary-type-conversion": "warn",
      "@typescript-eslint/no-unnecessary-type-arguments": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/no-extraneous-class": "off", // NestJS empty modules

      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-deprecated": "warn",
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      // --- General quality rules ---
      "no-console": "warn",
      "no-debugger": "error",
      "no-duplicate-imports": "off", // handled by consistent-type-imports
      // `== null` is allowed because it idiomatically matches both null and undefined.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "no-throw-literal": "off", // superseded by TS rule
      "no-useless-escape": "warn",
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
      "@typescript-eslint/no-unused-vars": "warn",
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
