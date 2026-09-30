import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { importTs, srcPath } = await import(
    pathToFileURL(path.join(repoRoot, 'tools', 'app-tests', 'load-ts.mjs')).href
);
const { StreamRunTracker } = await importTs(srcPath('rpg-lite/services/StreamRun.ts'));

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

test('StreamRun: a started run is current and not aborted', () => {
    const t = new StreamRunTracker();
    const run = t.start('op1');
    assert.equal(run.isCurrent(), true);
    assert.equal(run.signal.aborted, false);
    assert.equal(t.active, run);
});

test('StreamRun: stop() aborts the run signal and it is no longer current', () => {
    const t = new StreamRunTracker();
    const run = t.start('op1');
    assert.equal(t.stop(), true);
    assert.equal(run.signal.aborted, true);
    assert.equal(run.isCurrent(), false);
    assert.equal(t.stop(), false, 'second stop is a no-op');
});

test('StreamRun: starting a new run supersedes (and aborts) the previous one', () => {
    const t = new StreamRunTracker();
    const a = t.start('op1');
    const b = t.start('op2');
    assert.equal(a.signal.aborted, true);
    assert.equal(a.isCurrent(), false);
    assert.equal(b.isCurrent(), true);
});

test('StreamRun: finish() of a stale run does not clear the new run', () => {
    const t = new StreamRunTracker();
    const a = t.start('op1');
    const b = t.start('op2');
    t.finish(a);
    assert.equal(t.active, b);
    assert.equal(b.isCurrent(), true);
});

test('StreamRun: finish() of the current run clears it without aborting', () => {
    const t = new StreamRunTracker();
    const a = t.start('op1');
    t.finish(a);
    assert.equal(t.active, null);
    assert.equal(a.signal.aborted, false, 'a completed run was not aborted');
    assert.equal(a.isCurrent(), false);
});

/**
 * Regression test for the reported bug: "sometimes no reply, then two replies at
 * once after Stop and Retry". Faithful model of the RPGLiteView flow:
 *   start run -> await setup (the model-metadata download) -> streamingChat,
 *   which registers its operation only when called, then completes later.
 * The user presses Stop DURING setup, then Retry.
 */
async function simulate({ withRunOwnership }) {
    const t = new StreamRunTracker();
    const registry = new Map();
    const rendered = [];

    async function streamingChat(opId, externalSignal, onComplete) {
        const controller = new AbortController();
        registry.set(opId, controller);
        if (externalSignal?.aborted) controller.abort();
        else externalSignal?.addEventListener('abort', () => controller.abort(), { once: true });
        await tick(20);
        registry.delete(opId);
        if (!controller.signal.aborted) onComplete();
    }

    async function send(opId, setupMs) {
        const run = t.start(opId);
        await tick(setupMs); // buildStreamingOptions: /models download, before registration
        if (withRunOwnership && !run.isCurrent()) return;
        await streamingChat(opId, withRunOwnership ? run.signal : undefined, () => {
            if (withRunOwnership && !run.isCurrent()) return;
            rendered.push(opId);
        });
    }

    function pressStop(opId) {
        if (withRunOwnership) t.stop();
        registry.get(opId)?.abort(); // the old mechanism: MISSES if not registered yet
    }

    const first = send('op1', 60);
    await tick(10);
    pressStop('op1'); // during setup - op1 not yet registered with the client
    const retry = send('op2', 5);
    await Promise.all([first, retry]);
    return rendered;
}

test('regression: OLD behaviour renders two replies after Stop-during-setup + Retry', async () => {
    // Pins the bug so this test demonstrably distinguishes old from new behaviour.
    assert.deepEqual((await simulate({ withRunOwnership: false })).sort(), ['op1', 'op2']);
});

test('regression: with run ownership, Stop-during-setup + Retry renders exactly one reply', async () => {
    assert.deepEqual(await simulate({ withRunOwnership: true }), ['op2']);
});
