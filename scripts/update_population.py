#!/usr/bin/env python3
"""Conservatively update 65+ and 75+ population from Cabinet Office annual whitepapers.
Only accepts explicit publication-year figures and preserves all other data unchanged.
No third-party packages or API keys.
"""
import json
import re
import html
import sys
import urllib.request
from pathlib import Path

FILE = Path(__file__).resolve().parents[1] / "data" / "population.json"
URL = "https://www8.cao.go.jp/kourei/whitepaper/w-{year}/html/zenbun/s1_1_1.html"
JPN_YEAR = re.compile(r"令和\s*(\d+)\s*年")


def extract(page: str, year: int):
    plain = re.sub(r"<[^>]*>", " ", page)
    plain = html.unescape(plain).replace("\u3000", " ")
    plain = re.sub(r"\s+", "", plain)
    # Require a clear, same-publication date and all 3 key fields.
    # The latest whitepaper generally describes the previous October's population.
    expected = year - 1
    reiwa = expected - 2018
    if f"令和{reiwa}年10月1日" not in plain:
        raise ValueError("Whitepaper reference date not found")
    def population(pattern):
        matches = re.findall(pattern, plain)
        if not matches:
            raise ValueError("Cannot verify key statistic " + pattern)
        return int(matches[0].replace(",", ""))
    over65 = population(r"65歳以上人口は、?([0-9,]+)万人")
    over75 = population(r"75歳以上人口[」は、]*([0-9,]+)万人")
    rates = re.findall(r"高齢化率[^。]{0,100}?([0-9]+\.[0-9]+)％", plain)
    if not rates:
        raise ValueError("Cannot verify ageing rate")
    pct65 = float(rates[0])
    # For 75+, identify the rate explicitly in the same clause.
    rate75 = re.findall(r"75歳以上人口[^。]{0,180}?総人口に占める割合は([0-9]+\.[0-9]+)％", plain)
    if not rate75:
        raise ValueError("Cannot verify 75+ rate")
    pct75 = float(rate75[0])
    if not (3000 <= over65 <= 4500 and 1800 <= over75 <= 3200 and over75 < over65 and 25 <= pct65 <= 40 and 14 <= pct75 <= 28):
        raise ValueError("Out-of-range data; manual review required")
    return dict(over65=over65, over75=over75, pct65=pct65, pct75=pct75,
                asOf=f"{expected}年10月", source=URL.format(year=year), edition=year)


def main():
    data = json.loads(FILE.read_text(encoding="utf-8"))
    current = data["ages"]
    for year in range(int(current["edition"]) + 1, min(2035, int(current["edition"]) + 3)):
        try:
            request = urllib.request.Request(URL.format(year=year), headers={"User-Agent": "SOFTAZIO population verifier (public statistics)"})
            with urllib.request.urlopen(request, timeout=25) as response:
                body = response.read().decode("utf-8")
            update = extract(body, year)
        except Exception as exc:
            print(f"Not updating from {year}: {exc}")
            continue
        if update["edition"] > current["edition"]:
            print(f"Verified newer whitepaper: {year}.")
            data["ages"] = update
            FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            return
    print("No newer verified whitepaper. Keeping existing published numbers.")


if __name__ == "__main__":
    main()
