// node --test tests/rules.test.mjs  （Mac 版の Python テストと同じ数字になることを確かめる）
import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../rules.js";

const cfg = structuredClone(R.DEFAULT_SETTINGS);
const fresh = () => ({ lots: [], stocks: [], assets: [], reviews: [], ops: [] });

test("先物の乗数・市場の自動判定・数量の言い方", () => {
  assert.equal(R.unitFor("NK225M"), 100); assert.equal(R.unitFor("MNQ"), 2); assert.equal(R.unitFor("7203"), 1);
  assert.equal(R.marketForCode("NK225M"), "JP"); assert.equal(R.marketForCode("MNQ"), "US"); assert.equal(R.marketForCode("285A"), "JP"); assert.equal(R.marketForCode("AAPL"), "US");
  assert.equal(R.qtyStr("NK225M", 2), "2枚"); assert.equal(R.qtyStr("7203", 100), "100株");
});

test("投入割合は最新の総資産で割り直す。米国株は為替で円に", () => {
  const s = fresh();
  R.upsertAssets(s, "2026-10-01", 10_000_000, 150);
  R.upsertStock(s, "7203", "トヨタ", "JP"); R.upsertStock(s, "AAPL", "Apple", "US");
  R.insertLot(s, { code: "7203", market: "JP", account: "cash", en_date: "2026-10-02", en_price: 3000, shares: 100 });
  R.insertLot(s, { code: "AAPL", market: "US", account: "margin", en_date: "2026-10-02", en_price: 200, shares: 10 });
  let df = R.enrichLots(R.openLots(s.lots), s.assets);
  assert.ok(Math.abs(df[0].pct_of_assets - 3.0) < 1e-9); assert.equal(df[1].amount_jpy, 200 * 10 * 150);
  R.upsertAssets(s, "2026-10-10", 20_000_000, 150);
  df = R.enrichLots(R.openLots(s.lots), s.assets); assert.ok(Math.abs(df[0].pct_of_assets - 1.5) < 1e-9);
});

test("先物：想定元本・損切り損失・目安枚数（100株に丸めない）", () => {
  const s = fresh(); R.upsertAssets(s, "2026-10-01", 10_000_000, 150);
  R.insertLot(s, { code: "NK225M", market: "JP", account: "margin", en_date: "2026-10-02", en_price: 40000, shares: 2, sl_price: 39500 });
  const df = R.enrichLots(R.openLots(s.lots), s.assets);
  assert.equal(df[0].amount_jpy, 40000 * 100 * 2); assert.equal(df[0].sl_loss_jpy, 500 * 100 * 2);
  assert.equal(R.suggestedShares(340_000, 40000, 39500, 1, 1, 100), 6);
  const pv = R.enPreview(s, cfg, "NK225M", "JP", 40000, 2, 39500);
  assert.equal(pv.suggested_shares, 6); assert.equal(pv.amount, 8_000_000); assert.equal(pv.invested_pct_after, 0);
  const sum = R.portfolioSummary(s); assert.equal(sum.invested, 0); assert.equal(sum.futures_notional, 8_000_000);
});

test("空売り：損切りは上、損益は逆向き、置き直しは下がったとき", () => {
  const s = fresh(); R.upsertAssets(s, "2026-10-01", 10_000_000, 150); R.upsertStock(s, "7203", "トヨタ", "JP");
  const id = R.insertLot(s, { code: "7203", market: "JP", account: "margin", side: "short", en_date: "2026-10-02", en_price: 3000, shares: 100, sl_price: 3150 });
  let df = R.enrichLots(R.openLots(s.lots), s.assets); assert.equal(df[0].sl_loss_jpy, 150 * 100);
  assert.equal(R.suggestedShares(340_000, 3000, 3150, 1, 100, 1, "short"), 2200);
  assert.equal(R.suggestedShares(340_000, 3000, 2900, 1, 100, 1, "short"), null);
  const pv = R.enPreview(s, cfg, "7203", "JP", 3000, 100, 2900, "short"); assert.ok(pv.warnings.some((w) => w.includes("売値以下")));
  assert.throws(() => R.resetBasis(s, id, "2026-10-10", 3100, 100));
  R.sellLot(s, id, "2026-10-05", 2700);
  df = R.enrichLots(R.activeLots(s.lots), s.assets); assert.equal(df[0].pnl_jpy, 300 * 100); assert.ok(Math.abs(df[0].pnl_pct - 10) < 1e-9);
});

