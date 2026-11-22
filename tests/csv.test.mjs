// node --test tests/csv.test.mjs  （Mac 版 test_broker_csv.py と同じ結果になることを確かめる）
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as C from "../csv.js";
import * as R from "../rules.js";

const fresh = () => ({ lots: [], stocks: [], assets: [], reviews: [], ops: [] });
const run = (text, market = "auto") => { const rows = C.parseCsvText(text); const h = C.detectHeaderRow(rows); return C.parseTrades(rows, h, C.guessMapping(rows[h]), market); };

test("SBI風（Shift_JIS・見出しが2行目）：一部売りは分割して手仕舞い", () => {
  const rows = C.readCsvBytes(readFileSync(new URL("./sbi_sjis.csv", import.meta.url)));
  const h = C.detectHeaderRow(rows); assert.equal(h, 1);
  const df = C.parseTrades(rows, h, C.guessMapping(rows[h]));
  assert.equal(C.summarize(df).ok, 3); assert.equal(df.filter((t) => t.side === "sell").length, 1);
  const s = fresh(); R.upsertAssets(s, "2026-10-01", 10_000_000, null);
  const res = C.importTrades(s, df, "SBI");
  assert.equal(res.lots, 2); assert.equal(res.closed, 2); assert.deepEqual(res.warnings, []);
  const open = s.lots.filter((l) => !l.ex_date);
  assert.equal(open.length, 1); assert.equal(open[0].shares, 50); assert.equal(open[0].en_price, 3100);
  assert.equal(s.lots.filter((l) => l.ex_price === 3300).length, 2);
});

test("楽天風：信用は margin、空売り（新規売）は飛ばす", () => {
  const df = run("約定日,受渡日,銘柄コード,銘柄名,市場名称,口座区分,取引区分,売買区分,信用区分,数量［株］,単価［円］\n2026/10/02,2026/10/06,6758,ソニーグループ,東証,特定,信用新規,買付,制度,200,2500\n2026/10/09,2026/10/13,6758,ソニーグループ,東証,特定,信用返済,売付,制度,200,2600\n2026/10/09,2026/10/13,9984,ソフトバンクグループ,東証,特定,信用新規,売付,制度,100,9000\n");
  assert.equal(df[0].account, "margin");
  const s = fresh(); const res = C.importTrades(s, df, "楽天");
  assert.equal(res.lots, 1); assert.equal(res.closed, 1); assert.ok(!s.lots.some((l) => l.code === "9984"));
});

test("moomoo風（米国株・約定日時）：CSV より前の保有を売ると注意", () => {
  const df = run("銘柄コード,銘柄名,市場,売買方向,約定数量,約定価格,約定日時\nAAPL,Apple Inc,US,買い,10,250.5,2026-10-03 23:31:00\nAAPL,Apple Inc,US,売り,20,260,2026-10-20 23:31:00\n");
  assert.equal(df[0].market, "US");
  const s = fresh(); const res = C.importTrades(s, df, "moomoo");
  assert.equal(res.lots, 1); assert.equal(res.closed, 1); assert.equal(res.warnings.length, 1);
});

test("同じ CSV を2回取り込んでも二重登録しない", () => {
  const text = "約定日,銘柄コード,銘柄名,売買,数量,単価\n2026/10/01,7203,トヨタ,買,100,3000\n2026/10/10,7203,トヨタ,売,100,3300\n";
  const s = fresh(); const r1 = C.importTrades(s, run(text)); const r2 = C.importTrades(s, run(text));
  assert.equal(r1.lots, 1); assert.equal(r2.lots, 0); assert.equal(r2.closed, 0); assert.equal(s.lots.length, 1);
});

test("約定日時（時刻・タイムゾーン付き）から日付だけ", () => {
  assert.equal(C.toDate("2026/10/15 11:53:34 JST"), "2026-10-15"); assert.equal(C.toDate("2026/10/12 15:52:32 ET"), "2026-10-12");
  assert.equal(C.toDate("2026-10-09T12:46:31"), "2026-10-09"); assert.equal(C.toDate("2026年10月9日 09:00"), "2026-10-09");
  assert.equal(C.toDate("10/28/2026 09:30:00 EDT"), "2026-10-28"); assert.equal(C.toDate("2026/10/09"), "2026-10-09"); assert.equal(C.toDate("2026/13/40 1:00"), null);
});

test("新しい順の CSV でも、同じ日の買い→売りを時刻順に処理する", () => {
  const df = C.parseTrades([["銘柄コード", "銘柄名", "方向", "約定数量", "約定価格", "約定日時"], ["8035", "東京エレクトロン", "売り", "100", "12430", "2026/10/09 14:18:34 JST"], ["8035", "東京エレクトロン", "買い", "100", "12430", "2026/10/09 13:14:30 JST"]], 0, { code: 0, name: 1, side: 2, qty: 3, price: 4, date: 5 });
  assert.deepEqual(df.map((t) => t.side), ["buy", "sell"]);
  const s = fresh(); const res = C.importTrades(s, df); assert.deepEqual(res.warnings, []); assert.ok(s.lots.every((l) => l.ex_date));
  const df2 = C.parseTrades([["約定日", "銘柄コード", "売買", "数量", "単価"], ["2026/10/09", "8035", "売", "100", "12430"], ["2026/10/09", "8035", "買", "100", "12430"]], 0, { date: 0, code: 1, side: 2, qty: 3, price: 4 });
  assert.deepEqual(df2.map((t) => t.side), ["buy", "sell"]);
});

test("引用符つきの CSV と英数字の日本株コード", () => {
  const df = run('"約定日","銘柄コード","銘柄名","売買","数量","単価"\n"2026/10/01","285A","キオクシア, Inc","買","1,000","3,000"\n');
  assert.equal(df[0].market, "JP"); assert.equal(df[0].qty, 1000); assert.equal(df[0].price, 3000); assert.equal(df[0].name, "キオクシア, Inc");
});
