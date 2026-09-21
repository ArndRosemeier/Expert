import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTs, srcPath } from '../tools/app-tests/load-ts.mjs';

const { generateLogId, addLogEntry } = await importTs(srcPath('logPersistence.ts'));

/** Minimal in-memory stand-in for IndexedDBService. */
function makeStore({ failInit = false, failSet = false } = {}) {
    const calls = { set: [], ensureInit: 0 };
    return {
        calls,
        store: {
            set: async (storeName, key, value) => {
                calls.set.push({ storeName, key, value });
                if (failSet) throw new Error('set failed');
            },
        },
        ensureInitialized: async () => {
            calls.ensureInit++;
            if (failInit) throw new Error('init failed');
        },
    };
}

/** Capture console.error without polluting test output. */
function captureConsoleError() {
    const original = console.error;
    const calls = [];
    console.error = (...args) => calls.push(args);
    return { calls, restore: () => { console.error = original; } };
}

test('generateLogId: <prefix>-<epoch>-<9 base36 chars>', () => {
    const id = generateLogId('ai-log');
    assert.match(id, /^ai-log-\d+-[0-9a-z]{9}$/);
});

test('generateLogId: honours an arbitrary prefix', () => {
    assert.match(generateLogId('error-log'), /^error-log-\d+-[0-9a-z]{9}$/);
});

test('generateLogId: unique across rapid calls', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateLogId('x')));
    assert.equal(ids.size, 200);
});

test('addLogEntry: persists to the given store with the generated id', async () => {
    const h = makeStore();
    await addLogEntry({ message: 'hello' }, h.store, h.ensureInitialized, {
        storeName: 'aiLogs',
        idPrefix: 'ai-log',
        failureMessage: 'Failed to add AI log entry:',
    });
    assert.equal(h.calls.set.length, 1);
    assert.equal(h.calls.set[0].storeName, 'aiLogs');
    assert.match(h.calls.set[0].key, /^ai-log-\d+-[0-9a-z]{9}$/);
    assert.equal(h.calls.set[0].value.id, h.calls.set[0].key);
    assert.equal(h.calls.set[0].value.message, 'hello');
});

test('addLogEntry: entry fields are preserved, id is added last', async () => {
    const h = makeStore();
    await addLogEntry({ message: 'm', source: 'window.onerror', extra: 42 }, h.store, h.ensureInitialized, {
        storeName: 'errorLogs',
        idPrefix: 'error-log',
        failureMessage: 'x',
    });
    const saved = h.calls.set[0].value;
    assert.equal(saved.message, 'm');
    assert.equal(saved.source, 'window.onerror');
    assert.equal(saved.extra, 42);
});

test('addLogEntry: initInsideTry=false lets an init failure REJECT (AILogService semantics)', async () => {
    const h = makeStore({ failInit: true });
    const c = captureConsoleError();
    try {
        await assert.rejects(
            () => addLogEntry({ message: 'm' }, h.store, h.ensureInitialized, {
                storeName: 'aiLogs',
                idPrefix: 'ai-log',
                failureMessage: 'Failed to add AI log entry:',
            }),
            /init failed/
        );
    } finally {
        c.restore();
    }
    assert.equal(h.calls.set.length, 0, 'nothing should be persisted when init rejects');
    assert.equal(c.calls.length, 0, 'init failure propagates, it is not swallowed');
});

test('addLogEntry: initInsideTry=true SWALLOWS an init failure (ErrorLogService semantics)', async () => {
    const h = makeStore({ failInit: true });
    const c = captureConsoleError();
    try {
        await addLogEntry({ message: 'm' }, h.store, h.ensureInitialized, {
            storeName: 'errorLogs',
            idPrefix: 'error-log',
            failureMessage: 'Failed to persist error log entry:',
            initInsideTry: true,
        });
    } finally {
        c.restore();
    }
    assert.equal(h.calls.set.length, 0);
    assert.equal(c.calls.length, 1, 'the failure is reported to the console');
    assert.equal(c.calls[0][0], 'Failed to persist error log entry:');
});

test('addLogEntry: a persistence failure is swallowed and reported', async () => {
    const h = makeStore({ failSet: true });
    const c = captureConsoleError();
    try {
        await addLogEntry({ message: 'm' }, h.store, h.ensureInitialized, {
            storeName: 'aiLogs',
            idPrefix: 'ai-log',
            failureMessage: 'Failed to add AI log entry:',
        });
    } finally {
        c.restore();
    }
    assert.equal(c.calls.length, 1);
    assert.equal(c.calls[0][0], 'Failed to add AI log entry:');
    assert.equal(c.calls[0].length, 2, 'without logEntryOnFailure only (message, error)');
});

test('addLogEntry: logEntryOnFailure=true includes the lost entry', async () => {
    const h = makeStore({ failSet: true });
    const c = captureConsoleError();
    try {
        await addLogEntry({ message: 'm' }, h.store, h.ensureInitialized, {
            storeName: 'errorLogs',
            idPrefix: 'error-log',
            failureMessage: 'Failed to persist error log entry:',
            initInsideTry: true,
            logEntryOnFailure: true,
        });
    } finally {
        c.restore();
    }
    assert.equal(c.calls.length, 1);
    assert.equal(c.calls[0].length, 4);
    assert.equal(c.calls[0][2], 'original entry:');
    assert.equal(c.calls[0][3].message, 'm');
});

test('addLogEntry: initOutsideTry still initializes once before writing', async () => {
    const h = makeStore();
    await addLogEntry({ message: 'm' }, h.store, h.ensureInitialized, {
        storeName: 'aiLogs',
        idPrefix: 'ai-log',
        failureMessage: 'x',
    });
    assert.equal(h.calls.ensureInit, 1);
});
