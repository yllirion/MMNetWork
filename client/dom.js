// DOM helpers, the canvas and the field geometry, image paths.

export const $ = (id) => document.getElementById(id);
export const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const cv = $('cv'), ctx = cv.getContext('2d'), SQ3 = Math.sqrt(3), S = 30;
export const OX = (cv.width - 17 * SQ3 * S) / 2 + (SQ3 * S) / 2, OY = (cv.height - (1.5 * S * 16 + 2 * S)) / 2 + S;   // field is centered

// ---- images: client/img/<name>.png (the build inlines them as data URIs)
export const img = (n) => globalThis.__IMG?.[n] ?? `img/${n}.png`;
export const mini = (name, title = '', cls = '') => `<img class="${cls || 'mini'}" src="${img(name)}" alt="" title="${esc(title)}">`;
