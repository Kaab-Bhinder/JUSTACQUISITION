import js from "@eslint/js";
import globals from "globals";

/* Same reasoning as the web config: no-undef is the rule that matters when
   code is spread across modules, because a missing import looks exactly like
   a global until it runs. */
export default [
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
