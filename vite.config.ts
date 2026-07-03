import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev server and static build for the demo app in demo/
export default defineConfig({
  root: 'demo',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
});
