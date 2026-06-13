"""Apply the audit's case-study fixes across all /work/*.html in one pass:
- Insert a "Hire me" CTA block before the pager nav (was missing on all 10).
- Replace stale 'Beta' sticker labels with 'Live' in projects that are now live
  in projects.json.
- De-dupe the cover image in EnterpriseCore's gallery.
"""
import re
from pathlib import Path

WORK = Path(__file__).parent / 'work'
files = sorted(WORK.glob('*.html'))

# 1. Hire-me CTA — inserted right before <nav class="cs-pager">
CTA_BLOCK = '''  <section class="cs-cta">
    <h3>Like what you read? I can ship this for <em>you.</em></h3>
    <p class="cs-cta-sub">Send a one-line scope and I'll quote within 24h. Three engagement shapes — fixed-price MVP, embeddable widget, or maintenance retainer.</p>
    <div class="cs-cta-actions">
      <a href="../index.html#pricing" class="cs-cta-primary">See engagements &amp; pricing →</a>
      <a href="mailto:abedinminhazul12@gmail.com?subject=Inquiry%20%E2%80%94%20%5Byour%20project%5D&amp;body=Hi%20Abedin%2C%0A%0AScope%3A%20%0ABudget%3A%20%0ATimeline%3A%20%0A%0A" class="cs-cta-secondary">Or email me directly</a>
    </div>
  </section>

'''

# 2. Files that should flip Beta → Live (sync with projects.json)
LIVE_FILES = {'enterprisecore.html', 'knowledge-hub.html', 'linguabot.html'}

for f in files:
    src = f.read_text(encoding='utf-8')
    orig = src
    # Insert CTA before the pager
    if 'class="cs-cta"' not in src and '<nav class="cs-pager">' in src:
        src = src.replace(
            '<nav class="cs-pager">',
            CTA_BLOCK + '  <nav class="cs-pager">',
            1
        )
    # Flip Beta → Live for the right files (only the sticker label, not all "Beta" text)
    if f.name in LIVE_FILES:
        src = re.sub(
            r'(<span class="sticker sticker--ghost">)Beta(\s*·\s*\d{4}</span>)',
            r'\1Live\2',
            src
        )
    if src != orig:
        f.write_text(src, encoding='utf-8')
        print(f'  patched {f.name}')

# 3. EnterpriseCore: remove duplicate cover image inside the gallery
ec = WORK / 'enterprisecore.html'
if ec.exists():
    src = ec.read_text(encoding='utf-8')
    # Find <div class="cs-gallery"> and replace the duplicate cover image inside
    # with a different image or remove the duplicate.
    pattern = r'(<div class="cs-gallery">\s*)<img src="\.\./assets/enterprisecore\.webp"[^/]*/>\s*'
    new = re.sub(pattern, r'\1', src, count=1, flags=re.DOTALL)
    if new != src:
        ec.write_text(new, encoding='utf-8')
        print('  de-duplicated EnterpriseCore cover image in gallery')

print('done')
