// 証券口座（moomoo・SBI・楽天など）の取引履歴 CSV を読み、買い→新しい記録、売り→古い記録から手仕舞い として登録する。
// Mac 版の broker_csv.py を移植。列名は会社ごとに違うので、見出しの言葉から推測し、画面で直せるようにする。
import { insertLot, closeLot, splitLot, upsertStock, isJpCode, log } from "./rules.js";

export const FIELDS = { date: "約定日", code: "銘柄コード", name: "銘柄名", side: "売買", qty: "数量", price: "単価", account: "現物/信用", market: "市場" };
export const KEYWORDS = {
  date: ["約定日", "約定日時", "取引日", "成交時間", "成交日", "日付", "date", "time"],
  code: ["銘柄コード", "コード", "ティッカー", "ticker", "symbol", "code"],
  name: ["銘柄名", "銘柄", "名称", "name"],
  side: ["売買区分", "売買", "取引区分", "取引", "方向", "side", "action"],
  qty: ["約定数量", "数量", "株数", "口数", "quantity", "qty", "shares"],
  price: ["約定単価", "約定価格", "単価", "価格", "price"],
  account: ["預り区分", "預り", "口座区分", "信用区分", "取引種別", "account"],
  market: ["市場名称", "市場", "取引所", "market", "exchange"],
};

// ---------- 文字コードと CSV の読み取り ----------
export function decodeBytes(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); } catch (e) { /* Shift_JIS を試す */ }
  try { return new TextDecoder("shift_jis").decode(u8); } catch (e) { return new TextDecoder("utf-8").decode(u8); }
}

export function parseCsvText(text) {
  text = text.replace(/^﻿/, "");
  const sep = (text.match(/\t/g) || []).length > (text.match(/,/g) || []).length ? "\t" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!width) throw new Error("空のファイルです");
  return rows.map((r) => { const o = r.map((c) => String(c).trim()); while (o.length < width) o.push(""); return o; });
}

export const readCsvBytes = (buf) => parseCsvText(decodeBytes(buf));

// ---------- 見出しの推測 ----------
export function detectHeaderRow(rows, maxRows = 30) {
  const words = Object.values(KEYWORDS).flat();
  let best = 0, bestN = -1;
  for (let i = 0; i < Math.min(maxRows, rows.length); i++) {
    const n = rows[i].filter((c) => words.some((w) => c.toLowerCase().includes(w.toLowerCase()))).length;
    if (n > bestN) { best = i; bestN = n; }
  }
  return best;
}

export function guessMapping(headers) {
  const out = {}; const hs = headers.map((h) => String(h).trim());
  for (const [field, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      let hit = hs.map((h, j) => [h, j]).filter(([h, j]) => h.toLowerCase().includes(w.toLowerCase()) && !Object.values(out).includes(j)).map(([, j]) => j);
      if (!hit.length) continue;
      hit = hit.filter((j) => !(field === "name" && hs[j].includes("コード")));
      hit = hit.filter((j) => !(field === "side" && (hs[j].includes("日") || hs[j].includes("数量"))));
      if (hit.length) { out[field] = hit[0]; break; }
    }
  }
  return out;
}

