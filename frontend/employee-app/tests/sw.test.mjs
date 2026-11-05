// Checks public/sw.js without a browser: a small fake of the service-worker scope drives its install / activate / fetch handlers.
// Run: node tests/sw.test.mjs   (exit code 1 on any failure)
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';

const code = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://app.example';
const handlers = {}; const store = new Map();               // cacheName → Map(url → body)
let online = true; const log = [];
const cacheApi = {
  open: async (name) => { if (!store.has(name)) store.set(name, new Map()); const m = store.get(name); return { addAll: async (urls) => urls.forEach((u) => m.set(new URL(u, ORIGIN).href, 'shell:' + u)), put: async (req, res) => m.set(typeof req === 'string' ? new URL(req, ORIGIN).href : req.url, res) }; },
  match: async (req) => { const k = typeof req === 'string' ? new URL(req, ORIGIN).href : req.url; for (const m of store.values()) if (m.has(k)) return m.get(k); return undefined; },
  keys: async () => [...store.keys()], delete: async (n) => store.delete(n),
};
const mkRes = (body, ok = true) => ({ ok, body, clone() { return this; } });
const self = { location: { origin: ORIGIN }, addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting: async () => log.push('skipWaiting'), clients: { claim: async () => log.push('claim') } };
const sandbox = { self, caches: cacheApi, URL, fetch: async (req) => { log.push('net:' + req.url); if (!online) throw new Error('offline'); return mkRes('net:' + req.url); } };
vm.runInNewContext(code, sandbox);

const run = async (fn, event) => { const p = []; event.waitUntil = (x) => p.push(x); event.respondWith = (x) => { event.responded = x; }; fn(event); await Promise.all(p); return event; };
const req = (url, method = 'GET', mode = 'cors') => ({ url: new URL(url, ORIGIN).href, method, mode });

// install: the shell is cached and the worker activates at once
store.set('ariba-employee-v0', new Map([['x', 1]]));                   // an old version must disappear on activate
await run(handlers.install, {}); assert.ok(log.includes('skipWaiting')); assert.ok(store.get('ariba-employee-v1').has(ORIGIN + '/'));
await run(handlers.activate, {}); assert.ok(!store.has('ariba-employee-v0'), 'old cache removed'); assert.ok(log.includes('claim'));
// other origins and non-GET are never touched (the API must always be live)
let e = await run(handlers.fetch, { request: req('https://api.example.com/api/v1/me/payslips') }); assert.equal(e.responded, undefined, 'cross-origin API untouched');
e = await run(handlers.fetch, { request: req('/api/x', 'POST') }); assert.equal(e.responded, undefined, 'POST untouched');
e = await run(handlers.fetch, { request: req('/some/other.json') }); assert.equal(e.responded, undefined, 'unknown same-origin GET untouched');
// page loads: network first, the cached shell only when offline
e = await run(handlers.fetch, { request: req('/salary', 'GET', 'navigate') }); assert.equal((await e.responded).body, 'net:' + ORIGIN + '/salary');
online = false; e = await run(handlers.fetch, { request: req('/salary', 'GET', 'navigate') }); assert.equal(await e.responded, store.get('ariba-employee-v1').get(ORIGIN + '/'), 'offline → cached shell');
// build files: cache first
online = true; log.length = 0; const asset = req('/_expo/static/js/web/entry-abc.js');
e = await run(handlers.fetch, { request: asset }); assert.equal((await e.responded).body, 'net:' + asset.url); assert.ok(log.includes('net:' + asset.url));
log.length = 0; online = false; e = await run(handlers.fetch, { request: asset }); assert.equal((await e.responded).body, 'net:' + asset.url); assert.ok(!log.some((l) => l.startsWith('net:')), 'served from cache, no network');
console.log('sw.js: all checks passed');
