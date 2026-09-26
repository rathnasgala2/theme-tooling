import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // `node_modules/**` and this package's own `dist/**` (scratch SBOM
    // output) are the usual suspects; `template/**` and `theme-default/**`
    // are this package's own CI sibling checkouts (see
    // `.github/workflows/ci.yml`) — not part of this package's own source,
    // and not written to this eslint config's Node-globals ruleset, so
    // `npm run lint`'s `eslint . ` must never descend into them (a theme
    // repository never hits this: its own `lint` command only ever lints
    // its single `tooling/run.mjs` file, never a recursive `.`).
    ignores: ['node_modules/**', 'dist/**', 'template/**', 'theme-default/**'],
  },
];
