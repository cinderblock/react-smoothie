import { copyFile, rm } from 'node:fs/promises';

import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  clean: true,
  async onSuccess() {
    // uPlot's stylesheet, republished so consumers just `import 'react-smoothie/style.css'`
    await rm('dist/style.css', { recursive: true, force: true });
    await copyFile('node_modules/uplot/dist/uPlot.min.css', 'dist/style.css');
  },
});
