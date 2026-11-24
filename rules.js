// 資金管理ルールの計算（Mac 版 src/trades.py・risk.py・performance.py・futures.py をスマホ用に移植）。
// 画面を持たない純粋な計算だけ。ブラウザでも node でも動く。

export const FUTURES = [
  { code: "NK225",   name: "日経225先物 ラージ",          market: "JP", unit: 1000, yahoo: "^N225" },
  { code: "NK225M",  name: "日経225先物 ミニ",            market: "JP", unit: 100,  yahoo: "^N225" },
  { code: "NK225MC", name: "日経225先物 マイクロ",        market: "JP", unit: 10,   yahoo: "^N225" },
  { code: "ES",      name: "S&P500先物 ミニ（E-mini）",   market: "US", unit: 50,   yahoo: "ES=F" },
  { code: "MES",     name: "S&P500先物 マイクロ",         market: "US", unit: 5,    yahoo: "MES=F" },
  { code: "SP",      name: "S&P500先物 ラージ（旧）",     market: "US", unit: 250,  yahoo: "ES=F" },
  { code: "NQ",      name: "NASDAQ100先物 ミニ（E-mini）", market: "US", unit: 20,  yahoo: "NQ=F" },
  { code: "MNQ",     name: "NASDAQ100先物 マイクロ",      market: "US", unit: 2,    yahoo: "MNQ=F" },
];
const FUT = Object.fromEntries(FUTURES.map((f) => [f.code, f]));
export const futureSpec = (code) => FUT[String(code || "").trim().toUpperCase()] || null;
export const isFuture = (code) => !!futureSpec(code);
export const unitFor = (code) => (futureSpec(code) ? futureSpec(code).unit : 1);
export const qtyWord = (code) => (isFuture(code) ? "枚" : "株");
export const qtyStr = (code, n) => `${fmt0(n)}${qtyWord(code)}`;
export const unitNote = (code) => { const f = futureSpec(code); return f ? `1枚＝価格×${fmt0(f.unit)}${f.market === "JP" ? "円" : "ドル"}` : ""; };
const JP_CODE = /^\d[0-9A-Z]\d[0-9A-Z]$/;
export const isJpCode = (code) => JP_CODE.test(String(code || "").trim().toUpperCase());
export const marketForCode = (code) => (futureSpec(code) ? futureSpec(code).market : isJpCode(code) ? "JP" : "US");
export const sign = (side) => (side === "short" ? -1 : 1);

export const SIDE_LABEL = { long: "買い", short: "空売り" };
export const ACCOUNT_LABEL = { cash: "現物", margin: "信用" };
export const EN_TYPE_LABEL = { real: "実EN", reset: "置き直しEN", month_start: "月初EN" };
export const EX_TYPE_LABEL = { real: "実EX", reset: "置き直しEX", month_end: "月末繰越EX" };

export const DEFAULT_SETTINGS = {
  risk: { ruin_threshold_pct: 30, max_risk_pct: 3.4, win_rate_pct: 50, rr_ratio: 2.0, max_positions: 4, max_total_loss_pct: 4.0, reset_threshold_pct: 3.0 },
  charts: { trend_indexes: ["^N225"],  colors: ["#2f6fed", "#f28c28", "#2fa36b", "#d64561", "#8e5bd6", "#1fa3b8", "#c9a227", "#7a7a7a"], cash_color: "#b9c2cf" },
  stats: { period: "ytd", sort: "new", trend_mode: "assets" },
};

