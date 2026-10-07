import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// 확장 루트(백그라운드 · 패키징 스크립트 · E2E). 팝업은 pages/popup에 따로 설정이 있다.
export default tseslint.config(
  { ignores: ['dist', 'release', 'pages', 'node_modules', 'playwright-report', 'e2e/.results'] },
  {
    files: ['src/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.serviceworker, ...globals.browser, chrome: 'readonly' },
    },
  },
  {
    files: ['src/**/*.test.js', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['e2e/**/*.ts', '*.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser, chrome: 'readonly' } },
  },
);