test("一部売り・置き直し・成績（勝率・RR・月の期間）", () => {
  const s = fresh(); R.upsertAssets(s, "2026-01-01", 10_000_000, 150); R.upsertStock(s, "7203", "トヨタ", "JP"); R.upsertStock(s, "9984", "SBG", "JP");
  const a = R.insertLot(s, { code: "7203", market: "JP", account: "cash", en_date: "2026-05-10", en_price: 3000, shares: 300, sl_price: 2900 });
  const res = R.sellLot(s, a, "2026-05-15", 3300, 100);                       // 一部売り +30,000
  assert.equal(res.remaining_lot_id, a); assert.equal(s.lots.find((l) => l.id === a).shares, 200);
  const rb = R.resetBasis(s, a, "2026-05-20", 3600, 200);                      // 置き直し：確定 +120,000
  assert.equal(rb.realized_jpy, 600 * 200);
  R.sellLot(s, rb.new_lot_id, "2026-05-25", 3500);                             // -20,000 → 取引全体 +130,000
  const b = R.insertLot(s, { code: "9984", market: "JP", account: "cash", en_date: "2026-06-01", en_price: 10000, shares: 100 });
  R.sellLot(s, b, "2026-06-10", 9000);                                         // -100,000
  const eps = R.episodes(s); assert.equal(eps.length, 2);
  let st = R.periodStats(s, ...R.periodRange("2026-05")); assert.equal(st.n, 1); assert.equal(st.total_pnl_jpy, 130_000); assert.equal(st.win_rate, 100);
  st = R.periodStats(s, ...R.periodRange("all")); assert.equal(st.n, 2); assert.equal(st.total_pnl_jpy, 30_000); assert.equal(st.win_rate, 50);
  assert.deepEqual(R.periodRange("2026-02"), ["2026-02-01", "2026-02-28"]);
  const sorted = R.sortTrades(st.trades, "pnl_asc"); assert.equal(sorted[0].code, "9984");
  assert.equal(R.monthOptions(s)[R.monthOptions(s).length - 1][0], "2026-05");
});

test("指数との比較：起点は開始日以前の最後の値、変化率は起点比", () => {
  const raw = [["2026-01-05", 100], ["2026-01-09", 110], ["2026-01-16", 99], ["2026-02-02", 120]];
  const p = R.indexSeries(raw, "2026-01-10", "2026-01-31");
  assert.deepEqual(p, [["2026-01-09", 110], ["2026-01-16", 99]]);
  assert.deepEqual(R.pctSeries(p).map(([d, v]) => [d, +v.toFixed(2)]), [["2026-01-09", 0], ["2026-01-16", -10]]);
  assert.equal(+R.changePct(p).toFixed(2), -10);
  assert.deepEqual(R.indexSeries(raw, "2026-03-01", "2026-03-31"), [["2026-02-02", 120]]);
});

test("為替：自分で入れた値が優先、なければ自動取得のドル円、その日以前の最後の値", () => {
  const s = fresh(); R.upsertAssets(s, "2026-10-01", 10_000_000, null);
  R.setFxTable([["2026-09-30", 150], ["2026-10-05", 152], ["2026-10-10", 155]]);
  assert.equal(R.fxRate(s.assets, "2026-10-07"), 152); assert.equal(R.fxRate(s.assets), 155); assert.equal(R.fxRate(s.assets, "2026-01-01"), 150);
  R.insertLot(s, { code: "AAPL", market: "US", account: "margin", en_date: "2026-10-06", en_price: 200, shares: 10 });
  assert.equal(R.enrichLots(R.openLots(s.lots), s.assets)[0].amount_jpy, 200 * 10 * 152);
  R.upsertAssets(s, "2026-10-08", 10_000_000, 160);
  assert.equal(R.fxRate(s.assets, "2026-10-09"), 160); assert.equal(R.fxRate(s.assets, "2026-10-07"), 152);
  const pv = R.enPreview(s, cfg, "NVDA", "US", 100, 10, 90);
  assert.equal(pv.fx, 160); assert.equal(pv.amount_local, 1000); assert.equal(pv.fx_missing, false);
  R.setFxTable([]);
});
