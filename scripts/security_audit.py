#!/usr/bin/env python3
"""Read-only, conservative security checks for the static SOFTAZIO site."""
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
errors = []
warnings = []
skip_dirs = {".git", "node_modules", ".venv", "vendor"}
sources = [p for p in root.rglob("*") if p.is_file() and not any(s in skip_dirs for s in p.parts)]
text_exts = {".html", ".js", ".json", ".css", ".yml", ".yaml", ".txt", ".py", ".env"}
for path in sources:
    rel = path.relative_to(root)
    if path.suffix == ".js":
        run = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
        if run.returncode:
            errors.append(f"JavaScript syntax: {rel}: {run.stderr[:240]}")
    if path.suffix not in text_exts:
        continue
    body = path.read_text(encoding="utf-8", errors="replace")
    if re.search(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----", body):
        errors.append(f"Private key marker found in {rel}")
    if re.search(r"gh[pousr]_[A-Za-z0-9_]{36,}", body):
        errors.append(f"Possible GitHub credential in {rel}")
    if re.search(r"AIza[0-9A-Za-z_-]{35}", body):
        warnings.append(f"Review Google API key usage in {rel} (some browser keys are public by design)")
    if re.search(r"(?:api_key|secret_key|service_role_key)\s*[:=]\s*['\"][^'\"]{16,}['\"]", body, re.I):
        warnings.append(f"Review possible embedded credential in {rel}")
    if path.suffix in {".html", ".js"} and re.search(r"\b(?:eval\s*\(|new\s+Function\s*\()", body):
        warnings.append(f"Review dynamic code execution in {rel}")

print(f"Scanned {len(sources)} files")
for warning in sorted(set(warnings)):
    print("WARNING:", warning)
for error in errors:
    print("ERROR:", error)
if errors:
    sys.exit(1)
print("Security baseline PASSED (heuristic checks; not a full vulnerability assessment)")
