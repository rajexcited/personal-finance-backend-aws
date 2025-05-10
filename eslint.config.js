// eslint.config.js
const js = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const globals = require("globals");

module.exports = defineConfig([
  {
    ignores: ["dist/", "node_modules/", "cdk.out/"]
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        atob: false,
        btoa: false,
        ...globals.jest,
        fail: false
      }
    },
    plugins: {
      js
    },
    extends: ["js/recommended"],
    rules: {
      semi: "warn",
      "prefer-const": "warn",
      "no-unused-vars": "warn",
      "no-empty": "warn", // temporary
      "no-useless-escape": "warn", // temporary
      "no-fallthrough": "warn", // temporary
      "no-case-declarations": "warn", // temporary
      "no-extra-boolean-cast": "warn" // temporary
    }
  }
]);
