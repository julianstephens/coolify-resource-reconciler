import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/"],
  },
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
