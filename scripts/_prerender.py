"""Prerender script — bake projects.json into index.html for fast first paint + headless screenshots.

Reads projects.json, generates work-grid + banner + marquee HTML + Now + Said + FAQ HTML,
writes index.prerendered.html.
"""
import json
import re
import html as htmllib
from pathlib import Path

ROOT = Path(__file__).parent.parent   # /scripts -> repo root
data = json.loads((ROOT / "projects.json").read_text(encoding="utf-8"))


def esc(s):
    return htmllib.escape(str(s or ""), quote=True)


cats = {c["id"]: c["label"] for c in data.get("categories", [])}


def visual(p, i):
    if p.get("image"):
        return f'<img class="project-visual project-visual--photo" src="{esc(p["image"])}" alt="{esc(p["name"])}" />'
    palette = {
        "desktop": ("#ff6b35", "#7a1f00"),
        "saas":    ("#4a7bff", "#0a2266"),
        "client":  ("#65d57a", "#1a4a26"),
        "tools":   ("#f3eed9", "#3a3528"),
    }
    c1, c2 = palette.get(p.get("category", ""), ("#666", "#222"))
    seed = sum(ord(ch) for ch in (p.get("slug") or p.get("name", "")))
    a, b, c = (seed * 17) % 360, (seed * 31) % 100, (seed * 47) % 100
    initial = (p.get("name") or "").strip()[:1].upper()
    return f'''<svg class="project-visual" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="g{i}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/>
    </linearGradient>
    <radialGradient id="r{i}" cx="{30 + b/3}%" cy="{30 + c/3}%" r="60%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="{c2}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="500" fill="url(#g{i})"/>
  <rect width="400" height="500" fill="url(#r{i})"/>
  <g opacity="0.22" stroke="#fff" stroke-width="1" fill="none">
    <circle cx="{200+b-50}" cy="{250+c-50}" r="{80+(b%80)}"/>
    <circle cx="{200+b-50}" cy="{250+c-50}" r="{130+(c%50)}"/>
    <circle cx="{200+b-50}" cy="{250+c-50}" r="{180+(b%30)}"/>
  </g>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
        font-family="'Bricolage Grotesque', sans-serif" font-size="240"
        fill="rgba(255,255,255,0.12)" font-weight="700">{esc(initial)}</text>
</svg>'''


# Projects: highlights first
projects = sorted(data["projects"], key=lambda p: (not p.get("highlight", False),))
work_html = []
for i, p in enumerate(projects):
    span = "span-3" if (p.get("highlight") and i < 2) else "span-2"
    href = p.get("case_study") or p.get("url") or p.get("repo") or "#"
    is_external = (href == p.get("url") or href == p.get("repo"))
    target = ' target="_blank" rel="noopener"' if is_external else ""
    cat = cats.get(p.get("category", ""), p.get("category", ""))
    stack_html = "".join(f'<span>{esc(s)}</span>' for s in (p.get("stack") or [])[:4])
    year_html = f'<span class="project-year">{esc(p["year"])}</span>' if p.get("year") else ""
    metric_html = f'<p class="project-metric">{esc(p["metric"])}</p>' if p.get("metric") else ""
    kind = p.get("kind") or ("client" if p.get("category") == "client" else "product")
    kind_label = "Client work" if kind == "client" else "Own product"
    work_html.append(f'''<a class="project {span} reveal" data-category="{esc(p.get("category",""))}" data-kind="{kind}" href="{esc(href)}"{target}>
  {visual(p, i)}
  <div class="project-overlay"></div>
  <span class="project-kind project-kind--{kind}" aria-label="{esc(kind_label)}">{esc(kind_label)}</span>
  <span class="project-link" aria-hidden="true">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M7 7h10v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </span>
  {year_html}
  <div class="project-body">
    <div class="project-meta">
      <span class="project-cat">{esc(cat)}</span>
      <span>{esc(p.get("status", ""))}</span>
    </div>
    <h3 class="project-name">{esc(p.get("name"))}</h3>
    <p class="project-tagline">{esc(p.get("tagline"))}</p>
    {metric_html}
    <div class="project-stack">{stack_html}</div>
  </div>
</a>''')


