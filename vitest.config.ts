import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    include: ['src/**/*.test.ts', 'test/integration/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: [
        'src/extension.ts',
        'src/adapters/**/*.ts',
        'src/commands/**/*.ts',
        'src/config/**/*.ts',
        'src/detection/**/*.ts',
      ],
      exclude: [
        'src/**/*.test.ts',
        'test/**',
        'dist/**',
        'src/__mocks__/**',
        'src/types.ts',
        'src/interfaces/**',
        'src/adapters/vscodeUserInterface.ts',
        'src/adapters/vscodeConfiguration.ts',
        'src/__tests__/**',
      ],
    },
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'test/vscode.mock.ts'),
    },
  },
})
