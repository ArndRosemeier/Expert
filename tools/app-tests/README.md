# app-tests — running tests for `src/`

`npm test` runs `node --test "tools/**/*.test.mjs" "src/**/*.test.mjs"`.

App test files live next to the module they test, as `<module>.test.mjs`. To reach
the TypeScript source and the loader without counting `../` by hand:

```js
import { importTs, srcPath } from '<relative path to>/tools/app-tests/load-ts.mjs';
const { myFunction } = await importTs(srcPath('path/inside/src/myModule.ts'));
```

Or resolve it from the repo root regardless of test depth:

```js
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { importTs, srcPath } = require('../../../../../tools/app-tests/load-ts.mjs');
```

Simplest reliable form, used by the current tests — compute the repo root from the
test file's own location:

```js
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { importTs, srcPath } = await import(pathToFileURL(path.join(repoRoot, 'tools/app-tests/load-ts.mjs')).href);
```

`load-ts.mjs` transpiles TypeScript in memory using the **esbuild Vite already
installs**, so app tests need no new dependency. Modules that reach browser-only
globals (DOM, IndexedDB, `window`) cannot be imported in Node — test the pure parts,
and cover the rest with the headless-Chrome render check.
