# Portfolio — Abedin M.

Cream + green + orange. Bricolage Grotesque + Fraunces. Vanilla HTML/CSS/JS, no build framework, no npm. Inspired by [fromanother.love](https://www.fromanother.love).

## Files

```
F:/portfolio/
├── index.html                  # source HTML (JS-rendered)
├── index.prerendered.html      # baked HTML — deploy this
├── style.css                   # all main styles
├── script.js                   # cursor, blobs, marquees, FAQ, music, counters
├── projects.json               # single source of truth for content
├── manifest.webmanifest        # PWA manifest
├── robots.txt + sitemap.xml
├── work/
│   ├── enterprisecore.html     # case study
│   ├── linguabot.html          # case study
│   └── case-study.css          # case-study specific styles
├── assets/
│   ├── *.webp                  # project screenshots (optimized)
│   ├── favicon.svg + favicon-32.png + icon-{180,192,512}.png
│   └── og.png                  # 1200×630 share image
├── _prerender.py               # bakes projects.json → index.prerendered.html
├── _optimize_images.py         # PNG → WebP @ q82, max-w 1600
└── _gen_artifacts.py           # generates favicons + OG image
```

## Editing content

All copy / projects / testimonials / FAQ / "Now" items live in [projects.json](projects.json). After editing, re-bake:

```bash
python _prerender.py
```

## Local preview

```bash
python -m http.server 5181
# → http://localhost:5181/index.prerendered.html
```

Or use the launch.json entry already set up: `claude preview start portfolio`.

## Deploy

Drop the whole `F:/portfolio/` directory on any static host. **Use `index.prerendered.html` as the entry point** (or rename it to `index.html` and replace the source version). Cloudflare Pages / Netlify / Vercel / Render — pick one.

## Sections (in order)

01 Hello (hero) · 02 About · 03 Now · 04 Services · 05 Process · 06 Selected work · 07 Stack · 08 Where · 09 Said · 10 FAQ · 11 Contact · footer

## URL parameters

- `?static` — disables animations (cursor loop, scroll reveal, marquee). Used for screenshots and `prefers-reduced-motion` users.
- `?v=<anything>` — cache buster (ignored by the page).

## Interactive bits

- Custom cursor (label changes per hover target)
- Mouse-following ambient blobs in hero (green / orange / blue)
- 3px scroll progress bar (green → orange gradient)
- Music toggle (Web Audio API, ambient Cm9 pad with filter LFO — no audio files)
- Animated stat counters (count up on scroll-into-view)
- Banner + dual stack marquees (CSS animation)
- FAQ accordion (first item open by default)
- Project tiles link to case studies when `case_study` field is set, otherwise to live URL

## Image optimization

7 project screenshots WebP @ quality 82, max-width 1600px. Total 683KB (down from 3.8MB).

## Things still pending (need real content from you)

- Replace `hello@abedin.dev` with your real email (3 places in index.html + projects.json + work/*.html)
- Replace social handles `github.com/abedinm`, `x.com/abedinm_`, `linkedin.com/in/abedinm` (in projects.json — propagated everywhere via prerender)
- Testimonial quotes in `projects.json` are realistic placeholders — swap with real ones
- Write more case studies (copy `work/enterprisecore.html` and adapt — then set `case_study` field in projects.json for that project)
- Replace placeholder URLs `enterprisecore.app`, `linguabot.app`, `siteforge.studio` etc. if they're not live yet
