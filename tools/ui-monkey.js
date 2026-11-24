// Random but reproducible UI run for checking that a refactor did not change behaviour.
// Needs Playwright (not a project dependency):  npm i -D playwright && npx playwright install chromium
//   node tools/ui-monkey.js <url> <outdir> <seed> <steps> [url2]
//   single file:  node tools/ui-monkey.js file://$PWD/dist/metalmadness.html runs/before 1 300
//   network:      start the server with a fixed Math.random, then pass the same room twice:
//                 node tools/ui-monkey.js "http://localhost:3000/client/?room=t" runs/net 3 120 "http://localhost:3000/client/?room=t"
// Every step picks an action (map click, panel button, key, hover) with a seeded RNG, the page clock is frozen and advanced
// by hand, and the game state + HTML of every window is recorded. Run the old and the new build with the same seed,
// then: node tools/ui-compare.js runs/before runs/after
const { chromium } = require('playwright');
const crypto = require('crypto'), fs = require('fs');
const [url, out, seedArg, stepsArg, url2] = process.argv.slice(2);
const seed = +seedArg || 1, STEPS = +stepsArg || 150;
let r = seed >>> 0; const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 2 ** 32; };
const H = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 10);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const ctx1 = await b.newContext({ viewport: { width: 1600, height: 950 } });
  let p = await ctx1.newPage();
  const NET = !!url2; let p2 = null;
  await p.addInitScript((sd) => { let x = sd >>> 0; Math.random = () => { x = (x * 1103515245 + 12345) >>> 0; return x / 2 ** 32; }; try { localStorage.clear(); } catch (_) {} }, seed * 7 + 3);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const T = { run: async (ms) => (NET ? p.waitForTimeout(ms + 200) : p.clock.runFor(ms)) };
  if (!NET) { await p.clock.install({ time: new Date('2026-11-21T12:00:00Z') }); await p.clock.pauseAt(new Date('2026-11-21T12:00:01Z')); }
  await p.goto(url); await p.waitForFunction(() => globalThis.__mm); await T.run(300);
  if (NET) { const c2 = await b.newContext({ viewport: { width: 1600, height: 950 } }); p2 = await c2.newPage(); p2.on('pageerror', (e) => errs.push('p2 ' + e.message)); await p2.goto(url2); await p2.waitForFunction(() => globalThis.__mm); await p2.waitForTimeout(800); }
  const pages = NET ? [p, p2] : [p];
  const snap = async () => pages[0].evaluate(() => {
    const ids = ['panel', 'mech', 'info', 'dice', 'log', 'skills', 'roundrow', 'pilotfly', 'settings', 'weather'];
    const dom = Object.fromEntries(ids.map((i) => { const e = document.getElementById(i); return [i, e ? e.innerHTML + '|' + getComputedStyle(e).display : '']; }));
    return { dom, cv: document.getElementById('cv').toDataURL(), state: JSON.stringify(__mm.g.state) };
  });
  const cands = async () => p.evaluate(() => {
    const L = [], s = __mm.g.state, cv = document.getElementById('cv'), rc = cv.getBoundingClientRect();
    const scr = (h) => { const q = __mm.pix(h); return { x: rc.left + q.x * rc.width / cv.width, y: rc.top + q.y * rc.height / cv.height }; };
    const vis = (e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed' && getComputedStyle(e).display !== 'none';
    document.querySelectorAll('#panel button, #dice button, #skills [data-pos], #pilotfly [data-pilot], #mech button').forEach((e, i) => {
      if (e.disabled || !vis(e)) return; const t = (e.textContent || '').trim();
      if (/Новая игра|Ссылка/.test(t)) return;
      const rr = e.getBoundingClientRect(); if (!rr.width) return;
      L.push({ k: 'btn:' + (e.closest('[id]')?.id) + ':' + (e.dataset ? JSON.stringify(e.dataset) : '') + ':' + t.slice(0, 30), x: rr.left + rr.width / 2, y: rr.top + rr.height / 2 });
    });
    const lg = __mm.legal, a = s.activation;
    const cells = Object.values(s.map.cells);
    if (!a && !s.pending) for (const m of Object.values(s.mechs)) if (m.status === 'active' && !m.activated && m.owner === s.turn.player) L.push({ k: 'mech:' + m.id, ...scr(m.pos) });
    if (a) {
      for (const [k, h] of [...lg.moves, ...lg.jumps]) L.push({ k: 'move:' + k, ...scr(h) });
      for (const id of lg.targets) L.push({ k: 'tgt:' + id, ...scr(s.mechs[id].pos) });
      for (const id of lg.rams) L.push({ k: 'ram:' + id, ...scr(s.mechs[id].pos) });
      for (const [k, h] of [...lg.hexTargets, ...lg.mineHexes, ...lg.mineStep]) L.push({ k: 'hex:' + k, ...(h.q !== undefined ? scr(h) : scr(cells.find((c) => c.q + ',' + c.r === k) ?? cells[0])) });
      if (a.phase !== 'PLAY') { for (const t of ['ROLL_PILOT', 'EMERGENCY_SHUTDOWN']) if (__mm.dry({ type: t })) L.push({ k: 'send:' + t }); }
      ['KeyW', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'KeyS'].forEach((c) => L.push({ k: 'key:' + c }));
    }
    for (let i = 0; i < 3; i++) { const c = cells[(s.round * 7 + i * 31 + (a ? 5 : 0)) % cells.length]; L.push({ k: 'hover:' + c.q + ',' + c.r, ...scr(c), hover: true }); }
    L.push({ k: 'roundbar' });
    return L.sort((x, y) => (x.k < y.k ? -1 : 1));
  });
  const log = [];
  for (let step = 0; step <= STEPS; step++) {
    const sn = await snap();
    const rec = { step, cv: H(sn.cv), state: H(sn.state), dom: Object.fromEntries(Object.entries(sn.dom).map(([k, v]) => [k, H(v)])) };
    fs.writeFileSync(`${out}/s${String(step).padStart(3, '0')}.json`, JSON.stringify(sn.dom));
    if (step === STEPS) { log.push(rec); break; }
    if (NET) p = pages[step % 2];
    const L = await cands(); const c = L[Math.floor(rnd() * L.length)]; rec.act = c.k; log.push(rec);
    if (c.k.startsWith('send:')) await p.evaluate((t) => __mm.send({ type: t }), c.k.slice(5));
    else if (c.k.startsWith('key:')) await p.keyboard.press(c.k.slice(4).replace('Key', '').toLowerCase());
    else if (c.k === 'roundbar') await p.click('#roundbar');
    else if (c.hover) await p.mouse.move(c.x, c.y);
    else { await p.mouse.move(c.x, c.y); await T.run(30); await p.mouse.click(c.x, c.y); }
    await T.run(120); await p.waitForTimeout(20);
  }
  fs.writeFileSync(`${out}/log.json`, JSON.stringify({ log, errs }, null, 1));
  console.log(out, 'steps', log.length, 'errors', errs.length, errs.slice(0, 3), 'last state', log[log.length - 1].state, 'round', JSON.parse((await snap()).state).round);
  await b.close();
})();
