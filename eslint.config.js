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
      
      // ANTI-DEFENSIVE PROGRAMMING RULES
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      
      // Catch defensive programming patterns (VERIFIED RULES ONLY)
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error', // Prevents defensive || usage
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-type-constraint': 'error',
      
      // Prevent silent errors and defensive returns
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      
      // Force explicit error handling instead of defensive checks
      'no-throw-literal': 'error', // Use standard ESLint rule instead
      
      // Catch defensive try-catch patterns
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-expressions': 'error',
      
      // General code quality rules that prevent defensive programming
      'prefer-const': 'error',
      'no-var': 'error',
      'no-implicit-coercion': 'error',
      'no-implicit-globals': 'error',
      
      // Prevent defensive fallback patterns
      'no-sequences': 'error', // Catches defensive comma operators
      'no-unneeded-ternary': 'error',
      'no-nested-ternary': 'error',
      
      // Force explicit comparisons instead of truthy/falsy defensive checks
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      
      // BROWSER COMPATIBILITY RULES
      // Prevent require() usage in browser code - use ES6 imports instead
      'no-restricted-globals': [
        'error',
        {
          name: 'require',
          message: 'Use ES6 imports instead of require() - require is not available in browser environment'
        }
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: 'Use ES6 imports instead of require() - require is not available in browser environment'
        }
      ],
    },
  },
]; 