// ---------- 書式 ----------
export const fmt0 = (v) => (v == null || Number.isNaN(+v) ? "-" : Math.round(+v).toLocaleString("ja-JP"));
export const yen = (v) => (v == null || Number.isNaN(+v) ? "-" : `${fmt0(v)} 円`);
export const man = (v) => (v == null || Number.isNaN(+v) ? "-" : `${fmt0(v / 10000)}万円`);
export const pct = (v, d = 1) => (v == null || Number.isNaN(+v) ? "-" : `${(+v).toFixed(d)}%`);
export const signed0 = (v) => (v == null || Number.isNaN(+v) ? "-" : `${v >= 0 ? "+" : "−"}${fmt0(Math.abs(v))}`);
export const signedPct = (v, d = 2) => (v == null || Number.isNaN(+v) ? "-" : `${v >= 0 ? "+" : "−"}${Math.abs(+v).toFixed(d)}%`);
export const priceStr = (v) => (v == null || Number.isNaN(+v) ? "-" : Number.isInteger(+v) ? fmt0(v) : (+v).toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const nowStr = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// ---------- 総資産・為替 ----------
export function latestAssets(assets, onOrBefore = null) {
  const rows = assets.filter((a) => !onOrBefore || a.date <= onOrBefore).sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows[0] || null;
}
// 自動取得したドル円（data/indices.json の USDJPY）。総資産で為替を入れていない日の代わりに使う
let FX_TABLE = [];
export function setFxTable(rows) { FX_TABLE = (rows || []).map(([d, v]) => [d, +v]).filter(([, v]) => v > 0).sort((a, b) => a[0].localeCompare(b[0])); }
export function autoFx(onOrBefore = null) {
  const rows = onOrBefore ? FX_TABLE.filter(([d]) => d <= onOrBefore) : FX_TABLE;
  return rows.length ? rows[rows.length - 1][1] : (FX_TABLE.length ? FX_TABLE[0][1] : null);
}
export const autoFxDate = () => (FX_TABLE.length ? FX_TABLE[FX_TABLE.length - 1][0] : null);
// 為替：その日以前に自分で入れた値 → なければ自動取得の値 → それもなければ後の日の自分の値
export function fxRate(assets, onOrBefore = null) {
  const rows = assets.filter((a) => a.usd_jpy && (!onOrBefore || a.date <= onOrBefore)).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (rows.length) return +rows[0].usd_jpy;
  const auto = autoFx(onOrBefore); if (auto) return auto;
  const any = assets.filter((a) => a.usd_jpy).sort((a, b) => (a.date < b.date ? 1 : -1));
  return any.length ? +any[0].usd_jpy : null;
}

// 先物 1枚あたりの元本（円）。{コード: 円}。入れた先物は、ポートフォリオと総資産比を「枚数×この金額」で出す
let FUT_PRINCIPAL = {};
export function setFuturesPrincipal(map) { FUT_PRINCIPAL = map || {}; }
export const futuresPrincipal = (code) => +FUT_PRINCIPAL[String(code || "").toUpperCase()] || 0;
// ---------- ロットの計算（分母は常に最新の総資産） ----------
export function enrichLots(lots, assets) {
  const latest = latestAssets(assets); const total = latest ? +latest.total_jpy : null;
  return lots.map((l) => {
    const unit = unitFor(l.code), fut = isFuture(l.code), sgn = sign(l.side);
    const fxEn = l.market === "US" ? (fxRate(assets, l.en_date) || 0) : 1;
    const amount_jpy = l.en_price * l.shares * unit * fxEn;
    const principal_jpy = fut && futuresPrincipal(l.code) ? futuresPrincipal(l.code) * l.shares : null;   // 設定していなければ null（想定元本を使う）
    const closed = l.ex_price != null && l.ex_date;
    const fxEx = closed ? (l.market === "US" ? (fxRate(assets, l.ex_date) || 0) : 1) : null;
    const pnl_jpy = closed ? (l.ex_price - l.en_price) * sgn * l.shares * unit * fxEx : null;
    const pnl_pct = closed ? (l.ex_price / l.en_price - 1) * 100 * sgn : null;
    const sl_loss_jpy = l.sl_price != null && !closed ? (l.en_price - l.sl_price) * sgn * l.shares * unit * fxEn : null;
    return {
      ...l, unit, fut, fx_en: fxEn, amount_jpy, principal_jpy,
      pct_of_assets: total ? (principal_jpy ?? amount_jpy) / total * 100 : null,
      pnl_jpy, pnl_pct, pnl_of_assets_pct: total && pnl_jpy != null ? pnl_jpy / total * 100 : null,
      sl_loss_jpy, sl_loss_pct: total && sl_loss_jpy != null ? sl_loss_jpy / total * 100 : null,
    };
  });
}
export const activeLots = (lots) => lots.filter((l) => l.status === "active");
export const openLots = (lots) => activeLots(lots).filter((l) => !l.ex_date);

export function portfolioSummary(state) {
  const latest = latestAssets(state.assets); const total = latest ? +latest.total_jpy : null;
  const df = enrichLots(openLots(state.lots), state.assets);
  const out = { total_assets: total, assets_date: latest ? latest.date : null, invested: 0, invested_pct: null, cash_pct: null,
    cash_invested: 0, margin_invested: 0, futures_notional: 0, futures_principal: 0, n_positions: 0, by_stock: [], sl_total_pct: 0 };
  if (!df.length) { if (total) { out.invested_pct = 0; out.cash_pct = 100; } return out; }
  for (const r of df) {
    if (r.fut) { out.futures_notional += r.amount_jpy; out.futures_principal += r.principal_jpy || 0; }
    else { out.invested += r.amount_jpy; if (r.account === "margin") out.margin_invested += r.amount_jpy; else out.cash_invested += r.amount_jpy; }
    out.sl_total_pct += r.sl_loss_pct || 0;
  }
  if (total) { out.invested_pct = out.invested / total * 100; out.cash_pct = 100 - out.invested_pct; }
  const groups = new Map();
  for (const r of df) {
    const k = r.code; const g = groups.get(k) || { code: r.code, name: stockName(state, r.code), market: r.market, fut: r.fut, shares: 0, amount: 0, cost: 0, principal: null };
    g.shares += r.shares; g.amount += r.amount_jpy; if (r.principal_jpy != null) g.principal = (g.principal || 0) + r.principal_jpy; g.cost += r.en_price * r.shares; groups.set(k, g);
  }
  out.by_stock = [...groups.values()].map((g) => ({ ...g, avg_price: g.shares ? g.cost / g.shares : null, pct_of_assets: total ? (g.principal ?? g.amount) / total * 100 : null }));
  out.n_positions = groups.size;
  return out;
}
export const stockName = (state, code) => (state.stocks.find((s) => s.code === code) || {}).name || code;

// ---------- 新規ENの評価 ----------
export function suggestedShares(maxRisk, en, sl, fx = 1, lotUnit = 1, unit = 1, side = "long") {
  if (!maxRisk || !sl || en <= 0) return null;
  const per = (en - sl) * sign(side) * unit * fx;
  if (per <= 0) return null;
  let n = Math.floor(maxRisk / per);
  if (lotUnit > 1) n = Math.floor(n / lotUnit) * lotUnit;
  return n;
}

export function enPreview(state, cfg, code, market, en, shares, sl, side = "long") {
  const latest = latestAssets(state.assets); const total = latest ? +latest.total_jpy : null;
  const fx = market === "US" ? (fxRate(state.assets) || 0) : 1;
  const sgn = sign(side), short = side === "short", fut = isFuture(code), unit = unitFor(code), uw = qtyWord(code);
  const open = enrichLots(openLots(state.lots), state.assets);
  const investedNow = open.filter((r) => !r.fut).reduce((s, r) => s + r.amount_jpy, 0);
  const held = new Set(open.map((r) => r.code));
  const amount = en * shares * unit * fx;
  const maxRisk = total ? total * cfg.risk.max_risk_pct / 100 : null;
  const sug = suggestedShares(maxRisk, en, sl, fx, fut || market !== "JP" ? 1 : 100, unit, side);
  const slOk = !!sl && (en - sl) * sgn > 0;
  const risk = slOk ? (en - sl) * sgn * shares * unit * fx : null;
  const nAfter = new Set([...held, ...(code ? [code] : [])]).size;
  const existingSl = open.reduce((s, r) => s + (r.sl_loss_jpy || 0), 0);
  const totalSl = existingSl + (risk || 0);
  const out = {
    total_assets: total, max_risk_amount: maxRisk, suggested_shares: sug, amount, amount_pct: total ? amount / total * 100 : null,
    risk_amount: risk, risk_pct: total && risk != null ? risk / total * 100 : null, is_future: fut, side, unit,
    notional_x: fut && total ? amount / total : null,
    invested_pct_before: total ? investedNow / total * 100 : null,
    invested_pct_after: total ? (investedNow + (fut ? 0 : amount)) / total * 100 : null,
    n_positions_after: nAfter, total_sl_loss_pct: total ? totalSl / total * 100 : null, warnings: [], notes: [],
    fx_missing: market === "US" && !fx, fx, amount_local: en * shares * unit,
  };
  const r = cfg.risk;
  if (total == null) { out.warnings.push("総資産が未登録です。「総資産」から登録してください。"); return out; }
  if (out.fx_missing) { out.amount = out.amount_pct = out.risk_amount = out.risk_pct = out.invested_pct_after = null; out.warnings.push("為替（USD/JPY）がまだ取れていないので円に直せません。ネットにつないで開き直すか、「総資産」で為替を入れてください。"); return out; }
  if (!sl) out.warnings.push("損切り値が未設定です。目安の株数と損失額が計算できません。");
  else if (!slOk) out.warnings.push(short ? "損切り値が売値以下になっています（空売りの損切り値は売値より上に置きます）。" : "損切り値が買値以上になっています。");
  if (risk != null && maxRisk && risk > maxRisk) out.warnings.push(`損切りになったときの損失 ${fmt0(risk)} 円が、許せる上限 ${fmt0(maxRisk)} 円を超えています（目安 ${fmt0(sug)} ${uw}）。`);
  if (nAfter > r.max_positions) out.warnings.push(`保有銘柄数が ${nAfter} 銘柄になり、上限 ${r.max_positions} 銘柄を超えます。`);
  if (out.total_sl_loss_pct != null && out.total_sl_loss_pct > r.max_total_loss_pct) out.warnings.push(`全保有ロットが同時に損切りになった場合の損失が総資産の ${out.total_sl_loss_pct.toFixed(1)}% となり、許容 ${r.max_total_loss_pct}% を超えます。`);
  if (code && held.has(code)) {
    const same = open.filter((x) => x.code === code); const avg = same.reduce((s, x) => s + x.en_price * x.shares, 0) / same.reduce((s, x) => s + x.shares, 0);
    if ((en - avg) * sgn < 0) out.warnings.push(short ? `同じ銘柄を、いまの建値（平均 ${priceStr(avg)}）より高く売り増す形です。含み損での追加（ナンピン）は原則しない方針です。`
      : `同じ銘柄を、いまの建値（平均 ${priceStr(avg)}）より安く買い足す形です。含み損での買い足し（ナンピン）は原則しない方針です。`);
    else out.notes.push(`同じ銘柄を、いまの建値（平均 ${priceStr(avg)}）より${short ? "安く売り増す" : "高く買い足す"}形です（含み益の中での積み増し）。`);
  }
  if (out.invested_pct_after != null && out.invested_pct_after > 100) out.notes.push("登録後は株の割合が100%を超えます（信用を使っている状態）。");
  if (fut && out.notional_x != null && shares > 0) out.notes.push(`先物の想定元本は ${fmt0(amount)} 円で、総資産の ${out.notional_x.toFixed(1)} 倍です（株の割合には入れません）。`);
  return out;
}

// ---------- 記録の操作（state を直接書き換える。保存は呼ぶ側） ----------
const nextId = (state) => (state.lots.reduce((m, l) => Math.max(m, l.id), 0) + 1);
export function log(state, op, detail) { (state.ops ||= []).push({ ts: nowStr(), op, detail }); if (state.ops.length > 2000) state.ops.splice(0, state.ops.length - 2000); }

export function upsertStock(state, code, name, market, earnings_date = null) {
  code = code.trim().toUpperCase();
  const s = state.stocks.find((x) => x.code === code);
  if (s) { s.name = name; s.market = market; if (earnings_date !== undefined) s.earnings_date = earnings_date; }
  else state.stocks.push({ code, name, market, earnings_date, created_at: nowStr() });
}
export function insertLot(state, lot) {
  const id = nextId(state);
  state.lots.push({ en_type: "real", sl_price: null, target_price: null, memo: "", original_en_date: null, parent_lot_id: null, side: "long",
    ex_date: null, ex_price: null, ex_type: null, void_reason: null, ...lot, id, code: lot.code.toUpperCase(), status: "active", created_at: nowStr(), updated_at: nowStr() });
  log(state, "insert_lot", { id, code: lot.code }); return id;
}
export function closeLot(state, id, ex_date, ex_price, ex_type = "real") {
  const l = state.lots.find((x) => x.id === id && x.status === "active"); if (!l) throw new Error("記録が見つかりません");
  if (l.ex_date) throw new Error("すでに手仕舞い済みです");
  l.ex_date = ex_date; l.ex_price = +ex_price; l.ex_type = ex_type; l.updated_at = nowStr(); log(state, "close_lot", { id, ex_date, ex_price });
}
export function splitLot(state, id, qty, memoSuffix = "") {
  const l = state.lots.find((x) => x.id === id); if (!l || l.ex_date) throw new Error("保有中の記録ではありません");
  if (qty <= 0 || qty >= l.shares) throw new Error("分ける数量は 1 以上、保有数量未満にしてください。");
  l.shares -= qty; l.updated_at = nowStr();
  return insertLot(state, { ...l, shares: qty, memo: (l.memo || "") + (memoSuffix || `（${qtyStr(l.code, qty)}を分割）`), ex_date: null, ex_price: null, ex_type: null });
}
export function sellLot(state, id, ex_date, ex_price, qty = null) {
  const l = state.lots.find((x) => x.id === id); if (!l || l.ex_date) throw new Error("保有中の記録ではありません");
  if (qty == null || qty >= l.shares - 1e-9) { closeLot(state, id, ex_date, ex_price); return { closed_lot_id: id, remaining_lot_id: null, sold: l.shares }; }
  const nid = splitLot(state, id, qty, `（${qtyStr(l.code, qty)}を一部${l.side === "short" ? "買い戻し" : "売り"}）`);
  closeLot(state, nid, ex_date, ex_price); return { closed_lot_id: nid, remaining_lot_id: id, sold: qty };
}
export function resetBasis(state, id, d, price, newShares, memo = "", sl = null, target = null) {
  const l = state.lots.find((x) => x.id === id && x.status === "active"); if (!l) throw new Error("記録が見つかりません");
  if (l.ex_date) throw new Error("手仕舞い済みの記録は置き直せません");
  if (newShares <= 0) throw new Error("数量は 0 より大きくしてください（全部手放すときは「売る」）");
  if (d < l.en_date) throw new Error("置き直しの日は買った日より後にしてください");
  if ((price - l.en_price) * sign(l.side) < 0) throw new Error(l.side === "short" ? "建値より上には置き直せません（空売りは下がったときに置き直します）" : "建値より下には置き直せません（下がったときは売るか、損切り値を見直します）");
  closeLot(state, id, d, price, "reset");
  const diff = newShares - l.shares; const uw = qtyWord(l.code);
  const auto = diff ? `置き直し（${fmt0(l.shares)}${uw}→${fmt0(newShares)}${uw}）` : "置き直し";
  const nid = insertLot(state, { code: l.code, market: l.market, account: l.account, side: l.side, en_date: d, en_price: +price, shares: newShares, en_type: "reset",
    sl_price: sl || null, target_price: target || l.target_price, memo: auto + (memo ? "：" + memo : ""), original_en_date: l.original_en_date || l.en_date, parent_lot_id: id });
  const fx = l.market === "US" ? (fxRate(state.assets, d) || 0) : 1;
  return { new_lot_id: nid, realized_jpy: (price - l.en_price) * sign(l.side) * l.shares * unitFor(l.code) * fx, shares_diff: diff };
}
export function voidLot(state, id, reason = "") { const l = state.lots.find((x) => x.id === id); if (!l) return; l.status = "void"; l.void_reason = reason; l.updated_at = nowStr(); log(state, "void_lot", { id, reason }); }
export function reopenLot(state, id) { const l = state.lots.find((x) => x.id === id); if (!l) return; l.ex_date = null; l.ex_price = null; l.ex_type = null; l.updated_at = nowStr(); log(state, "reopen_lot", { id }); }
export function updateLot(state, id, fields) { const l = state.lots.find((x) => x.id === id); if (!l) return; for (const k of ["sl_price", "target_price", "memo", "account", "en_date", "en_price", "shares"]) if (k in fields) l[k] = fields[k]; l.updated_at = nowStr(); log(state, "update_lot", { id, ...fields }); }
export function upsertAssets(state, date, total_jpy, usd_jpy, memo = "") {
  const a = state.assets.find((x) => x.date === date);
  if (a) { a.total_jpy = +total_jpy; a.usd_jpy = usd_jpy || null; a.memo = memo; } else state.assets.push({ date, total_jpy: +total_jpy, usd_jpy: usd_jpy || null, memo, created_at: nowStr() });
  state.assets.sort((x, y) => (x.date < y.date ? -1 : 1)); log(state, "upsert_assets", { date, total_jpy });
}

// ---------- 1回の取引（エピソード）＝持ち始めてから全部手放すまで ----------
export function episodes(state) {
  const lots = activeLots(state.lots); const byCode = new Map();
  for (const l of lots) { if (!byCode.has(l.code)) byCode.set(l.code, []); byCode.get(l.code).push(l); }
  const out = [];
  for (const [code, g] of byCode) {
    g.sort((a, b) => (a.en_date === b.en_date ? a.id - b.id : a.en_date < b.en_date ? -1 : 1));
    let cur = null, curEnd = "";
    for (const r of g) {
      const ex = r.ex_date || null;
      if (!cur || r.en_date > curEnd) {
        if (cur) { cur.end = curEnd === "9999" ? null : curEnd; out.push(cur); }
        cur = { code, name: stockName(state, code), market: r.market, side: r.side || "long", start: r.en_date, end: null, lot_ids: [], buys: [], sells: [] };
        curEnd = "";
      }
      cur.lot_ids.push(r.id);
      if (r.en_type === "real") cur.buys.push({ date: r.en_date, qty: r.shares, price: r.en_price });
      if (ex && r.ex_type === "real") cur.sells.push({ date: ex, qty: r.shares, price: r.ex_price });
      curEnd = curEnd > (ex || "9999") ? curEnd : (ex || "9999");
    }
    if (cur) { cur.end = curEnd === "9999" ? null : curEnd; out.push(cur); }
  }
  for (const e of out) {
    const q1 = e.buys.reduce((s, b) => s + b.qty, 0), q2 = e.sells.reduce((s, b) => s + b.qty, 0);
    e.avg_buy = q1 ? e.buys.reduce((s, b) => s + b.qty * b.price, 0) / q1 : null;
    e.avg_sell = q2 ? e.sells.reduce((s, b) => s + b.qty * b.price, 0) / q2 : null;
    e.pnl_pct = e.end && e.avg_buy && e.avg_sell ? (e.avg_sell / e.avg_buy - 1) * 100 * sign(e.side) : null;
    e.key = `${e.code}:${e.start}`;
  }
  return out.sort((a, b) => ((b.end || "9999") + b.start).localeCompare((a.end || "9999") + a.start));
}
export function episodeKeyForBuy(state, code, en_date) {
  for (const e of episodes(state)) if (e.code === code && e.start <= en_date && (!e.end || e.end >= en_date)) return e.key;
  return `${code}:${en_date}`;
}

// ---------- 成績 ----------
export const PERIODS = [["mtd", "今月"], ["last_month", "先月"], ["3m", "直近3か月"], ["ytd", "年初来"], ["1y", "直近1年"], ["all", "全期間"], ["custom", "期間を指定"]];
export const SORTS = [["new", "新しい順"], ["pnl_desc", "利益が大きい順"], ["pnl_asc", "損失が大きい順"], ["pct_desc", "損益%が高い順"], ["pct_asc", "損益%が低い順"], ["days_desc", "保有日数が長い順"]];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export function periodRange(key, custom = null) {
  const t = new Date(); t.setHours(0, 0, 0, 0); const end = iso(t);
  const mk = /^(\d{4})-(\d{2})$/.exec(key || "");
  if (mk) { const y = +mk[1], m = +mk[2]; return [`${mk[1]}-${mk[2]}-01`, iso(new Date(y, m, 0))]; }
  if (key === "mtd") return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), end];
  if (key === "last_month") return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))];
  if (key === "3m") return [iso(addDays(t, -91)), end];
  if (key === "ytd") return [`${t.getFullYear()}-01-01`, end];
  if (key === "1y") return [iso(addDays(t, -365)), end];
  if (key === "custom" && custom) { const [a, b] = custom; return a && b ? [a < b ? a : b, a < b ? b : a] : [a || null, b || end]; }
  return [null, end];
}
export function periodLabel(key, start, end) {
  const mk = /^(\d{4})-(\d{2})$/.exec(key || ""); const name = mk ? `${+mk[1]}年${+mk[2]}月` : (Object.fromEntries(PERIODS)[key] || key);
  return `${name}（${start || "最初"}〜${end}）`;
}
export function monthOptions(state) {
  const dates = activeLots(state.lots).map((l) => l.en_date).sort(); const t = new Date();
  let y = t.getFullYear(), m = t.getMonth() + 1; const first = dates[0] || iso(t); const fy = +first.slice(0, 4), fm = +first.slice(5, 7); const out = [];
  while (y > fy || (y === fy && m >= fm)) { out.push([`${y}-${String(m).padStart(2, "0")}`, `${y}年${m}月`]); m -= 1; if (m === 0) { y -= 1; m = 12; } }
  return out;
}
export const periodOptions = (state) => [...PERIODS, ...monthOptions(state)];
export function sortTrades(t, how) {
  const a = [...t];
  if (how === "pnl_desc") return a.sort((x, y) => y.pnl_jpy - x.pnl_jpy);
  if (how === "pnl_asc") return a.sort((x, y) => x.pnl_jpy - y.pnl_jpy);
  if (how === "pct_desc") return a.sort((x, y) => (y.pnl_pct ?? -1e9) - (x.pnl_pct ?? -1e9));
  if (how === "pct_asc") return a.sort((x, y) => (x.pnl_pct ?? 1e9) - (y.pnl_pct ?? 1e9));
  if (how === "days_desc") return a.sort((x, y) => y.days - x.days || y.end.localeCompare(x.end));
  return a.sort((x, y) => (y.end + y.start).localeCompare(x.end + x.start));
}
export function periodStats(state, start, end) {
  const out = { n: 0, wins: 0, losses: 0, win_rate: null, avg_win_pct: null, avg_loss_pct: null, rr: null, expectancy_pct: null, total_pnl_jpy: 0, pnl_of_assets_pct: null, best: null, worst: null, trades: [], open_n: 0 };
  const df = enrichLots(activeLots(state.lots), state.assets); const pnlById = new Map(df.map((r) => [r.id, r.pnl_jpy || 0]));
  const rows = [];
  for (const e of episodes(state)) {
    if (!e.end) { out.open_n += 1; continue; }
    if ((start && e.end < start) || e.end > end) continue;
    rows.push({ code: e.code, name: e.name, side: e.side, start: e.start, end: e.end, days: daysBetween(e.start, e.end), pnl_pct: e.pnl_pct, pnl_jpy: e.lot_ids.reduce((s, i) => s + (pnlById.get(i) || 0), 0), key: e.key });
  }
  if (!rows.length) return out;
  out.trades = rows; out.n = rows.length;
  const wins = rows.filter((r) => r.pnl_jpy > 0), losses = rows.filter((r) => r.pnl_jpy <= 0);
  out.wins = wins.length; out.losses = losses.length; out.win_rate = wins.length / rows.length * 100;
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  out.avg_win_pct = mean(wins.map((r) => r.pnl_pct).filter((x) => x != null)); out.avg_loss_pct = -mean(losses.map((r) => r.pnl_pct).filter((x) => x != null));
  out.rr = out.avg_loss_pct > 0 ? out.avg_win_pct / out.avg_loss_pct : null;
  const p = out.win_rate / 100; out.expectancy_pct = p * out.avg_win_pct - (1 - p) * out.avg_loss_pct;
  out.total_pnl_jpy = rows.reduce((s, r) => s + r.pnl_jpy, 0);
  const latest = latestAssets(state.assets, end); if (latest && latest.total_jpy) out.pnl_of_assets_pct = out.total_pnl_jpy / latest.total_jpy * 100;
  out.best = rows.reduce((a, b) => (b.pnl_jpy > a.pnl_jpy ? b : a)); out.worst = rows.reduce((a, b) => (b.pnl_jpy < a.pnl_jpy ? b : a));
  return out;
}
export function statsVerdict(st, cfg) {
  if (!st.n) return "この期間に手仕舞いした取引はありません。";
  const w = cfg.risk.win_rate_pct, rr = cfg.risk.rr_ratio; const parts = [];
  parts.push(`勝率 ${st.win_rate.toFixed(0)}%（想定 ${(+w).toFixed(0)}%）` + (st.win_rate >= w ? "" : " ← 下回っています"));
  if (st.rr != null) parts.push(`RR比 ${st.rr.toFixed(2)}（想定 ${(+rr).toFixed(1)}）` + (st.rr >= rr ? "" : " ← 下回っています"));
  else parts.push("RR比は負け（または勝ち）がないため計測できません");
  parts.push(`1回あたりの期待値 ${signedPct(st.expectancy_pct)}` + (st.expectancy_pct > 0 ? "（プラス）" : "（マイナス。勝率かRR比のどちらかを上げる必要があります）"));
  return parts.join("。") + "。";
}
export function assetsSeries(state, start, end) {
  const a = state.assets.filter((x) => x.date <= end).sort((x, y) => (x.date < y.date ? -1 : 1));
  if (!start) return a.map((x) => [x.date, +x.total_jpy]);
  const before = a.filter((x) => x.date < start); const inr = a.filter((x) => x.date >= start);
  return [...(before.length ? [before[before.length - 1]] : []), ...inr].map((x) => [x.date, +x.total_jpy]);
}


