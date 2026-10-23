#!/usr/bin/env python3
"""SOFTAZIO static checks. No writes or third-party dependencies."""
from pathlib import Path
from html.parser import HTMLParser
import re
import sys
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = {
    "care-dementia.html": "認知症",
    "care-technique.html": "介護技術",
    "product-care-worker-exam.html": "介護福祉士国家試験",
    "care-mind.html": "メンタルケア",
    "care-equipment.html": "福祉用具ガイド",
    "care-ai.html": "介護とAI",
    "care-notes.html": "CARE NOTES",
    "play.html": "脳トレゲーム",
    "money.html": "お金の備え",
    "population.html": "人口統計",
}
CORE_PAGES = {"index.html": "トップ", **CATEGORIES}
errors = []
class LocalLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("a", "script", "link", "img"):
            url = a.get("href") if tag in ("a", "link") else a.get("src")
            if url:
                self.links.append(url)

for filename, label in CORE_PAGES.items():
    path = ROOT / filename
    if not path.is_file():
        errors.append(f"Missing core page: {filename}")
        continue
    html = path.read_text(encoding="utf-8")
    titles = re.findall(r"<title>(.*?)</title>", html, flags=re.I | re.S)
    descriptions = re.findall(
        r'<meta\b(?=[^>]*\bname=["\']description["\'])'
        r'(?=[^>]*\bcontent=["\']([^"\']+)["\'])[^>]*>',
        html,
        flags=re.I,
    )
    viewports = re.findall(
        r'<meta\b(?=[^>]*\bname=["\']viewport["\'])'
        r'(?=[^>]*\bcontent=["\']([^"\']+)["\'])[^>]*>',
        html,
        flags=re.I,
    )
    if len(titles) != 1 or not titles[0].strip():
        errors.append(f"Title count/content: {filename}")
    if len(descriptions) != 1 or not descriptions[0].strip():
        errors.append(f"Meta description count/content: {filename}")
    if len(viewports) != 1 or "width=device-width" not in viewports[0].replace(" ", ""):
        errors.append(f"Mobile viewport missing/invalid: {filename}")
    if not re.search(r'<html\b[^>]*\blang=["\']ja["\']', html, flags=re.I):
        errors.append(f"Japanese language declaration missing: {filename}")

for filename, label in CATEGORIES.items():
    path = ROOT / filename
    if not path.is_file():
        errors.append(f"Missing category: {filename}")
        continue
    html = path.read_text(encoding="utf-8")
    if html.count('class="sz-breadcrumb"') != 1:
        errors.append(f"Breadcrumb count: {filename}")
    if not re.search(r'href="index\.html"[^>]*>TOP</a>', html):
        errors.append(f"Home breadcrumb missing: {filename}")
    footer_home = re.findall(
        r'<a\b(?=[^>]*\bclass="[^"]*\bsz-footer-home\b[^"]*")'
        r'(?=[^>]*\bhref="/?index\.html(?:[?#][^"]*)?")[^>]*>'
        r'\s*トップへ\s*</a>',
        html,
    )
    if len(footer_home) != 1:
        errors.append(f"Footer home-link count: {filename}")

for path in ROOT.glob("*.html"):
    parser = LocalLinks()
    parser.feed(path.read_text(encoding="utf-8"))
    for link in parser.links:
        if link.startswith(("#", "http:", "https:", "mailto:", "tel:", "data:", "javascript:", "//")):
            continue
        target = link.split("#", 1)[0].split("?", 1)[0]
        if not target:
            continue
        target_path = ROOT / target.lstrip("/") if target.startswith("/") else path.parent / target
        if target_path.is_dir():
            target_path = target_path / "index.html"
        if not target_path.exists():
            errors.append(f"Broken local asset/link: {path.name} -> {link}")

# Ensure public core pages remain discoverable in the XML sitemap.
sitemap = ROOT / "sitemap.xml"
if not sitemap.is_file():
    errors.append("XML sitemap missing")
else:
    xml = sitemap.read_text(encoding="utf-8")
    for page in ("finance-simulator.html", "money.html", "play.html", "population.html", "care-notes.html"):
        if f"https://softazio.github.io/{page}" not in xml:
            errors.append(f"Missing sitemap entry: {page}")

js = ROOT / "finance-simulator.js"
html = ROOT / "finance-simulator.html"
if not js.is_file() or not html.is_file():
    errors.append("Pension simulator missing")
else:
    script = js.read_text(encoding="utf-8")
    page = html.read_text(encoding="utf-8")
    for marker in ("pensionFactor", "spousePension", "spouseStart", "birthDate", "pensionGrowth"):
        if marker not in script:
            errors.append(f"Pension calculator code missing: {marker}")
    for field in ("spousePension", "spouseStart", "birthDate", "spouseBirthDate", "pensionGrowth"):
        if f'id="{field}"' not in page:
            errors.append(f"Pension calculator input missing: {field}")
    if "birth<='1962-04-01'" not in script:
        errors.append("Pension birthdate boundary missing")
    if not re.search(r'src="finance-simulator\.js(?:\?[^"]*)?"', page):
        errors.append("Pension JS link missing")
    if subprocess.run(["node", "--check", str(js)], capture_output=True).returncode:
        errors.append("Pension JavaScript syntax error")

if errors:
    print("SOFTAZIO quality check FAILED")
    for issue in errors[:100]:
        print(" -", issue)
    sys.exit(1)
print(
    f"SOFTAZIO quality check PASSED: {len(CATEGORIES)} categories, "
    "core metadata, local links and pension code"
)
