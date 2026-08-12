import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";

/* Deliberately minimal. The one rule that earns its keep here is no-undef:
   the app is split across two dozen modules, and a bundler will happily build
   a missing import as an undefined global that only explodes at runtime. */
export default [
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react },
    settings: { react: { version: "18.3" } },
    rules: {
      "no-undef": "error",
      "react/jsx-uses-vars": "error",   // or every component reads as unused
      "react/jsx-uses-react": "off",    // new JSX transform, no React import needed
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
