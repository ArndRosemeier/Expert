import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // CRITICAL: These rules catch unawaited async calls
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      
      // Additional async safety rules
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/prefer-promise-reject-errors': 'error',
      
      // General code quality rules that prevent defensive programming
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      
      // Prevent silent errors
      'prefer-const': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
    },
  },
]; 