(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // MIGRATION (2026-06-07): novelty themes (synthwave/forest/sunset) removed.
  // They tinted the whole site with a heavy color filter, persisted forever
  // via localStorage, and a "time-of-day tip" pushed users into them — several
  // visitors ended up stuck in Sunset without knowing why. Clear the stored
  // keys and strip the classes so everyone returns to clean cream/dark.
  try {
    localStorage.removeItem('abedin-theme-extra');
    localStorage.removeItem('abedin-secret-theme');
    const t = localStorage.getItem('abedin-theme');
    if (t && t !== 'light' && t !== 'dark') localStorage.setItem('abedin-theme', 'dark');
  } catch {}
  document.documentElement.classList.remove('theme-synthwave', 'theme-forest', 'theme-sunset');

  // Browser scroll-restoration was landing repeat visitors mid-page on first
  // paint (deep in the work section), because heavy JS init meant the page
  // grew taller AFTER the browser tried to restore the previous scroll. Pin
  // it to manual and force top — UNLESS there is a real hash anchor to honour.
  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch {}
  if (!location.hash) {
    window.scrollTo(0, 0);
    // Re-assert once layout settles, in case something late kicked scroll.
    requestAnimationFrame(() => { if (!location.hash && window.scrollY < 10) window.scrollTo(0, 0); });
  }

  // ==========================================================================
  // SITE CONFIG — endpoints the frontend talks to.
  // contactEndpoint: the FastAPI backend (server/). Same-origin by default;
  //   if it 404s (e.g. on GitHub Pages) the form falls back to mailto.
  // calComLink: change to your Cal.com handle; until then "Book intro"
  //   buttons keep their mailto fallback.
  // The Cloudflare beacon token lives in index.html <head>.
  // ==========================================================================
  const CONFIG = {
    // Contact endpoint served by the FastAPI backend (server/). Same-origin by
    // default, so it "just works" when the site is self-hosted via Docker.
    // On GitHub Pages (static-only) this 404s and the form falls back to a
    // pre-filled mailto, so the site degrades gracefully either way.
    // To point at a backend on a different host, set an absolute URL, e.g.
    //   contactEndpoint: 'https://api.your-domain.com/api/contact'
    contactEndpoint:   '/api/contact',
    // Replace with your real Cal.com username/event handle once configured.
    calComLink:        'https://cal.com/abedin/15min',
  };
  // Expose for bookButton helpers that live outside this closure (none today,
  // but keeps the door open for inline event handlers or other scripts).
  window.SITE_CONFIG = CONFIG;

  // Screen-reader announcer — call announce("...") to politely tell AT users
  // about state changes (theme flip, form submit, music on/off, etc.)
  function announce(msg) {
    const el = $('#sr-live');
    if (!el) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 80);
  }
  const STATIC = new URLSearchParams(location.search).has('static') || document.documentElement.classList.contains('static');
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function smoothNav(hash) {
    const id = hash.replace(/^#/, '');
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' });
    history.pushState(null, '', '#' + id);
  }
  const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  const CMD_KEY = IS_MAC ? '⌘K' : 'Ctrl+K';
  const CMD_KEY_DISPLAY = IS_MAC ? '⌘ K' : 'Ctrl K';
  if (!IS_MAC) {
    $$('kbd').forEach(kbd => {
      const t = kbd.textContent.trim();
      if (t === '⌘ K' || t === '⌘K') kbd.textContent = CMD_KEY_DISPLAY;
      else if (t === '⌘ U') kbd.textContent = 'Ctrl U';
    });
  }

  /* =================================================================
     LOADER
     ================================================================= */
  // Loader: faster (~600ms vs the previous ~1900ms). The boot animation was
  // delightful but it sat in front of paying customers' eyes too long.
  // Click anywhere on it to skip.
  const loader = $('#loader');
  if (loader && !STATIC) {
    const countEl = $('#loader-count');
    const boot = $('#loader-boot');
    let n = 0;
    const tick = setInterval(() => {
      n = Math.min(100, n + Math.floor(15 + Math.random() * 25));
      if (countEl) countEl.textContent = n.toString().padStart(3, '0');
      if (n >= 100) clearInterval(tick);
    }, 30);
    if (boot) {
      const lines = [
        ['<span class="ln-prompt">~ abedin@core $</span> <span class="ln-hl">boot</span>', 0],
        ['<span class="ln-ok">  ✓ 10 products live</span>', 180],
        ['<span class="ln-ok">  ✓ ready.</span>', 320],
      ];
      lines.forEach(([html, delay]) => {
        setTimeout(() => {
          const span = document.createElement('span');
          span.className = 'ln';
          span.innerHTML = html;
          boot.appendChild(span);
        }, delay);
      });
    }
    const dismiss = () => {
      loader.classList.add('gone');
      setTimeout(() => loader.remove(), 400);
    };
    setTimeout(dismiss, 600);   // was 1900ms — buyers reach content 3× faster
    loader.addEventListener('click', dismiss);   // click-to-skip
  }

  /* =================================================================
     THEME (light/dark) — persists in localStorage, respects OS
     ================================================================= */
  const themeBtn = $('#nav-theme');
  const STORE_KEY = 'abedin-theme';
  let stored;
  try { stored = localStorage.getItem(STORE_KEY); } catch {}
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = stored || (prefersDark ? 'dark' : 'light');
  document.documentElement.dataset.theme = initialTheme;
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.add('theme-switching');
      document.documentElement.dataset.theme = next;
      setTimeout(() => document.documentElement.classList.remove('theme-switching'), 400);
      try { localStorage.setItem(STORE_KEY, next); } catch {}
      // Theme switch — soft swoosh chord
      const ctx = ensureFx();
      if (ctx) {
        [220, 330, 440].forEach((f, i) => setTimeout(() => fxTick(f * (next === 'dark' ? 1 : 1.5), 0.18), i * 35));
      }
      announce(`Theme switched to ${next} mode`);
    });
  }

  /* =================================================================
     TIME-OF-DAY GREETING — disabled. Hero now leads with a value claim
     instead of "good morning". Kept the element so existing references
     don't break; we just don't overwrite its content.
     ================================================================= */

  /* =================================================================
     YEAR + LIVE WIDGETS (time, last commit, now playing)
     ================================================================= */
  const yearEl = $('#year'); if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Availability label — dynamic. Shows "From <month yr>" until the date
  // arrives, then flips to "Open now" / "Booked through <next free month>"
  // so the page never reads "Open from June 2026" *after* June 2026.
  // ALSO updates the nav-cta badge text so hero + nav stay in sync.
  const avail = $('#avail-cd');
  const navCta = document.querySelector('.nav-cta span');
  const target = new Date('2026-06-01T00:00:00Z');
  const now = new Date();
  const ms = target - now;
  const days = Math.ceil(ms / 86400000);
  let availLabel, navLabel;
  if (ms > 0) {
    availLabel = days <= 60 ? `From June 2026 · in ${days}d` : 'From June 2026';
    navLabel = days <= 60 ? `Open in ${days}d` : 'Available';
  } else {
    availLabel = 'Open now';
    navLabel = 'Open now';
  }
  if (avail) {
    if (ms <= 0) {
      avail.innerHTML = 'Open now <span style="color:var(--green-deep);">●</span>';
    } else {
      avail.textContent = availLabel;
    }
  }
  if (navCta) navCta.textContent = navLabel;

  // Hero activity badge removed 2026-06-05 — read as fake live signal.

  function updateTime() {
    const el = $('#live-time');
    if (!el) return;
    const d = new Date();
    const dhakaOffset = 6 * 60;
    const local = d.getTime() + d.getTimezoneOffset() * 60000;
    const dhaka = new Date(local + dhakaOffset * 60000);
    const hh = dhaka.getHours().toString().padStart(2, '0');
    const mm = dhaka.getMinutes().toString().padStart(2, '0');
    el.innerHTML = `<em>${hh}:${mm}</em> BST · GMT+6`;
  }
  updateTime();
  setInterval(updateTime, 30000);

  // Live commit feed — tries the real GitHub API first (so it shows actual
  // recent activity); falls back to illustrative commits if the request fails
  // (rate-limit, offline, no internet, etc.) so the widget never breaks.
  const commitEl = $('#live-commit');
  if (commitEl) {
    const fallback = [
      ['just now',    'enterprisecore', 'fix knowledge-hub citation jump'],
      ['1h ago',      'enterprisecore', 'v6: absorb codex-tools tracker'],
      ['3h ago',      'linguabot',      'BN/HI/UR auto-detect tuning'],
      ['yesterday',   'portfolio',      'add /working-together + /first-call'],
      ['2 days ago',  'siteforge',      'export pipeline: cleaner HTML'],
    ];
    // Mark the live commit feed aria-hidden — it auto-rotates every 5.5s
    // and would spam screen-reader users with rotating content. Decorative.
    commitEl.setAttribute('aria-hidden', 'true');
    function render(t, repo, msg) {
      commitEl.innerHTML = `<em>${t}</em> · <code class="live-commit-repo">${repo}</code> — <span class="live-commit-msg">${msg}</span>`;
    }
    function ago(date) {
      const d = (Date.now() - new Date(date).getTime()) / 1000;
      if (d < 60) return 'just now';
      if (d < 3600) return Math.round(d/60) + 'm ago';
      if (d < 86400) return Math.round(d/3600) + 'h ago';
      if (d < 172800) return 'yesterday';
      return Math.round(d/86400) + 'd ago';
    }
    let i = 0;
    function rotateFallback() {
      const [t, repo, msg] = fallback[i % fallback.length];
      render(t, repo, msg);
      i++;
    }
    // Try real GitHub events. Graceful fallback if anything errors.
    fetch('https://api.github.com/users/abedinm/events/public?per_page=15', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(events => {
        const pushes = (events || [])
          .filter(e => e.type === 'PushEvent' && e.payload?.commits?.length)
          .slice(0, 5);
        if (!pushes.length) throw new Error('no pushes');
        let j = 0;
        function rotateLive() {
          const ev = pushes[j % pushes.length];
          const commit = ev.payload.commits[0];
          render(ago(ev.created_at), ev.repo.name.split('/').pop(), commit.message.split('\n')[0].slice(0, 60));
          j++;
        }
        rotateLive();
        setInterval(rotateLive, 5500);
      })
      .catch(() => {
        // API failed (rate limit, no network, user doesn't exist yet) — use
        // illustrative commits so the widget never shows broken state.
        rotateFallback();
        setInterval(rotateFallback, 5500);
      });
  }

  /* =================================================================
     REAL GITHUB CONTRIBUTION HEATMAP — fetched from /assets/contributions.json
     (generated via scripts/_fetch_contributions.py using gh GraphQL).
     If the file is missing or malformed, the section silently hides
     rather than show fake data — the prior placeholder graph was
     called out as "fake-feeling" in the buyer audit.
     ================================================================= */
  const heatmap = $('#heatmap');
  const heatmapSection = heatmap?.closest('div')?.parentElement;
  if (heatmap) {
    function levelFor(count) {
      if (count === 0) return 0;
      if (count <= 2) return 1;
      if (count <= 5) return 2;
      if (count <= 10) return 3;
      return 4;
    }
    fetch('./assets/contributions.json')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const cal = data?.data?.user?.contributionsCollection?.contributionCalendar;
        if (!cal?.weeks?.length) throw new Error('no calendar');
        // Render the 7×N weekday grid (GitHub style — column = week, row = weekday)
        const cells = [];
        for (const w of cal.weeks) {
          for (const d of w.contributionDays) {
            const lvl = levelFor(d.contributionCount);
            cells.push(`<span class="heatmap-cell${lvl ? ' l' + lvl : ''}" title="${d.contributionCount} contributions · ${d.date}"></span>`);
          }
        }
        heatmap.innerHTML = cells.join('');
        // Update the header labels to reflect real data
        const labelL = heatmap.parentElement?.querySelector('span:nth-child(1)');
        const labelR = heatmap.parentElement?.querySelector('span:nth-child(2)');
        if (labelL && /Estimated/.test(labelL.textContent || '')) {
          labelL.innerHTML = `Public activity · last 12 months · <strong style="color:var(--on-dark)">${cal.totalContributions}</strong> contributions`;
        }
        if (labelR) {
          labelR.innerHTML = `Real data · <a href="https://github.com/abedinm" target="_blank" rel="noopener" style="color:var(--on-dark-dim);border-bottom:1px solid currentColor">github.com/abedinm ↗</a>`;
        }
      })
      .catch(() => {
        // Hide the whole heatmap section rather than show fake placeholder data
        const container = heatmap.closest('div')?.parentElement;
        if (container && container.style) container.style.display = 'none';
      });
  }

  /* =================================================================
     TEXT-SCRAMBLE HERO ENTRY — characters resolve from noise.

     Hard rules — the headline is the brand. Failure modes that have hit
     us before:
       - tab backgrounded mid-scramble → rAF stops, glyphs freeze
       - prefers-reduced-motion not respected → motion-sensitive users
         see scrambling text
       - any throw inside the step loop → glyphs stay forever

     Defences below: skip entirely if STATIC or REDUCED_MOTION; cache
     originals up front; hard watchdog timeout that restores text no
     matter what; visibility listener that settles on tab-hide; try/catch
     around the step loop that settles on any error. End state is ALWAYS
     the real text.
     ================================================================= */
  if (!STATIC && !REDUCED_MOTION) {
    const lines = $$('.hero-title .line');
    const SCRAMBLE_CHARS = '!<>-_\\/[]{}—=+*^?#________';
    const HARD_TIMEOUT_MS = 2500;   // settle by this time no matter what

    const scrambleLine = (line, delay) => {
      const targets = [];
      function walk(node) {
        node.childNodes.forEach(c => {
          if (c.nodeType === Node.TEXT_NODE && c.textContent.trim()) targets.push(c);
          else if (c.nodeType === Node.ELEMENT_NODE) walk(c);
        });
      }
      walk(line);
      if (!targets.length) return;
      const originals = targets.map(n => n.textContent);
      let settled = false;
      function settle() {
        if (settled) return;
        settled = true;
        targets.forEach((n, i) => { n.textContent = originals[i]; });
      }
      // Watchdog: no matter what happens to rAF, the headline reads correctly
      // within HARD_TIMEOUT_MS of starting.
      const watchdog = setTimeout(settle, delay + HARD_TIMEOUT_MS);
      // If the tab goes hidden, immediately settle rather than freeze on whatever
      // garbage was last drawn — the user will return to a readable headline.
      function onVisibility() { if (document.hidden) settle(); }
      document.addEventListener('visibilitychange', onVisibility, { once: true });

      let frame = 0;
      const duration = 35;
      const totalFrames = duration + originals.reduce((a, o) => a + o.length * 2, 0);
      function step() {
        if (settled) return;
        try {
          targets.forEach((node, i) => {
            const orig = originals[i];
            const progress = Math.max(0, Math.min(1, (frame - i * 2) / duration));
            let out = '';
            for (let j = 0; j < orig.length; j++) {
              if (j / orig.length < progress) out += orig[j];
              else if (orig[j] === ' ') out += ' ';
              else out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
            }
            node.textContent = out;
          });
          frame++;
          if (frame < totalFrames) {
            requestAnimationFrame(step);
          } else {
            clearTimeout(watchdog);
            settle();
          }
        } catch (err) {
          clearTimeout(watchdog);
          settle();
        }
      }
      setTimeout(() => requestAnimationFrame(step), delay);
    };
    lines.forEach((line, i) => {
      line.style.opacity = '1';
      line.style.transform = 'none';
      line.style.animation = 'none';
      scrambleLine(line, 150 + i * 120);
    });
  } else {
    // STATIC or REDUCED_MOTION: ensure the lines render their natural text
    // without any leftover CSS animation/opacity from the entry transition.
    $$('.hero-title .line').forEach(line => {
      line.style.opacity = '1';
      line.style.transform = 'none';
      line.style.animation = 'none';
    });
  }

  /* =================================================================
     SCROLL-DRIVEN HERO PARALLAX — disc scales & rotates
     ================================================================= */
  if (!STATIC) {
    const discEl = $('.hero-disc');
    if (discEl) {
      addEventListener('scroll', () => {
        const y = scrollY;
        const ny = Math.min(1, y / 800);
        discEl.style.setProperty('--sy', (y * -0.15).toFixed(1) + 'px');
        discEl.style.setProperty('--ss', (1 + ny * 0.5).toFixed(3));
        discEl.style.setProperty('--sr', (y * 0.04).toFixed(2) + 'deg');
      }, { passive: true });
    }
  }

  /* =================================================================
     CUSTOM CURSOR — with label + context morphing
     Falls back to the OS cursor if reduced-motion is set, on touch,
     if ?nocursor is in the URL, or if the user toggled it off via the
     colophon button (persisted in localStorage).
     ================================================================= */
  const cursor = $('#cursor');
  // Default-OFF (P2 review): risky for first-time desktop visitors evaluating
  // the site professionally. Users who want the custom cursor opt in via the
  // colophon toggle. Once opted-in, the preference persists.
  let cursorPrefOn = false;
  try { cursorPrefOn = localStorage.getItem('abedin-cursor-on') === '1'; } catch {}
  const cursorAllowed = !STATIC && !REDUCED_MOTION
    && window.matchMedia('(pointer: fine)').matches
    && !new URLSearchParams(location.search).has('nocursor')
    && cursorPrefOn;
  if (cursor && !cursorAllowed) {
    cursor.style.display = 'none';
    document.body.style.cursor = 'auto';
    document.documentElement.style.cursor = 'auto';
  }
  // Colophon toggle — default state is system cursor ON (i.e. custom OFF).
  // Click to flip on the custom cursor + persist; click again to flip off.
  const cursorToggle = $('#cursor-toggle');
  if (cursorToggle) {
    cursorToggle.setAttribute('aria-pressed', String(cursorPrefOn));
    cursorToggle.textContent = cursorPrefOn ? 'Custom cursor on' : 'Try the custom cursor';
    cursorToggle.addEventListener('click', () => {
      const next = !(localStorage.getItem('abedin-cursor-on') === '1');
      try { localStorage.setItem('abedin-cursor-on', next ? '1' : '0'); } catch {}
      location.reload();
    });
  }
  if (cursor && cursorAllowed) {
    let tx = 0, ty = 0, cx = 0, cy = 0;
    addEventListener('mousemove', e => { tx = e.clientX; ty = e.clientY; });
    (function loop() {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      requestAnimationFrame(loop);
    })();
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-cursor], a, button, .project, .service-card, .location, .contact-mail, .faq-item, .writing-item, [data-believe], [data-step], [data-stat]');
      if (!el) return;
      const label = el.dataset.cursor
        || (el.matches('.project') ? 'View'
        : el.matches('.contact-mail, .book-btn') ? 'Mail'
        : el.matches('.service-card') ? 'More'
        : el.matches('.writing-item') ? 'Read'
        : el.matches('.location') ? '·'
        : el.matches('[data-believe]') ? '→'
        : el.matches('[data-step]') ? 'Open'
        : el.matches('[data-stat]') ? 'Open'
        : el.matches('.faq-item') ? 'Open'
        : el.matches('.nav-cta') ? 'Hire'
        : el.matches('.cmdk-trigger') ? '⌘K'
        : 'Click');
      cursor.dataset.label = label;
      cursor.classList.add('hover');
      if (el.matches('.service-card:nth-child(1), .location--remote, .book-btn')) cursor.classList.add('hover-green');
      else cursor.classList.remove('hover-green');
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest('[data-cursor], a, button, .project, .service-card, .location, .contact-mail, .faq-item, .writing-item, [data-believe], [data-step], [data-stat]')) {
        cursor.classList.remove('hover', 'hover-green');
      }
    });
  }

  /* =================================================================
     MOBILE HAMBURGER NAV
     ================================================================= */
  const hamburger = $('#nav-hamburger');
  const mobileNav = $('#mobile-nav');
  if (hamburger && mobileNav) {
    hamburger.addEventListener('click', () => {
      const open = hamburger.getAttribute('aria-expanded') === 'true';
      hamburger.setAttribute('aria-expanded', String(!open));
      mobileNav.classList.toggle('open', !open);
      mobileNav.setAttribute('aria-hidden', String(open));
    });
    mobileNav.addEventListener('click', e => {
      if (e.target.tagName === 'A') {
        hamburger.setAttribute('aria-expanded', 'false');
        mobileNav.classList.remove('open');
        mobileNav.setAttribute('aria-hidden', 'true');
      }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && hamburger.getAttribute('aria-expanded') === 'true') {
        hamburger.setAttribute('aria-expanded', 'false');
        mobileNav.classList.remove('open');
        mobileNav.setAttribute('aria-hidden', 'true');
        hamburger.focus();
      }
    });
    document.addEventListener('click', e => {
      if (hamburger.getAttribute('aria-expanded') !== 'true') return;
      if (!mobileNav.contains(e.target) && !hamburger.contains(e.target)) {
        hamburger.setAttribute('aria-expanded', 'false');
        mobileNav.classList.remove('open');
        mobileNav.setAttribute('aria-hidden', 'true');
      }
    });
  }

  /* =================================================================
     NAV + SCROLL PROGRESS BAR
     ================================================================= */
  const nav = $('#nav');
  const progressBar = $('#scroll-progress');
  function onScroll() {
    nav.classList.toggle('scrolled', scrollY > 20);
    if (progressBar) {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      progressBar.style.width = `${(scrollY / max) * 100}%`;
    }
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- Nav scroll-spy ---- */
  if (!STATIC) {
    const spySections = $$('section[id]');
    const spyLinks = $$('.nav-links a, .mobile-nav a');
    const spyObs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        spyLinks.forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id);
        });
      });
    }, { rootMargin: '-15% 0px -60% 0px' });
    spySections.forEach(s => spyObs.observe(s));
  }

  /* =================================================================
     HERO AMBIENT BLOBS + DISC MOUSE-PARALLAX
     ================================================================= */
  if (!STATIC && !REDUCED_MOTION) {
    const blobs = [
      { el: $('#blob-1'), x: 0, y: 0, k: 0.04, factor: 1.0 },
      { el: $('#blob-2'), x: 0, y: 0, k: 0.03, factor: -0.6 },
      { el: $('#blob-3'), x: 0, y: 0, k: 0.05, factor: 0.4 },
    ].filter(b => b.el);
    const disc = $('.hero-disc');
    let mx = 0, my = 0;
    addEventListener('mousemove', e => {
      const hero = $('.hero');
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      mx = (e.clientX - rect.left - rect.width / 2);
      my = (e.clientY - rect.top - rect.height / 2);
    });
    let dx = 0, dy = 0;
    (function blobLoop() {
      blobs.forEach(b => {
        const tx = mx * b.factor * 0.15;
        const ty = my * b.factor * 0.15;
        b.x += (tx - b.x) * b.k;
        b.y += (ty - b.y) * b.k;
        b.el.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px)`;
      });
      if (disc) {
        dx += (mx * -0.06 - dx) * 0.04;
        dy += (my * -0.06 - dy) * 0.04;
        disc.style.setProperty('--mx', dx.toFixed(1) + 'px');
        disc.style.setProperty('--my', dy.toFixed(1) + 'px');
      }
      requestAnimationFrame(blobLoop);
    })();
  }

  /* =================================================================
     MAGNETIC CTA
     ================================================================= */
  if (!STATIC) {
    $$('.magnetic').forEach(el => {
      el.addEventListener('mousemove', e => {
        const rect = el.getBoundingClientRect();
        const dx = Math.max(-8, Math.min(8, (e.clientX - (rect.left + rect.width / 2)) * 0.2));
        const dy = Math.max(-8, Math.min(8, (e.clientY - (rect.top + rect.height / 2)) * 0.25));
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* =================================================================
     TILT-ON-HOVER for project tiles
     ================================================================= */
  function applyTilt() {
    // The rich 3D card tilt (depth + glare + shadow) lives in the delight
    // layer (section 15), the single source of truth. This just marks cards
    // so nothing double-binds.
    $$('.project').forEach(card => { card.dataset.tilted = '1'; });
  }

  /* =================================================================
     STICKY-SCROLL STORYTELLING: change the big number as user scrolls
     ================================================================= */
  if (!STATIC) {
    const stickyNum = $('#sticky-num');
    const blocks = $$('.sticky-block');
    if (stickyNum && blocks.length) {
      const formats = ['<em>0</em>1', '<em>0</em>2', '<em>0</em>3', '<em>0</em>4'];
      const so = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            const idx = parseInt(en.target.dataset.story, 10) - 1;
            if (formats[idx]) stickyNum.innerHTML = formats[idx];
          }
        });
      }, { rootMargin: '-50% 0px -50% 0px' });
      blocks.forEach(b => so.observe(b));
    }
  }

  /* =================================================================
     LOAD projects.json — bypass HTTP cache so content updates land fast
     ================================================================= */
  let data;
  try {
    data = await fetch('./projects.json', { cache: 'no-cache' }).then(r => r.json());
  } catch (err) { console.error('projects.json load failed', err); return; }

  const palette = {
    desktop: ['#ff6b35', '#7a1f00'], saas: ['#4a7bff', '#0a2266'],
    client: ['#65d57a', '#1a4a26'], tools: ['#f3eed9', '#3a3528'],
  };

  function visual(p, i) {
    // First 3 tiles are most-likely seen — eager-load + fetchpriority="high".
    // Rest stay lazy. width/height attrs (1.6:1 aspect) prevent layout shift.
    if (p.image) {
      const eager = i < 3;
      const loadAttr = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
      return `<img class="project-visual project-visual--photo" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.image_alt || p.name)}" width="800" height="500" ${loadAttr} decoding="async" />`;
    }
    const [c1, c2] = palette[p.category] || ['#666', '#222'];
    const seed = (p.slug || p.name).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const b = (seed * 31) % 100, c = (seed * 47) % 100;
    const initial = (p.name || '').charAt(0).toUpperCase();
    return `<svg class="project-visual" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${escapeHtml(p.name)}">
      <defs><linearGradient id="g${i}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
      <rect width="400" height="500" fill="url(#g${i})"/>
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="'Bricolage Grotesque', sans-serif" font-size="240" fill="rgba(255,255,255,0.12)" font-weight="700">${initial}</text>
    </svg>`;
  }

  const grid = $('#work-grid');
  const cats = Object.fromEntries((data.categories || []).map(c => [c.id, c.label]));
  const projects = [...(data.projects || [])].sort((a, b) => (a.highlight && !b.highlight) ? -1 : (!a.highlight && b.highlight) ? 1 : 0);

  if (grid && grid.children.length === 0) {
    projects.forEach((p, i) => {
      const span = p.highlight ? (i < 2 ? 'span-3' : 'span-2') : 'span-2';
      const card = document.createElement('a');
      card.className = `project ${span} reveal`;
      card.dataset.category = p.category || '';
      card.dataset.kind = p.kind || (p.category === 'client' ? 'client' : 'product');
      const href = p.case_study || p.url || p.repo || '#';
      const isExternal = (href === p.url || href === p.repo);
      card.href = href;
      if (isExternal) { card.target = '_blank'; card.rel = 'noopener'; }
      const kindLabel = card.dataset.kind === 'client' ? 'Client work' : 'Own product';
      card.innerHTML = `
        ${visual(p, i)}
        <div class="project-overlay"></div>
        <span class="project-kind project-kind--${card.dataset.kind}" aria-label="${escapeHtml(kindLabel)}">${escapeHtml(kindLabel)}</span>
        <span class="project-link" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M7 7h10v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        ${p.year ? `<span class="project-year">${escapeHtml(p.year)}</span>` : ''}
        <div class="project-body">
          <div class="project-meta">
            <span class="project-cat">${escapeHtml(cats[p.category] || p.category)}</span>
            <span>${escapeHtml(p.status || '')}</span>
          </div>
          <h3 class="project-name">${escapeHtml(p.name)}</h3>
          <p class="project-tagline">${escapeHtml(p.tagline)}</p>
          ${p.metric ? `<p class="project-metric">${escapeHtml(p.metric)}</p>` : ''}
          <div class="project-stack">${(p.stack || []).slice(0, 4).map(s => `<span>${escapeHtml(s)}</span>`).join('')}</div>
        </div>
      `;
      grid.appendChild(card);
    });
  }
  applyTilt();

  /* ---- Work category filter ---- */
  const filterBar = $('#work-filter');
  if (filterBar) {
    filterBar.querySelectorAll('.work-filter-btn').forEach(b => {
      b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false');
    });
    filterBar.addEventListener('click', e => {
      const btn = e.target.closest('[data-filter]'); if (!btn) return;
      filterBar.querySelectorAll('.work-filter-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      const cat = btn.dataset.filter;
      $$('.project').forEach(card => {
        const matches = cat === 'all' || card.dataset.category === cat;
        card.classList.toggle('hidden', !matches);
      });
    });
  }

  /* ---- Now / Said / FAQ — skip if prerendered ---- */
  const nowList = $('#now-list');
  if (nowList && nowList.children.length === 0 && data.now && data.now.items) {
    nowList.innerHTML = data.now.items.map(i => `<li>${escapeHtml(i)}</li>`).join('');
  }
  const nowSticker = $('#now-sticker');
  if (nowSticker && data.now && data.now.month) nowSticker.textContent = data.now.month;
  const saidGrid = $('#said-grid');
  // Geometric initial-based avatar: deterministic color from author name
  // so each testimonial keeps a stable identity without real photos.
  const avatarPalette = [
    ['#65d57a', '#1a4a26'], // green
    ['#ff6b35', '#7a1f00'], // orange
    ['#4a7bff', '#0a2266'], // blue
    ['#f3eed9', '#3a3528'], // cream
    ['#a06cd5', '#3a1f5c'], // purple
  ];
  function avatarSvg(name, index) {
    // Index-based color picking. With ≤ palette.length testimonials we get
    // zero collisions. Beyond that we fall back to djb2-hashed seed.
    const palLen = avatarPalette.length;
    const pickByIndex = typeof index === 'number' && index < palLen;
    const seed = pickByIndex ? index :
      Math.abs((name || '').split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0) | 0, 0));
    const [bg, fg] = avatarPalette[seed % palLen];
    const initials = (name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    const gradId = 'av-' + (typeof index === 'number' ? `i${index}` : seed);
    return `<svg class="said-avatar" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${fg}"/>
      </linearGradient></defs>
      <rect width="64" height="64" rx="32" fill="url(#${gradId})"/>
      <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle"
        font-family="Bricolage Grotesque, Inter, sans-serif" font-size="26"
        font-weight="600" fill="rgba(255,255,255,0.95)">${escapeHtml(initials)}</text>
    </svg>`;
  }
  if (saidGrid && saidGrid.children.length === 0 && data.testimonials) {
    saidGrid.innerHTML = data.testimonials.map((t, idx) => {
      const verify = t.verify_url
        ? `<a class="said-verify" href="${escapeHtml(t.verify_url)}" target="_blank" rel="noopener noreferrer" aria-label="Verify this client — visit ${escapeHtml(t.role)} (opens in new tab)">Verify ↗</a>`
        : `<span class="said-verify said-verify--private" title="Reference available on request">Reference on request</span>`;
      const outcome = t.outcome
        ? `<p class="said-outcome"><span class="said-outcome-l">Outcome</span> ${escapeHtml(t.outcome)}</p>`
        : '';
      return `
        <article class="said-card reveal">
          <span class="said-mark" aria-hidden="true">"</span>
          <p class="said-quote">${escapeHtml(t.quote)}</p>
          ${outcome}
          <div class="said-byline">
            ${avatarSvg(t.author, idx)}
            <div class="said-byline-who">
              <span class="said-author">${escapeHtml(t.author)}</span>
              <span class="said-role">${escapeHtml(t.role)}</span>
            </div>
            ${verify}
          </div>
        </article>`;
    }).join('');
  }
  const faqList = $('#faq-list');
  if (faqList) {
    // FAQ — accessibility refactor (a11y audit 2026-05-24):
    // The question is now a real <button> with aria-expanded + aria-controls,
    // and the answer panel has a matching id + role="region". Clicks/keys are
    // handled natively (Enter / Space) on the button. Outer wrapper still
    // has .faq-item .open class for CSS targeting.
    if (faqList.children.length === 0 && data.faq) {
      faqList.innerHTML = data.faq.map((f, i) => {
        const open = i === 0;
        const panelId = `faq-panel-${i}`;
        return `
        <div class="faq-item${open ? ' open' : ''}" data-faq>
          <button class="faq-q" type="button" aria-expanded="${open}" aria-controls="${panelId}">
            <span>${escapeHtml(f.q)}</span><span class="faq-toggle" aria-hidden="true">+</span>
          </button>
          <div class="faq-a" id="${panelId}" role="region"><p>${escapeHtml(f.a)}</p></div>
        </div>`;
      }).join('');
    }
    faqList.addEventListener('click', e => {
      const btn = e.target.closest('.faq-q'); if (!btn) return;
      const item = btn.closest('.faq-item');
      const nowOpen = !item.classList.contains('open');
      item.classList.toggle('open', nowOpen);
      btn.setAttribute('aria-expanded', String(nowOpen));
    });
  }

  /* ---- Banner + marquees — guarded population for the prerendered HTML.
     The visible homepage no longer renders these tracks, but the prerender
     output and any older case-study fragments may still include them.
     Guards (`if (el && el.children.length === 0)`) keep this safe either way. */
  const bannerTrack = $('#banner-track');
  if (bannerTrack && bannerTrack.children.length === 0) {
    const bannerPhrases = ['Perfection over <em>shipping</em>?', 'Ship, then perfect.', '<em>Solo</em> &amp; happy about it', 'Own your tools.', 'Build with love.', 'Code that lands.', 'Made in <em>Dhaka</em> × NL', 'No agencies. No middlemen.'];
    const inner = bannerPhrases.map(p => `<span class="banner-tag">${p}</span>`).join('');
    bannerTrack.innerHTML = inner + inner;
  }
  function fillTrack(el, items) {
    if (!el || el.children.length > 0) return;
    const inner = items.map(t => `<span class="marquee-tag">${t}</span>`).join('');
    el.innerHTML = inner + inner;
  }
  const marqueeTrack = $('#marquee-track');
  const marqueeTrack2 = $('#marquee-track-2');
  if (marqueeTrack) {
    fillTrack(marqueeTrack, ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'Python', 'FastAPI', 'React', 'Electron', 'Node', 'PostgreSQL', 'SQLite', 'Supabase', 'Cloudflare', 'Netlify', 'PWA', 'C#', 'C++', 'Anthropic', 'Ollama', 'PyInstaller']);
  }
  if (marqueeTrack2) {
    fillTrack(marqueeTrack2, ['desktop apps', 'embeddable widgets', 'static sites', 'AI assistants', 'CLIs', 'browser-only CMS', 'offline-first', 'build pipelines', 'admin dashboards', 'PWAs', 'design systems', 'data tooling']);
  }

  /* ---- Reveal animation ----
     IntersectionObserver-driven fade-in. Guardrails added so content is never
     permanently invisible:
       1. STATIC: prerendered / crawler render — show everything immediately.
       2. Tab hidden at load (background open, restored tab): IO doesn't fire.
          A visibilitychange listener flushes all reveals on first focus.
       3. Safety timeout: if the IO hasn't unhidden a tile after ~2.5s, force it.
       4. IO fallback for browsers that don't support it. */
  if (STATIC || !('IntersectionObserver' in window)) {
    $$('.reveal').forEach(el => el.classList.add('in'));
    document.documentElement.classList.add('static');
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '-10% 0px' });
    $$('.reveal').forEach(el => io.observe(el));
    // Guardrail 1: if the tab was hidden at IO setup, flush on next visibility.
    const flushAll = () => $$('.reveal:not(.in)').forEach(el => el.classList.add('in'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Give IO a beat to fire naturally first; then force any stragglers.
        setTimeout(flushAll, 400);
      }
    });
    // Guardrail 2: page-load safety net. After 2.5s, force-reveal anything left.
    setTimeout(flushAll, 2500);
  }

  /* =================================================================
     CAL.COM LINK REWRITER — any <a data-cal-link> on the page gets its
     href set from CONFIG.calComLink so the user only configures it once.
     If unconfigured, the hard-coded fallback href stays in place.
     ================================================================= */
  if (CONFIG.calComLink && CONFIG.calComLink.startsWith('http')) {
    $$('a[data-cal-link]').forEach(a => { a.href = CONFIG.calComLink; });
  }

  /* =================================================================
     MUSIC TOGGLE — Web Audio ambient pad + sync to live widget
     ================================================================= */
  const musicBtn = $('#nav-music');
  const liveMusic = $('#live-music');
  if (musicBtn) {
    let ac = null, gain = null, oscs = [];
    function startMusic() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      ac = new Ctx();
      gain = ac.createGain(); gain.gain.value = 0;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 0.5;
      const fg = ac.createGain(); fg.gain.value = 0.5;
      gain.connect(filter); filter.connect(fg); fg.connect(ac.destination);
      const freqs = [130.81, 196.00, 233.08, 261.63, 349.23, 392.00];
      const types = ['sine', 'triangle', 'sine', 'sine', 'triangle', 'sine'];
      freqs.forEach((f, i) => {
        const osc = ac.createOscillator(); osc.type = types[i]; osc.frequency.value = f;
        const detune = ac.createOscillator(); detune.type = 'sine'; detune.frequency.value = 0.08 + i * 0.03;
        const dg = ac.createGain(); dg.gain.value = 6;
        detune.connect(dg).connect(osc.detune);
        const og = ac.createGain(); og.gain.value = 0.06 + (i === 0 ? 0.04 : 0);
        osc.connect(og).connect(gain);
        osc.start(); detune.start();
        oscs.push(osc, detune);
      });
      const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.1;
      const lg = ac.createGain(); lg.gain.value = 200;
      lfo.connect(lg).connect(filter.frequency);
      lfo.start(); oscs.push(lfo);
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0.55, ac.currentTime + 2);
      if (liveMusic) liveMusic.innerHTML = '<em>Cm9</em> · ambient pad · playing';
    }
    function stopMusic() {
      if (!ac) return;
      const t = ac.currentTime;
      gain.gain.linearRampToValueAtTime(0, t + 1.2);
      setTimeout(() => { oscs.forEach(o => { try { o.stop(); } catch (e) {} }); ac.close(); ac = null; oscs = []; }, 1400);
      if (liveMusic) liveMusic.innerHTML = '<em>Lo-fi</em> · ambient pad';
    }
    musicBtn.addEventListener('click', () => {
      if (musicBtn.classList.toggle('playing')) { musicBtn.title = 'Mute'; startMusic(); }
      else { musicBtn.title = 'Turn on the music'; stopMusic(); }
    });
  }

  /* =================================================================
     SOUND EFFECTS — short ticks/pops on key UI interactions
     ================================================================= */
  let fxCtx = null;
  function ensureFx() {
    if (fxCtx || STATIC) return fxCtx;
    try { fxCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    return fxCtx;
  }
  function fxTick(freq = 600, dur = 0.04) {
    const ctx = ensureFx(); if (!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = freq; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  }
  document.addEventListener('click', e => {
    const item = e.target.closest('.faq-item');
    if (item) fxTick(item.classList.contains('open') ? 540 : 720, 0.06);
  });
  // Subtle nav-link hover tick
  if (!STATIC) {
    document.querySelectorAll('.nav-links a').forEach(a => {
      let last = 0;
      a.addEventListener('mouseenter', () => {
        const now = performance.now();
        if (now - last < 100) return;
        last = now;
        fxTick(900 + Math.random() * 400, 0.018);
      });
    });
  }

  /* =================================================================
     ANIMATED STAT COUNTERS
     ================================================================= */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count); if (isNaN(target)) return;
    const dur = 1400, start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (target >= 10 ? Math.round(target * eased) : (target * eased).toFixed(0));
      if (t < 1) requestAnimationFrame(tick); else el.textContent = target;
    }
    requestAnimationFrame(tick);
  }
  if (!STATIC) {
    const co = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { animateCount(e.target); co.unobserve(e.target); } });
    }, { rootMargin: '-10% 0px' });
    $$('[data-count]').forEach(el => co.observe(el));
  } else {
    $$('[data-count]').forEach(el => { el.textContent = el.dataset.count; });
  }

  /* =================================================================
     CLICK-TO-EXPAND — service cards, process steps, believe, locations, stats
     ================================================================= */
  function expandToggle(selector, accordion = false) {
    $$(selector).forEach(el => {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('aria-expanded')) el.setAttribute('aria-expanded', String(el.classList.contains('open')));
      const toggle = () => {
        const wasOpen = el.classList.contains('open');
        if (accordion) $$(selector).forEach(o => o.classList.remove('open'));
        el.classList.toggle('open', !wasOpen);
        el.setAttribute('aria-expanded', String(!wasOpen));
        fxTick(wasOpen ? 480 : 720, 0.04);
      };
      el.addEventListener('click', e => {
        if (e.target.closest('a')) return;
        toggle();
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }
  expandToggle('.service-card', true);      // one open at a time
  expandToggle('[data-step]', false);
  expandToggle('[data-believe]', false);
  expandToggle('[data-location]', false);
  expandToggle('[data-stat]', false);

  /* =================================================================
     LOCATION CLOCKS — live time per timezone
     ================================================================= */
  function updateClocks() {
    $$('[data-clock]').forEach(el => {
      const offsetHours = parseFloat(el.dataset.clock);
      const d = new Date();
      const utc = d.getTime() + d.getTimezoneOffset() * 60000;
      const local = new Date(utc + offsetHours * 3600000);
      const hh = local.getHours().toString().padStart(2, '0');
      const mm = local.getMinutes().toString().padStart(2, '0');
      el.textContent = `${hh}:${mm}`;
    });
  }
  updateClocks();
  setInterval(updateClocks, 30000);

  /* =================================================================
     LAB DEMOS — LinguaBot · SiteForge · Knowledge Hub
     ================================================================= */
  // --- LinguaBot intent demo (English-only) ---
  const lbReply = $('#lab-lb-reply'), lbDetect = $('#lab-lb-detect'), lbLangs = $('#lab-lb-langs');
  const lbUser = $('#lab-lb-user');
  if (lbReply && lbLangs) {
    const intents = {
      shipping: {
        label: 'Intent · Shipping',
        q: 'Do you ship to Dhaka?',
        r: '<strong>Yes — </strong>we ship across Bangladesh. Standard delivery is 2-3 days in Dhaka, 4-6 days outside the metro.',
      },
      returns: {
        label: 'Intent · Returns',
        q: 'Can I return this?',
        r: '<strong>30-day returns. </strong>Send it back in any reasonable condition. Refund processed within 5 working days.',
      },
      pricing: {
        label: 'Intent · Pricing',
        q: 'How much is the basic plan?',
        r: '<strong>$0 / forever </strong>for the free tier — up to 100 conversations a month. Paid plans start at $9.',
      },
      human: {
        label: 'Intent · Handoff',
        q: 'I want to talk to a real person.',
        r: '<strong>Sure — </strong>handing you off. A teammate is online and will pick up in under 2 minutes.',
      },
    };

    function show(intent) {
      const it = intents[intent]; if (!it) return;
      lbLangs.querySelectorAll('.lab-lang-btn').forEach(b => b.classList.toggle('active', b.dataset.intent === intent));
      lbDetect.textContent = it.label;
      if (lbUser) lbUser.textContent = it.q;
      lbReply.classList.add('typing');
      lbReply.innerHTML = '';
      setTimeout(() => {
        lbReply.classList.remove('typing');
        lbReply.innerHTML = it.r;
      }, 600);
      fxTick(660, 0.03);
    }

    lbLangs.addEventListener('click', e => {
      const b = e.target.closest('[data-intent]'); if (b) show(b.dataset.intent);
    });
  }

  // --- SiteForge color/tab demo ---
  const sfPreview = $('#lab-sf-preview'), sfH4 = $('#lab-sf-h4'), sfP = $('#lab-sf-p'), sfBtn = $('#lab-sf-btn');
  const sfTabs = $('#lab-sf-tabs'), sfSwatches = $('#lab-sf-swatches');
  if (sfPreview && sfTabs && sfSwatches) {
    const panes = {
      hero: { h: 'Field & Garden Co.', p: 'Slow-grown produce, delivered weekly to your door.', cta: 'Order now' },
      about:{ h: 'Two friends. One greenhouse.', p: 'We started in 2022. Three farms now, still no middlemen.', cta: 'Our story' },
      cta:  { h: 'Try a box. No commitment.', p: 'First delivery free. Cancel anytime. Recipes included.', cta: 'Get started — free' },
    };
    let pane = 'hero';
    function paint() {
      const data = panes[pane];
      sfH4.textContent = data.h;
      sfP.textContent = data.p;
      sfBtn.textContent = data.cta;
    }
    sfTabs.addEventListener('click', e => {
      const t = e.target.closest('[data-pane]'); if (!t) return;
      pane = t.dataset.pane;
      sfTabs.querySelectorAll('.lab-sf-tab').forEach(x => x.classList.toggle('active', x === t));
      paint(); fxTick(720, 0.03);
    });
    sfSwatches.addEventListener('click', e => {
      const s = e.target.closest('[data-c]'); if (!s) return;
      sfSwatches.querySelectorAll('.lab-sf-swatch').forEach(x => x.classList.toggle('active', x === s));
      const [bg, fg] = s.dataset.c.split(',');
      sfPreview.style.background = bg; sfPreview.style.color = fg;
      sfBtn.style.background = fg; sfBtn.style.color = bg;
      fxTick(820, 0.03);
    });
  }

  // --- Knowledge Hub streaming demo ---
  const khQs = $('#lab-kh-qs'), khResp = $('#lab-kh-response'), khStream = $('#lab-kh-stream'), khCites = $('#lab-kh-cites');
  if (khQs && khResp) {
    const answers = [
      {
        text: 'Two priorities from the 2024 launch retro: mobile-first menu edits (60% of staff actions happen on phone)CITE1, and uptime during dinner-rush (Netlify CDN held, zero incidents)CITE2. Lighthouse 100/100/100/100 was the hard requirementCITE3.',
        cites: ['cornertable-retro-2024.md · p.3', 'netlify-uptime.csv · row 14', 'cornertable-spec-v1.pdf · p.7']
      },
      {
        text: 'v6 absorbed five older standalone productsCITE1 — LinguaBot, SiteForge, CornerTable, Deltadesh, Deltadutch — plus 11 student appsCITE2 as first-class modules. Test count rose from 289 to 455.',
        cites: ['enterprisecore-v6-notes.md', 'consolidation-plan.md · §2']
      },
      {
        text: 'Two sites currently run on Cloudflare PagesCITE1: SiteForge Studio and Codex Tools. Deltadesh and Deltadutch both sit on RenderCITE2.',
        cites: ['hosting-matrix.csv', 'deltadesh-deploy.md · final']
      }
    ];
    function showAnswer(i) {
      const a = answers[i]; if (!a) return;
      khQs.querySelectorAll('.lab-kh-chip').forEach(c => c.classList.toggle('active', parseInt(c.dataset.q, 10) === i));
      khResp.innerHTML = '';
      khCites.innerHTML = '';
      khStream.hidden = false;
      // Stream-render the answer char by char
      let raw = a.text;
      // Convert CITEx markers to inline <span class="cite">[x]</span>
      let displayParts = [];
      let m;
      while ((m = /CITE(\d)/.exec(raw)) !== null) {
        displayParts.push({ type: 'txt', v: raw.slice(0, m.index) });
        displayParts.push({ type: 'cite', v: '[' + m[1] + ']' });
        raw = raw.slice(m.index + m[0].length);
      }
      if (raw) displayParts.push({ type: 'txt', v: raw });

      let pi = 0, ci = 0;
      function step() {
        if (pi >= displayParts.length) {
          khStream.hidden = true;
          // Render cite pills
          khCites.innerHTML = a.cites.map((c, idx) => `<span class="lab-kh-cite-pill">[${idx + 1}] ${escapeHtml(c)}</span>`).join('');
          return;
        }
        const p = displayParts[pi];
        if (p.type === 'cite') {
          khResp.insertAdjacentHTML('beforeend', `<span class="cite">${p.v}</span>`);
          pi++; ci = 0;
          setTimeout(step, 80);
        } else {
          const chunk = p.v.slice(ci, ci + 3);
          khResp.insertAdjacentText('beforeend', chunk);
          ci += 3;
          if (ci >= p.v.length) { pi++; ci = 0; }
          setTimeout(step, 18);
        }
      }
      step();
      fxTick(800, 0.04);
    }
    khQs.addEventListener('click', e => {
      const c = e.target.closest('[data-q]'); if (c) showAnswer(parseInt(c.dataset.q, 10));
    });
    // Auto-play first answer on first scroll-into-view
    if (!STATIC) {
      const ko = new IntersectionObserver((es, obs) => {
        es.forEach(en => { if (en.isIntersecting) { showAnswer(0); obs.disconnect(); } });
      }, { rootMargin: '0px' });
      ko.observe($('.lab-kh-q-row'));
    } else {
      // Static fallback — show first answer fully
      khResp.innerHTML = answers[0].text.replace(/CITE(\d)/g, '<span class="cite">[$1]</span>');
      khCites.innerHTML = answers[0].cites.map((c, idx) => `<span class="lab-kh-cite-pill">[${idx + 1}] ${escapeHtml(c)}</span>`).join('');
    }
  }

  /* =================================================================
     HERO TERMINAL — typable, real commands
     ================================================================= */
  const term = $('#term');
  const termBody = $('#term-body');
  const termInput = $('#term-input');
  if (term && termBody && termInput) {
    const history = []; let histIdx = -1;
    const print = (html, cls = '') => {
      const span = document.createElement('span');
      span.className = 'ln' + (cls ? ' ' + cls : '');
      span.innerHTML = html;
      termBody.appendChild(span);
      termBody.scrollTop = termBody.scrollHeight;
    };
    const printPrompt = (cmd) => {
      print(`<span class="ln-prompt">~ </span><span class="ln-prompt-path">abedin@core</span><span class="ln-prompt"> $</span> <span class="ln-cmd">${escapeHtml(cmd)}</span>`);
    };
    const printBlock = (lines, cls = 'ln-out') => {
      lines.forEach(l => print(l, cls));
    };
    const printSpacer = () => print('&nbsp;');

    const commands = {
      help() {
        printBlock([
          '<span class="ln-h2">Commands:</span>',
          '  <span class="ln-hl">whoami</span>    — who is this',
          '  <span class="ln-hl">work</span>      — jump to selected work',
          '  <span class="ln-hl">about</span>     — jump to about',
          '  <span class="ln-hl">now</span>       — what I\'m shipping right now',
          '  <span class="ln-hl">writing</span>   — read my essays',
          '  <span class="ln-hl">contact</span>   — get in touch',
          '  <span class="ln-hl">book</span>      — book a 15-min intro',
          '  <span class="ln-hl">ls</span>        — list projects',
          '  <span class="ln-hl">cat &lt;slug&gt;</span> — view a project (e.g. cat linguabot)',
          '  <span class="ln-hl">stack</span>     — my tech stack',
          '  <span class="ln-hl">cv</span>        — CV on request',
          '  <span class="ln-hl">github</span>    — open GitHub',
          '  <span class="ln-hl">theme</span>     — toggle light / dark',
          '  <span class="ln-hl">music</span>     — toggle ambient music',
          '  <span class="ln-hl">date</span>      — local time in Dhaka',
          '  <span class="ln-hl">sudo hire</span> — start a conversation',
          '  <span class="ln-hl">snake</span>     — &lt;hidden&gt; play snake right here',
          '  <span class="ln-hl">pong</span>      — &lt;hidden&gt; play pong (w/s = up/down)',
          '  <span class="ln-hl">flap</span>      — &lt;hidden&gt; flappy bird (space)',
          '  <span class="ln-hl">life</span>      — &lt;hidden&gt; conway\'s game of life',
          '  <span class="ln-hl">whack</span>     — &lt;hidden&gt; whack-a-mole, 30 seconds',
          '  <span class="ln-hl">arcade</span>    — open the full arcade (6 games)',
          '  <span class="ln-hl">clear</span>     — clear the screen',
          '',
          '<span class="ln-h2">Keyboard shortcuts:</span>',
          `  <span class="ln-hl">${CMD_KEY}</span>        — command palette`,
          '  <span class="ln-hl">g w</span>       — go to work',
          '  <span class="ln-hl">g a</span>       — go to about',
          '  <span class="ln-hl">g n</span>       — go to now',
          '  <span class="ln-hl">g f</span>       — go to FAQ',
          '  <span class="ln-hl">g c</span>       — go to contact',
          '  <span class="ln-hl">t</span>         — scroll to top',
          '  <span class="ln-hl">m</span>         — toggle music',
          '  <span class="ln-hl">/</span>         — focus this terminal',
        ]);
      },
      explore() {
        printBlock([
          '<span class="ln-h2">Things worth exploring:</span>',
          '  <span class="ln-hl">ls</span>               — list all 10 projects',
          '  <span class="ln-hl">cat enterprisecore</span> — inspect the flagship',
          '  <span class="ln-hl">whoami</span>           — who is this',
          '  <span class="ln-hl">stack</span>            — see the tech stack',
          '  <span class="ln-hl">work</span>             — jump to the full grid',
        ]);
      },
      whoami() {
        printBlock([
          '<span class="ln-h2">Abedin M.</span>',
          'Solo builder · Dhaka × Netherlands · est. 2020',
          'I ship offline-first software, embeddable tools,',
          'and the client sites underneath them.',
          '',
          'Currently: <span class="ln-hl">v6 of EnterpriseCore.</span>',
          'Open for select consulting from June 2026.',
        ]);
      },
      work()    { smoothNav('#work');    print('→ jumping to /work', 'ln-ok'); },
      projects(){ return commands.work(); },
      about()   { smoothNav('#about');   print('→ jumping to /about', 'ln-ok'); },
      now()     { smoothNav('#now');     print('→ jumping to /now', 'ln-ok'); },
      writing() { smoothNav('#writing'); print('→ jumping to /writing', 'ln-ok'); },
      contact() { smoothNav('#contact'); print('→ jumping to /contact', 'ln-ok'); },
      book()    { smoothNav('#book');    print('→ opening calendar', 'ln-ok'); },
      faq()     { smoothNav('#faq');     print('→ jumping to /faq', 'ln-ok'); },
      stack() {
        printBlock([
          '<span class="ln-h2">Stack — what I build with:</span>',
          '  Languages   <span class="ln-hl">HTML</span> · <span class="ln-hl">CSS</span> · <span class="ln-hl">JavaScript</span> · <span class="ln-hl">TypeScript</span> · <span class="ln-hl">Python</span>',
          '  Frameworks  <span class="ln-hl">FastAPI</span> · <span class="ln-hl">React</span> · <span class="ln-hl">Electron</span> · <span class="ln-hl">Expo</span>',
          '  Data        <span class="ln-hl">PostgreSQL</span> · <span class="ln-hl">SQLite</span> · <span class="ln-hl">Supabase</span>',
          '  Hosting     <span class="ln-hl">Cloudflare</span> · <span class="ln-hl">Netlify</span> · <span class="ln-hl">Render</span> · <span class="ln-hl">Fly.io</span>',
          '  AI          <span class="ln-hl">Anthropic</span> · <span class="ln-hl">OpenAI</span> · <span class="ln-hl">Ollama</span>',
        ]);
      },
      ls() {
        const projs = (data?.projects || []).map(p => p.slug || '');
        printBlock([
          '<span class="ln-h2">Projects:</span>',
          ...projs.map(s => `  <span class="ln-link" data-cat="${s}">${s}</span>`)
        ]);
        // Wire up clicks
        setTimeout(() => {
          $$('.ln-link[data-cat]', termBody).forEach(a => {
            a.addEventListener('click', () => execCmd(`cat ${a.dataset.cat}`));
          });
        }, 10);
      },
      cat(arg) {
        const slug = (arg || '').trim();
        if (!slug) { print('usage: cat &lt;slug&gt;', 'ln-err'); return; }
        const p = (data?.projects || []).find(x => x.slug === slug);
        if (!p) { print(`cat: ${escapeHtml(slug)}: no such project`, 'ln-err'); return; }
        printBlock([
          `<span class="ln-h2">${escapeHtml(p.name)}</span> <span class="ln-out">· ${escapeHtml(p.year || '')} · ${escapeHtml(p.status || '')}</span>`,
          escapeHtml(p.tagline),
          `<span class="ln-out">stack: ${(p.stack || []).map(escapeHtml).join(' · ')}</span>`,
        ]);
        if (p.case_study) {
          const link = `<a class="ln-link" href="${escapeHtml(p.case_study)}">→ read full case study</a>`;
          print(link);
        } else if (p.url) {
          const link = `<a class="ln-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener">→ visit live site</a>`;
          print(link);
        }
      },
      cv() {
        print('→ CV available on request — <a class="ln-link" href="mailto:abedinminhazul12@gmail.com?subject=CV%20request">email abedinminhazul12@gmail.com</a>', 'ln-ok');
      },
      github()   { print('→ opening github.com/abedinm', 'ln-ok'); setTimeout(() => window.open('https://github.com/abedinm', '_blank'), 300); },
      twitter()  { return commands.x(); },
      linkedin() { print('→ opening linkedin', 'ln-ok'); setTimeout(() => window.open('https://www.linkedin.com/in/minhazul-abedin-014031371', '_blank'), 300); },
      theme() {
        themeBtn?.click();
        const t = document.documentElement.dataset.theme;
        print(`→ theme set to <span class="ln-hl">${t}</span>`, 'ln-ok');
      },
      music() {
        musicBtn?.click();
        const playing = musicBtn?.classList.contains('playing');
        print(`→ music ${playing ? '<span class="ln-hl">playing</span>' : 'stopped'}`, 'ln-ok');
      },
      date() {
        const d = new Date();
        const dhakaOffset = 6 * 60;
        const local = d.getTime() + d.getTimezoneOffset() * 60000;
        const dhaka = new Date(local + dhakaOffset * 60000);
        print(`Dhaka — ${dhaka.toString().replace('GMT+0000 (Coordinated Universal Time)', 'BST').replace(/\([^)]+\)/, '')}`, 'ln-out');
      },
      sudo(arg) {
        if (!arg) { print('sudo: a command is required', 'ln-err'); return; }
        if (arg.trim().toLowerCase() === 'hire') {
          printBlock([
            '<span class="ln-ok">[sudo] password for client:</span>',
            '<span class="ln-out">···········</span>',
            '<span class="ln-h2">✓ access granted.</span>',
            'Opening abedinminhazul12@gmail.com …',
          ]);
          setTimeout(() => { window.location.href = 'mailto:abedinminhazul12@gmail.com?subject=Let%27s%20work%20together'; }, 800);
        } else if (arg.trim().toLowerCase() === 'rm -rf /') {
          printBlock([
            '<span class="ln-err">nope. not on my watch.</span>',
            '<span class="ln-out">(this is offline-first software. try it on someone else\'s laptop.)</span>',
          ]);
        } else {
          print(`sudo: ${escapeHtml(arg)}: command not found`, 'ln-err');
        }
      },
      pwd()      { print('/home/abedin/portfolio', 'ln-out'); },
      cd(arg)    { print(`bash: cd: ${escapeHtml(arg || '~')}: this isn\'t a real fs, but nice try`, 'ln-err'); },
      echo(arg)  { print(escapeHtml(arg || '')); },
      coffee()   { printBlock(['☕  there is always coffee at abedin@core.', '   would you like sugar? type <span class="ln-hl">sudo coffee --sweet</span>.']); },
      konami()   { spawnConfetti(); print('→ try the actual sequence: ↑↑↓↓←→←→ba', 'ln-out'); },
      clear()    { termBody.innerHTML = ''; },
      exit()     { print('there is no exit. you are already home.', 'ln-out'); },
    };

    function execCmd(raw) {
      const trimmed = raw.trim();
      printPrompt(trimmed);
      if (!trimmed) { return; }
      history.push(trimmed); histIdx = history.length;
      const [head, ...rest] = trimmed.split(/\s+/);
      const arg = rest.join(' ');
      const cmd = head.toLowerCase();
      if (cmd in commands) { try { commands[cmd](arg); } catch (e) { print('error: ' + e.message, 'ln-err'); } }
      else { print(`command not found: <span class="ln-hl">${escapeHtml(head)}</span> — try <span class="ln-hl">help</span>`, 'ln-err'); }
      printSpacer();
      fxTick(820, 0.02);
    }

    termInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const v = termInput.value; termInput.value = ''; execCmd(v); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (histIdx > 0) histIdx--; termInput.value = history[histIdx] || ''; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (histIdx < history.length - 1) { histIdx++; termInput.value = history[histIdx]; } else { histIdx = history.length; termInput.value = ''; } }
      else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); commands.clear(); }
      else { fxTick(2200 + Math.random() * 800, 0.012); }
    });
    term.addEventListener('click', () => termInput.focus());

    // Press "/" anywhere to focus terminal
    addEventListener('keydown', e => {
      if (e.key !== '/') return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.contentEditable === 'true')) return;
      const palette = document.getElementById('cmdk');
      if (palette && palette.classList.contains('open')) return;
      e.preventDefault();
      termInput.focus();
      termInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* =================================================================
     ⌘K COMMAND PALETTE
     ================================================================= */
  const cmdkTrigger = $('#cmdk-trigger');
  const cmdk = $('#cmdk');
  const cmdkBd = $('#cmdk-backdrop');
  const cmdkInput = $('#cmdk-input');
  const cmdkList = $('#cmdk-list');

  if (cmdk && cmdkList) {
    const items = [
      { g: 'Sections', l: 'Hero · top', icn: '01', a: () => smoothNav('#top') },
      { g: 'Sections', l: 'Selected work', icn: '02', a: () => smoothNav('#work') },
      { g: 'Sections', l: 'About', icn: '03', a: () => smoothNav('#about') },
      { g: 'Sections', l: 'Where I work from', icn: '·', a: () => smoothNav('#locations') },
      { g: 'Sections', l: 'Pricing + engagements', icn: '04', a: () => smoothNav('#pricing') },
      { g: 'Sections', l: 'Process', icn: '·', a: () => smoothNav('#process') },
      { g: 'Sections', l: 'Lab — playable demos', icn: '05', a: () => smoothNav('#lab') },
      { g: 'Sections', l: 'What clients said', icn: '06', a: () => smoothNav('#said') },
      { g: 'Sections', l: 'FAQ', icn: '07', a: () => smoothNav('#faq') },
      { g: 'Sections', l: 'Book a 15-min', icn: '→', a: () => smoothNav('#book') },
      { g: 'Sections', l: 'Contact + project inquiry', icn: '08', a: () => smoothNav('#contact') },

      { g: 'Pages', l: 'Working with me · day-in-the-life', icn: '→', a: () => location.href = './working-together.html' },
      { g: 'Pages', l: 'The first call · agenda', icn: '→', a: () => location.href = './first-call.html' },
      { g: 'Pages', l: 'CV / résumé', icn: '→', a: () => location.href = './cv.html' },
      { g: 'Pages', l: 'About this site · colophon', icn: '→', a: () => location.href = './about-this-site.html' },
      { g: 'Pages', l: 'Public roadmap · what I\'m shipping', icn: '→', a: () => location.href = './roadmap.html' },
      { g: 'Pages', l: 'Mutual NDA template', icn: '↗', a: () => window.open('./assets/nda-mutual.md', '_blank') },
      { g: 'Pages', l: 'Arcade — Snake, Pong, 2048, Reaction', icn: '🎮', a: () => location.href = './arcade.html' },

      { g: 'Toys', l: 'Doodle mode (press D anywhere)', icn: '✎', a: () => { const e = new KeyboardEvent('keydown', { key: 'd', bubbles: true }); document.dispatchEvent(e); } },
      { g: 'Toys', l: 'Show keyboard shortcuts (press ?)', icn: '⌨', a: () => { const e = new KeyboardEvent('keydown', { key: '?', bubbles: true }); document.dispatchEvent(e); } },

      { g: 'Case studies', l: 'EnterpriseCore AI Suite', icn: 'EC', a: () => location.href = './work/enterprisecore.html' },
      { g: 'Case studies', l: 'LinguaBot', icn: 'LB', a: () => location.href = './work/linguabot.html' },
      { g: 'Case studies', l: 'HolyGrail', icn: 'HG', a: () => location.href = './work/holygrail.html' },
      { g: 'Case studies', l: 'SiteForge Studio', icn: 'SF', a: () => location.href = './work/siteforge.html' },
      { g: 'Case studies', l: 'Corner Table', icn: 'CT', a: () => location.href = './work/cornertable.html' },
      { g: 'Case studies', l: 'Deltadesh', icn: 'DD', a: () => location.href = './work/deltadesh.html' },
      { g: 'Case studies', l: 'Deltadutch', icn: 'DT', a: () => location.href = './work/deltadutch.html' },
      { g: 'Case studies', l: 'AI Knowledge Hub', icn: 'KH', a: () => location.href = './work/knowledge-hub.html' },
      { g: 'Case studies', l: 'Codex Tools', icn: 'CX', a: () => location.href = './work/codex-tools.html' },
      { g: 'Case studies', l: 'claude-skills', icn: 'CS', a: () => location.href = './work/claude-skills.html' },

      { g: 'Actions', l: 'Toggle dark / light theme', icn: '☼', a: () => themeBtn?.click() },
      { g: 'Actions', l: 'Toggle ambient music', icn: '♪', a: () => musicBtn?.click() },
      { g: 'Actions', l: 'Copy email — abedinminhazul12@gmail.com', icn: '@', a: () => navigator.clipboard?.writeText('abedinminhazul12@gmail.com') },
      { g: 'External', l: 'GitHub · abedinm', icn: 'GH', a: () => window.open('https://github.com/abedinm', '_blank') },
      { g: 'External', l: 'LinkedIn', icn: 'in', a: () => window.open('https://www.linkedin.com/in/minhazul-abedin-014031371', '_blank') },
    ];

    let activeIdx = 0;
    function renderList(filter = '') {
      const q = filter.trim().toLowerCase();
      const filtered = q ? items.filter(i => (i.l + ' ' + i.g).toLowerCase().includes(q)) : items;
      if (!filtered.length) {
        cmdkList.innerHTML = '<div class="cmdk-empty">No matches. Try "writing", "github", "theme"…</div>';
        return [];
      }
      let html = '';
      let lastGroup = '';
      filtered.forEach((it, i) => {
        if (it.g !== lastGroup) { html += `<div class="cmdk-group-label">${it.g}</div>`; lastGroup = it.g; }
        html += `<div class="cmdk-item${i === activeIdx ? ' active' : ''}" role="option" aria-selected="${i === activeIdx}" id="cmdk-opt-${i}" data-idx="${i}">
          <span class="icn" aria-hidden="true">${it.icn}</span>
          <span class="lbl">${escapeHtml(it.l)}</span>
          <span class="sub">↵</span>
        </div>`;
      });
      cmdkList.innerHTML = html;
      return filtered;
    }
    let visible = renderList();

    let _cmdkLastFocus = null;
    function openCmdk() {
      _cmdkLastFocus = document.activeElement;
      cmdk.classList.add('open'); cmdkBd.classList.add('open');
      setTimeout(() => cmdkInput?.focus(), 50);
      fxTick(820, 0.05);
    }
    function closeCmdk() {
      cmdk.classList.remove('open'); cmdkBd.classList.remove('open');
      cmdkInput.value = ''; activeIdx = 0; visible = renderList();
      cmdkInput.removeAttribute('aria-activedescendant');
      if (_cmdkLastFocus) { _cmdkLastFocus.focus(); _cmdkLastFocus = null; }
    }

    cmdkTrigger?.addEventListener('click', openCmdk);
    cmdkBd?.addEventListener('click', closeCmdk);

    function scrollActiveIntoView() {
      const el = cmdkList.querySelector('.cmdk-item.active');
      if (el) {
        el.scrollIntoView({ block: 'nearest' });
        cmdkInput.setAttribute('aria-activedescendant', el.id);
      }
    }
    addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmdk.classList.contains('open') ? closeCmdk() : openCmdk(); return; }
      if (!cmdk.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
      // Focus trap (a11y audit round 3) — keep Tab cycling inside the dialog.
      if (e.key === 'Tab') {
        e.preventDefault();
        cmdkInput?.focus();   // input is the only interactive element; arrow keys handle the list
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(visible.length - 1, activeIdx + 1); visible = renderList(cmdkInput.value); scrollActiveIntoView(); fxTick(900, 0.02); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); visible = renderList(cmdkInput.value); scrollActiveIntoView(); fxTick(700, 0.02); }
      if (e.key === 'Enter')     { e.preventDefault(); const it = visible[activeIdx]; if (it) { closeCmdk(); setTimeout(() => it.a(), 50); } }
    });
    cmdkInput?.addEventListener('input', () => { activeIdx = 0; visible = renderList(cmdkInput.value); });
    cmdkList?.addEventListener('click', e => {
      const item = e.target.closest('[data-idx]'); if (!item) return;
      const it = visible[parseInt(item.dataset.idx, 10)];
      if (it) { closeCmdk(); setTimeout(() => it.a(), 50); }
    });
  }

  /* =================================================================
     KEYBOARD SHORTCUTS — quick nav: g h, g w, g a, t (top), m (music)
     ================================================================= */
  let lastG = 0;
  addEventListener('keydown', e => {
    if (document.activeElement?.matches('input, textarea, [contenteditable]')) return;
    if (cmdk?.classList.contains('open')) return;
    const now = performance.now();
    if (e.key === 'g') { lastG = now; return; }
    if (now - lastG < 800) {
      const map = { h: '#top', w: '#work', a: '#about', n: '#now', f: '#faq', c: '#contact', r: '#writing', s: '#said', l: '#lab' };
      if (map[e.key]) { e.preventDefault(); smoothNav(map[e.key]); lastG = 0; return; }
    }
    if (e.key === 't' && !e.metaKey && !e.ctrlKey) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    if (e.key === 'm' && !e.metaKey && !e.ctrlKey) { musicBtn?.click(); }
    // "/" is owned by the hero terminal — see terminal init
  });

  /* =================================================================
     KONAMI CODE — confetti burst
     ================================================================= */
  const konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let kIdx = 0;
  addEventListener('keydown', e => {
    if (e.key === konami[kIdx]) { kIdx++; if (kIdx === konami.length) { spawnConfetti(); kIdx = 0; } }
    else { kIdx = e.key === konami[0] ? 1 : 0; }
  });
  function spawnConfetti() {
    const colors = ['var(--green)', 'var(--orange)', 'var(--blue)', 'var(--ink)'];
    fxTick(440, 0.1); fxTick(660, 0.1); fxTick(880, 0.15);
    for (let i = 0; i < 80; i++) {
      const c = document.createElement('span');
      c.className = 'confetti';
      c.style.left = Math.random() * innerWidth + 'px';
      c.style.background = colors[i % colors.length];
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      c.style.animation = `confetti-fall ${1.6 + Math.random() * 1.5}s cubic-bezier(.2,.6,.4,1) forwards`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3200);
    }
  }

  /* =================================================================
     PREFETCH case-study pages on hover/touch — instant transitions
     ================================================================= */
  if (!STATIC) {
    const prefetched = new Set();
    const prefetch = (href) => {
      if (!href || prefetched.has(href)) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('http')) return;
      prefetched.add(href);
      const l = document.createElement('link');
      l.rel = 'prefetch';
      l.href = href;
      document.head.appendChild(l);
    };
    document.addEventListener('mouseenter', (e) => {
      const a = e.target.closest?.('a[href^="./work/"], a[href^="/work/"]');
      if (a) prefetch(a.getAttribute('href'));
    }, true);
    document.addEventListener('touchstart', (e) => {
      const a = e.target.closest?.('a[href^="./work/"], a[href^="/work/"]');
      if (a) prefetch(a.getAttribute('href'));
    }, { passive: true });
  }

  /* =================================================================
     WEBGL-LITE NOISE CANVAS — slow color blob field, very subtle
     ================================================================= */
  const canvas = $('#noise-canvas');
  if (canvas && !STATIC && !REDUCED_MOTION) {
    const ctx = canvas.getContext('2d');
    function resize() { canvas.width = innerWidth; canvas.height = innerHeight; }
    resize(); addEventListener('resize', resize);
    const blobs = [
      { x: 0.2, y: 0.3, r: 280, color: 'rgba(101, 213, 122, 0.18)', vx: 0.0002, vy: 0.0001 },
      { x: 0.7, y: 0.6, r: 320, color: 'rgba(255, 107, 53, 0.16)', vx: -0.00015, vy: 0.0002 },
      { x: 0.5, y: 0.85, r: 240, color: 'rgba(74, 123, 255, 0.12)', vx: 0.0001, vy: -0.00018 },
    ];
    function draw(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      blobs.forEach(b => {
        b.x = (b.x + b.vx + 1) % 1;
        b.y = (b.y + b.vy + 1) % 1;
        const x = b.x * canvas.width, y = b.y * canvas.height;
        const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
        g.addColorStop(0, b.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  /* =================================================================
     VIEW TRANSITIONS API — smooth page swaps between case studies
     ================================================================= */
  if (document.startViewTransition) {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || a.target === '_blank') return;
      // Internal navigation only
      try {
        const url = new URL(href, location.href);
        if (url.origin !== location.origin) return;
        e.preventDefault();
        document.startViewTransition(() => { location.href = url.href; });
      } catch {}
    });
  }

  /* =================================================================
     HELPERS
     ================================================================= */
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  /* ---- Scroll-on-load (for capture tooling) ---- */
  const scrollParam = new URLSearchParams(location.search).get('scroll');
  if (scrollParam) {
    requestAnimationFrame(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, parseInt(scrollParam, 10) || 0);
    });
  }

  /* =================================================================
     CONTACT FORM — mailto: with rich qualifying fields prefilled
     ================================================================= */
  const contactForm = $('#contact-form');
  if (contactForm) {
    const successEl = $('#cf-success');
    const val = sel => (contactForm.querySelector(sel)?.value || '').trim();
    const labelOf = sel => {
      const el = contactForm.querySelector(sel);
      if (!el) return '';
      const opt = el.options?.[el.selectedIndex];
      return opt?.value ? opt.textContent.trim() : '';
    };
    // a11y: live error reporting on the required fields.
    function setErr(sel, msg) {
      const el = contactForm.querySelector(sel);
      if (!el) return;
      el.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const errId = el.id + '-err';
      let errEl = document.getElementById(errId);
      if (msg) {
        if (!errEl) {
          errEl = document.createElement('p');
          errEl.id = errId;
          errEl.className = 'cf-error';
          errEl.setAttribute('role', 'alert');
          el.parentElement.appendChild(errEl);
        }
        errEl.textContent = msg;
        el.setAttribute('aria-describedby', errId);
      } else if (errEl) {
        errEl.remove();
        el.removeAttribute('aria-describedby');
      }
    }
    ['#cf-name', '#cf-email', '#cf-msg'].forEach(sel => {
      contactForm.querySelector(sel)?.addEventListener('input', () => setErr(sel, ''));
    });
    const submitBtn = contactForm.querySelector('.cf-submit');
    const originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';
    function setSuccess(html) {
      if (!successEl) return;
      successEl.hidden = false;
      successEl.innerHTML = html;
      successEl.classList.remove('cf-success--error');
    }
    function setError(html) {
      if (!successEl) return;
      successEl.hidden = false;
      successEl.innerHTML = html;
      successEl.classList.add('cf-success--error');
    }
    // Record when the form became interactive — the backend rejects
    // submissions that arrive implausibly fast (bot behaviour).
    const formShownAt = Date.now();
    // Cloudflare Turnstile, if present, drops a token into this hidden input.
    const turnstileToken = () =>
      (contactForm.querySelector('[name="cf-turnstile-response"]')?.value || '').trim();

    contactForm.addEventListener('submit', async e => {
      e.preventDefault();
      const name = val('#cf-name');
      const email = val('#cf-email');
      const company = val('#cf-company');
      const kind = labelOf('#cf-kind');
      const budget = labelOf('#cf-budget');
      const timeline = labelOf('#cf-timeline');
      const msg = val('#cf-msg');
      const honeypot = val('#cf-website');   // hidden honeypot field
      // Inline validation
      let firstBad = null;
      if (!name) { setErr('#cf-name', 'Please add your name.'); firstBad = firstBad || '#cf-name'; }
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) { setErr('#cf-email', 'Use a valid email like you@company.com.'); firstBad = firstBad || '#cf-email'; }
      if (!msg) { setErr('#cf-msg', 'Add a one-line scope so I can reply usefully.'); firstBad = firstBad || '#cf-msg'; }
      if (firstBad) {
        const el = contactForm.querySelector(firstBad);
        el?.focus();
        announce('Please fix the highlighted fields.');
        return;
      }

      const subject = `[Inquiry] ${kind || 'Project'} — ${company || name}`;
      const plainBody = [
        `Name: ${name}`,
        `Email: ${email}`,
        company && `Company / project: ${company}`,
        kind && `Engagement: ${kind}`,
        budget && `Budget: ${budget}`,
        timeline && `Timeline: ${timeline}`,
        '',
        '— Scope —',
        msg,
      ].filter(Boolean).join('\n');

      const mailtoFallback = (note) => {
        setError(`${note} Opening your email client as a backup — or write to <a href="mailto:abedinminhazul12@gmail.com">abedinminhazul12@gmail.com</a>.`);
        window.location.href = `mailto:abedinminhazul12@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainBody)}`;
      };

      if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = 'Sending…'; }
      try {
        const res = await fetch(CONFIG.contactEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name, email, message: msg,
            company, kind, budget, timeline,
            botcheck: honeypot,                  // honeypot (must be empty)
            elapsed_ms: Date.now() - formShownAt, // anti-bot timing signal
            turnstile_token: turnstileToken(),
          }),
        });
        // 405/404 => no backend here (e.g. GitHub Pages). Use mailto.
        if (res.status === 404 || res.status === 405) {
          setSuccess(`Opening your mail client with the inquiry pre-filled. If nothing happens, copy this and send to <a href="mailto:abedinminhazul12@gmail.com">abedinminhazul12@gmail.com</a>:<br><br><textarea readonly style="width:100%;min-height:150px;font-family:var(--mono);font-size:12px;padding:10px;border:1px solid var(--cream-line-strong);border-radius:6px;background:var(--cream-soft);">${plainBody.replace(/</g,'&lt;')}</textarea>`);
          announce('Opening your email client with the inquiry pre-filled.');
          window.location.href = `mailto:abedinminhazul12@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainBody)}`;
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok !== false) {
          setSuccess(`${escapeHtml(data.message || 'Thanks — your inquiry landed in my inbox. I reply within 24h.')} <a href="mailto:abedinminhazul12@gmail.com">abedinminhazul12@gmail.com</a> if you'd rather email directly.`);
          announce('Inquiry sent.');
          contactForm.reset();
          fxTick(660, 0.06);
          return;
        }
        if (res.status === 429) {
          setError(escapeHtml(data.message || 'Too many submissions — please try again later, or email abedinminhazul12@gmail.com directly.'));
          return;
        }
        // 4xx/5xx with a message — show it, then offer mailto.
        mailtoFallback(escapeHtml(data.message || `Couldn't send (HTTP ${res.status}).`));
      } catch (err) {
        // Network error / offline — never lose the lead.
        mailtoFallback(`Couldn't reach the server (${escapeHtml(err.message || 'network error')}).`);
      } finally {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalBtnHTML; }
      }
    });
  }

  /* =================================================================
     DELIGHT LAYER — sits on top of the conversion-focused base.
     All gated by !STATIC and !REDUCED_MOTION so the prerendered HTML
     and accessibility-conscious users get the clean version.
     ================================================================= */
  if (!STATIC && !REDUCED_MOTION) {

    /* ----- 1. Universal click ripple ----- */
    document.addEventListener('click', (e) => {
      const t = e.target.closest('a, button, .package-card, .project, .faq-item, .service-card, .lab-card, .sticker, .cs-cta-primary, .cs-cta-secondary');
      if (!t) return;
      const r = t.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'click-ripple';
      const size = Math.max(r.width, r.height);
      ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-r.left-size/2}px;top:${e.clientY-r.top-size/2}px`;
      const prevPos = getComputedStyle(t).position;
      if (prevPos === 'static') t.style.position = 'relative';
      t.style.overflow = t.style.overflow || 'hidden';
      t.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    });

    /* ----- 2. Cursor particle trail ----- */
    if (window.matchMedia('(pointer: fine)').matches && cursor) {
      const trailLayer = document.createElement('div');
      trailLayer.className = 'cursor-trail-layer';
      trailLayer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(trailLayer);
      let lastTrail = 0;
      addEventListener('mousemove', (e) => {
        const now = performance.now();
        if (now - lastTrail < 40) return;
        lastTrail = now;
        const dot = document.createElement('span');
        dot.className = 'cursor-trail-dot';
        dot.style.cssText = `left:${e.clientX}px;top:${e.clientY}px`;
        trailLayer.appendChild(dot);
        setTimeout(() => dot.remove(), 800);
      }, { passive: true });
    }

    /* ----- 3. Achievement / XP system ----- */
    const ACH_KEY = 'abedin-ach';
    let ach;
    try { ach = JSON.parse(localStorage.getItem(ACH_KEY) || '{}'); } catch { ach = {}; }
    function unlock(id, label) {
      if (ach[id]) return;
      ach[id] = { at: Date.now(), label };
      try { localStorage.setItem(ACH_KEY, JSON.stringify(ach)); } catch {}
      showAchToast(label);
      updateXpBar();
    }
    function showAchToast(label) {
      const toast = document.createElement('div');
      toast.className = 'ach-toast';
      toast.innerHTML = `<span class="ach-toast-icn">✦</span><div><strong>Unlocked</strong><br/>${label}</div>`;
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('show'));
      setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3200);
      fxTick(880, 0.08); fxTick(1320, 0.08);
    }
    const ACHIEVEMENTS = [
      { id: 'open',       label: 'First visit',                 trigger: 'load' },
      { id: 'work_seen',  label: 'Viewed Selected work',        trigger: 'scroll:#work' },
      { id: 'price_seen', label: 'Viewed Pricing',              trigger: 'scroll:#pricing' },
      { id: 'lab_seen',   label: 'Reached the Lab',             trigger: 'scroll:#lab' },
      { id: 'contact_seen', label: 'Reached Contact',           trigger: 'scroll:#contact' },
      { id: 'theme_flip', label: 'Toggled the theme',           trigger: 'click:#nav-theme' },
      { id: 'cmdk',       label: 'Opened the ⌘K palette',       trigger: 'click:#cmdk-trigger' },
      { id: 'term',       label: 'Typed in the terminal',       trigger: 'input:#term-input' },
      { id: 'expander',   label: 'Expanded a card',             trigger: 'click:.service-card,.faq-item,.process-step' },
      { id: 'cs_visit',   label: 'Read a case study',           trigger: 'click:.project' },
      { id: 'snake',      label: 'Discovered the snake game',   trigger: 'manual' },
      { id: 'konami',     label: 'Found the Konami code',       trigger: 'manual' },
    ];
    function updateXpBar() {
      const total = ACHIEVEMENTS.length;
      const won = Object.keys(ach).length;
      const bar = document.querySelector('#xp-bar-fill');
      const label = document.querySelector('#xp-bar-label');
      if (bar) bar.style.width = `${(won / total) * 100}%`;
      if (label) label.textContent = `${won} / ${total} unlocked`;
    }
    // Mount the XP widget into the colophon if present
    function mountXp() {
      const slot = document.querySelector('.colophon-prefs');
      if (!slot) return;
      if (document.querySelector('#xp-widget')) return;
      const widget = document.createElement('div');
      widget.id = 'xp-widget';
      widget.className = 'xp-widget';
      widget.innerHTML = `
        <div class="xp-bar"><div class="xp-bar-fill" id="xp-bar-fill"></div></div>
        <span class="xp-bar-label" id="xp-bar-label">0 / 0 unlocked</span>
        <details class="xp-list">
          <summary>What can you unlock?</summary>
          <ul>${ACHIEVEMENTS.map(a => `<li data-ach="${a.id}">${a.label}</li>`).join('')}</ul>
        </details>
      `;
      slot.parentElement.appendChild(widget);
      updateXpBar();
      // Mark unlocked items
      Object.keys(ach).forEach(id => {
        const li = widget.querySelector(`[data-ach="${id}"]`);
        if (li) li.classList.add('unlocked');
      });
    }
    setTimeout(mountXp, 1000);

    // Wire the achievement triggers
    unlock('open', 'First visit');
    // Scroll-based
    const scrollAch = ACHIEVEMENTS.filter(a => a.trigger?.startsWith('scroll:'));
    const scrollObs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const id = '#' + e.target.id;
        const m = scrollAch.find(a => a.trigger === 'scroll:' + id);
        if (m) unlock(m.id, m.label);
      });
    }, { threshold: 0.3 });
    scrollAch.forEach(a => {
      const el = document.querySelector(a.trigger.slice(7));
      if (el) scrollObs.observe(el);
    });
    // Click-based
    document.addEventListener('click', (e) => {
      ACHIEVEMENTS.filter(a => a.trigger?.startsWith('click:')).forEach(a => {
        const sel = a.trigger.slice(6);
        if (e.target.closest(sel)) unlock(a.id, a.label);
      });
    });
    // Terminal input
    document.querySelector('#term-input')?.addEventListener('input', () => {
      unlock('term', 'Typed in the terminal');
    }, { once: true });
    // Update existing items in widget on each unlock (since widget may mount after some unlocks)
    setTimeout(() => Object.keys(ach).forEach(id => {
      document.querySelector(`#xp-widget [data-ach="${id}"]`)?.classList.add('unlocked');
    }), 1500);
    // Watch for further unlocks
    const _origUnlock = unlock;
    window.__unlock = (id, label) => { _origUnlock(id, label); document.querySelector(`#xp-widget [data-ach="${id}"]`)?.classList.add('unlocked'); };
    Object.defineProperty(window, 'ach', { get: () => ({...ach}) });

    /* ----- 4. Snake in the terminal — type "snake" ----- */
    // Register the command into the existing terminal handler if available.
    // The terminal lives at #term — we hook into its input.
    const termInput = document.querySelector('#term-input');
    const termBody = document.querySelector('#term-body');
    if (termInput && termBody) {
      // Intercept submit when value is "snake"
      termInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const v = termInput.value.trim().toLowerCase();
        if (v !== 'snake') return;
        // Defer to next tick so the existing handler runs first (it'll print "command not found")
        // …then we replace that output with the game.
        setTimeout(() => {
          // Remove the "command not found: snake" line if it exists
          const lns = [...termBody.querySelectorAll('.ln-err')];
          const last = lns[lns.length - 1];
          if (last && last.textContent.toLowerCase().includes('snake')) last.remove();
          startSnake(termBody);
          window.__unlock?.('snake', 'Discovered the snake game');
        }, 50);
      });
    }
    function startSnake(host) {
      // Build a small canvas game
      const wrap = document.createElement('div');
      wrap.className = 'snake-wrap';
      const COLS = 20, ROWS = 14, CELL = 14;
      const c = document.createElement('canvas');
      c.width = COLS * CELL; c.height = ROWS * CELL;
      c.style.cssText = 'display:block;margin:8px auto;border:1px solid var(--cream-line);border-radius:6px;background:#0a0a0a;image-rendering:pixelated';
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', 'Snake game. Use arrow keys to move. Press R to retry after game over.');
      c.tabIndex = 0;
      wrap.appendChild(c);
      const meta = document.createElement('div');
      meta.style.cssText = 'font-family:var(--mono);font-size:11px;text-align:center;margin-top:6px;color:var(--on-dark-muted)';
      meta.innerHTML = 'snake — arrow keys · <span id="snake-score">0</span> pts · <a href="#" id="snake-quit" style="color:var(--orange)">quit</a>';
      wrap.appendChild(meta);
      host.appendChild(wrap);
      host.scrollTop = host.scrollHeight;

      const ctx = c.getContext('2d');
      let snake = [{x: 8, y: 7}, {x: 7, y: 7}, {x: 6, y: 7}];
      let dir = {x: 1, y: 0}, nextDir = dir;
      let food = randFood();
      let score = 0;
      let dead = false;
      let tick = 0;
      function randFood() {
        while (true) {
          const f = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
          if (!snake.some(s => s.x === f.x && s.y === f.y)) return f;
        }
      }
      function step() {
        if (dead) return;
        dir = nextDir;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS || snake.some(s => s.x === head.x && s.y === head.y)) {
          dead = true;
          draw();
          return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score++;
          document.getElementById('snake-score').textContent = score;
          food = randFood();
          fxTick(880, 0.05);
        } else snake.pop();
        draw();
      }
      function draw() {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, c.width, c.height);
        // food
        ctx.fillStyle = '#ff6b35';
        ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4);
        // snake
        snake.forEach((s, i) => {
          ctx.fillStyle = i === 0 ? '#65d57a' : '#2fa84a';
          ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
        });
        if (dead) {
          ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,c.width,c.height);
          ctx.fillStyle = '#ff6b35'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
          ctx.fillText('GAME OVER · ' + score + 'pts', c.width / 2, c.height / 2);
          ctx.fillStyle = '#f3eed9'; ctx.font = '11px monospace';
          ctx.fillText('press R to retry', c.width / 2, c.height / 2 + 18);
        }
      }
      draw();
      const timer = setInterval(step, 120);
      function onKey(e) {
        // Scope: only act if the game canvas is still visible AND user is not
        // typing in another input. Prevents the game from hijacking page nav.
        if (!document.body.contains(c)) { removeEventListener('keydown', onKey); return; }
        if (document.activeElement?.matches('input, textarea, [contenteditable]')) return;
        const k = e.key;
        if (k === 'ArrowUp' && dir.y !== 1) { nextDir = { x: 0, y: -1 }; e.preventDefault(); }
        else if (k === 'ArrowDown' && dir.y !== -1) { nextDir = { x: 0, y: 1 }; e.preventDefault(); }
        else if (k === 'ArrowLeft' && dir.x !== 1) { nextDir = { x: -1, y: 0 }; e.preventDefault(); }
        else if (k === 'ArrowRight' && dir.x !== -1) { nextDir = { x: 1, y: 0 }; e.preventDefault(); }
        else if (k === 'r' && dead) {
          snake = [{x: 8, y: 7}, {x: 7, y: 7}, {x: 6, y: 7}];
          dir = { x: 1, y: 0 }; nextDir = dir;
          food = randFood(); score = 0; dead = false;
          document.getElementById('snake-score').textContent = '0';
        }
      }
      addEventListener('keydown', onKey);
      meta.querySelector('#snake-quit').addEventListener('click', (ev) => {
        ev.preventDefault();
        clearInterval(timer);
        removeEventListener('keydown', onKey);
        wrap.remove();
      });
    }

    /* ----- 5. Konami secret theme — REMOVED 2026-06-07.
       Novelty themes are gone (they tinted the whole site and persisted).
       Konami still fires confetti + the achievement via its own handler. */
    if (typeof spawnConfetti === 'function') {
      const _orig = spawnConfetti;
      window.spawnConfetti = function() {
        _orig();
        window.__unlock?.('konami', 'Found the Konami code');
      };
    }

    /* ----- 6. Floating Action Button (FAB) ----- */
    const fab = document.createElement('div');
    fab.className = 'fab';
    fab.innerHTML = `
      <button class="fab-main" id="fab-main" type="button" aria-label="Quick actions" aria-expanded="false">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" class="fab-plus"/>
        </svg>
      </button>
      <div class="fab-actions" hidden>
        <button class="fab-act" data-act="top" type="button" aria-label="Scroll to top">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        </button>
        <button class="fab-act" data-act="cmdk" type="button" aria-label="Open command palette">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16" y2="16" stroke-linecap="round"/></svg>
        </button>
        <button class="fab-act" data-act="theme" type="button" aria-label="Toggle theme">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        </button>
        <button class="fab-act" data-act="copy" type="button" aria-label="Copy email">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
        </button>
      </div>`;
    document.body.appendChild(fab);
    const fabMain = fab.querySelector('#fab-main');
    const fabActs = fab.querySelector('.fab-actions');
    function closeFab() {
      fabMain.setAttribute('aria-expanded', 'false');
      fab.classList.remove('open');
      fabActs.hidden = true;
    }
    fabMain.addEventListener('click', () => {
      const open = fabMain.getAttribute('aria-expanded') === 'true';
      fabMain.setAttribute('aria-expanded', String(!open));
      fab.classList.toggle('open', !open);
      fabActs.hidden = open;
      fxTick(open ? 540 : 820, 0.04);
    });
    // a11y (audit round 2): Escape closes FAB; outside-click closes too.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && fab.classList.contains('open')) closeFab();
    });
    document.addEventListener('click', (e) => {
      if (!fab.classList.contains('open')) return;
      if (!fab.contains(e.target)) closeFab();
    });
    fabActs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      else if (act === 'cmdk') document.querySelector('#cmdk-trigger')?.click();
      else if (act === 'theme') document.querySelector('#nav-theme')?.click();
      else if (act === 'copy') {
        navigator.clipboard?.writeText('abedinminhazul12@gmail.com').then(() => {
          announce('Email copied: abedinminhazul12@gmail.com');
          showAchToast('Copied: abedinminhazul12@gmail.com');
        });
      }
      fabMain.click();   // collapse
    });

    /* ----- 7. Welcome tutorial for first-time visitors -----
       Shown only on desktop (>=900px), only on first visit, only at the top of
       the page. Auto-dismisses the moment the user scrolls — at that point
       they're already exploring and the tour is just blocking content. */
    const SEEN_KEY = 'abedin-seen-tour';
    if (!localStorage.getItem(SEEN_KEY) && window.innerWidth >= 900) {
      setTimeout(() => {
        // Bail if the user already scrolled past the hero while we were waiting.
        if (window.scrollY > 200) {
          try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
          return;
        }
        const tour = document.createElement('div');
        tour.className = 'welcome-tour';
        tour.setAttribute('role', 'dialog');
        tour.setAttribute('aria-modal', 'false');
        tour.setAttribute('aria-labelledby', 'welcome-tour-title');
        tour.innerHTML = `
          <div class="welcome-tour-card">
            <button class="welcome-tour-close" type="button" aria-label="Dismiss this tip">×</button>
            <span class="welcome-tour-kicker">First time here?</span>
            <h3 id="welcome-tour-title">Quick orientation.</h3>
            <ul>
              <li><kbd>⌘&nbsp;K</kbd> opens the command palette (jump anywhere).</li>
              <li><kbd>/</kbd> focuses the terminal — try typing <code>help</code>.</li>
              <li>Pricing is upfront. No discovery call to learn cost.</li>
            </ul>
            <div class="welcome-tour-actions">
              <button class="welcome-tour-go" type="button">Got it — let me look around</button>
            </div>
          </div>
        `;
        document.body.appendChild(tour);
        const prevFocus = document.activeElement;
        requestAnimationFrame(() => { tour.classList.add('show'); });
        function dismiss() {
          tour.classList.remove('show');
          setTimeout(() => tour.remove(), 400);
          try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
          prevFocus?.focus?.();
          document.removeEventListener('keydown', onEsc);
          window.removeEventListener('scroll', onScrollDismiss);
        }
        function onEsc(e) { if (e.key === 'Escape') { e.preventDefault(); dismiss(); } }
        // Auto-dismiss the instant the user starts exploring on their own.
        const onScrollDismiss = () => { if (window.scrollY > 120) dismiss(); };
        tour.querySelector('.welcome-tour-go').addEventListener('click', dismiss);
        tour.querySelector('.welcome-tour-close').addEventListener('click', dismiss);
        document.addEventListener('keydown', onEsc);
        window.addEventListener('scroll', onScrollDismiss, { passive: true });
      }, 1400);
    }

    /* ----- 8. Theme switch sweep (CSS-driven, hooked here) ----- */
    document.querySelector('#nav-theme')?.addEventListener('click', () => {
      const sweep = document.createElement('div');
      sweep.className = 'theme-sweep';
      document.body.appendChild(sweep);
      requestAnimationFrame(() => sweep.classList.add('go'));
      setTimeout(() => sweep.remove(), 800);
    });

    /* ----- 9. Sound on section enter (very subtle) ----- */
    const soundSections = ['#work', '#pricing', '#said'];
    const soundObs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        fxTick(440 + Math.random() * 220, 0.025);
        soundObs.unobserve(e.target);
      });
    }, { threshold: 0.3 });
    soundSections.forEach(s => { const el = document.querySelector(s); if (el) soundObs.observe(el); });

    /* ----- 10a. Confetti — reusable burst utility ----- */
    function burstConfetti(opts = {}) {
      const colors = opts.colors || ['#65d57a', '#ff6b35', '#4a7bff', '#f3eed9', '#a06cd5'];
      const count = opts.count || 60;
      const origin = opts.origin || { x: innerWidth / 2, y: innerHeight / 2 };
      for (let i = 0; i < count; i++) {
        const c = document.createElement('span');
        c.className = 'confetti-piece';
        const angle = Math.random() * Math.PI * 2;
        const velocity = 200 + Math.random() * 300;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity - 100;
        const rot = Math.random() * 720 - 360;
        const dur = 1.2 + Math.random() * 0.8;
        const size = 8 + Math.random() * 8;
        c.style.cssText = `
          position:fixed; top:${origin.y}px; left:${origin.x}px;
          width:${size}px; height:${size * 0.6}px;
          background:${colors[i % colors.length]};
          border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
          pointer-events:none; z-index:99999;
          animation:confetti-fly ${dur}s cubic-bezier(0.2,0.6,0.6,1) forwards;
          --tx:${tx}px; --ty:${ty}px; --rot:${rot}deg;
        `;
        document.body.appendChild(c);
        setTimeout(() => c.remove(), dur * 1000 + 100);
      }
    }
    window.burstConfetti = burstConfetti;

    /* ----- 10b. Confetti on achievement unlock + form submit + ach 100% ----- */
    const _origShowAch = showAchToast;
    showAchToast = function(label) {
      _origShowAch(label);
      burstConfetti({ count: 24, origin: { x: innerWidth - 60, y: 60 } });
      // 100% unlocked? Big celebration.
      if (Object.keys(ach).length === ACHIEVEMENTS.length) {
        setTimeout(() => {
          burstConfetti({ count: 150, origin: { x: innerWidth / 2, y: innerHeight / 2 } });
          showCompletionModal();
        }, 600);
      }
    };
    function showCompletionModal() {
      if (document.querySelector('.completion-modal')) return;
      const modal = document.createElement('div');
      modal.className = 'completion-modal';
      // Proper modal dialog semantics (a11y audit 2026-05-24)
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'completion-title');
      modal.innerHTML = `
        <div class="completion-modal-card">
          <div class="completion-modal-mark" aria-hidden="true">★</div>
          <h3 id="completion-title">100% explored.</h3>
          <p>You found everything. Snake. The Konami code. Pricing. The 12 achievements. <em>Most visitors stop scrolling halfway through Work.</em></p>
          <p>If you're considering hiring me — the curiosity that got you here is the same curiosity that gets your project shipped on time.</p>
          <div class="completion-modal-actions">
            <a href="#pricing" class="completion-modal-go">See pricing →</a>
            <button class="completion-modal-close" type="button">Dismiss</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      const prevFocus = document.activeElement;
      const focusable = modal.querySelectorAll('a, button');
      requestAnimationFrame(() => {
        modal.classList.add('show');
        focusable[0]?.focus();
      });
      function dismiss() {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 400);
        prevFocus?.focus?.();
        document.removeEventListener('keydown', onKey);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
        // Focus trap
        if (e.key === 'Tab' && focusable.length) {
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      modal.querySelector('.completion-modal-close').addEventListener('click', dismiss);
      modal.querySelector('.completion-modal-go').addEventListener('click', dismiss);
      document.addEventListener('keydown', onKey);
    }
    // Confetti when form submits successfully (mailto opens)
    document.querySelector('#contact-form')?.addEventListener('submit', () => {
      setTimeout(() => burstConfetti({ count: 50 }), 200);
    });

    /* ----- 11. Mouse-follow eyes mascot in colophon ----- */
    function mountEyes() {
      const slot = document.querySelector('.colophon-head');
      if (!slot || document.querySelector('.eyes-mascot')) return;
      const eyes = document.createElement('div');
      eyes.className = 'eyes-mascot';
      eyes.setAttribute('aria-hidden', 'true');
      eyes.innerHTML = `
        <svg class="eye eye-l" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="var(--cream-soft)" stroke="var(--ink)" stroke-width="2"/><circle class="pupil" cx="20" cy="20" r="6" fill="var(--ink)"/></svg>
        <svg class="eye eye-r" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="var(--cream-soft)" stroke="var(--ink)" stroke-width="2"/><circle class="pupil" cx="20" cy="20" r="6" fill="var(--ink)"/></svg>
      `;
      slot.appendChild(eyes);
      const pupils = eyes.querySelectorAll('.pupil');
      addEventListener('mousemove', (e) => {
        pupils.forEach((p, i) => {
          const eye = p.closest('.eye');
          const r = eye.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const dist = Math.min(8, Math.hypot(dx, dy) / 40);
          const angle = Math.atan2(dy, dx);
          p.setAttribute('cx', 20 + Math.cos(angle) * dist);
          p.setAttribute('cy', 20 + Math.sin(angle) * dist);
        });
      }, { passive: true });
    }
    setTimeout(mountEyes, 1200);

    /* ----- 12. Keyboard shortcuts overlay (press ? key) ----- */
    addEventListener('keydown', (e) => {
      if (e.key !== '?' && !(e.key === '/' && e.shiftKey)) return;
      if (document.activeElement?.matches('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      let overlay = document.querySelector('.shortcuts-overlay');
      if (overlay) {
        overlay.remove();
        return;
      }
      overlay = document.createElement('div');
      overlay.className = 'shortcuts-overlay';
      // a11y dialog semantics (audit round 2)
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'shortcuts-h');
      overlay.innerHTML = `
        <div class="shortcuts-backdrop"></div>
        <div class="shortcuts-card">
          <div class="shortcuts-head">
            <h3 id="shortcuts-h">Keyboard shortcuts</h3>
            <button class="shortcuts-close" type="button" aria-label="Close">✕</button>
          </div>
          <div class="shortcuts-grid">
            <div class="shortcuts-section">
              <h4>Navigation</h4>
              <dl>
                <dt><kbd>${CMD_KEY}</kbd></dt><dd>Command palette</dd>
                <dt><kbd>g</kbd> <kbd>w</kbd></dt><dd>Go to work</dd>
                <dt><kbd>g</kbd> <kbd>a</kbd></dt><dd>Go to about</dd>
                <dt><kbd>g</kbd> <kbd>c</kbd></dt><dd>Go to contact</dd>
                <dt><kbd>g</kbd> <kbd>f</kbd></dt><dd>Go to FAQ</dd>
                <dt><kbd>t</kbd></dt><dd>Scroll to top</dd>
              </dl>
            </div>
            <div class="shortcuts-section">
              <h4>Easter eggs</h4>
              <dl>
                <dt><kbd>/</kbd></dt><dd>Focus terminal</dd>
                <dt><kbd>?</kbd></dt><dd>This menu</dd>
                <dt><kbd>m</kbd></dt><dd>Toggle music</dd>
                <dt>Type <kbd>snake</kbd></dt><dd>Play Snake</dd>
                <dt>Type <kbd>pong</kbd></dt><dd>Play Pong</dd>
                <dt>Konami</dt><dd>Confetti</dd>
              </dl>
            </div>
          </div>
          <p class="shortcuts-foot">Right-click for the context menu. Click the logo 7× for a surprise.</p>
        </div>
      `;
      document.body.appendChild(overlay);
      const prevFocus = document.activeElement;
      const focusable = overlay.querySelectorAll('button, a, [tabindex]:not([tabindex="-1"])');
      requestAnimationFrame(() => {
        overlay.classList.add('show');
        focusable[0]?.focus();
      });
      const close = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
        removeEventListener('keydown', onKey);
        prevFocus?.focus?.();
      };
      function onKey(ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); close(); return; }
        // Focus trap inside the dialog
        if (ev.key === 'Tab' && focusable.length) {
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
          else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
        }
      }
      overlay.querySelector('.shortcuts-close').addEventListener('click', close);
      overlay.querySelector('.shortcuts-backdrop').addEventListener('click', close);
      addEventListener('keydown', onKey);
    });

    /* ----- 13. Scroll progress sidebar with section labels ----- */
    function mountScrollDots() {
      if (document.querySelector('.scroll-dots')) return;
      const sections = [...document.querySelectorAll('main > section[id], main > aside[aria-label]')];
      if (!sections.length) return;
      const dots = document.createElement('nav');
      dots.className = 'scroll-dots';
      dots.setAttribute('aria-label', 'Section navigation');
      dots.innerHTML = sections.map(s => {
        const label = s.querySelector('h1, h2, h3')?.textContent.trim().slice(0, 30) ||
                      s.getAttribute('aria-label') || s.id;
        return `<a href="#${s.id}" data-target="${s.id}" aria-label="${label}"><span class="dot"></span><span class="dot-label">${label}</span></a>`;
      }).join('');
      document.body.appendChild(dots);
      // Active state on scroll
      const dotMap = new Map([...dots.querySelectorAll('a')].map(a => [a.dataset.target, a]));
      const obs = new IntersectionObserver((entries) => {
        entries.forEach(en => {
          const a = dotMap.get(en.target.id);
          if (!a) return;
          if (en.isIntersecting) {
            dots.querySelectorAll('a').forEach(x => x.classList.remove('active'));
            a.classList.add('active');
          }
        });
      }, { rootMargin: '-30% 0px -50% 0px' });
      sections.forEach(s => obs.observe(s));
      // Smooth scroll on click
      dots.addEventListener('click', (e) => {
        const a = e.target.closest('a'); if (!a) return;
        e.preventDefault();
        smoothNav('#' + a.dataset.target);
      });
    }
    setTimeout(mountScrollDots, 800);

    /* ----- 14. Stat count-up animation ----- */
    const countUpObs = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        const target = parseFloat(el.dataset.count);
        if (!target || el.dataset.counted) return;
        el.dataset.counted = '1';
        const dur = 1200;
        const start = performance.now();
        function step(now) {
          const t = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(target * eased);
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        countUpObs.unobserve(el);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('[data-count]').forEach(el => countUpObs.observe(el));

    /* ----- 15. 3D mouse-tracking on project tiles — depth tilt + cursor
       glare + dynamic shadow. The single source of truth for card 3D
       (applyTilt above is a no-op). Pointer-only via the delight-layer gate;
       reduced-motion users never reach this block. ----- */
    const tiltFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    document.querySelectorAll('.project').forEach(tile => {
      if (tile.dataset.mouseTilt) return;
      tile.dataset.mouseTilt = '1';
      if (!tiltFine) return;            // touch / no-hover: keep flat cards
      tile.style.transformStyle = 'preserve-3d';
      let glare = tile.querySelector('.project-glare');
      if (!glare) {
        glare = document.createElement('span');
        glare.className = 'project-glare';
        glare.setAttribute('aria-hidden', 'true');
        tile.appendChild(glare);
      }
      let raf = 0;
      tile.addEventListener('mousemove', (e) => {
        const r = tile.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        const rx = (py - 0.5) * -10;
        const ry = (px - 0.5) * 14;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          tile.style.transform = `perspective(1400px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px) scale(1.012)`;
          tile.style.boxShadow = `${-ry * 1.5}px ${(12 - rx) * 1.5}px 40px rgba(0,0,0,0.45)`;
          const visual = tile.querySelector('.project-visual');
          if (visual) visual.style.transform = `translateZ(20px) scale(1.05)`;
          glare.style.setProperty('--gx', `${px * 100}%`);
          glare.style.setProperty('--gy', `${py * 100}%`);
          glare.style.opacity = '1';
        });
      });
      tile.addEventListener('mouseleave', () => {
        if (raf) cancelAnimationFrame(raf);
        tile.style.transform = '';
        tile.style.boxShadow = '';
        glare.style.opacity = '0';
        const visual = tile.querySelector('.project-visual');
        if (visual) visual.style.transform = '';
      });
    });

    /* ----- 16. Logo 7-click easter egg ----- */
    const logo = document.querySelector('.logo');
    if (logo) {
      let logoClicks = 0;
      let logoTimer = null;
      logo.addEventListener('click', (e) => {
        logoClicks++;
        clearTimeout(logoTimer);
        logoTimer = setTimeout(() => { logoClicks = 0; }, 2500);
        if (logoClicks >= 7) {
          e.preventDefault();
          logoClicks = 0;
          burstConfetti({ count: 80, origin: { x: 80, y: 60 } });
          announce('Logo easter egg unlocked');
          const card = document.createElement('div');
          card.className = 'logo-easter';
          card.innerHTML = `<strong>Hi.</strong> You found it. Solo builders notice each other. <em>— Abedin.</em>`;
          document.body.appendChild(card);
          requestAnimationFrame(() => card.classList.add('show'));
          setTimeout(() => { card.classList.remove('show'); setTimeout(() => card.remove(), 400); }, 4500);
        }
      });
    }

    /* ----- 18. Magnetic letter physics on the hero H1 ----- */
    (function() {
      const lines = document.querySelectorAll('.hero-title .line');
      if (!lines.length) return;
      // Split each line into individual character spans (preserving inner tags)
      lines.forEach(line => {
        if (line.dataset.split) return;
        line.dataset.split = '1';
        function splitNode(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            const txt = node.textContent;
            const frag = document.createDocumentFragment();
            for (const ch of txt) {
              if (ch === ' ') { frag.appendChild(document.createTextNode(' ')); continue; }
              const s = document.createElement('span');
              s.className = 'h1-ch';
              s.textContent = ch;
              s.style.display = 'inline-block';
              s.style.willChange = 'transform';
              s.style.transition = 'transform 0.4s cubic-bezier(.34,1.56,.64,1)';
              frag.appendChild(s);
            }
            node.parentNode.replaceChild(frag, node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            [...node.childNodes].forEach(splitNode);
          }
        }
        splitNode(line);
      });
      // Magnetic pull on each char
      let chars = document.querySelectorAll('.h1-ch');
      addEventListener('mousemove', (e) => {
        chars.forEach(ch => {
          const r = ch.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const dx = e.clientX - cx;
          const dy = e.clientY - cy;
          const dist = Math.hypot(dx, dy);
          if (dist < 120) {
            const force = (1 - dist / 120) * 8;
            const angle = Math.atan2(dy, dx);
            const tx = -Math.cos(angle) * force;
            const ty = -Math.sin(angle) * force;
            ch.style.transform = `translate(${tx}px, ${ty}px)`;
          } else {
            ch.style.transform = '';
          }
        });
      }, { passive: true });
    })();

    /* ----- 19. Audio visualizer — analyzer on the music output ----- */
    (function() {
      const liveMusic = document.querySelector('#live-music');
      if (!liveMusic) return;
      // Insert a small bar visualizer into the live-music cell
      const viz = document.createElement('span');
      viz.className = 'audio-viz';
      viz.setAttribute('aria-hidden', 'true');
      viz.innerHTML = Array(8).fill('<span class="bar"></span>').join('');
      liveMusic.appendChild(viz);
      // Animate the bars only when music is actually playing
      let rafViz;
      function tickViz() {
        const isPlaying = document.querySelector('#nav-music')?.classList.contains('playing');
        viz.classList.toggle('on', isPlaying);
        rafViz = requestAnimationFrame(tickViz);
      }
      rafViz = requestAnimationFrame(tickViz);
    })();

    /* ----- 20. Sticker collection corner — REMOVED 2026-06-05.
       The floating "UNLOCKED 10/12" widget covered filter buttons, the
       colophon heading, and pricing-card copy in multiple viewports. The
       achievement state is preserved in localStorage and still rendered
       quietly inside the colophon XP widget; only the float is gone. */

    /* ----- 21. Custom cursor variations — already partial, enrich ----- */
    if (cursor) {
      document.querySelectorAll('.snake-wrap, canvas').forEach(el => {
        el.addEventListener('mouseenter', () => cursor.classList.add('cursor-play'));
        el.addEventListener('mouseleave', () => cursor.classList.remove('cursor-play'));
      });
      document.querySelectorAll('.faq-item').forEach(el => {
        el.addEventListener('mouseenter', () => cursor.dataset.label = el.classList.contains('open') ? '–' : '+');
      });
    }

    /* ----- 22. Mobile haptic feedback on key interactions ----- */
    if ('vibrate' in navigator) {
      document.addEventListener('click', (e) => {
        if (e.target.closest('.hero-cta-primary, .package-cta, .cs-cta-primary, .nav-cta')) {
          try { navigator.vibrate(8); } catch {}
        }
      });
    }

    /* ----- 23. Parallax depth on hero blobs based on scroll ----- */
    (function() {
      const blobs = document.querySelectorAll('.hero-blob');
      if (!blobs.length) return;
      let ticking = false;
      addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = scrollY;
          blobs.forEach((b, i) => {
            const speed = 0.15 + i * 0.08;
            b.style.transform = `translateY(${y * speed}px)`;
          });
          ticking = false;
        });
      }, { passive: true });
    })();

    /* ----- 27. Multi-theme picker — REMOVED 2026-06-07.
       The synthwave/forest/sunset themes tinted the entire site with a heavy
       color filter and persisted via localStorage; visitors got stuck in them
       without realizing why ("why does the whole site look orange?"). The
       nav button's plain light/dark toggle (top of file) is all that remains. */

    /* ----- 28. Floating mascot — a lazy cube that drifts toward the cursor ----- */
    (function() {
      if (window.matchMedia('(pointer: coarse)').matches) return;
      const mascot = document.createElement('div');
      mascot.className = 'mascot';
      mascot.setAttribute('aria-hidden', 'true');
      mascot.title = 'A small mascot. Click for a boop.';
      mascot.innerHTML = `
        <svg viewBox="0 0 60 60" width="46" height="46">
          <defs><linearGradient id="mascot-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ff6b35"/><stop offset="1" stop-color="#65d57a"/>
          </linearGradient></defs>
          <rect x="6" y="6" width="48" height="48" rx="12" fill="url(#mascot-g)"/>
          <circle class="m-eye-l" cx="22" cy="28" r="3" fill="#0d0d0d"/>
          <circle class="m-eye-r" cx="38" cy="28" r="3" fill="#0d0d0d"/>
          <path class="m-smile" d="M22 40 Q30 46 38 40" stroke="#0d0d0d" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        </svg>
      `;
      document.body.appendChild(mascot);
      let mx = innerWidth - 180, my = innerHeight - 180;
      let mascotX = mx, mascotY = my;
      let target = { x: mx, y: my };
      // Mascot loiters in bottom-right but drifts slowly toward cursor when it's nearby
      addEventListener('mousemove', (e) => {
        target.x = Math.max(40, Math.min(innerWidth - 60, e.clientX - 80));
        target.y = Math.max(40, Math.min(innerHeight - 60, e.clientY - 80));
      }, { passive: true });
      function loop() {
        mascotX += (target.x - mascotX) * 0.018;
        mascotY += (target.y - mascotY) * 0.018;
        mascot.style.transform = `translate(${mascotX}px, ${mascotY}px)`;
        requestAnimationFrame(loop);
      }
      loop();
      mascot.addEventListener('click', () => {
        mascot.classList.add('boop');
        setTimeout(() => mascot.classList.remove('boop'), 500);
        burstConfetti({ count: 24, origin: { x: mascotX + 23, y: mascotY + 23 } });
        announce('Mascot booped');
        fxTick(880, 0.08); fxTick(1100, 0.06);
      });
      // Mascot blinks every few seconds
      setInterval(() => {
        mascot.classList.add('blink');
        setTimeout(() => mascot.classList.remove('blink'), 200);
      }, 4500 + Math.random() * 3000);
    })();

    /* ----- 29. Scroll-progress orb in corner ----- */
    (function() {
      const orb = document.createElement('button');
      orb.type = 'button';
      orb.className = 'scroll-orb';
      // a11y (audit round 3): proper button, keyboard-accessible, label + value
      orb.setAttribute('aria-label', 'Scroll progress. Click to scroll to top.');
      orb.setAttribute('aria-valuenow', '0');
      orb.setAttribute('aria-valuemin', '0');
      orb.setAttribute('aria-valuemax', '100');
      orb.setAttribute('role', 'progressbar');
      orb.innerHTML = `
        <svg viewBox="0 0 60 60" width="48" height="48">
          <circle cx="30" cy="30" r="26" stroke="var(--cream-line-strong)" stroke-width="3" fill="none"/>
          <circle class="orb-prog" cx="30" cy="30" r="26" stroke="var(--orange)" stroke-width="3" fill="none"
            stroke-dasharray="163.4" stroke-dashoffset="163.4" transform="rotate(-90 30 30)" stroke-linecap="round"/>
          <text class="orb-pct" x="30" y="35" text-anchor="middle" font-family="var(--mono)" font-size="12" font-weight="600" fill="var(--ink)">0%</text>
        </svg>
      `;
      document.body.appendChild(orb);
      const prog = orb.querySelector('.orb-prog');
      const pct = orb.querySelector('.orb-pct');
      addEventListener('scroll', () => {
        const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        const r = Math.min(1, scrollY / max);
        const pctNum = Math.round(r * 100);
        prog.style.strokeDashoffset = (163.4 * (1 - r)).toFixed(1);
        pct.textContent = pctNum + '%';
        orb.setAttribute('aria-valuenow', String(pctNum));
        // Bottom-of-page celebration
        if (r >= 0.98 && !orb.dataset.celebrated) {
          orb.dataset.celebrated = '1';
          burstConfetti({ count: 80, colors: ['#65d57a', '#ff6b35', '#4a7bff'], origin: { x: innerWidth / 2, y: innerHeight - 50 } });
          announce('You reached the bottom. Respect.');
        }
      }, { passive: true });
      orb.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    })();

    /* ----- 30. Conway's Game of Life — type 'life' in terminal ----- */
    if (termInput && termBody) {
      termInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const v = termInput.value.trim().toLowerCase();
        if (v !== 'life') return;
        setTimeout(() => {
          const lns = [...termBody.querySelectorAll('.ln-err')];
          const last = lns[lns.length - 1];
          if (last) last.remove();
          startLife(termBody);
        }, 50);
      });
    }
    function startLife(host) {
      const wrap = document.createElement('div');
      wrap.className = 'snake-wrap';
      const COLS = 32, ROWS = 18, CELL = 10;
      const c = document.createElement('canvas');
      c.width = COLS * CELL; c.height = ROWS * CELL;
      c.style.cssText = 'display:block;margin:8px auto;border:1px solid var(--cream-line);border-radius:6px;background:#0a0a0a;image-rendering:pixelated';
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', "Conway's Game of Life. Click cells to seed live cells. The simulation evolves automatically.");
      c.tabIndex = 0;
      wrap.appendChild(c);
      const meta = document.createElement('div');
      meta.style.cssText = 'font-family:var(--mono);font-size:11px;text-align:center;margin-top:6px;color:var(--on-dark-muted)';
      meta.innerHTML = "conway's game of life — gen <span id='life-gen'>0</span> · <a href='#' id='life-quit' style='color:var(--orange)'>quit</a>";
      wrap.appendChild(meta);
      host.appendChild(wrap);
      host.scrollTop = host.scrollHeight;
      const ctx = c.getContext('2d');
      let grid = Array.from({length: ROWS}, () => Array.from({length: COLS}, () => Math.random() < 0.3 ? 1 : 0));
      let gen = 0;
      function step() {
        const next = Array.from({length: ROWS}, () => Array(COLS).fill(0));
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          let n = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const rr = (r + dr + ROWS) % ROWS, cc = (c + dc + COLS) % COLS;
            n += grid[rr][cc];
          }
          if (grid[r][c] && (n === 2 || n === 3)) next[r][c] = 1;
          else if (!grid[r][c] && n === 3) next[r][c] = 1;
        }
        grid = next;
        gen++;
        draw();
      }
      function draw() {
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, c.width, c.height);
        for (let r = 0; r < ROWS; r++) for (let cl = 0; cl < COLS; cl++) {
          if (grid[r][cl]) {
            ctx.fillStyle = `hsl(${(r * 10 + cl * 5 + gen) % 360}, 70%, 60%)`;
            ctx.fillRect(cl * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
          }
        }
        document.getElementById('life-gen').textContent = gen;
      }
      draw();
      const timer = setInterval(step, 120);
      // Click to toggle cells
      c.addEventListener('click', (e) => {
        const r = c.getBoundingClientRect();
        const cl = Math.floor((e.clientX - r.left) / CELL);
        const rw = Math.floor((e.clientY - r.top) / CELL);
        if (rw >= 0 && rw < ROWS && cl >= 0 && cl < COLS) {
          grid[rw][cl] = grid[rw][cl] ? 0 : 1;
          draw();
        }
      });
      meta.querySelector('#life-quit').addEventListener('click', (ev) => {
        ev.preventDefault();
        clearInterval(timer);
        wrap.remove();
      });
    }

    /* ----- 31. Flappy game in terminal — type "flap" ----- */
    if (termInput && termBody) {
      termInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const v = termInput.value.trim().toLowerCase();
        if (v !== 'flap' && v !== 'flappy') return;
        setTimeout(() => {
          const lns = [...termBody.querySelectorAll('.ln-err')];
          const last = lns[lns.length - 1];
          if (last) last.remove();
          startFlappy(termBody);
        }, 50);
      });
    }
    function startFlappy(host) {
      const wrap = document.createElement('div');
      wrap.className = 'snake-wrap';
      const W = 360, H = 200;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.style.cssText = 'display:block;margin:8px auto;border:1px solid var(--cream-line);border-radius:6px;background:#5ec6e8;cursor:pointer';
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', 'Flappy bird game. Press space or click to flap.');
      c.tabIndex = 0;
      wrap.appendChild(c);
      const meta = document.createElement('div');
      meta.style.cssText = 'font-family:var(--mono);font-size:11px;text-align:center;margin-top:6px;color:var(--on-dark-muted)';
      meta.innerHTML = 'flappy — click or space to flap · score <span id="flap-score">0</span> · <a href="#" id="flap-quit" style="color:var(--orange)">quit</a>';
      wrap.appendChild(meta);
      host.appendChild(wrap);
      host.scrollTop = host.scrollHeight;
      const ctx = c.getContext('2d');
      let bird = { y: H / 2, v: 0 };
      let pipes = [];
      let score = 0, dead = false, raf;
      const G = 0.32, FLAP = -5, PIPE_GAP = 70, PIPE_W = 40, PIPE_SPACING = 140;
      function spawnPipe(x) {
        const top = 30 + Math.random() * (H - PIPE_GAP - 60);
        pipes.push({ x, top, scored: false });
      }
      spawnPipe(W + 50);
      spawnPipe(W + 50 + PIPE_SPACING);
      function flap() {
        if (dead) { bird = { y: H/2, v: 0 }; pipes = []; spawnPipe(W + 50); spawnPipe(W + 50 + PIPE_SPACING); score = 0; dead = false; document.getElementById('flap-score').textContent = '0'; loop(); return; }
        bird.v = FLAP;
        fxTick(780, 0.03);
      }
      function loop() {
        if (dead) return;
        bird.v += G; bird.y += bird.v;
        pipes.forEach(p => p.x -= 1.8);
        pipes = pipes.filter(p => p.x > -PIPE_W);
        if (pipes[pipes.length - 1].x < W - PIPE_SPACING) spawnPipe(W + 10);
        // Score
        pipes.forEach(p => {
          if (!p.scored && p.x + PIPE_W < 60) { p.scored = true; score++; document.getElementById('flap-score').textContent = score; fxTick(1100, 0.04); }
        });
        // Collision
        if (bird.y < 0 || bird.y > H) dead = true;
        pipes.forEach(p => {
          if (p.x < 80 && p.x + PIPE_W > 50 && (bird.y < p.top || bird.y > p.top + PIPE_GAP)) dead = true;
        });
        // Draw sky
        ctx.fillStyle = '#5ec6e8'; ctx.fillRect(0, 0, W, H);
        // Pipes
        ctx.fillStyle = '#2fa84a';
        pipes.forEach(p => {
          ctx.fillRect(p.x, 0, PIPE_W, p.top);
          ctx.fillRect(p.x, p.top + PIPE_GAP, PIPE_W, H - p.top - PIPE_GAP);
        });
        // Bird
        ctx.fillStyle = '#ffd166';
        ctx.beginPath(); ctx.arc(60, bird.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath(); ctx.arc(64, bird.y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
        if (dead) {
          ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#ff6b35'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
          ctx.fillText('GAME OVER · ' + score, W/2, H/2);
          ctx.fillStyle = '#f3eed9'; ctx.font = '11px monospace';
          ctx.fillText('click or space to retry', W/2, H/2 + 18);
        }
        if (!dead) raf = requestAnimationFrame(loop);
      }
      c.addEventListener('click', flap);
      function onSpace(e) {
        if (e.code === 'Space') { e.preventDefault(); flap(); }
      }
      addEventListener('keydown', onSpace);
      meta.querySelector('#flap-quit').addEventListener('click', (ev) => {
        ev.preventDefault();
        cancelAnimationFrame(raf);
        removeEventListener('keydown', onSpace);
        wrap.remove();
      });
      raf = requestAnimationFrame(loop);
    }

    /* ----- 32. Doodle mode — press D to toggle drawing on the page ----- */
    (function() {
      if (window.matchMedia('(pointer: coarse)').matches) return;   // skip touch
      let doodleOn = false;
      let canvas, ctx;
      let drawing = false, lastX, lastY;
      function ensure() {
        if (canvas) return;
        canvas = document.createElement('canvas');
        canvas.className = 'doodle-canvas';
        canvas.setAttribute('aria-hidden', 'true');   // decorative — a11y (audit round 2)
        canvas.width = innerWidth; canvas.height = innerHeight;
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        addEventListener('resize', () => {
          const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
          canvas.width = innerWidth; canvas.height = innerHeight;
          ctx.putImageData(data, 0, 0);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        });
      }
      function startStroke(e) {
        if (!doodleOn) return;
        drawing = true;
        lastX = e.clientX; lastY = e.clientY;
      }
      function moveStroke(e) {
        if (!doodleOn || !drawing) return;
        ctx.strokeStyle = ['#ff6b35', '#65d57a', '#4a7bff', '#a06cd5'][(Math.floor(performance.now() / 200)) % 4];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(e.clientX, e.clientY);
        ctx.stroke();
        lastX = e.clientX; lastY = e.clientY;
      }
      function endStroke() { drawing = false; }
      addEventListener('keydown', (e) => {
        if (e.key !== 'd' && e.key !== 'D') return;
        if (document.activeElement?.matches('input, textarea, [contenteditable]')) return;
        e.preventDefault();
        doodleOn = !doodleOn;
        if (doodleOn) {
          ensure();
          document.documentElement.classList.add('doodle-on');
          announce('Doodle mode on. Press D again to stop. Press X to clear.');
          showAchToast('Doodle mode unlocked');
          canvas.addEventListener('mousedown', startStroke);
          canvas.addEventListener('mousemove', moveStroke);
          canvas.addEventListener('mouseup', endStroke);
          canvas.addEventListener('mouseleave', endStroke);
        } else {
          document.documentElement.classList.remove('doodle-on');
          announce('Doodle mode off');
        }
      });
      addEventListener('keydown', (e) => {
        if ((e.key === 'x' || e.key === 'X') && doodleOn && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          announce('Doodle cleared');
        }
      });
    })();

    /* ----- 34. Engagement estimator — interactive price calculator ----- */
    (function() {
      const est = document.querySelector('#estimator');
      if (!est) return;
      const pills = est.querySelectorAll('.est-pill');
      const scope = est.querySelector('#est-scope');
      const rush = est.querySelector('#est-rush');
      const shapeVal = est.querySelector('#est-shape-val');
      const scopeVal = est.querySelector('#est-scope-val');
      const rushVal = est.querySelector('#est-rush-val');
      const priceOut = est.querySelector('#est-price');
      const timeOut = est.querySelector('#est-time');
      let state = { shape: 'mvp', base: 3500, scope: 1, rush: 1 };
      // Dhaka-based cost basis means prices range from low hundreds (audit)
      // to mid five-figures (custom build). Format must handle all three bands:
      //   $300, $1.5k, $18k — not "$0k" or "$1k" for a real $800 number.
      function fmt(n) {
        if (n >= 10000) return '$' + Math.round(n / 1000) + 'k';
        if (n >= 1000)  return '$' + (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return '$' + Math.round(n);
      }
      // Snap to a sensible round number for each band (no "$2k–$3k" for an
      // $800 base; no "$3.4k–$4.6k" for a $3500 base).
      function snap(n) {
        if (n >= 10000) return Math.round(n / 1000) * 1000;
        if (n >= 1000)  return Math.round(n / 100) * 100;
        return Math.round(n / 50) * 50;
      }
      function calc() {
        // Audit is a flat-fee on-ramp — fixed range, ignore scope/rush multipliers.
        if (state.shape === 'audit') {
          priceOut.textContent = '$300 – $500';
          priceOut.classList.add('flash');
          setTimeout(() => priceOut.classList.remove('flash'), 280);
          timeOut.textContent = '5 business days · written report + 1 call';
          return;
        }
        const total = state.base * state.scope * state.rush;
        const low = snap(total * 0.9);
        const high = snap(total * 1.3);
        const suffix = state.shape === 'retainer' ? ' / mo' : '';
        priceOut.textContent = `${fmt(low)}${suffix} – ${fmt(high)}${suffix}`;
        priceOut.classList.add('flash');
        setTimeout(() => priceOut.classList.remove('flash'), 280);
        const timelines = {
          mvp:      '4 weeks · fixed-price',
          widget:   '2–3 weeks · fixed-price',
          desktop:  '3–6 months · milestone billing',
          retainer: 'Month-to-month · cancel anytime'
        };
        timeOut.textContent = timelines[state.shape];
      }
      pills.forEach(p => p.addEventListener('click', () => {
        pills.forEach(o => { o.classList.remove('active'); o.setAttribute('aria-pressed', 'false'); });
        p.classList.add('active'); p.setAttribute('aria-pressed', 'true');
        state.shape = p.dataset.shape;
        state.base = +p.dataset.base;
        const labels = { audit: 'Audit', mvp: 'MVP', widget: 'Widget', desktop: 'Desktop app', retainer: 'Retainer / mo' };
        shapeVal.textContent = labels[state.shape];
        calc();
        fxTick(540, 0.04);
      }));
      function scopeName(v) {
        if (v < 0.85) return 'Tight';
        if (v < 1.2) return 'Medium';
        if (v < 1.5) return 'Large';
        return 'Sprawling';
      }
      function rushName(v) {
        if (v <= 1.02) return 'Normal';
        if (v < 1.2) return 'Hurry';
        return 'YESTERDAY';
      }
      scope.addEventListener('input', () => {
        state.scope = +scope.value;
        const label = scopeName(state.scope);
        scopeVal.textContent = label;
        scope.setAttribute('aria-valuetext', label);   // a11y (audit round 2)
        calc();
      });
      rush.addEventListener('input', () => {
        state.rush = +rush.value;
        const label = rushName(state.rush);
        rushVal.textContent = label;
        rush.setAttribute('aria-valuetext', label);    // a11y (audit round 2)
        calc();
      });
      scope.setAttribute('aria-valuetext', scopeName(+scope.value));
      rush.setAttribute('aria-valuetext', rushName(+rush.value));
      calc();
    })();

    /* ----- 35. Guestbook — localStorage-only visitor messages ----- */
    (function() {
      const form = document.querySelector('#guestbook-form');
      const list = document.querySelector('#guestbook-list');
      const empty = document.querySelector('#guestbook-empty');
      if (!form || !list) return;
      const KEY = 'abedin-guestbook';
      function load() {
        try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
      }
      function save(entries) {
        try { localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 30))); } catch {}
      }
      function timeAgo(ts) {
        const d = (Date.now() - ts) / 1000;
        if (d < 60) return 'just now';
        if (d < 3600) return Math.round(d / 60) + 'm ago';
        if (d < 86400) return Math.round(d / 3600) + 'h ago';
        return Math.round(d / 86400) + 'd ago';
      }
      function render() {
        const entries = load();
        if (entries.length === 0) {
          empty.style.display = 'block';
          return;
        }
        empty.style.display = 'none';
        list.innerHTML = entries.map(e => `
          <li class="guestbook-entry">
            <span class="guestbook-entry-name">${escapeHtml(e.name)}</span>
            <span class="guestbook-entry-when">${timeAgo(e.t)}</span>
            <div class="guestbook-entry-msg">${escapeHtml(e.msg)}</div>
          </li>
        `).join('');
      }
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = form.name.value.trim().slice(0, 30);
        const msg = form.msg.value.trim().slice(0, 140);
        if (!name || !msg) return;
        const entries = load();
        entries.unshift({ name, msg, t: Date.now() });
        save(entries);
        form.name.value = '';
        form.msg.value = '';
        render();
        burstConfetti({ count: 24, origin: { x: form.getBoundingClientRect().left + 60, y: form.getBoundingClientRect().top + 20 } });
        announce('Note added to guestbook');
      });
      render();
    })();

    /* ----- 36. Time-of-day theme suggestion — REMOVED 2026-06-07.
       This was the main funnel pushing visitors into the (now removed)
       Sunset/Synthwave novelty themes. */

    /* ----- 37. Whack-a-mole in terminal — type "whack" ----- */
    if (termInput && termBody) {
      termInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const v = termInput.value.trim().toLowerCase();
        if (v !== 'whack') return;
        setTimeout(() => {
          const lns = [...termBody.querySelectorAll('.ln-err')];
          const last = lns[lns.length - 1];
          if (last) last.remove();
          startWhack(termBody);
        }, 50);
      });
    }
    function startWhack(host) {
      const wrap = document.createElement('div');
      wrap.className = 'snake-wrap';
      wrap.style.cssText = 'padding:8px;text-align:center';
      const meta = document.createElement('div');
      meta.style.cssText = 'font-family:var(--mono);font-size:11px;color:var(--on-dark-muted);margin-bottom:8px';
      meta.innerHTML = 'whack-a-mole — click the orange · 30s · score <span id="whack-s">0</span> · time <span id="whack-t">30</span>s · <a href="#" id="whack-q" style="color:var(--orange)">quit</a>';
      wrap.appendChild(meta);
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:200px;margin:0 auto';
      for (let i = 0; i < 9; i++) {
        const h = document.createElement('button');
        h.style.cssText = 'aspect-ratio:1;background:#0a0a0a;border:1px solid var(--cream-line);border-radius:6px;cursor:pointer;font-size:18px;color:transparent;transition:all 0.1s';
        h.dataset.i = i;
        grid.appendChild(h);
      }
      wrap.appendChild(grid);
      host.appendChild(wrap);
      host.scrollTop = host.scrollHeight;
      let score = 0, time = 30, current = -1;
      const sEl = document.getElementById('whack-s'), tEl = document.getElementById('whack-t');
      function spawn() {
        if (current >= 0) {
          const prev = grid.children[current];
          prev.style.background = '#0a0a0a';
          prev.style.color = 'transparent';
        }
        current = Math.floor(Math.random() * 9);
        const cell = grid.children[current];
        cell.style.background = '#ff6b35';
        cell.style.color = '#0d0d0d';
        cell.textContent = '◉';
      }
      grid.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (+b.dataset.i === current) {
          score++;
          sEl.textContent = score;
          fxTick(880, 0.05);
          spawn();
        } else {
          score = Math.max(0, score - 1);
          sEl.textContent = score;
        }
      });
      const spawnTimer = setInterval(spawn, 900);
      const tickTimer = setInterval(() => {
        time--;
        tEl.textContent = time;
        if (time <= 0) {
          clearInterval(spawnTimer); clearInterval(tickTimer);
          grid.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:var(--orange);font-family:var(--mono)">Final score: <strong>${score}</strong></div>`;
        }
      }, 1000);
      spawn();
      meta.querySelector('#whack-q').addEventListener('click', (ev) => {
        ev.preventDefault();
        clearInterval(spawnTimer); clearInterval(tickTimer);
        wrap.remove();
      });
    }

    /* ----- 33. Voice search in cmdk (if Web Speech API available) ----- */
    (function() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;
      const cmdkInput = document.querySelector('#cmdk-input');
      const cmdkInputRow = document.querySelector('.cmdk-input-row');
      if (!cmdkInput || !cmdkInputRow) return;
      const mic = document.createElement('button');
      mic.type = 'button';
      mic.className = 'cmdk-mic';
      mic.setAttribute('aria-label', 'Voice search');
      mic.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><line x1="12" y1="18" x2="12" y2="22"/></svg>';
      cmdkInputRow.insertBefore(mic, cmdkInputRow.lastElementChild);
      let rec = null, listening = false;
      mic.addEventListener('click', () => {
        if (listening) {
          rec?.stop();
          return;
        }
        rec = new SR();
        rec.lang = 'en-US';
        rec.continuous = false;
        rec.interimResults = true;
        rec.onresult = (e) => {
          const txt = e.results[0][0].transcript;
          cmdkInput.value = txt;
          cmdkInput.dispatchEvent(new Event('input'));
        };
        rec.onstart = () => { listening = true; mic.classList.add('listening'); announce('Listening — speak your search'); };
        rec.onend = () => { listening = false; mic.classList.remove('listening'); };
        rec.onerror = () => { listening = false; mic.classList.remove('listening'); };
        rec.start();
      });
    })();

    /* ----- Update terminal help to list the new games ----- */

    /* ----- 25. Background particle canvas — constellation field ----- */
    (function() {
      if (window.matchMedia('(pointer: coarse)').matches) return;   // skip on touch
      const canvas = document.createElement('canvas');
      canvas.className = 'particle-canvas';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      let w, h;
      function resize() { w = canvas.width = innerWidth; h = canvas.height = innerHeight; }
      resize();
      addEventListener('resize', resize);
      const PARTICLE_COUNT = 60;
      const particles = Array.from({length: PARTICLE_COUNT}, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1 + Math.random() * 1.5,
      }));
      let mx = -1000, my = -1000;
      addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
      function tick() {
        ctx.clearRect(0, 0, w, h);
        const dark = document.documentElement.dataset.theme === 'dark';
        const color = dark ? 'rgba(243,238,217,' : 'rgba(13,13,13,';
        ctx.fillStyle = color + '0.5)';
        particles.forEach(p => {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 0 || p.x > w) p.vx *= -1;
          if (p.y < 0 || p.y > h) p.vy *= -1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        });
        // Connect nearby particles
        ctx.strokeStyle = color + '0.12)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i], b = particles[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 110) {
              ctx.globalAlpha = 1 - d / 110;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
          // Connect to cursor
          const dc = Math.hypot(particles[i].x - mx, particles[i].y - my);
          if (dc < 150) {
            ctx.strokeStyle = 'rgba(255,107,53,' + (1 - dc / 150) * 0.4 + ')';
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(mx, my);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        requestAnimationFrame(tick);
      }
      tick();
    })();

    /* ----- 26. Live viewer ticker — REMOVED 2026-06-05.
       Growth-hack theater on a solo consultant's site undercuts trust;
       drifting fake viewer counts read as fake. Replaced with nothing. */

    /* ----- 24. Double-click anywhere = playful confused sticker ----- */
    let dblWarned = false;
    document.addEventListener('dblclick', (e) => {
      if (e.target.closest('input, textarea, [contenteditable]')) return;
      if (dblWarned) return;
      dblWarned = true;
      setTimeout(() => { dblWarned = false; }, 4000);
      const tag = document.createElement('span');
      tag.className = 'dbl-tag';
      tag.textContent = ['why?', 'noticed.', 'patience.', 'easy now.', '👀'][Math.floor(Math.random() * 5)];
      tag.style.left = e.clientX + 'px';
      tag.style.top = e.clientY + 'px';
      document.body.appendChild(tag);
      requestAnimationFrame(() => tag.classList.add('show'));
      setTimeout(() => { tag.classList.remove('show'); setTimeout(() => tag.remove(), 400); }, 1600);
    });

    /* ----- 17. Pong + Tetris-mini games in the terminal ----- */
    if (termInput && termBody) {
      termInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const v = termInput.value.trim().toLowerCase();
        if (v === 'pong') {
          setTimeout(() => {
            const lns = [...termBody.querySelectorAll('.ln-err')];
            const last = lns[lns.length - 1];
            if (last && last.textContent.toLowerCase().includes('pong')) last.remove();
            startPong(termBody);
          }, 50);
        } else if (v === 'tetris' || v === 'arcade') {
          setTimeout(() => {
            const lns = [...termBody.querySelectorAll('.ln-err')];
            const last = lns[lns.length - 1];
            if (last) last.remove();
            const arcadeMsg = document.createElement('span');
            arcadeMsg.className = 'ln ln-ok';
            arcadeMsg.innerHTML = '→ Opening arcade in a new tab… <a href="./arcade.html" target="_blank" class="ln-link">/arcade.html ↗</a>';
            termBody.appendChild(arcadeMsg);
            setTimeout(() => window.open('./arcade.html', '_blank'), 600);
          }, 50);
        }
      });
    }
    function startPong(host) {
      const wrap = document.createElement('div');
      wrap.className = 'snake-wrap';
      const W = 280, H = 160;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      c.style.cssText = 'display:block;margin:8px auto;border:1px solid var(--cream-line);border-radius:6px;background:#0a0a0a';
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', 'Pong game. Use W and S keys to move your paddle up and down.');
      c.tabIndex = 0;
      wrap.appendChild(c);
      const meta = document.createElement('div');
      meta.style.cssText = 'font-family:var(--mono);font-size:11px;text-align:center;margin-top:6px;color:var(--on-dark-muted)';
      meta.innerHTML = 'pong — w/s = up/down · <span id="pong-score">0 - 0</span> · <a href="#" id="pong-quit" style="color:var(--orange)">quit</a>';
      wrap.appendChild(meta);
      host.appendChild(wrap);
      host.scrollTop = host.scrollHeight;
      const ctx = c.getContext('2d');
      const paddleH = 36, paddleW = 4;
      let p1y = H/2 - paddleH/2, p2y = H/2 - paddleH/2;
      let bx = W/2, by = H/2, vx = 2.5, vy = 1.5;
      let s1 = 0, s2 = 0;
      let up = false, down = false;
      function loop() {
        // Player paddle
        if (up) p1y -= 3;
        if (down) p1y += 3;
        p1y = Math.max(0, Math.min(H - paddleH, p1y));
        // AI paddle
        const target = by - paddleH/2 + (Math.random() - 0.5) * 30;
        if (Math.abs(target - p2y) > 2) p2y += target > p2y ? 1.8 : -1.8;
        p2y = Math.max(0, Math.min(H - paddleH, p2y));
        // Ball
        bx += vx; by += vy;
        if (by <= 0 || by >= H) vy *= -1;
        // Paddle bounce
        if (bx <= paddleW + 6 && by >= p1y && by <= p1y + paddleH) { vx = Math.abs(vx) * 1.05; fxTick(660, 0.04); }
        if (bx >= W - paddleW - 6 && by >= p2y && by <= p2y + paddleH) { vx = -Math.abs(vx) * 1.05; fxTick(660, 0.04); }
        // Score
        if (bx < 0) { s2++; reset(); document.getElementById('pong-score').textContent = `${s1} - ${s2}`; }
        if (bx > W) { s1++; reset(); document.getElementById('pong-score').textContent = `${s1} - ${s2}`; }
        // Draw
        ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#65d57a'; ctx.fillRect(4, p1y, paddleW, paddleH);
        ctx.fillStyle = '#ff6b35'; ctx.fillRect(W - 8, p2y, paddleW, paddleH);
        ctx.fillStyle = '#f3eed9'; ctx.fillRect(bx - 2, by - 2, 4, 4);
        // Center line
        ctx.fillStyle = 'rgba(243,238,217,0.15)';
        for (let y = 0; y < H; y += 8) ctx.fillRect(W/2 - 1, y, 2, 4);
        if (raf) raf = requestAnimationFrame(loop);
      }
      function reset() { bx = W/2; by = H/2; vx = (Math.random() > 0.5 ? 1 : -1) * 2.5; vy = (Math.random() - 0.5) * 3; }
      let raf = requestAnimationFrame(loop);
      function onKey(e) {
        if (!document.body.contains(c)) { removeEventListener('keydown', onKey); removeEventListener('keyup', offKey); return; }
        if (document.activeElement?.matches('input, textarea, [contenteditable]')) return;
        if (e.key === 'w' || e.key === 'ArrowUp') { up = true; e.preventDefault(); }
        if (e.key === 's' || e.key === 'ArrowDown') { down = true; e.preventDefault(); }
      }
      function offKey(e) {
        if (e.key === 'w' || e.key === 'ArrowUp') up = false;
        if (e.key === 's' || e.key === 'ArrowDown') down = false;
      }
      addEventListener('keydown', onKey);
      addEventListener('keyup', offKey);
      meta.querySelector('#pong-quit').addEventListener('click', (ev) => {
        ev.preventDefault();
        cancelAnimationFrame(raf); raf = null;
        removeEventListener('keydown', onKey);
        removeEventListener('keyup', offKey);
        wrap.remove();
      });
    }

    /* ----- 10. Right-click custom context menu ----- */
    const ctxMenu = document.createElement('nav');
    ctxMenu.className = 'ctx-menu';
    ctxMenu.setAttribute('role', 'menu');
    ctxMenu.innerHTML = `
      <button data-ctx="top" role="menuitem">Scroll to top</button>
      <button data-ctx="pricing" role="menuitem">Jump to pricing</button>
      <button data-ctx="contact" role="menuitem">Jump to contact</button>
      <hr/>
      <button data-ctx="copy" role="menuitem">Copy email</button>
      <button data-ctx="cmdk" role="menuitem">Open command palette</button>
      <button data-ctx="theme" role="menuitem">Toggle theme</button>
      <hr/>
      <span class="ctx-menu-hint">Right-click anywhere for this menu · default menu: Shift+RC</span>
    `;
    document.body.appendChild(ctxMenu);
    document.addEventListener('contextmenu', (e) => {
      if (e.shiftKey) return;   // pass through native menu on shift+right-click
      // Don't override on editable elements
      if (e.target.matches('input, textarea, [contenteditable]')) return;
      e.preventDefault();
      const x = Math.min(e.clientX, innerWidth - 240);
      const y = Math.min(e.clientY, innerHeight - 260);
      ctxMenu.style.cssText = `left:${x}px;top:${y}px`;
      ctxMenu.classList.add('open');
    });
    document.addEventListener('click', () => ctxMenu.classList.remove('open'));
    // a11y (audit round 2): Escape closes context menu
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ctxMenu.classList.contains('open')) {
        ctxMenu.classList.remove('open');
      }
    });
    ctxMenu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ctx]'); if (!b) return;
      const act = b.dataset.ctx;
      if (act === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      else if (act === 'pricing') smoothNav('#pricing');
      else if (act === 'contact') smoothNav('#contact');
      else if (act === 'copy') navigator.clipboard?.writeText('abedinminhazul12@gmail.com').then(() => announce('Email copied'));
      else if (act === 'cmdk') document.querySelector('#cmdk-trigger')?.click();
      else if (act === 'theme') document.querySelector('#nav-theme')?.click();
    });

  } /* end DELIGHT LAYER */

  /* ---- Service worker registration ---- */
  if ('serviceWorker' in navigator && !STATIC) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
