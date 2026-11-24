// 資産推移のグラフ（大きめ・つまむ／ホイールで期間の拡大縮小・ドラッグで移動）。
// 線は SVG で描き、表示している期間（view = {x0, x1}、ミリ秒）だけを切り出す。縦軸は見えている点に合わせて毎回取り直す。
import { fmt0 } from "./rules.js?v=8";

export const DAY = 86400000;
export const ms = (d) => Date.parse(d);                       // "YYYY-MM-DD" → UTC 0時
const W = 360, L = 46, Rr = 10, T = 12, B = 28;

// 全部が入る表示範囲（両端に少し余白）
export function fullView(points) {
  const xs = points.map(([d]) => ms(d)); if (!xs.length) return { x0: Date.now() - 30 * DAY, x1: Date.now() };
  let x0 = Math.min(...xs), x1 = Math.max(...xs); if (x1 - x0 < 3 * DAY) { x0 -= 2 * DAY; x1 += 2 * DAY; }
  const pad = (x1 - x0) * 0.03; return { x0: x0 - pad, x1: x1 + pad };
}
// 表示範囲を動かす・広げる。bounds（全データ）の外へは行き過ぎないようにする
export function clampView(v, bounds) {
  const full = bounds.x1 - bounds.x0; let span = Math.min(Math.max(v.x1 - v.x0, 3 * DAY), full * 1.1);
  let x0 = v.x0; const lo = bounds.x0 - full * 0.05, hi = bounds.x1 + full * 0.05;
  if (x0 < lo) x0 = lo; if (x0 + span > hi) x0 = hi - span; if (x0 < lo) { x0 = lo; span = hi - lo; }
  return { x0, x1: x0 + span };
}
export const zoomView = (v, factor, anchorFrac) => { const span = (v.x1 - v.x0) * factor; const a = v.x0 + (v.x1 - v.x0) * anchorFrac; return { x0: a - span * anchorFrac, x1: a + span * (1 - anchorFrac) }; };
export const panView = (v, frac) => { const dx = (v.x1 - v.x0) * frac; return { x0: v.x0 + dx, x1: v.x1 + dx }; };

// 見えている区間の点（前後1点ずつ余分に含めて線が切れないようにする）
function visible(points, v) {
  const xs = points.map(([d]) => ms(d)); let i0 = xs.findIndex((x) => x >= v.x0), i1 = xs.length - 1;
  if (i0 < 0) i0 = xs.length; for (let i = xs.length - 1; i >= 0; i--) if (xs[i] <= v.x1) { i1 = i; break; }
  return points.slice(Math.max(0, i0 - 1), Math.min(points.length, i1 + 2));
}
const fmtDate = (x) => new Date(x).toISOString().slice(0, 10);
const niceStep = (span) => { const raw = span / 5; const p = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p; return 10 * p; };

function frame(H, v, y0, y1, fmtY) {
  const X = (x) => L + (x - v.x0) / (v.x1 - v.x0) * (W - L - Rr), Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  let g = ""; const step = niceStep(y1 - y0);
  for (let yv = Math.ceil(y0 / step) * step; yv <= y1 + 1e-9; yv += step) g += `<line x1="${L}" x2="${W - Rr}" y1="${Y(yv).toFixed(1)}" y2="${Y(yv).toFixed(1)}" stroke="currentColor" stroke-opacity=".12"/><text x="${L - 4}" y="${(Y(yv) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity=".7">${fmtY(yv)}</text>`;
  // 横軸：表示幅に応じて月初か日
  const span = v.x1 - v.x0; const d0 = new Date(v.x0), labels = [];
  if (span > 120 * DAY) { const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); const every = span > 900 * DAY ? 6 : span > 500 * DAY ? 3 : span > 240 * DAY ? 2 : 1; while (d.getTime() < v.x1) { if (d.getUTCMonth() % every === 0) labels.push([d.getTime(), d.getUTCMonth() === 0 ? `${d.getUTCFullYear()}/1` : `${d.getUTCMonth() + 1}月`]); d.setUTCMonth(d.getUTCMonth() + 1); } }
  else { const stepD = span > 40 * DAY ? 14 : span > 14 * DAY ? 7 : span > 5 * DAY ? 2 : 1; const d = new Date(Math.ceil(v.x0 / DAY) * DAY); while (d.getTime() < v.x1) { labels.push([d.getTime(), `${d.getUTCMonth() + 1}/${d.getUTCDate()}`]); d.setUTCDate(d.getUTCDate() + stepD); } }
  for (const [x, t] of labels) g += `<line x1="${X(x).toFixed(1)}" x2="${X(x).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="currentColor" stroke-opacity=".08"/><text x="${X(x).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity=".7">${t}</text>`;
  return { X, Y, grid: g };
}
const clip = (H, id) => `<clipPath id="${id}"><rect x="${L}" y="0" width="${W - L - Rr}" height="${H - B}"/></clipPath>`;

