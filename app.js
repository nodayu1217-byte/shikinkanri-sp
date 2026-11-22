// 画面（スマホ版）。計算は rules.js、保存は db.js。
import * as R from "./rules.js";
import * as DB from "./db.js";

let S = DB.load();
const cfg = () => S.settings;
const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 0) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(x) ? x : d; };
const save = () => { if (!DB.save(S)) toast("保存できませんでした（ブラウザの保存領域がいっぱいか、プライベートモードです）"); };
let toastTimer = null;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200); }
const go = (hash) => { location.hash = hash; };

const MENU = [["#home", "ホーム"], ["#buy", "買う・空売り"], ["#stats", "成績（勝率・RR比）"], ["#trend", "資産推移"], ["#review", "振り返り（取引ごと）"], ["#records", "記録（履歴・銘柄）"], ["#assets", "総資産の登録"], ["#settings", "設定（ルール・バックアップ）"]];
const NAV = [["#home", "ホーム", "⌂"], ["#buy", "買う", "＋"], ["#stats", "成績", "％"], ["#review", "振り返り", "✎"], ["#records", "記録", "≡"]];

// ---------- 部品 ----------
const field = (label, id, value = "", type = "text", opts = {}) => {
  const a = Object.entries({ step: opts.step, placeholder: opts.placeholder, inputmode: type === "number" ? "decimal" : undefined, autocapitalize: opts.caps ? "characters" : undefined, autocomplete: "off", list: opts.list })
    .filter(([, v]) => v != null).map(([k, v]) => `${k}="${esc(v)}"`).join(" ");
  return `<div class="f"><label for="${id}">${esc(label)}</label><input id="${id}" type="${type}" value="${esc(value)}" ${a}></div>`;
};
const select = (label, id, options, value) => `<div class="f"><label for="${id}">${esc(label)}</label><select id="${id}">${options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
const box = (kind, html) => `<div class="box ${kind}">${html}</div>`;
const tile = (k, v, s = "") => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`;
const kv = (k, v, cls = "") => `<div class="kv"><span class="k">${esc(k)}</span><span class="v ${cls}">${esc(v)}</span></div>`;
const val = (id) => ($(`#${id}`) || {}).value ?? "";
const lotById = (id) => S.lots.find((l) => l.id === +id);
const curOf = (market) => (market === "JP" ? "円" : "ドル");

function setChrome(title, cap, hash) {
  $("#title").textContent = title; $("#cap").textContent = cap || ""; document.title = `${title}｜資金管理`;
  const page = "#" + hash.split("/")[0].replace("#", "");
  $("#drawer").innerHTML = `<div class="ttl">資金管理</div><div class="sub">スマホ版 ${S.saved_at ? "・最終保存 " + S.saved_at.slice(5, 16) : ""}</div>` + MENU.map(([h, t]) => `<a href="${h}" class="${h === page ? "on" : ""}">${esc(t)}</a>`).join("");
  $("#nav").innerHTML = NAV.map(([h, t, i]) => `<a href="${h}" class="${h === page ? "on" : ""}"><span class="i">${i}</span>${esc(t)}</a>`).join("");
  $("#menu").checked = false; window.scrollTo(0, 0);
}

