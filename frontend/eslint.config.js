import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import sonarjs from 'eslint-plugin-sonarjs'

export default [
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      sonarjs,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'sonarjs/cognitive-complexity': 'warn',
      'sonarjs/todo-tag': 'warn',
      'sonarjs/super-linear-regex': 'warn',
      'sonarjs/concise-regex': 'warn',
      'sonarjs/no-unused-vars': 'warn',
      'sonarjs/no-dead-store': 'warn',
      'sonarjs/no-nested-conditional': 'warn',
      'sonarjs/unused-import': 'warn',
      'sonarjs/no-identical-functions': 'warn',
    },
  },
  {
    // vitest runs with `test.globals: true` (see vite.config.js)
    files: ['**/*.test.{js,jsx}', 'src/setupTests.js'],
    languageOptions: {
      globals: { ...globals.jest, vi: 'readonly' },
    },
  },
]
