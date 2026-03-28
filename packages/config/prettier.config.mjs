/**
 * Shared Prettier config for AS Finance LMS.
 *
 * Usage in workspace packages:
 *   Create a .prettierrc.mjs that re-exports:
 *     export { default } from "@as-finance/config/prettier";
 */
const prettierConfig = {
  semi: true,
  singleQuote: true,
  trailingComma: "all",
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  arrowParens: "always",
  endOfLine: "lf",
  plugins: [],
};

export default prettierConfig;