// ---------- ホーム ----------
function donut(items, total) {
  if (!total) return "";
  const r = 42, c = 2 * Math.PI * r; let off = 0; let segs = "";
  for (const [, v, col] of items) { const len = Math.max(0, v / total) * c; segs += `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${col}" stroke-width="16" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += len; }
  const stockPct = items.filter(([n]) => n !== "現金").reduce((s, [, v]) => s + v, 0) / total * 100;
  return `<div style="display:flex;align-items:center;gap:14px"><svg viewBox="0 0 120 120" width="120" height="120">${segs}<text x="60" y="57" text-anchor="middle" font-size="16" font-weight="700" fill="currentColor">株 ${stockPct.toFixed(0)}%</text><text x="60" y="74" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity=".7">現金 ${(100 - stockPct).toFixed(0)}%</text></svg>
    <div class="small">${items.map(([n, v, col]) => `<div><span class="swatch" style="background:${col};width:12px;height:12px;border-radius:3px"></span> ${esc(n)} ${(v / total * 100).toFixed(1)}%</div>`).join("")}</div></div>`;
}
function home() {
  const s = R.portfolioSummary(S); const r = cfg().risk; const has = s.total_assets != null;
  setChrome("ホーム", R.today() + (has ? `　総資産は ${s.assets_date} 時点` : ""), "#home");
  const st = R.periodStats(S, ...R.periodRange("ytd"));
  let h = '<div class="tiles">' + tile("総資産", has ? R.yen(s.total_assets) : "未登録", has ? `許せる損失 ${R.man(s.total_assets * r.max_risk_pct / 100)}` : "下の「総資産を更新」から")
    + tile("株に入れている割合", R.pct(s.invested_pct), `現物 ${R.man(s.cash_invested)} / 信用 ${R.man(s.margin_invested)}` + (s.futures_notional ? ` / 先物 ${R.man(s.futures_notional)}` : ""))
    + tile("保有銘柄数", `${s.n_positions} 銘柄`, `上限 ${r.max_positions}`) + tile("全損切り時の損失", R.pct(s.sl_total_pct), `上限 ${r.max_total_loss_pct}%`) + "</div>";
  if (st.n) h += `<div class="muted" style="margin:8px 2px 0">年初来の成績：勝率 <b>${st.win_rate.toFixed(0)}%</b>${st.rr != null ? `・RR比 <b>${st.rr.toFixed(2)}</b>` : ""}・損益 <b>${R.signed0(st.total_pnl_jpy / 10000)}万円</b>（決済 ${st.n}回）　<a class="lnk" href="#stats">詳しく</a></div>`;
  h += `<a class="btn sub" href="#assets">総資産を更新</a>`;
  const warns = R.collectWarnings(S, cfg());
  if (warns.length) h += box("warn", `<ul class="w">${warns.map((w) => `<li>${esc(w.text)}${w.go ? `（<a href="#${w.go === "assets" ? "assets" : w.go === "review" ? "review" : w.go.replace("sl:", "sl/")}">${w.go.startsWith("sl:") ? "いま決める" : w.go === "assets" ? "更新する" : "振り返る"}</a>）` : ""}</li>`).join("")}</ul>`);
  if (has) {
    const pal = cfg().charts.colors; const items = s.by_stock.filter((g) => !g.fut).map((g, i) => [`${g.code} ${g.name}`, g.amount, pal[i % pal.length]]);
    items.push(["現金", Math.max(s.total_assets - items.reduce((a, [, v]) => a + v, 0), 0), cfg().charts.cash_color]);
    h += `<h2>総資産の内訳</h2><div class="card">${donut(items, s.total_assets)}${s.futures_notional ? `<div class="muted" style="margin-top:8px">先物の想定元本 ${R.man(s.futures_notional)}（総資産の ${(s.futures_notional / s.total_assets).toFixed(1)} 倍）。円グラフには入れていません</div>` : ""}</div>`;
  }
  h += "<h2>保有している株・先物</h2>";
  const open = R.enrichLots(R.openLots(S.lots), S.assets);
  if (!open.length) h += '<div class="card muted">保有はありません。「買う」から登録できます。</div>';
  else {
    h += '<div class="card">';
    const keys = [...new Set(open.map((l) => `${l.code}|${l.side}`))];
    for (const k of keys) {
      const [code, side] = k.split("|"); const g = open.filter((l) => l.code === code && l.side === side);
      const shares = g.reduce((a, l) => a + l.shares, 0); const avg = g.reduce((a, l) => a + l.en_price * l.shares, 0) / shares;
      const sls = g.map((l) => l.sl_price).filter((x) => x != null);
      const sl = !sls.length ? "未設定" : sls.length < g.length ? "一部未設定" : new Set(sls).size === 1 ? R.priceStr(sls[0]) : `${R.priceStr(Math.min(...sls))}〜${R.priceStr(Math.max(...sls))}`;
      const acct = g[0].fut ? "先物" : R.ACCOUNT_LABEL[g[0].account];
      h += `<div class="pos"><div><div class="n">${esc(code)} ${esc(R.stockName(S, code))}</div><div class="d">${R.SIDE_LABEL[side]}・${acct}　損切り値 ${esc(sl)}</div></div>
        <div class="r"><div class="n">${R.qtyStr(code, shares)}</div><div class="d">${g.length > 1 ? "平均 " : ""}${R.priceStr(avg)}　${R.pct(g.reduce((a, l) => a + (l.pct_of_assets || 0), 0))}</div></div></div>`;
      for (const l of g) h += `<div class="lot"><span>${esc(l.original_en_date || l.en_date)}　${R.priceStr(l.en_price)}${l.en_type === "reset" ? "（置き直し）" : ""}　${R.qtyStr(code, l.shares)}</span><span><a href="#sl/${l.id}">損切り値</a><a href="#reset/${l.id}">置き直し</a><a href="#sell/${l.id}">${side === "short" ? "買い戻す" : "売る"}</a></span></div>`;
    }
    h += "</div>";
  }
  $("#main").innerHTML = h;
}

// ---------- 買う・空売り ----------
const buyForm = { side: "long", code: "", fut: "", name: "", date: "", price: "", sl: "", shares: "", account: "cash", memo: "", hr: "unknown", conv: "" };
function buy() {
  setChrome("買う・空売り", "", "#buy"); if (!buyForm.date) buyForm.date = R.today();
  const f = buyForm;
  $("#main").innerHTML = `<div class="card"><form id="buyf" onsubmit="return false">
    ${select("売買", "b_side", [["long", "買い"], ["short", "空売り"]], f.side)}
    ${field("銘柄コード（例 7203 / AAPL）", "b_code", f.code, "text", { caps: true, list: "codes" })}<datalist id="codes">${S.stocks.map((s) => `<option value="${esc(s.code)}">${esc(s.name)}</option>`).join("")}</datalist>
    ${select("先物（株ならそのまま）", "b_fut", [["", "株（上のコードを使う）"], ...R.FUTURES.map((x) => [x.code, x.name])], f.fut)}
    <div id="b_known" class="muted"></div><div id="b_namewrap">${field("銘柄名（初めての銘柄のとき）", "b_name", f.name)}</div>
    ${field("買った日", "b_date", f.date, "date")}
    <div class="row2">${field("買値　円", "b_price", f.price, "number", { step: "any" })}${field("損切り値　円", "b_sl", f.sl, "number", { step: "any" })}</div>
    ${field("数量（株）", "b_shares", f.shares, "number", { step: "1" })}
    <div id="b_acctwrap">${select("現物／信用", "b_account", [["cash", "現物"], ["margin", "信用"]], f.account)}</div>
    ${field("メモ（買う根拠を1行。振り返りの「ENの理由」になります）", "b_memo", f.memo)}
    <div class="row2">${select("HR候補か", "b_hr", [["unknown", "未判定"], ["yes", "はい"], ["no", "いいえ"]], f.hr)}${select("確信度", "b_conv", [["", "未記入"], ["1", "1（小）"], ["3", "3（中）"], ["9", "9（大）"]], f.conv)}</div>
    <div id="preview"></div>
    <button id="b_save" type="button">この内容で登録する</button></form></div>`;
  const form = $("#buyf");
  form.addEventListener("input", () => { readBuy(); buyPreview(); });
  form.addEventListener("change", () => { readBuy(); if (f.fut) { f.code = f.fut; $("#b_code").value = f.fut; } buyPreview(); });
  $("#b_save").addEventListener("click", buySave);
  buyPreview();
}
function readBuy() { for (const k of ["side", "code", "fut", "name", "date", "price", "sl", "shares", "account", "memo", "hr", "conv"]) buyForm[k] = val("b_" + k); buyForm.code = buyForm.code.trim().toUpperCase(); }
function buyPreview() {
  const f = buyForm; const spec = R.futureSpec(f.code); const fut = !!spec; const market = f.code ? R.marketForCode(f.code) : "JP"; const short = f.side === "short";
  const known = S.stocks.find((s) => s.code === f.code);
  $("#b_known").textContent = f.code ? (fut ? `${spec.name}（${R.unitNote(f.code)}）` : known ? `${known.name}（${market === "JP" ? "日本株" : "米国株"}）` : `新しい銘柄（${market === "JP" ? "日本株" : "米国株"}）。名前を下に入れてください`) : "";
  $("#b_namewrap").style.display = f.code && !fut && !known ? "" : "none";
  $("#b_acctwrap").style.display = fut || short ? "none" : "";
  $("label[for=b_date]").textContent = short ? "売った日（新規）" : "買った日"; $("label[for=b_price]").textContent = `${short ? "売値（新規）" : "買値"}　${curOf(market)}`;
  $("label[for=b_sl]").textContent = `損切り値　${curOf(market)}${short ? "（売値より上）" : ""}`; $("label[for=b_shares]").textContent = `数量（${R.qtyWord(f.code)}）`;
  $("#b_shares").step = fut || market === "US" ? "1" : "100";
  const price = num(f.price), sl = num(f.sl), shares = num(f.shares);
  if (!f.code || price <= 0) { $("#preview").innerHTML = '<div class="muted" style="margin-top:10px">コードと買値を入れると評価が出ます</div>'; $("#b_save").disabled = true; return; }
  const pv = R.enPreview(S, cfg(), f.code, market, price, shares, sl || null, f.side);
  let h = "<h2>評価</h2>";
  if (pv.suggested_shares) h += `<button type="button" class="sub" id="b_fill">目安の ${R.fmt0(pv.suggested_shares)} ${R.qtyWord(f.code)} を数量に入れる</button>`;
  h += kv("許せる損失の上限", R.yen(pv.max_risk_amount)) + kv("損切り時の損失", pv.risk_amount != null ? `${R.yen(pv.risk_amount)}（${R.pct(pv.risk_pct)}）` : "損切り値を入れると出ます")
    + kv(fut ? "想定元本" : short ? "売る金額" : "買う金額", fut && pv.notional_x != null ? `${R.yen(pv.amount)}（総資産の ${pv.notional_x.toFixed(1)} 倍）` : `${R.yen(pv.amount)}（${R.pct(pv.amount_pct)}）`)
    + kv("株の割合（登録後）", `${R.pct(pv.invested_pct_before)} → ${R.pct(pv.invested_pct_after)}`) + kv("銘柄数（登録後）", `${pv.n_positions_after}（上限 ${cfg().risk.max_positions}）`)
    + kv("全損切り時の損失（登録後）", `${R.pct(pv.total_sl_loss_pct)}（上限 ${cfg().risk.max_total_loss_pct}%）`);
  if (pv.warnings.length) h += box("warn", "⚠ ルールから外れています<br>" + pv.warnings.map((w) => "・" + esc(w)).join("<br>")); else if (shares > 0) h += box("ok", "✓ ルールの範囲内です");
  if (pv.notes.length) h += `<div class="muted">${pv.notes.map((n) => "参考: " + esc(n)).join("<br>")}</div>`;
  $("#preview").innerHTML = h; $("#b_save").disabled = !(shares > 0 && !pv.fx_missing);
  const fill = $("#b_fill"); if (fill) fill.addEventListener("click", () => { $("#b_shares").value = pv.suggested_shares; buyForm.shares = String(pv.suggested_shares); buyPreview(); });
  buyForm._pv = pv; buyForm._market = market; buyForm._fut = fut; buyForm._known = known;
}
function buySave() {
  readBuy(); buyPreview(); const f = buyForm; const pv = f._pv; if (!pv) return;
  const price = num(f.price), sl = num(f.sl), shares = num(f.shares); const spec = R.futureSpec(f.code);
  const name = spec ? spec.name : f._known ? f._known.name : f.name.trim();
  if (!name) { toast("銘柄名を入れてください"); return; }
  if (pv.warnings.length && !confirm("ルールから外れています：\n" + pv.warnings.map((w) => "・" + w).join("\n") + "\n\nこのまま登録しますか？")) return;
  const short = f.side === "short"; const account = f._fut || short ? "margin" : f.account;
  if (!f._known) R.upsertStock(S, f.code, name, f._market);
  const key = R.episodeKeyForBuy(S, f.code, f.date);
  R.insertLot(S, { code: f.code, market: f._market, account, side: f.side, en_date: f.date, en_price: price, shares, sl_price: sl || null, memo: f.memo });
  const rv = S.reviews.find((r) => r.key === key) || (S.reviews.push({ key, code: f.code, start_date: f.date, habits: [], created_at: R.nowStr() }), S.reviews[S.reviews.length - 1]);
  if (f.hr !== "unknown") rv.hr_candidate = f.hr; if (f.conv) rv.conviction = +f.conv;
  if (f.memo.trim()) { const line = `${f.date} ${short ? "空売り" : "買"} ${R.qtyStr(f.code, shares)}: ${f.memo.trim()}`; rv.en_reason = rv.en_reason ? rv.en_reason + "\n" + line : line; }
  save(); toast(`✓ ${f.code} ${name} ${R.qtyStr(f.code, shares)} を登録しました` + (sl ? "" : "（損切り値が未設定です）"));
  Object.assign(buyForm, { code: "", fut: "", name: "", price: "", sl: "", shares: "", memo: "", hr: "unknown", conv: "" }); go("#home");
}

// ---------- 売る・置き直し・損切り値 ----------
function lotHead(l) {
  return `<div style="font-weight:700">${esc(l.code)} ${esc(R.stockName(S, l.code))}${l.side === "short" ? "　空売り" : ""}</div><div class="muted">${R.qtyStr(l.code, l.shares)}　建値 ${R.priceStr(l.en_price)}${curOf(l.market)}　損切り値 ${l.sl_price != null ? R.priceStr(l.sl_price) : "未設定"}${R.isFuture(l.code) ? `　（${R.unitNote(l.code)}）` : ""}</div>`;
}
function fxFor(l, d) { return l.market === "US" ? (R.fxRate(S.assets, d) || 0) : 1; }
function sell(id) {
  const l = lotById(id); if (!l || l.ex_date) { $("#main").innerHTML = box("warn", "その記録は見つかりません（手仕舞い済みかもしれません）"); return; }
  const short = l.side === "short"; setChrome(short ? "買い戻す" : "売る", "", "#home");
  $("#main").innerHTML = `<div class="card">${lotHead(l)}${field(short ? "買い戻した日" : "売った日", "s_date", R.today(), "date")}
    <div class="row2">${field(`${short ? "買い戻し値" : "売値"}　${curOf(l.market)}`, "s_price", "", "number", { step: "any" })}${field(`数量（全部なら ${R.fmt0(l.shares)}）`, "s_qty", l.shares, "number", { step: "1" })}</div>
    <div id="s_fx"></div><button id="s_save" type="button" disabled>${short ? "買い戻しを記録する" : "売りを記録する"}</button></div>`;
  const upd = () => {
    const p = num(val("s_price")), q = Math.min(num(val("s_qty")), l.shares); const fx = fxFor(l, val("s_date"));
    if (p <= 0 || q <= 0) { $("#s_fx").innerHTML = box("info", "値段を入れると損益が出ます"); $("#s_save").disabled = true; return; }
    const pl = (p - l.en_price) * R.sign(l.side) * q * R.unitFor(l.code) * fx; const rate = (p / l.en_price - 1) * 100 * R.sign(l.side);
    $("#s_fx").innerHTML = box("info", `${R.qtyStr(l.code, q)}の損益 ${R.signed0(pl)} 円（${R.signedPct(rate)}）` + (q < l.shares ? `　残り ${R.qtyStr(l.code, l.shares - q)} は保有のまま` : "") + (fx ? "" : "　※為替が未登録"));
    $("#s_save").disabled = !fx;
  };
  $("#main").addEventListener("input", upd); upd();
  $("#s_save").addEventListener("click", () => {
    const p = num(val("s_price")), q = Math.min(num(val("s_qty")), l.shares); const d = val("s_date");
    const pl = (p - l.en_price) * R.sign(l.side) * q * R.unitFor(l.code) * fxFor(l, d);
    if (!confirm(`${l.code} ${R.stockName(S, l.code)} ${R.qtyStr(l.code, q)} を ${d} に ${R.priceStr(p)} で${short ? "買い戻します" : "売ります"}。\n損益 ${R.signed0(pl)} 円。よろしいですか？`)) return;
    try { R.sellLot(S, l.id, d, p, q); } catch (e) { toast(e.message); return; }
    save(); toast(`✓ ${short ? "買い戻し" : "売り"}を記録しました（${R.signed0(pl)} 円）`); go("#home");
  });
}
function reset(id) {
  const l = lotById(id); if (!l || l.ex_date) { $("#main").innerHTML = box("warn", "その記録は見つかりません"); return; }
  const short = l.side === "short"; setChrome("建値を置き直す", "", "#home");
  $("#main").innerHTML = `<div class="card">${lotHead(l)}
    <div class="muted small" style="margin-top:6px">売らずに、損失を測る起点を今の価格に動かす記録上の操作です。それまでの含み益は確定損益として記録されます。数量は通常そのまま（変えると差が買い増し／一部売りになります）。</div>
    ${field("置き直す日", "r_date", R.today(), "date")}${field(`新しい建値（今の価格）　${curOf(l.market)}`, "r_price", "", "number", { step: "any" })}
    ${field(`数量（${R.qtyWord(l.code)}）`, "r_shares", l.shares, "number", { step: "1" })}${field(`新しい損切り値　${curOf(l.market)}（空欄なら今の損切り幅を保った値）`, "r_sl", "", "number", { step: "any" })}
    ${field("メモ（任意）", "r_memo", "")}<div id="r_fx"></div><button id="r_save" type="button" disabled>置き直しを記録する</button></div>`;
  const upd = () => {
    const p = num(val("r_price")), n = num(val("r_shares")); const ok = p > 0 && (p - l.en_price) * R.sign(l.side) > 0;
    if (p <= 0) { $("#r_fx").innerHTML = box("info", "今の価格を「新しい建値」に入れてください"); $("#r_save").disabled = true; return; }
    const realized = (p - l.en_price) * R.sign(l.side) * l.shares * R.unitFor(l.code) * fxFor(l, val("r_date")); const diff = n - l.shares;
    const lines = [`確定損益として記録: ${R.signed0(realized)} 円（${R.priceStr(l.en_price)} → ${R.priceStr(p)}）`];
    if (l.sl_price != null && !num(val("r_sl"))) lines.push(`損切り値は空欄なら ${R.priceStr(p - (l.en_price - l.sl_price))} になります（今の損切り幅を保った値）`);
    if (diff > 0) lines.push(`数量 ${R.fmt0(l.shares)} → ${R.fmt0(n)}（+${R.fmt0(diff)}${R.qtyWord(l.code)} 買い増し）`); else if (diff < 0) lines.push(`数量 ${R.fmt0(l.shares)} → ${R.fmt0(n)}（${R.fmt0(diff)}${R.qtyWord(l.code)} 一部売り）`);
    if (!ok) lines.push(short ? "⚠ 建値より上には置き直せません。上がったときは「買い戻す」か、損切り値を見直します" : "⚠ 建値より下には置き直せません。下がったときは「売る」か、損切り値を見直します");
    $("#r_fx").innerHTML = box(ok ? "info" : "warn", lines.map(esc).join("<br>")); $("#r_save").disabled = !ok || n <= 0;
  };
  $("#main").addEventListener("input", upd); upd();
  $("#r_save").addEventListener("click", () => {
    const p = num(val("r_price")), n = num(val("r_shares")); let sl = num(val("r_sl")) || null; if (!sl && l.sl_price != null) sl = p - (l.en_price - l.sl_price);
    if (!confirm(`${l.code} ${R.stockName(S, l.code)} の建値を ${R.priceStr(l.en_price)} → ${R.priceStr(p)} に置き直します。\n損切り値は ${sl ? R.priceStr(sl) : "未設定"}。よろしいですか？`)) return;
    try { R.resetBasis(S, l.id, val("r_date"), p, n, val("r_memo"), sl); } catch (e) { toast(e.message); return; }
    save(); toast("✓ 建値を置き直しました"); go("#home");
  });
}
function slEdit(id) {
  const l = lotById(id); if (!l || l.ex_date) { $("#main").innerHTML = box("warn", "その記録は見つかりません"); return; }
  setChrome("損切り値を直す", "", "#home");
  $("#main").innerHTML = `<div class="card">${lotHead(l)}${field(`損切り値　${curOf(l.market)}（空欄で未設定）`, "e_sl", l.sl_price ?? "", "number", { step: "any" })}
    ${field(`目標値　${curOf(l.market)}（任意）`, "e_target", l.target_price ?? "", "number", { step: "any" })}${field("メモ", "e_memo", l.memo || "")}<button id="e_save" type="button">保存する</button></div>`;
  $("#e_save").addEventListener("click", () => {
    const sl = num(val("e_sl")) || null;
    if (sl && (l.en_price - sl) * R.sign(l.side) <= 0) { toast(l.side === "short" ? "空売りの損切り値は建値より上に置きます" : "損切り値は建値より下に置きます"); return; }
    R.updateLot(S, l.id, { sl_price: sl, target_price: num(val("e_target")) || null, memo: val("e_memo") }); save(); toast("✓ 保存しました"); go("#home");
  });
}

// ---------- 成績・資産推移 ----------
function periodBar(page, key, from, to, sort) {
  const opts = R.periodOptions(S).map(([k, t]) => `<option value="${k}"${k === key ? " selected" : ""}>${esc(t)}</option>`).join("");
  return `<div class="pf"><select id="p_key">${opts}</select>${sort != null ? `<select id="p_sort">${R.SORTS.map(([k, t]) => `<option value="${k}"${k === sort ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}</div>`
    + (key === "custom" ? `<div class="pf"><input type="date" id="p_from" value="${from}"><input type="date" id="p_to" value="${to}"></div>` : "");
}
function bindPeriod(page) {
  const st = cfg().stats;
  for (const id of ["p_key", "p_sort", "p_from", "p_to"]) { const el = $("#" + id); if (el) el.addEventListener("change", () => { st.period = val("p_key"); if ($("#p_sort")) st.sort = val("p_sort"); st.from = val("p_from") || st.from; st.to = val("p_to") || st.to; save(); route(); }); }
}
function stats() {
  const st = cfg().stats; const key = st.period || "ytd"; const [start, end] = R.periodRange(key, [st.from || `${new Date().getFullYear()}-01-01`, st.to || R.today()]);
  const x = R.periodStats(S, start, end); setChrome("成績", R.periodLabel(key, start, end), "#stats");
  let h = periodBar("stats", key, st.from || `${new Date().getFullYear()}-01-01`, st.to || R.today(), st.sort || "new");
  h += '<div class="tiles">' + tile("手仕舞いした取引", `${x.n} 回`, x.n ? `勝ち ${x.wins}・負け ${x.losses}` : "この期間はなし") + tile("勝率", x.n ? `${x.win_rate.toFixed(0)}%` : "-", `想定 ${cfg().risk.win_rate_pct}%`)
    + tile("RR比", x.rr != null ? x.rr.toFixed(2) : "-", x.n ? `平均利益 ${R.signedPct(x.avg_win_pct, 1)} / 平均損失 −${x.avg_loss_pct.toFixed(1)}%` : `想定 ${cfg().risk.rr_ratio}`)
    + tile("1回あたりの期待値", x.expectancy_pct != null ? R.signedPct(x.expectancy_pct) : "-", "勝率×平均利益 − 負け率×平均損失")
    + tile("合計損益", x.n ? `${R.signed0(x.total_pnl_jpy)} 円` : "-", x.pnl_of_assets_pct != null ? `総資産比 ${R.signedPct(x.pnl_of_assets_pct, 1)}` : "") + "</div>";
  h += box("info", esc(R.statsVerdict(x, cfg())));
  if (x.n) {
    h += `<div class="muted">いちばん良かった: ${esc(x.best.code)} ${esc(x.best.name)} ${R.signed0(x.best.pnl_jpy)} 円　／　いちばん悪かった: ${esc(x.worst.code)} ${esc(x.worst.name)} ${R.signed0(x.worst.pnl_jpy)} 円</div>`;
    h += `<h2>手仕舞いした取引（${esc(Object.fromEntries(R.SORTS)[st.sort || "new"])}）</h2><div class="card">`;
    for (const t of R.sortTrades(x.trades, st.sort || "new")) h += `<a class="pos ${t.pnl_jpy > 0 ? "up" : "down"}" href="#review/${encodeURIComponent(t.key)}" style="text-decoration:none;color:inherit"><div><div class="n">${esc(t.code)} ${esc(t.name)}</div><div class="d">${R.SIDE_LABEL[t.side]}　${t.start} → ${t.end}（${t.days}日）</div></div><div class="r"><div class="n">${R.signed0(t.pnl_jpy)} 円</div><div class="d">${t.pnl_pct != null ? R.signedPct(t.pnl_pct, 1) : "-"}</div></div></a>`;
    h += "</div>";
  }
  h += `<p class="muted">1回の取引＝持ち始めてから全部手放すまで。勝ち負けは円の確定損益で決めます。保有中 ${x.open_n} 件は含みません。取引を押すと振り返りが開きます。</p>`;
  $("#main").innerHTML = h; bindPeriod("stats");
}
function lineChart(points) {
  if (points.length < 2) return '<div class="muted">この期間に総資産の登録が2回以上ないので、線が引けません。</div>';
  const W = 360, H = 200, L = 46, Rr = 10, T = 10, B = 26; const xs = points.map(([d]) => new Date(d).getTime()), ys = points.map(([, v]) => v);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys); if (y1 === y0) { y0 *= 0.98; y1 *= 1.02; } if (x1 === x0) x1 = x0 + 1; const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const X = (x) => L + (x - x0) / (x1 - x0) * (W - L - Rr), Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const pts = xs.map((x, i) => `${X(x).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join(" "); let grid = "";
  for (let i = 0; i < 5; i++) { const yv = y0 + (y1 - y0) * i / 4; grid += `<line x1="${L}" x2="${W - Rr}" y1="${Y(yv).toFixed(1)}" y2="${Y(yv).toFixed(1)}" stroke="currentColor" stroke-opacity=".12"/><text x="${L - 4}" y="${(Y(yv) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity=".7">${R.fmt0(yv / 10000)}万</text>`; }
  const up = ys[ys.length - 1] >= ys[0]; const col = up ? "var(--up)" : "var(--down)";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}<polygon points="${X(xs[0]).toFixed(1)},${Y(y0).toFixed(1)} ${pts} ${X(xs[xs.length - 1]).toFixed(1)},${Y(y0).toFixed(1)}" fill="${col}" fill-opacity=".12"/><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${X(xs[xs.length - 1]).toFixed(1)}" cy="${Y(ys[ys.length - 1]).toFixed(1)}" r="3.5" fill="${col}"/>
    <text x="${L}" y="${H - 8}" font-size="10" fill="currentColor" fill-opacity=".7">${points[0][0]}</text><text x="${W - Rr}" y="${H - 8}" text-anchor="end" font-size="10" fill="currentColor" fill-opacity=".7">${points[points.length - 1][0]}</text></svg>`;
}
function trend() {
  const st = cfg().stats; const key = st.period || "ytd"; const [start, end] = R.periodRange(key, [st.from || `${new Date().getFullYear()}-01-01`, st.to || R.today()]);
  const pts = R.assetsSeries(S, start, end); setChrome("資産推移", R.periodLabel(key, start, end), "#trend");
  let h = periodBar("trend", key, st.from || `${new Date().getFullYear()}-01-01`, st.to || R.today(), null) + `<div class="card">${lineChart(pts)}`;
  if (pts.length >= 2) { const a = pts[0][1], b = pts[pts.length - 1][1]; h += kv(`${pts[0][0]} → ${pts[pts.length - 1][0]}`, `${R.signed0(b - a)} 円（${R.signedPct((b / a - 1) * 100, 1)}）`, b >= a ? "plus" : "minus") + kv("期間の最高・最低", `${R.fmt0(Math.max(...pts.map((p) => p[1])) / 10000)}万 / ${R.fmt0(Math.min(...pts.map((p) => p[1])) / 10000)}万円`); }
  h += "</div>";
  if (pts.length) h += `<h2>登録した値（新しい順）</h2><div class="card">${[...pts].reverse().slice(0, 20).map(([d, v]) => kv(d, R.yen(v))).join("")}</div>`;
  h += '<a class="btn sub" href="#assets">総資産を登録する</a>';
  $("#main").innerHTML = h; bindPeriod("trend");
}

// ---------- 振り返り（取引ごと） ----------
function review(key) {
  if (key) return reviewEdit(decodeURIComponent(key));
  setChrome("振り返り", "取引ごとに「理由・HR判定・癖」を残す", "#review");
  const eps = R.episodes(S); const df = R.enrichLots(R.activeLots(S.lots), S.assets); const pnl = new Map(df.map((r) => [r.id, r.pnl_jpy || 0]));
  const rvOf = (k) => S.reviews.find((r) => r.key === k) || {};
  const status = (e) => { if (!e.end) return "保有中"; const d = Math.round((new Date(R.today()) - new Date(e.end)) / 86400000); const rv = rvOf(e.key); if (rv.reviewed_at) return "振り返り済み"; return d < 14 ? `手仕舞いから${d}日（14日後から）` : "振り返り待ち"; };
  let h = '<div class="card">';
  if (!eps.length) h += '<div class="muted">まだ取引がありません。</div>';
  for (const e of eps) {
    const p = e.lot_ids.reduce((s, i) => s + (pnl.get(i) || 0), 0); const stt = status(e);
    h += `<a class="pos ${e.end ? (p > 0 ? "up" : "down") : ""}" href="#review/${encodeURIComponent(e.key)}" style="text-decoration:none;color:inherit"><div><div class="n">${esc(e.code)} ${esc(e.name)}${e.side === "short" ? "（空売り）" : ""}</div><div class="d">${e.start} → ${e.end || "保有中"}　<b>${esc(stt)}</b>${rvOf(e.key).hr_result ? "　" + esc(rvOf(e.key).hr_result) : ""}</div></div><div class="r"><div class="n">${e.end ? R.signed0(p) + " 円" : ""}</div><div class="d">${e.pnl_pct != null ? R.signedPct(e.pnl_pct, 1) : ""}</div></div></a>`;
  }
  $("#main").innerHTML = h + "</div>";
}
function reviewEdit(key) {
  const e = R.episodes(S).find((x) => x.key === key); if (!e) { $("#main").innerHTML = box("warn", "その取引は見つかりません"); return; }
  let rv = S.reviews.find((r) => r.key === key); if (!rv) { rv = { key, code: e.code, start_date: e.start, habits: [], created_at: R.nowStr() }; S.reviews.push(rv); }
  rv.habits ||= [];
  setChrome(`${e.code} ${e.name}`, `${e.start} → ${e.end || "保有中"}`, "#review");
  const fills = [...e.buys.map((b) => ({ ...b, s: e.side === "short" ? "空売り" : "買い" })), ...e.sells.map((b) => ({ ...b, s: e.side === "short" ? "買い戻し" : "売り" }))].sort((a, b) => a.date.localeCompare(b.date));
  let h = `<div class="card"><h2 style="margin-top:0">売買</h2>${fills.map((f) => kv(`${f.date} ${f.s}`, `${R.fmt0(f.qty)}${R.qtyWord(e.code)} @ ${R.priceStr(f.price)}`)).join("")}`;
  if (e.pnl_pct != null) h += kv(e.side === "short" ? "平均売値 → 平均買い戻し値" : "平均買値 → 平均売値", `${R.priceStr(e.avg_buy)} → ${R.priceStr(e.avg_sell)}（${R.signedPct(e.pnl_pct, 1)}）`, e.pnl_pct >= 0 ? "plus" : "minus");
  h += `</div><div class="card"><h2 style="margin-top:0">EN時</h2>
    <div class="row2">${select("HR候補だと思ったか", "v_hr", [["unknown", "未判定"], ["yes", "はい"], ["no", "いいえ"]], rv.hr_candidate || "unknown")}${select("確信度", "v_conv", [["", "未記入"], ["1", "1（小）"], ["3", "3（中）"], ["9", "9（大）"]], rv.conviction || "")}</div>
    <label for="v_en">ENの理由</label><textarea id="v_en">${esc(rv.en_reason || "")}</textarea></div>
    <div class="card"><h2 style="margin-top:0">EX時</h2><label for="v_ex">EXの理由</label><textarea id="v_ex">${esc(rv.ex_reason || "")}</textarea></div>
    <div class="card"><h2 style="margin-top:0">事後の振り返り${e.end ? "" : "（手仕舞い後に）"}</h2>
    ${select("本人判定", "v_res", [["", "未判定"], ["HR", "HR"], ["準HR", "準HR"], ["HRではない", "HRではない"]], rv.hr_result || "")}
    <label>当てはまった癖（押して選ぶ）</label><div class="chips" id="v_habits">${R.HABITS.map(([k, t, d]) => `<span class="chip ${rv.habits.includes(k) ? "on" : ""}" data-h="${k}" title="${esc(d)}">${esc(t)}</span>`).join("")}</div>
    <label for="v_cm">自分のコメント</label><textarea id="v_cm">${esc(rv.self_comment || "")}</textarea>
    <button id="v_save" type="button" class="sub">保存する</button>${e.end ? `<button id="v_done" type="button">保存して「振り返り済み」にする</button>` : ""}${rv.reviewed_at ? `<div class="muted center" style="margin-top:6px">振り返り済み（${esc(rv.reviewed_at.slice(0, 10))}）</div>` : ""}</div>`;
  $("#main").innerHTML = h;
  $("#v_habits").addEventListener("click", (ev) => { const c = ev.target.closest(".chip"); if (!c) return; c.classList.toggle("on"); });
  const collect = () => { rv.hr_candidate = val("v_hr"); rv.conviction = val("v_conv") ? +val("v_conv") : null; rv.en_reason = val("v_en"); rv.ex_reason = val("v_ex"); rv.hr_result = val("v_res"); rv.habits = [...document.querySelectorAll("#v_habits .chip.on")].map((c) => c.dataset.h); rv.self_comment = val("v_cm"); rv.updated_at = R.nowStr(); };
  $("#v_save").addEventListener("click", () => { collect(); save(); toast("✓ 保存しました"); });
  const done = $("#v_done"); if (done) done.addEventListener("click", () => { collect(); rv.reviewed_at = R.nowStr(); save(); toast("✓ 振り返り済みにしました"); go("#review"); });
}

// ---------- 記録 ----------
let recTab = "lots", showVoid = false;
function records(tab) {
  if (tab) recTab = tab; setChrome("記録", "削除はしません。間違いは「取り消し」として残ります", "#records");
  let h = `<div class="tabs"><a href="#records/lots" class="${recTab === "lots" ? "on" : ""}">売買の履歴</a><a href="#records/assets" class="${recTab === "assets" ? "on" : ""}">総資産</a><a href="#records/stocks" class="${recTab === "stocks" ? "on" : ""}">銘柄</a></div>`;
  if (recTab === "lots") {
    const df = R.enrichLots(S.lots.filter((l) => showVoid || l.status === "active"), S.assets).sort((a, b) => (b.en_date + String(b.id).padStart(6, "0")).localeCompare(a.en_date + String(a.id).padStart(6, "0")));
    const closedSum = df.filter((r) => r.status === "active" && r.pnl_jpy != null).reduce((s, r) => s + r.pnl_jpy, 0);
    h += `<div class="muted">確定損益の合計 ${R.signed0(closedSum)} 円　<span class="lnk" id="tg_void">${showVoid ? "取り消し済みを隠す" : "取り消し済みも見る"}</span></div><div class="card">`;
    if (!df.length) h += '<div class="muted">記録はありません</div>';
    for (const r of df) {
      const closed = !!r.ex_date; const cls = r.status === "void" ? "void" : closed ? (r.pnl_jpy > 0 ? "up" : "down") : "";
      h += `<div class="pos ${cls}"><div><div class="n">${esc(r.code)} ${esc(R.stockName(S, r.code))}${r.side === "short" ? "（空売り）" : ""}</div><div class="d">${R.EN_TYPE_LABEL[r.en_type]} ${r.en_date} @ ${R.priceStr(r.en_price)} ${R.qtyStr(r.code, r.shares)}${closed ? `　→ ${R.EX_TYPE_LABEL[r.ex_type]} ${r.ex_date} @ ${R.priceStr(r.ex_price)}` : ""}${r.memo ? `<br>${esc(r.memo)}` : ""}${r.status === "void" ? `<br>取り消し: ${esc(r.void_reason || "")}` : ""}</div>
        <div class="small" style="margin-top:4px">${r.status === "active" ? `<span class="lnk" data-act="void" data-id="${r.id}" style="margin-left:0">この記録を取り消す</span>${closed && r.ex_type === "real" ? `<span class="lnk" data-act="reopen" data-id="${r.id}">手仕舞いを取り消して保有中に戻す</span>` : ""}` : `<span class="lnk" data-act="unvoid" data-id="${r.id}" style="margin-left:0">取り消しを戻す</span>`}</div></div>
        <div class="r"><div class="n">${closed ? R.signed0(r.pnl_jpy) + " 円" : "保有中"}</div><div class="d">${closed ? R.signedPct(r.pnl_pct) : R.pct(r.pct_of_assets)}</div></div></div>`;
    }
    h += "</div>";
  } else if (recTab === "assets") {
    const a = [...S.assets].sort((x, y) => (x.date < y.date ? 1 : -1));
    h += '<a class="btn sub" href="#assets">総資産を登録する</a><div class="card">' + (a.length ? a.map((x, i) => { const prev = a[i + 1]; return `<div class="pos"><div><div class="n">${x.date}</div><div class="d">${x.usd_jpy ? `為替 ${(+x.usd_jpy).toFixed(2)}　` : ""}${esc(x.memo || "")} <a href="#assets/${x.date}">直す</a></div></div><div class="r"><div class="n">${R.yen(x.total_jpy)}</div><div class="d">${prev ? R.signed0(x.total_jpy - prev.total_jpy) + " 円" : ""}</div></div></div>`; }).join("") : '<div class="muted">まだありません</div>') + "</div>";
  } else {
    h += '<div class="card">' + (S.stocks.length ? S.stocks.map((s) => `<div class="pos"><div><div class="n">${esc(s.code)} ${esc(s.name)}</div><div class="d">${s.market === "JP" ? "日本株" : "米国株"}${s.earnings_date ? `　決算日 ${s.earnings_date}` : ""}</div></div><div class="r"><span class="lnk" data-act="stock" data-code="${esc(s.code)}">直す</span></div></div>`).join("") : '<div class="muted">まだありません</div>') + "</div><div class=\"muted\">決算日を入れておくと、7日以内になったときホームに注意が出ます。</div>";
  }
  $("#main").innerHTML = h;
  const tg = $("#tg_void"); if (tg) tg.addEventListener("click", () => { showVoid = !showVoid; records(); });
  $("#main").addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]"); if (!el) return; const id = +el.dataset.id; const l = lotById(id);
    if (el.dataset.act === "void") { const why = prompt(`${l.code} の記録を取り消します（履歴には残ります）。理由があれば入れてください`, "入力ミス"); if (why === null) return; R.voidLot(S, id, why); save(); toast("取り消しました"); records(); }
    if (el.dataset.act === "unvoid") { l.status = "active"; l.void_reason = null; save(); toast("戻しました"); records(); }
    if (el.dataset.act === "reopen") { if (!confirm(`${l.code} の手仕舞い（${l.ex_date} @ ${R.priceStr(l.ex_price)}）を取り消して保有中に戻しますか？`)) return; R.reopenLot(S, id); save(); toast("保有中に戻しました"); records(); }
    if (el.dataset.act === "stock") { const s = S.stocks.find((x) => x.code === el.dataset.code); const name = prompt("銘柄名", s.name); if (name === null) return; const ed = prompt("決算日（YYYY-MM-DD。なければ空欄）", s.earnings_date || ""); if (ed === null) return; s.name = name.trim() || s.name; s.earnings_date = ed.trim() || null; save(); records(); }
  });
}

// ---------- 総資産 ----------
function assets(date) {
  setChrome("総資産の登録", "", "#assets"); const last = R.latestAssets(S.assets); const cur = date ? S.assets.find((a) => a.date === date) : null;
  $("#main").innerHTML = `<div class="card">${last ? `<div class="muted">最新: ${last.date}　${R.yen(last.total_jpy)}${last.usd_jpy ? `　為替 ${(+last.usd_jpy).toFixed(2)}` : ""}</div>` : ""}
    ${field("日付", "a_date", cur ? cur.date : R.today(), "date")}${field("総資産（円。証券口座の評価額の合計）", "a_total", cur ? cur.total_jpy : last ? Math.round(last.total_jpy) : "", "number", { step: "1" })}
    ${field("為替 USD/JPY（米国株・米国先物がなければ空欄）", "a_fx", cur ? cur.usd_jpy ?? "" : last && last.usd_jpy ? (+last.usd_jpy).toFixed(2) : "", "number", { step: "0.01" })}${field("メモ", "a_memo", cur ? cur.memo || "" : "")}
    <button id="a_save" type="button">登録する</button></div><div class="muted">週に1回（金曜の夜）と、入出金のあとに更新する想定です。投入割合・損失率は全部この最新の値で割り直します。</div>`;
  $("#a_save").addEventListener("click", () => { const t = num(val("a_total")); if (t <= 0) { toast("総資産を入れてください"); return; } R.upsertAssets(S, val("a_date"), t, num(val("a_fx")) || null, val("a_memo")); save(); toast(`✓ ${val("a_date")} の総資産 ${R.yen(t)} を登録しました`); go("#home"); });
}

// ---------- 設定 ----------
function settings() {
  setChrome("設定", "ルール・色・バックアップ", "#settings"); const r = cfg().risk; const c = cfg().charts;
  const row = (label, id, v, help, step = "0.1") => `<div class="pos"><div style="flex:1"><div class="n small">${esc(label)}</div><div class="d">${esc(help)}</div></div><div class="r" style="width:110px"><input id="${id}" type="number" step="${step}" value="${v}" inputmode="decimal"></div></div>`;
  let h = `<div class="card"><h2 style="margin-top:0">資金管理ルール</h2>
    ${row("限界リスク率 %", "c_risk", r.max_risk_pct, "1回の買いで許す損失＝総資産×この%。目安の株数に使います")}
    ${row("破産基準 %", "c_ruin", r.ruin_threshold_pct, "ここまで減ったら立て直す、という許容ドローダウン", "1")}
    ${row("上限銘柄数", "c_pos", r.max_positions, "同時に持つ銘柄数の上限", "1")}
    ${row("全損切り時の許容損失 %", "c_loss", r.max_total_loss_pct, "全部が同時に損切りになったときの損失の上限（総資産比）")}
    ${row("想定勝率 %", "c_win", r.win_rate_pct, "成績の勝率と比べる目安", "1")}
    ${row("想定RR比", "c_rr", r.rr_ratio, "1回の利益÷1回の損失の目安")}
    ${row("置き直し未実施の目安 %", "c_reset", r.reset_threshold_pct, "建値からこの%以上動いたら置き直しを考える目安")}
    <button id="c_save" type="button">ルールを保存する</button></div>`;
  h += `<div class="card"><h2 style="margin-top:0">円グラフの色</h2><div class="chips">${c.colors.map((col, i) => `<label class="chip" style="padding:4px 8px"><input type="color" data-ci="${i}" value="${col}" style="width:34px;height:26px;padding:0;border:0;background:none"> ${i + 1}</label>`).join("")}<label class="chip" style="padding:4px 8px"><input type="color" id="c_cash" value="${c.cash_color}" style="width:34px;height:26px;padding:0;border:0;background:none"> 現金</label></div><div class="muted">変えるとすぐ保存されます。銘柄の順に使います。</div></div>`;
  h += `<div class="card"><h2 style="margin-top:0">バックアップ（機種変更・万一のため）</h2>
    <div class="muted">データはこのスマホの中だけにあります。週に1回は書き出して、iCloud Drive や Google ドライブに保存してください。新しいスマホでは、このアプリを入れてから「読み込む」でそのファイルを選べば、全部そのまま戻ります。</div>
    <button id="bk_out" type="button">バックアップを書き出す（共有／保存）</button>
    <label for="bk_in" class="btn sub" style="margin-top:10px">バックアップを読み込む（今のデータは置き換わります）</label><input id="bk_in" type="file" accept="application/json,.json" style="display:none">
    <div class="muted" style="margin-top:10px">Mac 版に渡すとき：下の CSV を AirDrop などで Mac に送り、Mac 版の「記録 → Excel」から取り込めます。</div>
    <button id="csv_lots" type="button" class="sub">売買の記録を CSV で書き出す</button><button id="csv_assets" type="button" class="sub">総資産の履歴を CSV で書き出す</button>
    <div class="muted" style="margin-top:10px">記録 ${S.lots.length} 件・総資産 ${S.assets.length} 件・銘柄 ${S.stocks.length} 件　最終保存 ${esc(S.saved_at || "-")}　<span id="persist"></span></div></div>`;
  h += `<div class="card"><h2 style="margin-top:0">危険な操作</h2><button id="wipe" type="button" class="danger">このスマホのデータを全部消す</button><div class="muted">消す前に必ずバックアップを書き出してください。</div></div>`;
  $("#main").innerHTML = h;
  $("#c_save").addEventListener("click", () => { Object.assign(cfg().risk, { max_risk_pct: num(val("c_risk"), 3.4), ruin_threshold_pct: num(val("c_ruin"), 30), max_positions: Math.max(1, Math.round(num(val("c_pos"), 4))), max_total_loss_pct: num(val("c_loss"), 4), win_rate_pct: num(val("c_win"), 50), rr_ratio: num(val("c_rr"), 2), reset_threshold_pct: num(val("c_reset"), 3) }); save(); toast("✓ ルールを保存しました"); });
  $("#main").addEventListener("input", (ev) => { const t = ev.target; if (t.type !== "color") return; if (t.id === "c_cash") c.cash_color = t.value; else c.colors[+t.dataset.ci] = t.value; save(); });
  $("#bk_out").addEventListener("click", async () => { const r2 = await DB.shareOrDownload(DB.backupBlob(S), DB.backupName()); if (r2 !== "cancelled") toast(r2 === "shared" ? "共有しました" : "ダウンロードしました（ファイルアプリの「ダウンロード」にあります）"); });
  $("#bk_in").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try { const ns = DB.parseBackup(await f.text()); if (!confirm(`「${f.name}」を読み込みます。\n記録 ${ns.lots.length} 件・総資産 ${ns.assets.length} 件。\n\n今このスマホにあるデータは置き換わります。よろしいですか？`)) return; S = ns; save(); toast("✓ 読み込みました"); go("#home"); }
    catch (e) { toast("読み込めませんでした: " + e.message); }
  });
  $("#csv_lots").addEventListener("click", () => DB.shareOrDownload(DB.lotsCsv(S), `資金管理_売買記録_${R.today()}.csv`));
  $("#csv_assets").addEventListener("click", () => DB.shareOrDownload(DB.assetsCsv(S), `資金管理_総資産_${R.today()}.csv`));
  $("#wipe").addEventListener("click", () => { if (prompt("本当に全部消しますか？ 消すなら「消す」と入力してください") !== "消す") return; S = DB.emptyState(); save(); toast("消しました"); go("#home"); });
  DB.askPersist().then((ok) => { const p = $("#persist"); if (p) p.textContent = ok ? "（保存領域は保護されています）" : ""; });
}

// ---------- ルーティング ----------
function route() {
  const [page, arg] = (location.hash || "#home").slice(1).split("/");
  try {
    ({ home, buy, stats, trend, review: () => review(arg), records: () => records(arg), assets: () => assets(arg), settings,
      sell: () => sell(arg), reset: () => reset(arg), sl: () => slEdit(arg) }[page] || home)();
  } catch (e) { $("#main").innerHTML = box("warn", "画面を出せませんでした: " + esc(e.message)); console.error(e); }
}
window.addEventListener("hashchange", route);
route();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
