// The root package.json has no "type" field, so Node would treat dist/esm/*.js as
// CommonJS. These stubs pin the module system of each build output.
import { writeFileSync } from 'node:fs';

writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n');
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
