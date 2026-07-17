import js from '@eslint/js';
import globals from 'globals';

export default [
  // ─── Base recommended rules ────────────────────────────────────────────────
  js.configs.recommended,

  // ─── Source files ──────────────────────────────────────────────────────────
  {
    files: ['packages/*/src/**/*.js', 'apps/*/src/**/*.js', 'apps/*/main.js',
            'premium/*/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Bugs that silent JS lets through
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-constant-condition': 'error',
      'no-duplicate-case': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',

      // Style — kept minimal, don't fight the existing codebase
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },

  // ─── Node-side sources (CLI, entitlements issuer) ──────────────────────────
  // These run under Node, not a browser: process/Buffer/node:* imports are the
  // norm. Same bug-catching rules as browser sources.
  {
    files: ['packages/cli/bin/**/*.js', 'packages/cli/src/**/*.js',
            'packages/entitlements/src/issuer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },

  // ─── JSX test files (React wrapper tests) ───────────────────────────────────
  {
    files: ['packages/*/tests/**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },

  // ─── Test files ────────────────────────────────────────────────────────────
  {
    files: ['packages/*/tests/**/*.js', 'apps/*/tests/**/*.js', 'premium/*/tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-var': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },

  // ─── Config files (rollup, vite, vitest, eslint itself) ───────────────────
  {
    files: ['*.config.js', 'packages/*/rollup.config.js', 'packages/*/*.config.js',
            'apps/*/*.config.js', 'apps/*/vite.config.js', 'premium/*/*.config.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
    },
  },

  // ─── Ignored paths ─────────────────────────────────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/test-results/**',
    ],
  },
];
