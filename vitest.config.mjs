import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node', include: ['tests/**/*.test.ts'],
    ...(process.env.MEDBRIDGE_CI_VITEST_REPORT ? {
      reporters: ['default', 'json'],
      outputFile: { json: process.env.MEDBRIDGE_CI_VITEST_REPORT },
    } : {}),
  },
});
