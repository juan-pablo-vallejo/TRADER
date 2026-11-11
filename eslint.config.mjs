import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";
import { globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Next's rules (react, react-hooks, jsx-a11y, @next/next) apply to the web app only; its
// own global ignores are kept. `next/typescript` registers a plugin this file already has,
// and Next's Babel-based parser is replaced by the TypeScript one, which the
// `consistent-type-imports` rule below needs (parser services) and every file here is TS.
const webOnly = nextVitals
  .filter((config) => config.name !== "next/typescript")
  .map((config) =>
    config.ignores && !config.files && !config.rules
      ? config
      : {
          ...config,
          files: ["apps/web/**/*.{ts,tsx}"],
          ...(config.languageOptions && {
            languageOptions: { ...config.languageOptions, parser: tseslint.parser },
          }),
        },
  );

export default tseslint.config(
  globalIgnores(["**/.next/**", "**/next-env.d.ts"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...webOnly,
  {
    // The app router has no pages directory; the rule looks for one from the cwd.
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      // Mobile imports AppRouter from packages/api purely for types. Without an
      // explicit `import type`, Metro follows the import and tries to bundle
      // server code into the app. This rule makes that mistake a lint error.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Typed rules, for the two mistakes the compiler allows and the database punishes: a
    // statement on `tx` that is never awaited runs after its transaction has ended, or not
    // at all, and a promise handed where a plain callback is expected is never observed.
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },
  prettier,
);
