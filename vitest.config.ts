import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Prefer .tsx/.ts sources over in-place tsc build output (SmoothieComponent.js)
  resolve: {
    extensions: ['.tsx', '.ts', '.mjs', '.js', '.jsx', '.json'],
  },
  test: {
    environment: 'jsdom',
  },
});