banner_phrases = [
    'Perfection over <em>shipping</em>?',
    'Ship, then perfect.',
    '<em>Solo</em> &amp; happy about it',
    'Own your tools.',
    'Build with love.',
    'Code that lands.',
    'Made in <em>Dhaka</em> × NL',
    'No agencies. No middlemen.'
]
banner_html = "".join(f'<span class="banner-tag">{p}</span>' for p in banner_phrases)
banner_html = banner_html + banner_html

stack_tags = ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'Python',
              'FastAPI', 'React', 'Electron', 'Node', 'PostgreSQL',
              'SQLite', 'Supabase', 'Cloudflare', 'Netlify', 'PWA',
              'C#', 'C++', 'Anthropic', 'Ollama', 'PyInstaller']
alt_tags = ['desktop apps', 'embeddable widgets', 'static sites',
            'AI assistants', 'CLIs', 'browser-only CMS',
            'offline-first', 'build pipelines', 'admin dashboards',
            'PWAs', 'design systems', 'data tooling']
stack_html_main = "".join(f'<span class="marquee-tag">{esc(t)}</span>' for t in stack_tags) * 2
stack_html_alt = "".join(f'<span class="marquee-tag">{esc(t)}</span>' for t in alt_tags) * 2

# Now items
now_items = (data.get("now") or {}).get("items", [])
now_html = "".join(f'<li>{esc(i)}</li>' for i in now_items)

_AVATAR_PALETTE = [
    ('#65d57a', '#1a4a26'),
    ('#ff6b35', '#7a1f00'),
    ('#4a7bff', '#0a2266'),
    ('#f3eed9', '#3a3528'),
    ('#a06cd5', '#3a1f5c'),
]
def avatar_svg(name, index=None):
    # Index-based color picking — zero collisions for ≤ palette-length items.
    if index is not None and index < len(_AVATAR_PALETTE):
        seed = index
        grad_id = f'av-i{index}'
    else:
        # djb2 fallback for overflow
        seed = 0
        for c in (name or ''):
            seed = ((seed << 5) - seed + ord(c)) & 0xFFFFFFFF
            if seed >= 0x80000000:
                seed -= 0x100000000
        seed = abs(seed)
        grad_id = f'av-{seed}'
    bg, fg = _AVATAR_PALETTE[seed % len(_AVATAR_PALETTE)]
    parts = (name or '?').split()
    initials = ''.join(p[0] for p in parts[:2]).upper()
    return (
        f'<svg class="said-avatar" viewBox="0 0 64 64" aria-hidden="true" focusable="false">'
        f'<defs><linearGradient id="{grad_id}" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="{bg}"/><stop offset="100%" stop-color="{fg}"/>'
        f'</linearGradient></defs>'
        f'<rect width="64" height="64" rx="32" fill="url(#{grad_id})"/>'
        f'<text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" '
        f'font-family="Bricolage Grotesque, Inter, sans-serif" font-size="26" '
        f'font-weight="600" fill="rgba(255,255,255,0.95)">{esc(initials)}</text></svg>'
    )

# Testimonials — with verify_url support
def render_verify(t):
    if t.get("verify_url"):
        return (
            f'<a class="said-verify" href="{esc(t["verify_url"])}" '
            f'target="_blank" rel="noopener noreferrer" '
            f'aria-label="Verify this client — visit {esc(t["role"])} (opens in new tab)">Verify ↗</a>'
        )
    return '<span class="said-verify said-verify--private" title="Reference available on request">Reference on request</span>'

testimonials = data.get("testimonials", [])
def _outcome(t):
    if t.get("outcome"):
        return f'<p class="said-outcome"><span class="said-outcome-l">Outcome</span> {esc(t["outcome"])}</p>'
    return ''
said_html = "".join(f'''<article class="said-card reveal">
  <span class="said-mark" aria-hidden="true">"</span>
  <p class="said-quote">{esc(t["quote"])}</p>
  {_outcome(t)}
  <div class="said-byline">
    {avatar_svg(t.get("author", ""), i)}
    <div class="said-byline-who">
      <span class="said-author">{esc(t["author"])}</span>
      <span class="said-role">{esc(t["role"])}</span>
    </div>
    {render_verify(t)}
  </div>
</article>''' for i, t in enumerate(testimonials))

