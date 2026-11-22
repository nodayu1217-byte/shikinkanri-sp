"""指数の終値を Yahoo Finance から取って data/indices.json に書く（GitHub Actions が毎日実行。手元でも実行できる）。

  python scripts/fetch_indices.py

出力: {"updated": "YYYY-MM-DD HH:MM", "series": {"^N225": [["YYYY-MM-DD", 終値], ...], ...}}
スマホ版の「資産推移」が ./data/indices.json を読んで、総資産の変化率と比べる。
"""
import datetime as dt
import json
import pathlib
import warnings

warnings.filterwarnings("ignore")
import yfinance as yf  # noqa: E402

SYMBOLS = ["^N225", "^NDX", "^GSPC", "^SOX", "ACWI"]
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "indices.json"

def main() -> None:
    start = (dt.date.today() - dt.timedelta(days=3 * 366)).isoformat()
    df = yf.download(SYMBOLS, start=start, interval="1d", progress=False, auto_adjust=False, threads=False)["Close"]
    series = {}
    for sym in SYMBOLS:
        s = df[sym].dropna() if sym in df else []
        series[sym] = [[d.strftime("%Y-%m-%d"), round(float(v), 2)] for d, v in s.items()]
    old = json.loads(OUT.read_text()) if OUT.exists() else {"series": {}}
    for sym, rows in series.items():  # 取れなかった日は前回の値を残す
        if len(rows) < 10 and old["series"].get(sym):
            series[sym] = old["series"][sym]
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "series": series}, ensure_ascii=False, separators=(",", ":")))
    print({k: (len(v), v[-1][0] if v else None) for k, v in series.items()})

if __name__ == "__main__":
    main()
