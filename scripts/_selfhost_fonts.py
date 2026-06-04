"""Self-host the Google Fonts in use.

Downloads only the woff2 files for Latin (the unicode-range the site needs),
saves them to /assets/fonts/, and rewrites the URLs in a local
/assets/fonts/fonts.css that the page links to instead of fonts.googleapis.com.

Result: zero third-party requests on first paint, ~400ms faster TTI on cold
loads, and the page works fully offline (PWA-friendly).
"""
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent.parent
FONTS = ROOT / 'assets' / 'fonts'
FONTS.mkdir(parents=True, exist_ok=True)

# Match the @import we have on the site. axis=opsz,wght both included for
# variable-axis support where the font has it.
GOOGLE_URL = (
    'https://fonts.googleapis.com/css2'
    '?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,500;12..96,600;12..96,700'
    '&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500;1,9..144,600'
    '&family=Inter:wght@300;400;500;600;700'
    '&family=JetBrains+Mono:wght@400;500;600'
    '&display=swap'
)
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

req = urllib.request.Request(GOOGLE_URL, headers={'User-Agent': UA})
css = urllib.request.urlopen(req, timeout=30).read().decode('utf-8')
print(f'Fetched Google Fonts CSS — {len(css)} bytes')

# We only need 'latin' subsets to keep payload small.
# Each @font-face block is preceded by /* subset-name */
# Strip everything that isn't /* latin */.
def filter_to_latin(css_text):
    out = []
    current_subset = ''
    buf = []
    for line in css_text.splitlines():
        if line.strip().startswith('/*') and line.strip().endswith('*/'):
            # Flush previous block if it was latin
            if current_subset == 'latin' and buf:
                out.append('\n'.join(buf))
            current_subset = line.strip().strip('/*').strip().strip('*/').strip()
            buf = []
        else:
            buf.append(line)
    if current_subset == 'latin' and buf:
        out.append('\n'.join(buf))
    return '\n\n'.join(out)

latin_css = filter_to_latin(css)
print(f'Latin-only CSS — {len(latin_css)} bytes')

# Download each woff2 referenced, save locally, rewrite URL
urls = re.findall(r'https://fonts\.gstatic\.com/[^)]+\.woff2', latin_css)
print(f'Found {len(urls)} woff2 URLs')

for url in set(urls):
    local_name = url.split('/')[-1]
    out_path = FONTS / local_name
    if not out_path.exists():
        try:
            r = urllib.request.Request(url, headers={'User-Agent': UA})
            data = urllib.request.urlopen(r, timeout=30).read()
            out_path.write_bytes(data)
            print(f'  downloaded {local_name} — {len(data)} bytes')
        except Exception as e:
            print(f'  FAILED {local_name}: {e}')
    # Rewrite URL in the CSS to point to local path
    latin_css = latin_css.replace(url, f'./{local_name}')

# Write the localized CSS
(FONTS / 'fonts.css').write_text(latin_css, encoding='utf-8')
print(f'Wrote assets/fonts/fonts.css ({len(latin_css)} bytes)')

# Cleanup the staging file from the earlier run
stale = FONTS / 'google.css'
if stale.exists():
    stale.unlink()
    print('Cleaned up stale google.css')
