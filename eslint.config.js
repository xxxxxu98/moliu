{
  "root": true,
  "env": {
    "browser": true,
    "es2021": true,
    "node": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:vue/vue3-recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "parser": "vue-eslint-parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "parser": "@typescript-eslint/parser",
    "sourceType": "module"
  },
  "plugins": [
    "vue",
    "@typescript-eslint"
  ],
  "rules": {
    "vue/multi-word-component-names": "off",
    "vue/no-v-html": "warn",
    "vue/require-default-prop": "off",
    "vue/html-self-closing": ["warn", {
      "html": { "void": "always", "normal": "always", "component": "always" },
      "svg": "always",
      "math": "always"
    }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["warn", {
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }],
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-debugger": "warn"
  },
  "ignorePatterns": [
    "node_modules/",
    "dist/",
    ".vite/",
    "*.min.js"
  ]
}
