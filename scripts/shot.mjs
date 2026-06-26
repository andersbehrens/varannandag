#!/usr/bin/env node
// Tar en helsides-skärmdump av appen med lite seedad demodata. node scripts/shot.mjs [url] [out.png]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const BASE = process.argv[2] || 'http://localhost:8770/index.html';
const OUT = process.argv[3] || '/tmp/va-shot.png';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'today=2026-06-26';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'va-shot-'));
const port = 9700 + Math.floor(Math.random() * 200);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 50; i++) { try { target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json(); break; } catch { await sleep(200); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map(); let mid = 0;
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const cdp = (method, params = {}) => new Promise((res) => { const i = ++mid; pending.set(i, { res }); ws.send(JSON.stringify({ id: i, method, params })); });
await cdp('Page.enable'); await cdp('Runtime.enable');
const evx = async (e) => (await cdp('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
await cdp('Emulation.setDeviceMetricsOverride', { width: 400, height: 900, deviceScaleFactor: 2, mobile: true });
async function go() { await cdp('Page.navigate', { url: URL }); for (let i = 0; i < 60; i++) { if (await evx(`!!document.getElementById('dayProgress')`)) return; await sleep(100); } }
await go();
// seed: startdatum tidigare denna månad, några klara dagar + idag påbörjad
const seed = { version: 2, settings: { startDate: '2026-06-08', schedule: 'everyOtherDay', exercises: [{ id: 'pushups', name: 'Armhävningar', reps: 10, sets: 3 }, { id: 'squats', name: 'Squats', reps: 10, sets: 3 }], bonus: [{ id: 'run', name: 'Löprunda', emoji: '🏃' }, { id: 'bike', name: 'Cyklat till jobbet', emoji: '🚲' }] }, log: { '2026-06-08': { pushups: 3, squats: 3 }, '2026-06-10': { pushups: 3, squats: 3 }, '2026-06-12': { pushups: 3, squats: 3 }, '2026-06-16': { pushups: 3, squats: 3 }, '2026-06-18': { pushups: 3, squats: 3 }, '2026-06-20': { pushups: 3, squats: 3 }, '2026-06-22': { pushups: 3, squats: 3 }, '2026-06-24': { pushups: 3, squats: 3 }, '2026-06-26': { pushups: 2, squats: 1 } }, bonusLog: { '2026-06-09': { run: 1 }, '2026-06-15': { bike: 2 }, '2026-06-22': { run: 1, bike: 2 }, '2026-06-26': { bike: 1 } } };
await evx(`localStorage.setItem('varannandag.v1', ${JSON.stringify(JSON.stringify(seed))})`);
await go();
await sleep(300);
const full = await evx(`({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight})`);
await cdp('Emulation.setDeviceMetricsOverride', { width: full.w, height: full.h, deviceScaleFactor: 2, mobile: true });
await sleep(200);
const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
writeFileSync(OUT, Buffer.from(data, 'base64'));
console.log('wrote', OUT, full);
try { chrome.kill(); } catch {}
process.exit(0);
