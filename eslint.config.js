import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist-preview: bundle minificado de harnesses de screenshot temporales; lintearlo
  // mete miles de falsos problemas que enmascaran errores reales del código fuente.
  globalIgnores(['dist', 'dist-preview']),
  {
    files: ['netlify/functions/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
    // Explícito para no depender de que recommended lo incluya: una variable no
    // definida (p.ej. una constante renombrada y no actualizada en algún uso)
    // debe fallar el lint, no aparecer solo en runtime.
    rules: { 'no-undef': 'error' },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['netlify/functions/**'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { 'no-undef': 'error' },
  },
])
