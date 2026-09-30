import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { importTs, srcPath } = await import(
    pathToFileURL(path.join(repoRoot, 'tools', 'app-tests', 'load-ts.mjs')).href
);
const { loadOnce, withFallback } = await importTs(srcPath('utils/memoizeAsync.ts'));

test('loadOnce: the catalog is downloaded exactly once per page load', async () => {
    const calls = [];
    const once = loadOnce(async (k) => { calls.push(k); return `v:${k}`; });
    for (let i = 0; i < 25; i++) assert.equal(await once.get('all'), 'v:all');
    assert.equal(calls.length, 1, 'owner rule: one download per page load, never more');
});

test('loadOnce: concurrent callers share one in-flight download', async () => {
    let resolve; const calls = [];
    const once = loadOnce((k) => { calls.push(k); return new Promise(r => { resolve = r; }); });
    const ps = [once.get('all'), once.get('all'), once.get('all')];
    resolve('x');
    assert.deepEqual(await Promise.all(ps), ['x', 'x', 'x']);
    assert.equal(calls.length, 1);
});

test('loadOnce: never expires, however much time passes', async () => {
    const calls = [];
    const once = loadOnce(async (k) => { calls.push(k); return k; });
    await once.get('all');
    await new Promise(r => setTimeout(r, 30));
    await once.get('all');
    assert.equal(calls.length, 1, 'no TTL - refresh is a hard reload');
});

test('loadOnce: keys are independent (one download per model for /endpoints)', async () => {
    const calls = [];
    const once = loadOnce(async (k) => { calls.push(k); return k; });
    await once.get('a'); await once.get('b'); await once.get('a'); await once.get('b');
    assert.deepEqual(calls, ['a', 'b']);
});

test('loadOnce: a FAILED download is not kept, so the next call retries', async () => {
    let fail = true; const calls = [];
    const once = loadOnce(async (k) => { calls.push(k); if (fail) throw new Error('down'); return 'ok'; });
    await assert.rejects(() => once.get('all'), /down/);
    fail = false;
    assert.equal(await once.get('all'), 'ok');
    assert.equal(await once.get('all'), 'ok');
    assert.equal(calls.length, 2, 'one failed attempt, one success, then kept');
});

test('loadOnce: a failure seen by concurrent callers triggers only ONE retry later', async () => {
    let n = 0;
    const once = loadOnce(async () => { n++; if (n === 1) throw new Error('down'); return 'ok'; });
    await Promise.allSettled([once.get('all'), once.get('all'), once.get('all')]);
    await Promise.all([once.get('all'), once.get('all')]);
    assert.equal(n, 2);
});


test('withFallback: returns the value when it arrives in time', async () => {
    assert.equal(await withFallback(Promise.resolve('catalog'), 50, null), 'catalog');
});

test('withFallback: a slow load yields the fallback instead of blocking the request', async () => {
    // Owner report: the /models download timed out and took the chat request with it.
    const slow = new Promise(r => setTimeout(() => r('late'), 300));
    const t = Date.now();
    assert.equal(await withFallback(slow, 30, null), null);
    assert.ok(Date.now() - t < 200, 'must not wait for the slow download');
});

test('withFallback: a failed load yields the fallback and never rejects', async () => {
    const failing = Promise.reject(Object.assign(new Error('signal timed out'), { name: 'TimeoutError' }));
    assert.equal(await withFallback(failing, 50, null), null);
});

test('withFallback: the slow load still completes (so the shared cache fills)', async () => {
    let settled = false;
    const slow = new Promise(r => setTimeout(() => { settled = true; r('late'); }, 60));
    await withFallback(slow, 10, null);
    await slow;
    assert.equal(settled, true);
});
