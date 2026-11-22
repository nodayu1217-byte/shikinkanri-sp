// データの保存（スマホの中）・バックアップの書き出しと読み込み・Mac 版への受け渡し用 CSV。
import { DEFAULT_SETTINGS, enrichLots, activeLots, ACCOUNT_LABEL, SIDE_LABEL, EN_TYPE_LABEL, EX_TYPE_LABEL, nowStr, today } from "./rules.js?v=5";

const KEY = "shikinkanri.v1";
export const SCHEMA_VERSION = 1;

export function emptyState() {
  return { version: SCHEMA_VERSION, lots: [], stocks: [], assets: [], reviews: [], ops: [], settings: structuredClone(DEFAULT_SETTINGS), saved_at: null };
}

function merge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" ? merge(out[k], v) : v;
  return out;
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* プライベートモードなど */ }
  if (!raw) return emptyState();
  try {
    const s = JSON.parse(raw); const e = emptyState();
    return { ...e, ...s, settings: merge(DEFAULT_SETTINGS, s.settings || {}) };
  } catch (e) { return emptyState(); }
}

export function save(state) {
  state.saved_at = nowStr();
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
}

export async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* 対応していない */ }
  return false;
}

// ---------- バックアップ（JSON。これを新しいスマホで読み込めば全部戻る） ----------
export function backupBlob(state) {
  return new Blob([JSON.stringify({ app: "資金管理 スマホ版", exported_at: nowStr(), ...state }, null, 1)], { type: "application/json" });
}
export const backupName = () => `資金管理_バックアップ_${today()}.json`;

export function parseBackup(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.lots) || !Array.isArray(d.assets)) throw new Error("バックアップのファイルではないようです（lots / assets がありません）");
  const e = emptyState();
  return { ...e, lots: d.lots, stocks: d.stocks || [], assets: d.assets, reviews: d.reviews || [], ops: d.ops || [], settings: merge(DEFAULT_SETTINGS, d.settings || {}) };
}

// ---------- Mac 版へ渡す CSV（Mac 版の「記録 → Excel」の取り込みで読める見出し） ----------
function csvCell(v) { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
export function lotsCsv(state) {
  const rows = enrichLots(activeLots(state.lots), state.assets);
  const head = ["コード", "銘柄名", "市場", "現物/信用", "方向", "EN日", "EN価格", "株数", "EN種別", "EX日", "EX価格", "EX種別", "SL", "目標", "メモ", "元の買い日", "確定損益"];
  const name = (c) => (state.stocks.find((s) => s.code === c) || {}).name || c;
  const lines = [head.join(",")];
  for (const r of rows) lines.push([r.code, name(r.code), r.market === "JP" ? "日本株" : "米国株", ACCOUNT_LABEL[r.account] || r.account, SIDE_LABEL[r.side] || r.side,
    r.en_date, r.en_price, r.shares, EN_TYPE_LABEL[r.en_type] || r.en_type, r.ex_date || "", r.ex_price ?? "", r.ex_type ? EX_TYPE_LABEL[r.ex_type] : "",
    r.sl_price ?? "", r.target_price ?? "", r.memo || "", r.original_en_date || "", r.pnl_jpy == null ? "" : Math.round(r.pnl_jpy)].map(csvCell).join(","));
  return new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
}
export function assetsCsv(state) {
  const lines = ["日付,総資産,為替,メモ", ...state.assets.map((a) => [a.date, a.total_jpy, a.usd_jpy ?? "", a.memo || ""].map(csvCell).join(","))];
  return new Blob(["﻿" + lines.join("\n")], { type: "text/csv" });
}

// 共有シート（iPhone / Android）があればそれで、なければダウンロード
export async function shareOrDownload(blob, filename) {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return "shared"; }
  } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return "downloaded";
}
