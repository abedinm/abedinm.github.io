"""One-shot migration: replace placeholder identity with the real, verified
identity taken from the owner's GitHub profile README (github.com/abedinm).

  hello@abedin.dev              -> abedinminhazul12@gmail.com   (real, reachable)
  linkedin.com/in/abedinm       -> www.linkedin.com/in/minhazul-abedin-014031371
  https://abedin.dev            -> https://abedinm.github.io     (the live site)
  x.com/abedinm_ links          -> removed  (no real X account on the profile)

Run from repo root:  python scripts/_real_identity.py
Idempotent: re-running is safe (no-ops once clean).
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REAL_EMAIL = "abedinminhazul12@gmail.com"
REAL_LINKEDIN = "https://www.linkedin.com/in/minhazul-abedin-014031371"
SITE_URL = "https://abedinm.github.io"

# Files to sweep (text replacements). Excludes binary/asset dirs.
EXTS = {".html", ".js", ".json", ".xml", ".webmanifest", ".txt", ".md", ".py", ".yml", ".yaml", ""}
SKIP_DIRS = {".git", ".venv", "venv", "node_modules", "__pycache__", "assets"}
# Don't rewrite this migration script itself or the contributions data blob.
SKIP_FILES = {"_real_identity.py", "contributions.json"}

# Literal replacements applied to every swept file.
LITERAL = [
    ("hello@abedin.dev", REAL_EMAIL),
    ("https://www.linkedin.com/in/abedinm", REAL_LINKEDIN),
    ("https://linkedin.com/in/abedinm", REAL_LINKEDIN),
    ("www.linkedin.com/in/abedinm", REAL_LINKEDIN.replace("https://", "")),
    ("linkedin.com/in/abedinm", REAL_LINKEDIN.replace("https://", "")),
    ("https://abedin.dev", SITE_URL),
    # Backend example comment — keep it generic, not the live site.
    ("https://api.abedin.dev/api/contact", "https://api.your-domain.com/api/contact"),
    # Any remaining bare domain (canonical/OG/email-domain already handled above).
    ("abedin.dev", "abedinm.github.io"),
]

# X / Twitter removal (HTML).
X_HTML = [
    # JSON-LD sameAs array entry (drops the preceding comma too).
    (re.compile(r',\s*"https://x\.com/abedinm_"'), ""),
    # Inline " · <a ...>X</a>" (bullet before the anchor).
    (re.compile(r'\s*·\s*<a\b[^>]*x\.com/abedinm_[^>]*>[^<]*</a>'), ""),
    # "<a ...>X</a> · " (bullet after the anchor).
    (re.compile(r'<a\b[^>]*x\.com/abedinm_[^>]*>[^<]*</a>\s*·\s*'), ""),
    # Standalone anchor on its own line (footer link lists).
    (re.compile(r'\n[ \t]*<a\b[^>]*x\.com/abedinm_[^>]*>[^<]*</a>[ \t]*(?=\n)'), ""),
]

# X / Twitter removal (JS): terminal command + command-palette entry.
X_JS = [
    (re.compile(r"\n\s*x\(\)\s*\{[^\n]*x\.com/abedinm_[^\n]*\},"), ""),
    (re.compile(r"\n\s*\{ g: 'External', l: 'X · @abedinm_'[^\n]*\},"), ""),
]


def sweep() -> None:
    changed = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.name in SKIP_FILES:
            continue
        if path.suffix not in EXTS:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError):
            continue
        original = text
        for old, new in LITERAL:
            text = text.replace(old, new)
        if path.suffix in {".html"}:
            for rx, repl in X_HTML:
                text = rx.sub(repl, text)
        if path.suffix == ".js":
            for rx, repl in X_JS:
                text = rx.sub(repl, text)
            # Also strip a stray terminal "opening x.com" echo if its method
            # survived (defensive).
            text = re.sub(r"\n\s*//[^\n]*x\.com/abedinm_[^\n]*", "", text)
        if text != original:
            path.write_text(text, encoding="utf-8")
            changed.append(str(path.relative_to(ROOT)))
    print(f"Rewrote {len(changed)} files:")
    for c in sorted(changed):
        print("  -", c)


if __name__ == "__main__":
    sweep()
