// Complexity-only ESLint config used to derive the JS/TS Complexity Signal.
//
// A max of 0 makes every function report its own cyclomatic complexity in the
// message text, which is what the backend parses out. Nothing here is a lint
// opinion — the analysed repository's own config is never consulted.
import tsParser from "@typescript-eslint/parser";

const complexityRule = { complexity: ["warn", 0] };

export default [
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: complexityRule,
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: complexityRule,
  },
];
