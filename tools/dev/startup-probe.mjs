// Startup-timing probe: real built app, headless Chrome, OpenRouter faked with
// configurable latency. Reports how long the app takes to reach
// "✅ Expert application started successfully" and the request timeline.
//
// Usage: node tools/dev/startup-probe.mjs [--models-ms N] [--endpoints-ms N] [--url U]
//   --models-ms     latency for /api/v1/models      (default 60000, i.e. the slow case)
//   --endpoints-ms  latency for /api/v1/models/*/endpoints (default 3000)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? dflt : Number(process.argv[i + 1]);
};
// Fail loudly on regression instead of only printing numbers.
const MAX_STARTUP_MS = arg('max-startup-ms', 3000);
const REQUIRE_MODELS = !process.argv.includes('--no-require-models');
const MODELS_MS = arg('models-ms', 60000);
const ENDPOINTS_MS = arg('endpoints-ms', 3000);
const urlIdx = process.argv.indexOf('--url');
const URL_UNDER_TEST = urlIdx === -1 ? 'http://127.0.0.1:8082/expert/' : process.argv[urlIdx + 1];
const PORT = 9336;

const profile = mkdtempSync('/tmp/chrome-startup-');
const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore', detached: true });
const cleanup = () => {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* already gone */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
};
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 80; i++) {
    try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        const page = list.find(t => t.type === 'page');
        if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch { /* not up yet */ }
    await sleep(200);
}
if (!wsUrl) { console.log('PROBE ERROR: Chrome did not start'); process.exit(2); }

const sock = new WebSocket(wsUrl);
await new Promise(r => { sock.onopen = r; });
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise(r => {
    const i = ++id; pending.set(i, r); sock.send(JSON.stringify({ id: i, method, params }));
});

// All reported timings are relative to this base, which is reset immediately before
// the measured page load (the first load is only used to seed storage).
let base = Date.now();
const timeline = [];
let readyMs = null;
const started = () => { if (readyMs === null) readyMs = Date.now() - base; };

sock.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
        if (text.includes('Expert application started successfully')) started();
        if (/fetchModels|Failed|error/i.test(text)) timeline.push({ kind: 'console', t: Date.now() - base, text: text.slice(0, 120) });
    }
    if (m.method === 'Fetch.requestPaused') {
        const { requestId, request } = m.params;
        const url = request.url;
        const cors = [
            { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Access-Control-Allow-Headers', value: '*' },
            { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
        ];
        if (request.method === 'OPTIONS') { send('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: cors }); return; }
        const isModels = /\/api\/v1\/models(\?|$)/.test(url);
        const isEndpoints = /\/endpoints(\?|$)/.test(url);
        const delay = isModels ? MODELS_MS : isEndpoints ? ENDPOINTS_MS : 200;
        const label = isModels ? '/models' : isEndpoints ? '/endpoints' : url.replace('https://openrouter.ai/api/v1', '');
        timeline.push({ kind: 'request', label, t: Date.now() - base, delay });
        const body = isModels
            ? JSON.stringify({ data: ['creator/one', 'rater/two', 'editor/three', 'prose/four'].map(m => ({
                id: m, name: m, description: 'probe model', supported_parameters: ['max_tokens'],
                architecture: { output_modalities: ['text'] }, pricing: { prompt: '0', completion: '0' }, context_length: 1,
            })) })
            : isEndpoints
                ? JSON.stringify({ data: { endpoints: [{ name: 'p', provider_name: 'p', supported_parameters: ['max_tokens'], pricing: { prompt: '0', completion: '0' }, context_length: 1 }] } })
                : JSON.stringify({ data: {} });
        setTimeout(() => {
            send('Fetch.fulfillRequest', {
                requestId, responseCode: 200,
                responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, ...cors],
                body: Buffer.from(body).toString('base64'),
            });
        }, delay);
    }
};

await send('Page.enable');
await send('Runtime.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: 'https://openrouter.ai/*' }] });

// First load: seed storage the way the app itself stores it, then reload so startup reads it.
await send('Page.navigate', { url: URL_UNDER_TEST });
await sleep(5000);
const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true });
    return r.result?.result?.value;
};
const purposes = ['creator', 'rater', 'editor', 'prose'];
await evaluate(`new Promise((res, rej) => {
    const open = indexedDB.open('ExpertAppDB');
    open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('keyValue', 'readwrite');
        const store = tx.objectStore('keyValue');
        store.put({ key: 'openrouter_api_key', value: 'sk-or-v1-' + '0'.repeat(64) });
        const models = {}; ${JSON.stringify(purposes)}.forEach(p => { models[p] = 'creator/one'; });
        store.put({ key: 'expert_app_settings_profiles', value: { default: {
            criteria: [], maxIterations: 1, selectedModels: models,
            webSearchEnabled: {}, selectedProviders: {}, selectedParams: {},
        } } });
        store.put({ key: 'expert_app_last_used_profile', value: 'default' });
        tx.oncomplete = () => res('seeded');
        tx.onerror = () => rej(tx.error);
    };
    open.onerror = () => rej(open.error);
})`);

