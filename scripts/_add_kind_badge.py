"""Add a 'Kind: Client work' or 'Kind: Own product' chip into each
case-study hero so buyers know at a glance whether this was built for
a client or for the engineer's own roadmap.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
WORK = ROOT / 'work'
data = json.loads((ROOT / 'projects.json').read_text(encoding='utf-8'))

# slug -> kind ('client' or 'product')
kind_by_slug = {p['slug']: p.get('kind') or ('client' if p.get('category') == 'client' else 'product') for p in data['projects']}

for f in sorted(WORK.glob('*.html')):
    if f.name in ('case-study.css', '_template.html'):
        continue
    slug = f.stem
    kind = kind_by_slug.get(slug)
    if not kind:
        print(f'  skip {f.name} (no kind in projects.json)')
        continue
    label = 'Client work' if kind == 'client' else 'Own product'
    chip_html = f'<span class="cs-kind cs-kind--{kind}" aria-label="Kind: {label}">{label}</span>'
    src = f.read_text(encoding='utf-8')
    if 'cs-kind' in src:
        # Already has it — replace
        src = re.sub(
            r'<span class="cs-kind cs-kind--\w+"[^>]*>[^<]+</span>',
            chip_html,
            src, count=1
        )
    else:
        # Insert just before the closing </p> of the .cs-tag line
        # Pattern: <p class="cs-tag">...stickers...</p>
        # Append chip_html inside the <p>
        m = re.search(r'(<p class="cs-tag">)([\s\S]*?)(</p>)', src)
        if not m:
            print(f'  skip {f.name} (no .cs-tag)')
            continue
        src = src[:m.start()] + m.group(1) + m.group(2) + ' ' + chip_html + m.group(3) + src[m.end():]
    f.write_text(src, encoding='utf-8')
    print(f'  patched {f.name} -> {label}')

print('done')