// 総資産の折れ線（円）
export function lineSvg(points, v, H = 400) {
  const vis = visible(points, v); if (vis.length < 2) return `<svg class="chart" viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity=".6">この範囲に点が足りません</text></svg>`;
  const ys = vis.map(([, y]) => y); let y0 = Math.min(...ys), y1 = Math.max(...ys); if (y1 === y0) { y0 *= 0.98; y1 *= 1.02; } const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const { X, Y, grid } = frame(H, v, y0, y1, (y) => `${fmt0(y / 10000)}万`);
  const pts = vis.map(([d, y]) => `${X(ms(d)).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const up = vis[vis.length - 1][1] >= vis[0][1]; const col = up ? "var(--up)" : "var(--down)"; const id = "c" + Math.random().toString(36).slice(2, 7);
  const dots = vis.length <= 60 ? vis.map(([d, y]) => `<circle cx="${X(ms(d)).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="2.5" fill="${col}"/>`).join("") : "";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><defs>${clip(H, id)}</defs>${grid}<g clip-path="url(#${id})"><polygon points="${X(ms(vis[0][0])).toFixed(1)},${Y(y0).toFixed(1)} ${pts} ${X(ms(vis[vis.length - 1][0])).toFixed(1)},${Y(y0).toFixed(1)}" fill="${col}" fill-opacity=".10"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"/>${dots}</g>
    <text x="${W - Rr}" y="${T}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity=".6">${fmtDate(v.x0)} 〜 ${fmtDate(v.x1)}</text></svg>`;
}

// 変化率（%）で重ねる折れ線。series = [{name, color, pts:[[日付, %]]}]。最初が総資産
export function compareSvg(series, v, H = 380) {
  const viss = series.map((s) => ({ ...s, vis: visible(s.pts, v) })).filter((s) => s.vis.length >= 2);
  if (!viss.length) return `<svg class="chart" viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="currentColor" fill-opacity=".6">この範囲に点が足りません</text></svg>`;
  const ys = viss.flatMap((s) => s.vis.map(([, y]) => y)); let y0 = Math.min(0, ...ys), y1 = Math.max(0, ...ys); if (y1 - y0 < 1) { y0 -= 1; y1 += 1; } const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const { X, Y, grid } = frame(H, v, y0, y1, (y) => `${y >= 0 ? "+" : ""}${y.toFixed(Math.abs(y1 - y0) < 5 ? 1 : 0)}%`); const id = "c" + Math.random().toString(36).slice(2, 7);
  const zero = `<line x1="${L}" x2="${W - Rr}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" stroke="currentColor" stroke-opacity=".4"/>`;
  const lines = viss.map((s, i) => { const p = s.vis.map(([d, y]) => `${X(ms(d)).toFixed(1)},${Y(y).toFixed(1)}`).join(" "); const last = s.vis[s.vis.length - 1];
    return `<polyline points="${p}" fill="none" stroke="${s.color}" stroke-width="${i === 0 ? 2.6 : 1.6}" stroke-linejoin="round"${i === 0 ? "" : ' stroke-opacity=".9"'}/><circle cx="${X(ms(last[0])).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="3" fill="${s.color}"/>`; }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><defs>${clip(H, id)}</defs>${grid}${zero}<g clip-path="url(#${id})">${lines}</g></svg>`;
}

// 指・マウスの操作：1本指／ドラッグで移動、2本指でつまんで拡大縮小、ホイールで拡大縮小。getView/setView で表示範囲をやり取りする
export function attachGestures(el, getView, setView) {
  el.style.touchAction = "pan-y";  // 縦のページスクロールはブラウザに任せ、横のドラッグとつまむ操作だけ受け取る const ptrs = new Map(); let lastDist = null, lastMid = null, moved = false;
  const plotW = () => el.getBoundingClientRect().width * (W - L - Rr) / W;
  const fracOf = (clientX) => { const r = el.getBoundingClientRect(); return Math.min(1, Math.max(0, (clientX - r.left - r.width * L / W) / plotW())); };
  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, e.clientX); moved = false; lastMid = null; lastDist = null; });
  el.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, e.clientX);
    if (ptrs.size === 1) { const dx = e.clientX - prev; if (Math.abs(dx) > 0) { moved = true; setView(panView(getView(), -dx / plotW())); } return; }
    const [a, b] = [...ptrs.values()]; const dist = Math.abs(a - b) || 1, mid = (a + b) / 2;
    if (lastDist) { let v = zoomView(getView(), lastDist / dist, fracOf(mid)); if (lastMid != null) v = panView(v, -(mid - lastMid) / plotW()); setView(v); moved = true; }
    lastDist = dist; lastMid = mid;
  });
  const up = (e) => { ptrs.delete(e.pointerId); lastDist = null; lastMid = null; };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up); el.addEventListener("lostpointercapture", up);
  el.addEventListener("wheel", (e) => { e.preventDefault(); const f = e.deltaY > 0 ? 1.15 : 1 / 1.15; setView(zoomView(getView(), f, fracOf(e.clientX))); }, { passive: false });
  el.addEventListener("click", (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
}