timeline.length = 0;
readyMs = null;
base = Date.now();          // start measuring here: the real page load
await send('Page.reload');
for (let i = 0; i < 250 && readyMs === null; i++) await sleep(100);
const elapsed = readyMs ?? (Date.now() - base);

console.log(`\nstartup probe  (url=${URL_UNDER_TEST})`);
console.log(`  simulated latency: /models=${MODELS_MS}ms  /endpoints=${ENDPOINTS_MS}ms  (4 models selected)`);
console.log(`  time to "Expert application started successfully": ${readyMs === null ? `NEVER (still not ready after ${elapsed}ms)` : elapsed + 'ms'}`);
// Correctness: the model list lives in the Settings modal, so open it (the real user
// path) and then watch for OUR model id to appear once the slow catalog lands.
const opened = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Settings/i.test(b.textContent || ''));
    if (!btn) return 'no-settings-button';
    btn.click();
    return 'clicked';
})()`);
if (opened !== 'clicked') console.log(`  WARNING: could not open Settings (${opened})`);
await sleep(500);
let modelsShownMs = null;
for (let i = 0; i < 300 && modelsShownMs === null; i++) {
    // Must look for OUR model id: the page has other <option>s (profile dropdown)
    // that appear immediately and would give a false pass.
    const n = await evaluate(`[...document.querySelectorAll('option')].filter(o => o.value === 'creator/one' || o.textContent.trim() === 'creator/one').length`);
    if (typeof n === 'number' && n > 0) modelsShownMs = Date.now() - base;
    else await sleep(100);
}
console.log(`  models visible in the UI after: ${modelsShownMs === null ? 'NEVER (not shown)' : modelsShownMs + 'ms'}`);
console.log('  request timeline:');
for (const e of timeline.filter(x => x.kind === 'request')) {
    console.log(`    +${String(e.t).padStart(6)}ms  ${e.label}${e.delay ? ` (served after ${e.delay}ms)` : ''}`);
}
for (const e of timeline.filter(x => x.kind === 'console').slice(0, 6)) {
    console.log(`    +${String(e.t).padStart(6)}ms  console: ${e.text}`);
}

// Verdict. Startup must not be gated on the network: with a slow catalog the app has
// to come up immediately and fill the model list in later.
const problems = [];
if (readyMs === null) problems.push('the app never finished starting up');
else if (readyMs > MAX_STARTUP_MS) problems.push(`startup took ${readyMs}ms (limit ${MAX_STARTUP_MS}ms)`);
if (REQUIRE_MODELS && modelsShownMs === null) problems.push('models never appeared in the UI');
if (REQUIRE_MODELS && modelsShownMs !== null && modelsShownMs < MODELS_MS) {
    problems.push(`models appeared at ${modelsShownMs}ms, before the catalog was served at ${MODELS_MS}ms (probe data problem)`);
}
if (problems.length > 0) {
    console.log(`\n  FAIL: ${problems.join('; ')}`);
    process.exit(1);
}
console.log(`\n  PASS: startup ${readyMs}ms (limit ${MAX_STARTUP_MS}ms) with a ${MODELS_MS}ms catalog; models shown at ${modelsShownMs}ms`);
process.exit(0);
