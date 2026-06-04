"""Inject Cloudflare Web Analytics beacon into every portfolio HTML page.

Cloudflare Web Analytics is cookieless, doesn't sample, and doesn't set
first-party storage — so it keeps the "no first-party cookies" stance.

Get a free token at: https://dash.cloudflare.com/?to=/:account/web-analytics
Paste it as CF_BEACON_TOKEN below and re-run this script.

Idempotent: re-running on a page that already has the marker just updates
the token in place.
"""
from pathlib import Path
import re

ROOT = Path(__file__).parent.parent

# Replace with your real Cloudflare Web Analytics token to enable the beacon.
# Until you do, the marker is injected but the script tag is commented out, so
# the site genuinely ships zero analytics until the token is set.
CF_BEACON_TOKEN = ""  # e.g. "a1b2c3d4e5f6..."

MARKER_START = "<!-- analytics:cloudflare:start -->"
MARKER_END   = "<!-- analytics:cloudflare:end -->"

def snippet():
    if CF_BEACON_TOKEN:
        body = (
            f'<script defer src="https://static.cloudflareinsights.com/beacon.min.js"'
            f' data-cf-beacon=\'{{"token": "{CF_BEACON_TOKEN}"}}\'></script>'
        )
    else:
        body = (
            '<!-- Cloudflare Web Analytics — set CF_BEACON_TOKEN in '
            'scripts/_inject_analytics.py and re-run to enable. -->'
        )
    return f"{MARKER_START}\n{body}\n{MARKER_END}"

block_re = re.compile(
    re.escape(MARKER_START) + r".*?" + re.escape(MARKER_END),
    re.DOTALL,
)

SKIP = {"index.prerendered.html"}
count_updated, count_skipped = 0, 0

for html in sorted(ROOT.glob("**/*.html")):
    if html.name in SKIP:
        continue
    # Avoid touching files outside the portfolio (case-study subfolders are fine)
    if not str(html).startswith(str(ROOT)):
        continue
    text = html.read_text(encoding="utf-8")
    if "</head>" not in text.lower():
        count_skipped += 1
        continue
    new_block = snippet()
    if MARKER_START in text:
        text = block_re.sub(new_block, text)
    else:
        # Insert right before </head>
        text = re.sub(r"(</head>)", new_block + r"\n\1", text, count=1, flags=re.IGNORECASE)
    html.write_text(text, encoding="utf-8")
    count_updated += 1

state = "ENABLED" if CF_BEACON_TOKEN else "PLACEHOLDER (no token set)"
print(f"Analytics snippet injected: {count_updated} files updated, {count_skipped} skipped — {state}")
