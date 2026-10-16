import { rolldown } from 'rolldown';
import path from 'node:path';

const root = path.resolve('.');
const entry = process.argv[2];
const outDir = process.argv[3];
const b = await rolldown({
  input: entry,
  platform: 'node',
  plugins: [
    {
      name: 'stubs',
      resolveId(source) {
        if (/art\/env(\.ts)?$/.test(source)) return path.join(root, '.smoke/stubs/env.ts');
        if (!process.env.REAL_TOWNENV && (/world\/townEnv(\.ts)?$/.test(source) || /^\.\/townEnv(\.ts)?$/.test(source))) return path.join(root, '.smoke/stubs/townEnv.ts');
        return null;
      },
    },
  ],
});
await b.write({ dir: outDir, format: 'esm' });
await b.close();
console.log('bundled');
