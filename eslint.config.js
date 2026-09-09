import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', 'prototype/**', '**/node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // R-6: barrels only. The layer graph itself is enforced by
      // dependency-cruiser (npm run arch); this catches the path shape.
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@tt/*/src/*', '@tt/*/dist/*'], message: 'Import the package barrel: @tt/<name> (ARCHITECTURE.md R-6).' },
          // NOTE: relative-path escapes across packages are deliberately NOT
          // handled here. A depth heuristic cannot tell `../../index.js` inside
          // one package from `../../other/src/index.js` across two, so it either
          // misses real violations or blocks legitimate intra-package imports.
          // `npm run arch` (dependency-cruiser) is repo-root aware and is the
          // authority on the graph. See ARCHITECTURE.md section 3.
        ],
      }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Discarding a field by destructuring is the clearest way to say "not
      // this one"; a leading underscore marks it deliberate.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true,
      }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