// ---------- 値の読み取り ----------
export function toDate(v) {
  const s = String(v ?? "").trim(); if (!s) return null;
  const ok = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null; };
  let m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?=$|[\sT(（])/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?=$|[\sT,])/);  // 米国式 MM/DD/YYYY
  if (m) return ok(+m[3], +m[1], +m[2]);
  m = s.match(/^(\d{1,2})[/月](\d{1,2})日?$/);
  if (m) return ok(new Date().getFullYear(), +m[1], +m[2]);
  const t = Date.parse(s); if (!Number.isNaN(t)) { const d = new Date(t); return ok(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  return null;
}
export function toNum(v) {
  const s = String(v ?? "").replace(/[,¥$円株\s]/g, ""); if (!s) return null;
  const x = parseFloat(s); return Number.isFinite(x) ? x : null;
}
export function parseTime(v) {
  const m = String(v ?? "").match(/[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}` : "";
}
export function parseSide(v) {
  const s = String(v ?? ""); const l = s.trim().toLowerCase();
  if (s.includes("返済買") || s.includes("買戻")) return null;  // 空売りの返済は対象外
  if (s.includes("新規売") || s.includes("空売")) return null;
  if (s.includes("買") || ["buy", "b", "bought"].includes(l)) return "buy";
  if (s.includes("売") || ["sell", "s", "sold"].includes(l)) return "sell";
  return null;
}

// 日付→時刻の順。時刻がわからない同じ日の約定は、買いを売りより先にする（デイトレードの売りが宙に浮かないように）
export const sortTrades = (rows) => rows.map((r, i) => [r, i]).sort((a, b) => (a[0].date + a[0].time + (a[0].side !== "buy" ? 1 : 0)).localeCompare(b[0].date + b[0].time + (b[0].side !== "buy" ? 1 : 0)) || a[1] - b[1]).map(([r]) => r);

// 生の表から、1行＝1約定の一覧を作る。
export function parseTrades(rows, headerRow, mapping, defaultMarket = "auto") {
  const out = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i]; const g = (f) => (mapping[f] != null && mapping[f] < r.length ? String(r[mapping[f]]).trim() : "");
    let code = g("code").toUpperCase().replace(".T", "").replace(/\.(JP|US)$/, "");
    const d = toDate(g("date")), t = parseTime(g("date")), qty = toNum(g("qty")), price = toNum(g("price")), side = parseSide(g("side"));
    if (!code && !d) continue;
    let reason = "";
    if (!code) reason = "銘柄コードなし";
    else if (!d) reason = "約定日が読めない";
    else if (!side) reason = `売買区分が対象外: ${g("side")}`;
    else if (!qty || !price) reason = "数量または単価が読めない";
    const others = r.filter((c, j) => j !== mapping.name).join(" ");
    const acc = others.includes("信用") ? "margin" : "cash";
    const mk = g("market").toUpperCase();
    const market = ["JP", "US"].includes(defaultMarket) ? defaultMarket : (mk.includes("米") || mk.includes("US") || mk.includes("NASDAQ") || mk.includes("NYSE")) ? "US" : (code && !isJpCode(code)) ? "US" : "JP";
    out.push({ date: d || "", time: t, code, name: g("name"), side: side || "", qty: qty ? Math.abs(qty) : null, price, account: acc, market, skip_reason: reason });
  }
  return sortTrades(out);
}

// 同じ銘柄・日付・株数・単価の買い（または売り）が既にあれば「登録済み」にする
export function markExisting(state, trades) {
  const r4 = (x) => Math.round(+x * 1e4) / 1e4;
  const buys = new Set(state.lots.filter((l) => l.status === "active" && l.en_type === "real").map((l) => [l.code, l.en_date, r4(l.shares), r4(l.en_price)].join("|")));
  const sells = {};
  for (const l of state.lots.filter((l) => l.status === "active" && l.ex_type === "real")) { const k = [l.code, l.ex_date, r4(l.ex_price)].join("|"); sells[k] = (sells[k] || 0) + +l.shares; }
  return trades.map((t) => {
    if (t.skip_reason) return t;
    if (t.side === "buy" && buys.has([t.code, t.date, r4(t.qty), r4(t.price)].join("|"))) return { ...t, skip_reason: "登録済み（同じ買いがあります）" };
    if (t.side === "sell") { const k = [t.code, t.date, r4(t.price)].join("|"); if ((sells[k] || 0) >= t.qty - 1e-9) { sells[k] -= t.qty; return { ...t, skip_reason: "登録済み（同じ売りがあります）" }; } }
    return t;
  });
}

export function summarize(trades) {
  const ok = trades.filter((t) => !t.skip_reason);
  return { rows: trades.length, ok: ok.length, skipped: trades.length - ok.length, buys: ok.filter((t) => t.side === "buy").length, sells: ok.filter((t) => t.side === "sell").length,
    codes: [...new Set(ok.map((t) => t.code))].sort(), from: ok.length ? ok.map((t) => t.date).sort()[0] : null, to: ok.length ? ok.map((t) => t.date).sort().at(-1) : null };
}

// 約定を日付順に処理する。買い＝新しい記録、売り＝古い記録から順に手仕舞い（先入先出。一部売りは分割）
export function importTrades(state, trades, source = "CSV") {
  const ok = sortTrades(markExisting(state, trades).filter((t) => !t.skip_reason));
  let made = 0, closed = 0; const warnings = []; const memo = `${source} から取り込み`;
  for (const r of ok) {
    if (!state.stocks.find((s) => s.code === r.code)) upsertStock(state, r.code, r.name || r.code, r.market);
    if (r.side === "buy") { insertLot(state, { code: r.code, market: r.market, account: r.account, en_date: r.date, en_price: +r.price, shares: +r.qty, en_type: "real", memo }); made++; continue; }
    let remaining = +r.qty;
    const open = state.lots.filter((l) => l.code === r.code && l.status === "active" && !l.ex_date && l.side !== "short" && l.en_date <= r.date).sort((a, b) => a.en_date.localeCompare(b.en_date) || a.id - b.id);
    for (const lot of open) {
      if (remaining <= 0) break;
      if (lot.shares <= remaining + 1e-9) { closeLot(state, lot.id, r.date, +r.price, "real"); remaining -= lot.shares; closed++; }
      else { const nid = splitLot(state, lot.id, remaining); closeLot(state, nid, r.date, +r.price, "real"); remaining = 0; closed++; }
    }
    if (remaining > 1e-9) warnings.push(`${r.date} ${r.code} 売り ${r.qty.toLocaleString("ja-JP")}株のうち ${remaining.toLocaleString("ja-JP")}株は、対応する買いが見つかりませんでした（CSVより前の保有）。`);
  }
  log(state, "import_csv", { source, lots: made, closed });
  return { lots: made, closed, warnings };
}
