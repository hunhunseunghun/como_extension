import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          // 컴포넌트 파일이 함께 내보내는 훅·변형·상수(shadcn 버튼 변형, 테마·번역 훅, 통화·봉 목록)
          allowExportNames: [
            'buttonVariants',
            'toggleVariants',
            'useTheme',
            'useI18n',
            'FIAT_CURRENCIES',
            'TIMEFRAME_VALUES',
            'getTimeframes',
          ],
        },
      ],
    },
  },
)
