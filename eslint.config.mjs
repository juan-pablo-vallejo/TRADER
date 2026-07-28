import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
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
    // CI helper scripts run under Node directly, so they use `console` and
    // `process`. Without these declared for this path they lint as undefined —
    // which is how the commit that added the doc guards turned main red.
    //
    // Listed explicitly rather than pulling in the `globals` package: two names
    // do not justify a dependency, and naming them says what these scripts may
    // reach for.
    files: [".github/scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
  prettier,
);