# FAQ — proper ARIA buttons (a11y audit 2026-05-24)
faq_items = data.get("faq", [])
def _faq(i, f):
    open_cls = ' open' if i == 0 else ''
    expanded = 'true' if i == 0 else 'false'
    return (
        f'<div class="faq-item{open_cls}" data-faq>'
        f'<button class="faq-q" type="button" aria-expanded="{expanded}" aria-controls="faq-panel-{i}">'
        f'<span>{esc(f["q"])}</span>'
        f'<span class="faq-toggle" aria-hidden="true">+</span>'
        f'</button>'
        f'<div class="faq-a" id="faq-panel-{i}" role="region"><p>{esc(f["a"])}</p></div>'
        f'</div>'
    )
faq_html = "".join(_faq(i, f) for i, f in enumerate(faq_items))


# Read index.html and inject
index = (ROOT / "index.html").read_text(encoding="utf-8")
index = index.replace('<html lang="en">', '<html lang="en" class="static">')
index = re.sub(r'class="(project [^"]*?) reveal"', r'class="\1 reveal in"', index)

index = re.sub(
    r'<div class="work-grid" id="work-grid">[\s\S]*?</div>',
    f'<div class="work-grid" id="work-grid">{chr(10).join(work_html)}</div>',
    index, count=1
)
# Banner / marquee / now-list were removed in the 2026 redesign — these
# regexes are now no-ops if the elements don't exist in index.html.
if '<div class="banner-track"' in index:
    index = re.sub(
        r'<div class="banner-track" id="banner-track">[\s\S]*?</div>',
        f'<div class="banner-track" id="banner-track">{banner_html}</div>',
        index, count=1
    )
if 'id="marquee-track"' in index:
    index = re.sub(
        r'<div class="marquee-track" id="marquee-track"[^>]*></div>',
        f'<div class="marquee-track" id="marquee-track" aria-hidden="true">{stack_html_main}</div>',
        index, count=1
    )
    index = re.sub(
        r'<div class="marquee-track marquee-track--reverse" id="marquee-track-2"[^>]*></div>',
        f'<div class="marquee-track marquee-track--reverse" id="marquee-track-2" aria-hidden="true">{stack_html_alt}</div>',
        index, count=1
    )
if 'id="now-list"' in index:
    index = re.sub(
        r'<ul class="now-list" id="now-list"></ul>',
        f'<ul class="now-list" id="now-list">{now_html}</ul>',
        index, count=1
    )
index = re.sub(
    r'<div class="said-grid" id="said-grid"></div>',
    f'<div class="said-grid" id="said-grid">{said_html}</div>',
    index, count=1
)
index = re.sub(
    r'<div class="faq-list" id="faq-list"></div>',
    f'<div class="faq-list" id="faq-list">{faq_html}</div>',
    index, count=1
)

# Heatmap — deterministic 53x7
import random as _r
_r.seed(42)
heatmap_cells = []
for week in range(53):
    for day in range(7):
        weekend = 0.5 if day in (0, 6) else 1.0
        import math
        seasonal = math.sin((week / 53) * math.pi) * 0.6 + 0.4
        rv = _r.random() * seasonal * weekend
        if rv > 0.85: lvl = 4
        elif rv > 0.65: lvl = 3
        elif rv > 0.4: lvl = 2
        elif rv > 0.2: lvl = 1
        else: lvl = 0
        heatmap_cells.append(f'<span class="heatmap-cell{(" l" + str(lvl)) if lvl else ""}"></span>')
heatmap_html = "".join(heatmap_cells)
index = re.sub(
    r'<div class="heatmap" id="heatmap"[^>]*></div>',
    f'<div class="heatmap" id="heatmap" aria-hidden="true">{heatmap_html}</div>',
    index, count=1
)

out = ROOT / "index.prerendered.html"
out.write_text(index, encoding="utf-8")
print(f"Wrote {out} — {len(work_html)} projects, {len(now_items)} now items, {len(testimonials)} testimonials, {len(faq_items)} FAQs")
