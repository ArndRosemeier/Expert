/**
 * Loads a TypeScript module into a node:test process without a build step or any
 * new dependency, using the esbuild that is already installed for Vite.
 *
 * This is a TOOL, not a test runner framework: it transpiles one file and returns
 * it. Test files use `node:test` directly.
 *
 * Porting note: if a target project has no esbuild, either add one, or transpile
 * ahead of time. Nothing else in this helper is project-specific.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

/** Transpile a .ts file to ESM source text. */
export function transpile(filePath) {
    return esbuild.transformSync(readFileSync(filePath, 'utf8'), {
        loader: 'ts',
        format: 'esm',
        target: 'es2022',
        sourcefile: filePath,
    }).code;
}

/** Repo root, derived from this file's location (tools/app-tests/ -> repo root). */
export const REPO_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..'
);

/** Absolute path to a file under src/, for use with importTs. */
export function srcPath(...parts) {
    return path.join(REPO_ROOT, 'src', ...parts);
}

/**
 * Import a .ts module by path, transpiled in memory. The file must be
 * import-free of unresolvable runtime dependencies, or those imports will fail.
 */
export async function importTs(filePath) {
    const code = transpile(filePath);
    const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    return import(url);
}
