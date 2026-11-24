// Canvas drawing: hexes, tokens, markers, previews, the roll / shutdown buttons on the token.
import { CLASSES } from '../core/data/classes.js';
import { TERRAIN } from '../core/data/terrain.js';
import { mustShutdown } from '../core/engine.js';
import { distance, inArc, key, neighbor, toPixel, DIRS } from '../core/hex.js';
import { planStep } from '../core/movement.js';
import { RULES } from '../core/rules.js';
import { evadeOf } from '../core/state.js';
import { drawZones, drawGhost, drawPetals, drawBadge, drawBanner } from './moveinput.js';
import { S, ctx, cv, img } from './dom.js';
import { TOK } from './labels.js';
import { myInput, pix, st, ui } from './ui.js';
import { jumpPip } from './actions.js';
import { badge, gaRadiusAt, movePreview } from './legal.js';
import { placeInfo } from './tooltip.js';

export const imgCache = {};
export function cimg(name) {                      // canvas image: loads lazily, redraws when ready
  if (typeof Image === 'undefined') return null;
  let i = imgCache[name];
  if (!i) { i = imgCache[name] = new Image(); i.onload = () => draw(); i.src = img(name); }
  return i.complete && i.naturalWidth ? i : null;
}

// ---- drawing
// hexPath draws corner i at angle 60i−30°; the edge between corners i and i+1 faces the neighbour in this direction
export const hexEdgeDir = (i) => i;
export function hexPath(c) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); ctx[i ? 'lineTo' : 'moveTo'](c.x + S * Math.cos(a), c.y + S * Math.sin(a)); } ctx.closePath(); }
// handle of a movable own mine: a small disc at the upper-right of its token (canvas coordinates)
export const mineHandle = (mn) => { const p = pix(mn.pos); return { x: p.x + S * 0.56, y: p.y - S * 0.56, r: S * 0.27 }; };
export function draw() {
  const s = st(); ctx.clearRect(0, 0, cv.width, cv.height); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const act = s.activation && s.mechs[s.activation.mechId];
  const mp = movePreview(), pv = mp && !mp.bad && mp.type !== 'arm' && mp.g !== null && mp.g !== undefined ? mp : null;   // where the mech would stand / look
  for (const c of Object.values(s.map.cells)) {
    const p = pix(c); hexPath(p); ctx.fillStyle = '#' + TERRAIN[c.terrain].color; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
    if (c.cover) { ctx.fillStyle = 'rgba(60,60,60,.8)'; ctx.font = '13px sans-serif'; ctx.fillText('▲' + c.cover, p.x, p.y + 14); }
  }
  if (act) {                      // reach of the active mech (or of its ghost while a move is previewed): every hex inside the 120° arc within 9, outlined along its outer edge
    const rp = pv ? { pos: pv.h, facing: pv.g } : act;
    const reach = new Set(Object.values(s.map.cells).filter((c) => distance(rp.pos, c) >= 1 && distance(rp.pos, c) <= 9 && inArc(rp.pos, rp.facing, c, RULES.arcDegrees, RULES.arcBoundaryInclusive)).map(key));
    for (const k of reach) { hexPath(pix(s.map.cells[k])); ctx.fillStyle = pv ? 'rgba(60,140,255,.12)' : 'rgba(240,180,41,.12)'; ctx.fill(); }
    ctx.strokeStyle = pv ? 'rgba(60,140,255,.95)' : 'rgba(240,160,20,.95)'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (const k of reach) { const c = s.map.cells[k], p = pix(c);
      for (let i = 0; i < 6; i++) { if (reach.has(key(neighbor(c, hexEdgeDir(i))))) continue;
        const a1 = (Math.PI / 180) * (60 * i - 30), a2 = (Math.PI / 180) * (60 * (i + 1) - 30);
        ctx.moveTo(p.x + S * Math.cos(a1), p.y + S * Math.sin(a1)); ctx.lineTo(p.x + S * Math.cos(a2), p.y + S * Math.sin(a2)); } }
    ctx.stroke(); ctx.lineWidth = 1;
  }
  for (const [, h] of ui.legal.moves) { hexPath(pix(h)); ctx.fillStyle = 'rgba(60,200,90,.45)'; ctx.fill(); }
  if (act && ui.legal.moves.size) { ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#123'; for (const [, h] of ui.legal.moves) { try { const q = pix(h); ctx.fillText(String(planStep(s, act, h).cost), q.x, q.y + S * 0.55); } catch (_) {} } }
  for (const [, h] of ui.legal.jumps) { hexPath(pix(h)); ctx.fillStyle = 'rgba(60,170,255,.55)'; ctx.fill(); }
  if (act && s.activation.route.length) {            // path walked in this activation + the facing the mech started with
    const r = s.activation.route, a0 = pix(r[0]);
    if (r.length > 1) { ctx.beginPath(); r.forEach((h, i) => { const q = pix(h); ctx[i ? 'lineTo' : 'moveTo'](q.x, q.y); }); ctx.strokeStyle = 'rgba(240,180,41,.9)'; ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.lineWidth = 1;
      for (const h of r.slice(1)) { const q = pix(h); ctx.beginPath(); ctx.arc(q.x, q.y, 3.5, 0, 7); ctx.fillStyle = 'rgba(240,180,41,.95)'; ctx.fill(); } }
    const d = toPixel(DIRS[s.activation.startFacing]), L = Math.hypot(d.x, d.y), ux = d.x / L, uy = d.y / L, sz = S * 0.34;
    ctx.beginPath(); ctx.moveTo(a0.x + ux * sz * 1.5, a0.y + uy * sz * 1.5); ctx.lineTo(a0.x - ux * sz * 0.6 - uy * sz, a0.y - uy * sz * 0.6 + ux * sz); ctx.lineTo(a0.x - ux * sz * 0.6 + uy * sz, a0.y - uy * sz * 0.6 - ux * sz); ctx.closePath();
    ctx.fillStyle = '#f0b429'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
  }
  for (const [, h] of ui.legal.hexTargets) { const p = pix(h); ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.9, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = '#ff3b3b'; ctx.stroke(); ctx.lineWidth = 1; }   // buildings: a circle like mechs
  for (const id of ui.legal.rams) { const p = pix(s.mechs[id].pos); ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.9, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = '#ff8c1a'; ctx.stroke(); ctx.lineWidth = 1; }
  for (const id of ui.legal.targets) { const p = pix(s.mechs[id].pos); ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.9, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = '#ff3b3b'; ctx.stroke(); ctx.lineWidth = 1; }
  if (mp && !mp.bad && mp.type !== 'arm' && ui.inputMode !== 'petals') drawZones(ctx, S, pix(mp.h), mp, ui.dead, ui.ptr);
  for (const mn of Object.values(s.mines ?? {})) {            // mines: armed (spiky) = placed / moved this round, locked = ready to be moved
    const p = pix(mn.pos), im = cimg(`mine_p${mn.owner}_${mn.activated ? 'inactive' : 'active'}`), r = S * 0.62;
    if (im) ctx.drawImage(im, p.x - r, p.y - r, 2 * r, 2 * r); else { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fillStyle = '#222'; ctx.fill(); }
    if (ui.legal.mineSel.has(mn.id)) {
      const sel = mn.id === ui.mineSel, col = sel ? '#7CFC00' : '#f0b429';
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke(); ctx.lineWidth = 1;
      const hd = mineHandle(mn);                                   // the handle: a click on it picks the mine, the rest of the hex stays a movement target
      ctx.beginPath(); ctx.arc(hd.x, hd.y, hd.r, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#222'; ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = '#222'; ctx.font = `bold ${Math.round(hd.r * 1.5)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(sel ? '✓' : '✥', hd.x, hd.y + 1);
    }
  }
  for (const [, h] of [...ui.legal.mineHexes, ...ui.legal.mineStep]) { const p = pix(h); ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.55, 0, 7); ctx.setLineDash([5, 3]); ctx.lineWidth = 3; ctx.strokeStyle = '#7CFC00'; ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; }
  for (const m of Object.values(s.mechs)) if (m.status === 'active' || m.status === 'disabled') drawMech(m, act);
  drawRollButtons();
  if (mp && !mp.bad && mp.type !== 'arm') {
    if (pv && key(mp.h) !== key(act.pos)) {            // path + ghost on the destination hex
      const A0 = pix(act.pos), T0 = pix(mp.h); ctx.save(); ctx.setLineDash([6, 4]); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(A0.x, A0.y);
      if (mp.type === 'jump') { ctx.strokeStyle = 'rgba(170,60,255,.95)'; ctx.quadraticCurveTo((A0.x + T0.x) / 2, (A0.y + T0.y) / 2 - S * 0.9, T0.x, T0.y); } else { ctx.strokeStyle = 'rgba(30,100,200,.9)'; ctx.lineTo(T0.x, T0.y); }
      ctx.stroke(); ctx.restore(); drawGhost(ctx, S, T0, pv.g, 0.7, act.owner === 1 ? '#4a90e2' : '#e25555');
    } else if (pv) drawGhost(ctx, S, pix(act.pos), pv.g, 0.55, act.owner === 1 ? '#4a90e2' : '#e25555');   // turn in place: where it will look
    if (ui.inputMode !== 'zones') drawPetals(ctx, S, pix(mp.h), mp, ui.inputMode, ui.ptr);
  }
  const gr = ui.gaMode ? gaRadiusAt(ui.hover) : ui.gaPrev;
  if (gr && act) for (const c of Object.values(s.map.cells)) if (distance(act.pos, c) <= gr) { hexPath(pix(c)); ctx.fillStyle = 'rgba(255,140,0,.22)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,140,0,.7)'; ctx.stroke(); }   // GA radius preview
  if (ui.turnPrev && s.mechs[ui.turnPrev.id]) { const tm = s.mechs[ui.turnPrev.id]; drawGhost(ctx, S, pix(tm.pos), ui.turnPrev.facing, 0.8, tm.owner === 1 ? '#4a90e2' : '#e25555'); }
  if (!act && !s.pending && s.winner === null) for (const m of Object.values(s.mechs)) if (m.status === 'active' && !m.activated && m.owner === s.turn.player && CLASSES[m.cls].rank === s.turn.rank) {
    const p = pix(m.pos); ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.95, 0, 7); ctx.lineWidth = m.id === ui.chosenMech ? 6 : 3; ctx.strokeStyle = m.id === ui.chosenMech ? '#7CFC00' : '#f0b429'; ctx.stroke(); ctx.lineWidth = 1; }
  if (ui.preview) {                 // trajectory of the armed weapons: both candidate lines, hexes that count are lit
    const A = pix(act.pos), T = pix(ui.previewPos), p0 = ui.preview[0], allOk = ui.preview.every((p) => p.ok);
    const col = allOk ? '240,180,41' : '226,85,85', counted = new Set(ui.preview.flatMap((p) => p.counted));
    { hexPath(T); ctx.fillStyle = `rgba(${col},0.38)`; ctx.fill(); }          // the target hex is lit like the hexes of the line
    for (const v of p0.variants) for (const h of v.slice(1, -1)) { const k = key(h), cell = s.map.cells[k]; if (!cell) continue; hexPath(pix(h)); ctx.fillStyle = `rgba(${col},${counted.has(k) ? 0.38 : 0.12})`; ctx.fill(); if (counted.has(k) && cell.cover) { ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('укр.' + cell.cover, pix(h).x, pix(h).y - 12); } }
    // terrain on the line that matters for this shot: armor tokens (rock) and +1 virtual evade (fire; lasers lose range instead)
    const best = (f) => p0.variants.reduce((acc, v) => { const hs = v.slice(1, -1).filter((h) => counted.has(key(h)) && f(s.map.cells[key(h)])); return hs.length > acc.length ? hs : acc; }, []);
    const armHs = best((c) => c && TERRAIN[c.terrain].armor), fireHs = ui.preview.some((p) => !p.laserReach) ? best((c) => c && TERRAIN[c.terrain].fire) : [];
    const tc0 = s.map.cells[key(ui.previewPos)];
    const mark = (h, name, n, dx) => { const q = pix(h), r = 11; ctx.beginPath(); ctx.arc(q.x + dx, q.y, r + 2, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill(); const im = cimg(name); if (im) { ctx.save(); ctx.beginPath(); ctx.arc(q.x + dx, q.y, r, 0, 7); ctx.clip(); ctx.drawImage(im, q.x + dx - r, q.y - r, r * 2, r * 2); ctx.restore(); }
      if (n > 1) { ctx.font = 'bold 12px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(n, q.x + dx + r, q.y + r - 1); ctx.fillStyle = '#fff'; ctx.fillText(n, q.x + dx + r, q.y + r - 1); ctx.lineWidth = 1; } };
    armHs.forEach((h) => mark(h, 'icon_armor', TERRAIN[s.map.cells[key(h)].terrain].armor, fireHs.some((f) => key(f) === key(h)) ? -9 : 0));
    fireHs.forEach((h) => mark(h, TOK.virtual, 1, armHs.some((f) => key(f) === key(h)) ? 9 : 0));
    if (tc0 && TERRAIN[tc0.terrain].fire && ui.preview.some((p) => !p.laserReach)) mark(ui.previewPos, TOK.virtual, 1, 0);   // the target stands in fire: +1 virtual evade
    if (tc0 && TERRAIN[tc0.terrain].armor) mark(ui.previewPos, 'icon_armor', TERRAIN[tc0.terrain].armor, 0);   // the target's own hex
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(T.x, T.y); ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 3; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
  }
  if (ui.hover) { hexPath(pix(ui.hover)); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; }
  const hadBadge = !!ui.badgeRect;
  ui.badgeRect = null;
  if (mp && ui.ptr) { const [txt, col] = badge(mp); ui.badgeRect = drawBadge(ctx, cv.width, cv.height, ui.ptr, txt, col); }
  const dl = drawDebuffList();                                    // the unfolded debuff list: on top of every token
  if (dl && !ui.badgeRect) ui.badgeRect = dl;                     // the hex hint keeps clear of it too
  if (ui.badgeRect || hadBadge) placeInfo();                      // the step / jump badge appeared or moved: move the hint out of its way
  if (ui.rmb) drawBanner(ctx, cv.width, jumpPip() ? 'РЕЖИМ ПРЫЖКА · отпусти ПКМ над гексом (вне поля — отмена)' : 'нет куба ⇧ для прыжка', jumpPip() ? 'rgba(150,60,230,.92)' : 'rgba(220,40,40,.9)');
  else if (ui.jumpMode) drawBanner(ctx, cv.width, 'РЕЖИМ ПРЫЖКА (клик по своему центру или кнопка — выключить)', 'rgba(150,60,230,.85)');
}
export function drawCrit(sys, lvl, x, y) {              // images crit_<system>_<1..3> if present; otherwise the damage-die icon with level dots
  const named = `crit_${sys}_${lvl}`, i = (!globalThis.__IMG || named in globalThis.__IMG) ? cimg(named) : null, r = 9;
  if (i) { ctx.drawImage(i, x - r, y - r, r * 2, r * 2); return; }
  const f = cimg('dmg_crit_' + sys);
  ctx.fillStyle = '#111'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (f) ctx.drawImage(f, x - r + 1, y - r + 1, r * 2 - 2, r * 2 - 2);
  ctx.strokeStyle = lvl >= 3 ? '#ff2d2d' : '#f0b429'; ctx.lineWidth = 1.5; ctx.strokeRect(x - r, y - r, r * 2, r * 2); ctx.lineWidth = 1;
  for (let k = 0; k < lvl; k++) { ctx.fillStyle = '#ff2d2d'; ctx.fillRect(x - 6 + k * 5, y + r - 3, 4, 3); }
}
export function drawToken(name, x, y, n) {            // token icon with a count (the count is hidden for a single token)
  const i = cimg(name), r = 6.5;
  if (i) ctx.drawImage(i, x - r, y - r, r * 2, r * 2);
  else { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#ccc'; ctx.fill(); }
  if (n > 1) { ctx.font = 'bold 11px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(n, x + r, y + r - 1); ctx.fillStyle = '#fff'; ctx.fillText(n, x + r, y + r - 1); ctx.lineWidth = 1; }
}
export // pilot-roll buttons drawn on the token of the activated mech: green = roll the pilot dice, red = emergency shutdown
function rollButtons() {
  const s = st(), a = s.activation; if (!a || a.phase !== 'ROLL' || s.pending || s.winner !== null || !myInput()) return [];
  const m = s.mechs[a.mechId], p = pix(m.pos), r = Math.max(13, S * 0.42), y = Math.max(r + 2, p.y - S * 0.15), dx = S * 1.22;
  return mustShutdown(m) ? [{ id: 'shutdown', x: p.x, y, r, title: 'Экстренное отключение (бросок невозможен: перегрев или нет кубов после сброса)' }]
    : [{ id: 'roll', x: p.x - dx, y, r, title: 'Бросок пилотирования' }, { id: 'shutdown', x: p.x + dx, y, r, title: 'Экстренное отключение (вместо броска)' }];
}
export const btnAt = (pt) => pt && rollButtons().find((b) => Math.hypot(pt.x - b.x, pt.y - b.y) <= b.r + 2);
export function drawRollButtons() {
  for (const b of rollButtons()) {
    const hot = ui.hoverBtn === b.id, roll = b.id === 'roll';
    ctx.save(); ctx.shadowColor = '#0009'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + (hot ? 2 : 0), 0, 7); ctx.fillStyle = roll ? (hot ? '#43c966' : '#2fa84f') : (hot ? '#ee5555' : '#d63838'); ctx.fill(); ctx.restore();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.lineWidth = 1;
    ctx.strokeStyle = ctx.fillStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    if (roll) { const q = b.r * 0.55; ctx.beginPath(); ctx.roundRect(b.x - q, b.y - q, q * 2, q * 2, 4); ctx.stroke();
      for (const [ox, oy] of [[-0.45, -0.45], [0, 0], [0.45, 0.45]]) { ctx.beginPath(); ctx.arc(b.x + ox * q, b.y + oy * q, 2, 0, 7); ctx.fill(); } }
    else { const q = b.r * 0.5; ctx.beginPath(); ctx.arc(b.x, b.y + 1, q, -Math.PI * 0.32, Math.PI * 1.32, false); ctx.stroke(); ctx.beginPath(); ctx.moveTo(b.x, b.y - q - 2); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.lineCap = 'butt'; ctx.lineWidth = 1;
  }
}
// ---- temporary debuffs: one slot on the token, the full list on hover
const DEBUFFS = [{ key: 'anchor', tok: () => TOK.anchor, name: 'anchor' }, { key: 'blind', tok: () => TOK.blind, name: 'blind' }];   // priority order
export const debuffsOf = (m) => DEBUFFS.filter((d) => (m[d.key] ?? 0) > 0).map((d) => ({ ...d, tok: d.tok(), n: m[d.key] }));
export const debuffSlot = (m) => { const p = pix(m.pos); return { x: p.x - 20, y: p.y + 10 }; };
// the mech whose debuff slot (a slightly larger area than the icon, the "+" included) is under the cursor, if it has more than one debuff
function debuffHover() {
  if (!ui.ptr) return null;
  for (const m of Object.values(st().mechs)) {
    if (m.status !== 'active' && m.status !== 'disabled') continue;
    const sl = debuffSlot(m);
    if (ui.ptr.x >= sl.x - 20 && ui.ptr.x <= sl.x + 11 && Math.abs(ui.ptr.y - sl.y) <= 11 && debuffsOf(m).length > 1) return m;
  }
  return null;
}
function drawDebuffList() {
  const m = debuffHover(); if (!m) return;
  const deb = debuffsOf(m), sl = debuffSlot(m), rowH = 20, w = 46, h = deb.length * rowH + 8;   // icon + count only
  let x = sl.x - 22 - w, y = sl.y - h / 2;
  if (x < 2) x = sl.x + 14; y = Math.max(2, Math.min(cv.height - h - 2, y));
  ctx.save(); ctx.shadowColor = '#0008'; ctx.shadowBlur = 8; ctx.fillStyle = 'rgba(16,18,22,.93)';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h); ctx.fill(); ctx.restore();
  ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  deb.forEach((d, i) => {
    const cy = y + 4 + rowH * i + rowH / 2, ic = cimg(d.tok);
    if (ic) ctx.drawImage(ic, x + 6, cy - 7, 14, 14);
    ctx.fillStyle = '#e8ecf2'; ctx.fillText(String(d.n), x + 26, cy + 1);
  });
  return { x, y, w, h };
}
export function drawMech(m, act) {
  const p = pix(m.pos), d = toPixel(DIRS[m.facing]), L = Math.hypot(d.x, d.y), dead = m.status === 'disabled';
  ctx.globalAlpha = m.activated ? 0.5 : 1;   // only the body of a mech that has finished is dimmed
  ctx.beginPath(); ctx.arc(p.x, p.y, S * 0.62, 0, 7); ctx.fillStyle = dead ? '#777' : m.owner === 1 ? '#4a90e2' : '#e25555'; ctx.fill();
  ctx.strokeStyle = act && act.id === m.id ? '#f0b429' : '#111'; ctx.lineWidth = act && act.id === m.id ? 3 : 1.5; ctx.stroke(); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + (d.x / L) * S * 0.95, p.y + (d.y / L) * S * 0.95); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); ctx.lineWidth = 1;
  ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(dead ? '✖' : m.cls[0].toUpperCase(), p.x - 2, p.y + 1);
  ctx.globalAlpha = 1;
  const dur = CLASSES[m.cls].durability;
  for (let i = 0; i < dur; i++) { ctx.fillStyle = i < m.damage ? '#ff2d2d' : '#222'; ctx.fillRect(p.x - dur * 3 + i * 6, p.y + S * 0.72, 5, 5); }
  const ev = evadeOf(m);                                   // two aligned columns: left overheat/anchor, right evade/virtual evade
  if (m.overheat) drawToken(TOK.overheat, p.x - 20, p.y - 10, m.overheat);
  // temporary debuffs share ONE slot (fixed priority: anchor, then blind); a "+" on its left means there are more —
  // hovering the slot unfolds the full list (drawn on top of everything by drawDebuffList)
  const deb = debuffsOf(m);
  if (deb.length) {
    const sl = debuffSlot(m);
    drawToken(deb[0].tok, sl.x, sl.y, deb[0].n);
    if (deb.length > 1) { ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText('+', sl.x - 12, sl.y); ctx.fillStyle = '#fff'; ctx.fillText('+', sl.x - 12, sl.y); ctx.lineWidth = 1; }
  }
  if (ev.evade) drawToken(TOK.evade, p.x + 20, p.y - 10, ev.evade);
  if (ev.virtual) drawToken(TOK.virtual, p.x + 20, p.y + 10, ev.virtual);
  const sys = ['control', 'armor', 'cooling'].filter((k) => m.crits[k] > 0);       // critical damage badges above the mech, 3 levels per system
  sys.forEach((k, i) => drawCrit(k, m.crits[k], p.x + (i - (sys.length - 1) / 2) * 19, p.y - S * 0.98));
  ctx.globalAlpha = 1;
}
