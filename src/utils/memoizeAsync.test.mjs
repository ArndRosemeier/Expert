import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { importTs, srcPath } = await import(
    pathToFileURL(path.join(repoRoot, 'tools', 'app-tests', 'load-ts.mjs')).href
);
const { memoizeAsync } = await importTs(srcPath('utils/memoizeAsync.ts'));

function counter(result = 'v') {
    const calls = [];
    return { calls, loader: async (k) => { calls.push(k); return `${result}:${k}`; } };
}

test('memoizeAsync: second call within TTL is served from cache', async () => {
    const c = counter();
    const m = memoizeAsync(c.loader, 1000);
    assert.equal(await m.get('a'), 'v:a');
    assert.equal(await m.get('a'), 'v:a');
    assert.equal(c.calls.length, 1, 'the ~760 KB /models list must be downloaded once, not per request');
});

test('memoizeAsync: concurrent callers share one in-flight load', async () => {
    let resolve;
    const calls = [];
    const m = memoizeAsync((k) => { calls.push(k); return new Promise(r => { resolve = r; }); }, 1000);
    const p1 = m.get('a'); const p2 = m.get('a'); const p3 = m.get('a');
    resolve('x');
    assert.deepEqual(await Promise.all([p1, p2, p3]), ['x', 'x', 'x']);
    assert.equal(calls.length, 1);
});

test('memoizeAsync: keys are cached independently', async () => {
    const c = counter();
    const m = memoizeAsync(c.loader, 1000);
    await m.get('a'); await m.get('b'); await m.get('a');
    assert.deepEqual(c.calls, ['a', 'b']);
});

test('memoizeAsync: entry expires after the TTL', async () => {
    let t = 0;
    const c = counter();
    const m = memoizeAsync(c.loader, 100, () => t);
    await m.get('a');
    t = 99; await m.get('a');
    assert.equal(c.calls.length, 1);
    t = 100; await m.get('a');
    assert.equal(c.calls.length, 2);
});

test('memoizeAsync: a failed load is NOT cached', async () => {
    let fail = true;
    const calls = [];
    const m = memoizeAsync(async (k) => { calls.push(k); if (fail) throw new Error('down'); return 'ok'; }, 1000);
    await assert.rejects(() => m.get('a'), /down/);
    fail = false;
    assert.equal(await m.get('a'), 'ok');
    assert.equal(calls.length, 2);
});

test('memoizeAsync: force bypasses a fresh cache entry', async () => {
    const c = counter();
    const m = memoizeAsync(c.loader, 1000);
    await m.get('a');
    await m.get('a', { force: true });
    assert.equal(c.calls.length, 2);
});

test('memoizeAsync: clear() drops entries', async () => {
    const c = counter();
    const m = memoizeAsync(c.loader, 1000);
    await m.get('a'); m.clear(); await m.get('a');
    assert.equal(c.calls.length, 2);
});

test('memoizeAsync: a load that started before clear() does not repopulate the cache', async () => {
    // e.g. the API key changed while an old-key request was still in flight.
    let resolve;
    let n = 0;
    const m = memoizeAsync(() => { n++; return new Promise(r => { resolve = r; }); }, 1000);
    const stale = m.get('a');
    m.clear();
    resolve('old-key-result');
    assert.equal(await stale, 'old-key-result');
    const fresh = m.get('a');
    resolve('new-key-result');
    assert.equal(await fresh, 'new-key-result');
    assert.equal(n, 2, 'the stale result must not have been served from cache');
});

const { withFallback } = await importTs(srcPath('utils/memoizeAsync.ts'));

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
