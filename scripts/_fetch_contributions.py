"""Pull the real GitHub contribution calendar for abedinm and save it to
assets/contributions.json. The portfolio's script.js fetches that file on
load and renders the heatmap from real data.

Re-run whenever you want a fresh 12-month window. Requires `gh` CLI signed in.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
USERNAME = "abedinm"
OUT = ROOT / "assets" / "contributions.json"

QUERY = (
    "query { user(login: \"%s\") {"
    "  contributionsCollection {"
    "    contributionCalendar {"
    "      totalContributions"
    "      weeks { contributionDays { contributionCount date weekday } }"
    "    }"
    "  }"
    "} }"
) % USERNAME

if shutil.which("gh") is None:
    print("gh CLI not on PATH — install GitHub CLI and run `gh auth login`.", file=sys.stderr)
    sys.exit(1)

res = subprocess.run(
    ["gh", "api", "graphql", "-f", f"query={QUERY}"],
    check=True, capture_output=True, text=True,
)
data = json.loads(res.stdout)
total = data["data"]["user"]["contributionsCollection"]["contributionCalendar"]["totalContributions"]
weeks = data["data"]["user"]["contributionsCollection"]["contributionCalendar"]["weeks"]
OUT.write_text(json.dumps(data), encoding="utf-8")
print(f"Wrote {OUT} — {total} contributions across {len(weeks)} weeks for {USERNAME}.")
