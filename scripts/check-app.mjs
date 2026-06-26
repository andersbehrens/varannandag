#!/usr/bin/env node
/**
 * Funktionell röktest av "Varannan dag" i en riktig (headless) Chrome via CDP.
 * Testar flera knapptryck och kontrollerar att allt ser rätt ut:
 *   A) Loggning: tre tryck fyller alla set, dagen blir klar, kalendern markerar idag.
 *   B) Tak + Ångra: extra tryck räknas inte, Ångra minskar.
 *   C) Persistens: ladda om → samma data kvar (localStorage).
 *   D) Historik + kalender: seedad månad visar done/partial/missed, månadsbläddring funkar.
 *   E) Layout: ingen horisontell overflow på 320–360px.
 *
 * Användning:  node scripts/check-app.mjs [url]
 * Avslutar med kod 1 om någon kontroll misslyckas.   Kräver Google Chrome.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://localhost:8770/index.html';
const URL = BASE + (BASE.includes('?') ? '&' : '?') + 'today=2026-06-26';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dir = mkdtempSync(join(tmpdir(), 'va-chk-'));
const port = 9400 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`,
  `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check'], { stdio: 'ignore' });

let target;
for (let i = 0; i < 50; i++) {
  try { target = await (await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' })).json(); break; }
  catch { await sleep(200); }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map(); let mid = 0;
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id).res(m.result); pending.delete(m.id); } };
await new Promise((r) => (ws.onopen = r));
const cdp = (method, params = {}) => new Promise((res) => { const i = ++mid; pending.set(i, { res }); ws.send(JSON.stringify({ id: i, method, params })); });

await cdp('Page.enable'); await cdp('Runtime.enable');

const ev = async (expr) => (await cdp('Runtime.evaluate', { expression: `(()=>{${expr}})()`, returnByValue: true })).result.value;
const evx = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
async function nav(url) {
  await cdp('Page.navigate', { url });
  for (let i = 0; i < 60; i++) { if (await evx(`!!document.getElementById('dayProgress')`)) return; await sleep(100); }
  throw new Error('sidan laddade inte: ' + url);
}
const click = (id) => evx(`(document.getElementById(${JSON.stringify(id)})||{click(){}}).click()`);

const checks = [];
const add = (label, ok, got = '') => { checks.push({ label, ok, got }); };

// ---------- A) Loggning ----------
await nav(URL);
await evx(`localStorage.clear()`);
await nav(URL); // ren start, startDate = idag

add('Idag är träningsdag (badge)', (await evx(`document.getElementById('dayBadge').textContent`)).includes('Träningsdag'));
add('Startläge: 0 / 6 set', (await evx(`document.getElementById('dayProgress').textContent`)).trim() === '0 / 6 set');

for (let i = 0; i < 3; i++) { await click('log-pushups'); await sleep(40); }
add('Armhävningar: 3 dots fyllda', (await evx(`document.querySelectorAll('#dots-pushups .filled').length`)) === 3);
add('Armhävningar: knapp "Klart för idag"', (await evx(`document.getElementById('log-pushups').textContent`)).includes('Klart'));
add('Armhävningar: knapp inaktiverad', (await evx(`document.getElementById('log-pushups').disabled`)) === true);
add('Halvvägs: 3 / 6 set', (await evx(`document.getElementById('dayProgress').textContent`)).trim() === '3 / 6 set');

for (let i = 0; i < 3; i++) { await click('log-squats'); await sleep(40); }
add('Squats: 3 dots fyllda', (await evx(`document.querySelectorAll('#dots-squats .filled').length`)) === 3);
add('Dagen klar: 6 / 6 set', (await evx(`document.getElementById('dayProgress').textContent`)).trim() === '6 / 6 set');
add('Klar-meddelande visas', (await evx(`document.getElementById('dayDoneMsg').classList.contains('show')`)) === true);
add('Framstegsstapel 100%', (await evx(`document.getElementById('dayBar').style.width`)) === '100%');
add('Kalender: idag markerad som klar', (await evx(`document.querySelector('.cell.today').classList.contains('done')`)) === true);
add('Streak = 1', (await evx(`document.getElementById('statStreak').textContent`)) === '1');

// ---------- A2) Bonus (löprunda + cykling) ----------
await click('bonus-run'); await sleep(30);
await click('bonus-bike'); await click('bonus-bike'); await sleep(30);
add('Bonus: löprunda räknare = 1', (await evx(`document.querySelector('#bonus-run .bcount')?.textContent`)) === '1');
add('Bonus: cykel räknare = 2', (await evx(`document.querySelector('#bonus-bike .bcount')?.textContent`)) === '2');
add('Bonus: löprunda-knapp aktiv', (await evx(`document.getElementById('bonus-run').classList.contains('active')`)) === true);
add('Kalender: idag har löpprick', (await evx(`!!document.querySelector('.cell.today .bdot-run')`)) === true);
add('Kalender: idag har cykelprick', (await evx(`!!document.querySelector('.cell.today .bdot-bike')`)) === true);
add('Bonus räknas EJ mot dagens set (kvar 6/6)', (await evx(`document.getElementById('dayProgress').textContent`)).trim() === '6 / 6 set');
await click('bonusundo-bike'); await sleep(30);
add('Bonus: ångra cykel → 1', (await evx(`document.querySelector('#bonus-bike .bcount')?.textContent`)) === '1');

// ---------- B) Tak + Ångra ----------
for (let i = 0; i < 4; i++) { await click('log-pushups'); await sleep(20); }
add('Tak: extra tryck räknas inte (kvar 3)', (await evx(`document.querySelectorAll('#dots-pushups .filled').length`)) === 3);

await click('undo-pushups'); await sleep(40);
add('Ångra: armhävningar nu 2 fyllda', (await evx(`document.querySelectorAll('#dots-pushups .filled').length`)) === 2);
add('Ångra: 5 / 6 set', (await evx(`document.getElementById('dayProgress').textContent`)).trim() === '5 / 6 set');
add('Kalender: idag nu påbörjad', (await evx(`document.querySelector('.cell.today').classList.contains('partial')`)) === true);

// ---------- C) Persistens ----------
await nav(URL); // ladda om utan att rensa
add('Persistens: 5 / 6 set kvar efter omladdning', (await evx(`document.getElementById('dayProgress').textContent`)).trim() === '5 / 6 set');
add('Persistens: armhävningar 2 fyllda kvar', (await evx(`document.querySelectorAll('#dots-pushups .filled').length`)) === 2);
add('Persistens: bonus löprunda 1 kvar', (await evx(`document.querySelector('#bonus-run .bcount')?.textContent`)) === '1');
add('Persistens: bonus cykel 1 kvar', (await evx(`document.querySelector('#bonus-bike .bcount')?.textContent`)) === '1');

// ---------- D) Migrering v1 -> v2 (befintlig data får INTE raderas) ----------
const seedV1 = {
  version: 1,
  settings: { startDate: '2026-06-01', schedule: 'everyOtherDay',
    exercises: [ { id: 'pushups', name: 'Armhävningar', reps: 10, sets: 3 }, { id: 'squats', name: 'Squats', reps: 10, sets: 3 } ] },
  log: { '2026-06-01': { pushups: 3, squats: 3 }, '2026-06-03': { pushups: 3, squats: 3 }, '2026-06-05': { pushups: 1 } }
};
await evx(`localStorage.setItem('varannandag.v1', ${JSON.stringify(JSON.stringify(seedV1))})`);
await nav(URL);
add('Migrering: gammal historik bevaras (01 juni klar)', (await evx(`(document.querySelector('.cell[data-date="2026-06-01"]')||{className:''}).className`)).includes('done'));
add('Migrering: data uppgraderad till version 2', (await evx(`JSON.parse(localStorage.getItem('varannandag.v1')).version`)) === 2);
add('Migrering: bonusLog skapad', (await evx(`typeof JSON.parse(localStorage.getItem('varannandag.v1')).bonusLog`)) === 'object');

// ---------- E) Historik, bonus i kalender + bläddring ----------
const seed = {
  version: 2,
  settings: { startDate: '2026-06-01', schedule: 'everyOtherDay',
    exercises: [ { id: 'pushups', name: 'Armhävningar', reps: 10, sets: 3 }, { id: 'squats', name: 'Squats', reps: 10, sets: 3 } ],
    bonus: [ { id: 'run', name: 'Löprunda', emoji: '🏃' }, { id: 'bike', name: 'Cyklat till jobbet', emoji: '🚲' } ] },
  log: { '2026-06-01': { pushups: 3, squats: 3 }, '2026-06-03': { pushups: 3, squats: 3 }, '2026-06-05': { pushups: 1 } },
  bonusLog: { '2026-06-02': { bike: 1 }, '2026-06-09': { run: 1, bike: 2 } }
};
await evx(`localStorage.setItem('varannandag.v1', ${JSON.stringify(JSON.stringify(seed))})`);
await nav(URL);
const cellCls = (d) => evx(`(document.querySelector('.cell[data-date="2026-06-${d}"]')||{className:''}).className`);
add('Historik: 01 juni = klar (done)', (await cellCls('01')).includes('done'));
add('Historik: 05 juni = påbörjad (partial)', (await cellCls('05')).includes('partial'));
add('Historik: 07 juni = missad (missed)', (await cellCls('07')).includes('missed'));
add('Historik: 02 juni = ej tränings-markerad', !/\b(done|partial|missed|scheduled)\b/.test(await cellCls('02')));
add('Bonus i kalender: 02 juni (vilodag) har cykelprick', (await evx(`!!document.querySelector('.cell[data-date="2026-06-02"] .bdot-bike')`)) === true);
add('Bonus i kalender: 02 juni klickbar (has)', (await cellCls('02')).includes('has'));
add('Bonus i kalender: 09 juni har löpprick + cykelprick', (await evx(`!!document.querySelector('.cell[data-date="2026-06-09"] .bdot-run') && !!document.querySelector('.cell[data-date="2026-06-09"] .bdot-bike')`)) === true);

add('Kalender visar Juni 2026', (await evx(`document.getElementById('calMonth').textContent`)).includes('Juni 2026'));
await click('calPrev'); await sleep(40);
add('Bläddra bakåt → Maj 2026', (await evx(`document.getElementById('calMonth').textContent`)).includes('Maj 2026'));
await click('calNext'); await click('calNext'); await sleep(40);
add('Bläddra framåt → Juli 2026', (await evx(`document.getElementById('calMonth').textContent`)).includes('Juli 2026'));

// detaljrad vid klick på en dag
await click('calNext'); // tillbaka? nej -> aug; gå tillbaka till juni
// säkra: navigera om för rent juni-läge
await nav(URL);
await evx(`document.querySelector('.cell[data-date="2026-06-01"]').click()`); await sleep(40);
add('Klick på dag visar detaljrad', /Armhävningar 3\/3/.test(await evx(`document.getElementById('calDetail').textContent`)));
await evx(`document.querySelector('.cell[data-date="2026-06-09"]').click()`); await sleep(40);
add('Detaljrad visar bonus', /Bonus/.test(await evx(`document.getElementById('calDetail').textContent`)));

// ---------- F) Layout: ingen horisontell overflow ----------
for (const w of [320, 360]) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: true });
  await nav(URL);
  const sw = await evx(`document.documentElement.scrollWidth`);
  add(`Layout ${w}px: ingen horisontell overflow (scrollW ${sw})`, sw <= w + 1);
}
await cdp('Emulation.clearDeviceMetricsOverride');

// ---------- konsolfel ----------
// (Runtime.consoleAPICalled fångas inte historiskt; en enkel sanity: appen exponerar __state)
add('App-state tillgängligt (ingen JS-krasch)', (await evx(`typeof window.__state === 'function'`)) === true);

// ---------- rapport ----------
let failed = 0;
console.log('\n  Varannan dag — funktionstest\n  ' + '─'.repeat(46));
for (const c of checks) {
  console.log(`  ${c.ok ? '✓' : '✗'} ${c.label}${c.ok ? '' : '   →  fick: ' + JSON.stringify(c.got)}`);
  if (!c.ok) failed++;
}
console.log('  ' + '─'.repeat(46));
console.log(`  ${checks.length - failed}/${checks.length} OK${failed ? `,  ${failed} MISSLYCKADES` : '  — allt grönt 🎉'}\n`);

try { chrome.kill(); } catch {}
try { rmSync(dir, { recursive: true, force: true }); } catch {}
process.exit(failed ? 1 : 0);
