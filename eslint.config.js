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
    // Installed dependencies, generated SBOM output, and opaque vendored
    // package archives are not this package's lint surface.
    ignores: ['node_modules/**', 'dist/**', 'vendor/**'],
  },
];