// ---------- 売買から推定した総資産（確定損益の積み上げ） ----------
// 基準＝一番新しい総資産の登録（日付 A、金額 T）。A より前の日 d は T − (d の翌日〜A に確定した損益)、A より後は T ＋ (A の翌日〜d に確定した損益)。
// 含み損益・入出金・税は入らない。点は手仕舞いのあった日ごと。登録が1件もなければ null。
export function tradesSeries(state, start = null, end = null) {
  const anchor = latestAssets(state.assets); if (!anchor) return null;
  const A = anchor.date, T = +anchor.total_jpy;
  const closed = enrichLots(activeLots(state.lots), state.assets).filter((r) => r.ex_date && r.pnl_jpy != null);
  const byDay = new Map();
  for (const r of closed) byDay.set(r.ex_date, (byDay.get(r.ex_date) || 0) + r.pnl_jpy);
  const days = [...new Set([...byDay.keys(), A])].sort();
  const pts = days.map((d) => {
    let v = T;
    if (d < A) { for (const [x, p] of byDay) if (x > d && x <= A) v -= p; }
    else { for (const [x, p] of byDay) if (x > A && x <= d) v += p; }
    return [d, Math.round(v)];
  });
  if (!start) return pts.filter(([d]) => !end || d <= end);
  const before = pts.filter(([d]) => d < start), inr = pts.filter(([d]) => d >= start && (!end || d <= end));
  return [...(before.length ? [before[before.length - 1]] : []), ...inr];
}

