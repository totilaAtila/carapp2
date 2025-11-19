import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Folosește jsdom pentru a simula browser-ul
    environment: 'jsdom',

    // Activează API-urile globale (describe, it, expect, etc.)
    globals: true,

    // Fișier de setup pentru teste
    setupFiles: ['./src/test/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'dist/',
        'scripts/',
        'src/main.tsx',
        'src/utils/dejavu-fonts.ts', // Exclude base64 fonts (1.9MB)
      ],
      // Target 80% coverage
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },

    // Include doar fișierele de test
    include: ['**/*.{test,spec}.{ts,tsx}'],

    // Exclude directories
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
  },

  resolve: {
    // Path aliases pentru @ → src/
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