// ---------- 指数との比較（資産推移） ----------
export const INDEXES = [["日経225", "^N225", "#9aa3af"], ["NASDAQ100", "^NDX", "#D55E00"], ["S&P500", "^GSPC", "#009E73"], ["SOX", "^SOX", "#CC79A7"], ["オルカン", "ACWI", "#E69F00"]];
// 開始日以前の最後の値を起点にして、期間内の値を並べる（総資産の系列と同じ考え方）
export function indexSeries(raw, start, end) {
  const rows = (raw || []).filter(([d]) => d <= end).sort((a, b) => a[0].localeCompare(b[0]));
  const before = rows.filter(([d]) => d <= start), inside = rows.filter(([d]) => d > start);
  return [...(before.length ? [before[before.length - 1]] : []), ...inside].map(([d, v]) => [d, +v]);
}
// 起点からの変化率（%）の系列
export const pctSeries = (pts) => (pts.length ? pts.map(([d, v]) => [d, (v / pts[0][1] - 1) * 100]) : []);
export const changePct = (pts) => (pts.length >= 2 ? (pts[pts.length - 1][1] / pts[0][1] - 1) * 100 : null);

// ---------- ホームの注意 ----------
export function collectWarnings(state, cfg) {
  const s = portfolioSummary(state); const out = [];
  if (s.total_assets != null) { const age = daysBetween(s.assets_date, today()); if (age > 7) out.push({ text: `総資産の登録が ${age} 日前のままです`, go: "assets" }); }
  const open = enrichLots(openLots(state.lots), state.assets);
  if (open.length) {
    if (s.n_positions > cfg.risk.max_positions) out.push({ text: `保有銘柄数 ${s.n_positions} が上限 ${cfg.risk.max_positions} を超えています` });
    if (s.sl_total_pct > cfg.risk.max_total_loss_pct) out.push({ text: `全部損切りになったときの損失 ${s.sl_total_pct.toFixed(1)}% が上限 ${cfg.risk.max_total_loss_pct}% を超えています` });
    for (const r of open) if (r.sl_price == null) out.push({ text: `${r.code} ${stockName(state, r.code)} の損切り値が未設定です`, go: `sl:${r.id}` });
    const held = new Set(open.map((r) => r.code));
    for (const st of state.stocks) if (held.has(st.code) && st.earnings_date) { const d = daysBetween(today(), st.earnings_date); if (d >= 0 && d <= 7) out.push({ text: `${st.code} ${st.name} の決算日 ${st.earnings_date} が近いです（決算またぎはしない方針）` }); }
  }
  const pend = episodes(state).filter((e) => e.end && daysBetween(e.end, today()) >= 14 && daysBetween(e.end, today()) <= 45 && !(state.reviews.find((r) => r.key === e.key) || {}).reviewed_at);
  if (pend.length) out.push({ text: `手仕舞いから2週間たった取引の振り返り待ち ${pend.length} 件`, go: "review" });
  return out;
}

export const HABITS = [
  ["no_reason_en", "根拠なしEN", "ENの理由を1行で書けない／悩んだまま入った"],
  ["size_short", "量不足", "入るべき所で入れているが、量が少ない・初動で入りきれない"],
  ["corr_break", "相関崩れの見逃し", "出来高とローソク足の相関が崩れたのに降りなかった"],
  ["first_pullback", "初押しで降りる", "直線上昇の初押しで降りてしまった"],
  ["en_late", "EN1日遅い", "ブレイクの判断が揺れて、ENが1日遅れた"],
  ["vol_compare", "出来高の比較相手違い", "以前にもよくある程度の出来高で入った"],
  ["near_double", "2倍付近で追加", "大底からの2倍価格付近で追加・入り直した"],
  ["illiquid", "小型・低流動性", "小型・低流動性の急騰に乗って荒れた"],
  ["earnings_full", "決算フル跨ぎ", "フルポジションのまま決算を跨いだ"],
];
