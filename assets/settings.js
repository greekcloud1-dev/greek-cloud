/* ==========================================================================
   GreekCloud — menu drawer
   ==========================================================================

   Owns navigation, language and theme. Accessibility preferences live in
   their own dedicated floating widget (a11y-widget.js), opened with Alt+A —
   split out on request so the two concerns don't compete for one button.

   Theme persists to localStorage and is replayed by the inline snippet in
   <head> before first paint, so a chosen theme never flashes the default on
   the way in.
   ========================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;
  var KEY_THEME = 'gc-theme';

  var host = document.querySelector('[data-settings-host]');
  if (!host) return;

  var isEn = (root.getAttribute('lang') || 'he').slice(0, 2) === 'en';

  var t = isEn ? {
    open: 'Menu', close: 'Close menu', title: 'Menu',
    navMain: 'Service', navRead: 'Learn', navCities: 'Destinations', navLegal: 'Legal',
    theme: 'Theme', system: 'System', light: 'Light', dark: 'Dark',
    lang: 'Language'
  } : {
    open: 'תפריט', close: 'סגירת התפריט', title: 'תפריט',
    navMain: 'השירות', navRead: 'מידע', navCities: 'יעדים', navLegal: 'משפטי',
    theme: 'ערכת נושא', system: 'מערכת', light: 'בהיר', dark: 'כהה',
    lang: 'שפה'
  };

  var NAV = isEn ? {
    main: [['/en/#how', 'How it works'], ['/en/#pricing', 'Pricing'],
           ['/en/intake.html', 'Check eligibility'], ['/en/#faq', 'FAQ']],
    read: [['/en/guide.html', 'The full guide'], ['/en/cannabis-in-greece.html', 'Cannabis in Greece'],
           ['/en/fly-with-cannabis.html', 'Flying with cannabis'], ['/en/cbd-in-greece.html', 'CBD in Greece']],
    cities: [['/en/athens.html', 'Athens'], ['/en/thessaloniki.html', 'Thessaloniki'],
             ['/en/crete.html', 'Crete'], ['/en/rhodes.html', 'Rhodes'], ['/en/kos.html', 'Kos'],
             ['/en/santorini.html', 'Santorini'], ['/en/mykonos.html', 'Mykonos'], ['/en/corfu.html', 'Corfu']],
    legal: [['/en/terms.html', 'Terms of use'], ['/en/privacy.html', 'Privacy policy'],
            ['/en/refund.html', 'Cancellations & refunds'], ['/en/accessibility.html', 'Accessibility']]
  } : {
    main: [['/#how', 'איך זה עובד'], ['/#pricing', 'מחירים'],
           ['/intake.html', 'בדיקת התאמה'], ['/#faq', 'שאלות נפוצות']],
    read: [['/guide.html', 'המדריך המלא'], ['/cannabis-in-greece.html', 'קנאביס ביוון'],
           ['/fly-with-cannabis.html', 'הטסת קנאביס'], ['/cbd-in-greece.html', 'CBD ביוון']],
    cities: [['/athens.html', 'אתונה'], ['/thessaloniki.html', 'סלוניקי'],
             ['/crete.html', 'כרתים'], ['/rhodes.html', 'רודוס'], ['/kos.html', 'קוס'],
             ['/santorini.html', 'סנטוריני'], ['/mykonos.html', 'מיקונוס'], ['/corfu.html', 'קורפו']],
    legal: [['/terms.html', 'תקנון ותנאי שימוש'], ['/privacy.html', 'מדיניות פרטיות'],
            ['/refund.html', 'ביטולים והחזרים'], ['/accessibility.html', 'הצהרת נגישות']]
  };

  /* ---------- theme ---------- */

  function currentTheme() {
    var s = root.getAttribute('data-theme');
    return (s === 'dark' || s === 'light') ? s : 'system';
  }
  function setTheme(v) {
    if (v === 'system') {
      root.removeAttribute('data-theme');
      try { localStorage.removeItem(KEY_THEME); } catch (e) {}
    } else {
      root.setAttribute('data-theme', v);
      try { localStorage.setItem(KEY_THEME, v); } catch (e) {}
    }
  }

  /* ---------- markup ---------- */

  // Normalised so the comparison survives either URL scheme: some hosts serve
  // /guide.html as written, others rewrite it to /guide. Stripping the
  // extension and any trailing slash makes both resolve to the same key.
  function pathKey(u) {
    return u.split('#')[0].replace(/\.html$/, '').replace(/\/$/, '') || '/';
  }

  function navList(items, cols) {
    var here = pathKey(location.pathname);
    return '<nav class="menu-nav' + (cols ? ' cols' : '') + '">' +
      items.map(function (i) {
        // Only whole-page links can be "the current page". An in-page anchor
        // such as /#pricing resolves to the same pathname, and marking all of
        // them would tell a screen-reader user they are on three pages at once.
        var isAnchor = i[0].indexOf('#') !== -1;
        var cur = (!isAnchor && pathKey(i[0]) === here) ? ' aria-current="page"' : '';
        return '<a href="' + i[0] + '"' + cur + '>' + i[1] + '</a>';
      }).join('') + '</nav>';
  }

  function seg(id, label, opts, attr) {
    return '<div class="menu-sec"><h3 id="' + id + '-h">' + label + '</h3>' +
      '<div class="seg" role="radiogroup" aria-labelledby="' + id + '-h" ' + attr + '>' +
      opts.map(function (o) {
        return '<button type="button" role="radio" data-v="' + o[0] + '"' +
          (o[2] ? ' aria-label="' + o[2] + '"' : '') + '>' + o[1] + '</button>';
      }).join('') + '</div></div>';
  }

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-btn';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-label', t.open);
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';

  var scrim = document.createElement('div');
  scrim.className = 'menu-scrim';
  scrim.hidden = true;

  var panel = document.createElement('div');
  panel.className = 'menu-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', t.title);

  // Placeholder destinations until the real profiles/number are connected —
  // "#" so the icons render and sit in place without sending anyone anywhere
  // broken. Swap each href (and the mailto: address if it changes) when the
  // accounts are ready; nothing else about this markup needs to change.
  var SOCIAL = [
    ['mailto:1greek.cloud@gmail.com', isEn ? 'Email' : 'מייל',
      '<path d="M3 6h18v12H3z"/><path d="M3 7l9 6 9-6"/>'],
    ['#', 'WhatsApp',
      '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M8.5 8.6c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.5.6c-.1.2-.2.3-.1.5.4.8 1.6 2 2.4 2.4.2.1.3 0 .5-.1l.6-.6c.1-.1.3-.2.5-.1l1.7.8c.3.1.3.3.3.5v.5c0 .2 0 .4-.5.6-.9.4-1.9.2-3.1-.5-1.6-.9-2.9-2.2-3.8-3.8-.7-1.2-.9-2.2-.5-3.1z" fill="var(--surface)" stroke="none"/>'],
    ['#', 'Facebook',
      '<path d="M15 8.5h2V5h-2c-2.2 0-4 1.8-4 4v2H9v3h2v6h3v-6h2.2l.8-3H14V9c0-.3.2-.5.5-.5H15z"/>'],
    ['#', 'TikTok',
      '<path d="M14 3v10.2a2.3 2.3 0 1 1-2-2.28V8.8a5 5 0 1 0 5 5V9.8c1 .7 2.1 1.1 3.3 1.1V8.7c-1.6 0-3-.9-3.6-2.2A5 5 0 0 1 16.4 4H14z"/>'],
    ['#', 'Instagram',
      '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6" fill="var(--surface)" stroke="none"/><circle cx="16.2" cy="7.8" r="1.1" fill="var(--surface)" stroke="none"/>']
  ];
  var socialHtml = '<div class="menu-social">' + SOCIAL.map(function (s) {
    var external = s[0].indexOf('#') !== 0 && s[0].indexOf('mailto:') !== 0;
    return '<a href="' + s[0] + '" aria-label="' + s[1] + '"' +
      (external ? ' target="_blank" rel="noopener"' : '') + '>' +
      '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" ' +
      'stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + s[2] + '</svg></a>';
  }).join('') + '</div>';

  panel.innerHTML =
    '<div class="menu-top"><span class="t">' + t.title + '</span>' +
      socialHtml +
      '<button type="button" class="menu-close" aria-label="' + t.close + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +

    '<div class="menu-sec"><h3>' + t.navMain + '</h3>' + navList(NAV.main) + '</div>' +
    '<div class="menu-sec"><h3>' + t.navRead + '</h3>' + navList(NAV.read) + '</div>' +
    '<div class="menu-sec"><h3>' + t.navCities + '</h3>' + navList(NAV.cities, true) + '</div>' +
    '<div class="menu-sec"><h3>' + t.navLegal + '</h3>' + navList(NAV.legal, true) + '</div>' +

    '<div class="menu-sec"><h3 id="gc-lang-h">' + t.lang + '</h3>' +
      '<div class="seg" role="group" aria-labelledby="gc-lang-h">' +
        '<span class="seg-current" aria-current="true">' + (isEn ? 'English' : 'עברית') + '</span>' +
        '<a href="' + (isEn ? '/' : '/en/') + '" hreflang="' + (isEn ? 'he' : 'en') + '" lang="' +
          (isEn ? 'he' : 'en') + '">' + (isEn ? 'עברית' : 'English') + '</a>' +
      '</div></div>' +

    seg('gc-theme', t.theme,
        [['system', t.system], ['light', t.light], ['dark', t.dark]], 'data-theme-seg');

  host.appendChild(btn);
  document.body.appendChild(scrim);
  document.body.appendChild(panel);

  /* ---------- reflect ---------- */

  function markGroup(sel, value) {
    [].forEach.call(panel.querySelectorAll(sel + ' [role="radio"]'), function (b) {
      var on = b.dataset.v === value;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }

  function reflect() {
    markGroup('[data-theme-seg]', currentTheme());
  }

  /* ---------- wiring ---------- */

  var themeSeg = panel.querySelector('[data-theme-seg]');
  themeSeg.addEventListener('click', function (e) {
    var b = e.target.closest('[role="radio"]'); if (!b) return;
    setTheme(b.dataset.v);
    reflect();
  });
  // Arrow-key navigation, as the radiogroup pattern requires.
  themeSeg.addEventListener('keydown', function (e) {
    if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].indexOf(e.key) === -1) return;
    var opts = [].slice.call(themeSeg.querySelectorAll('[role="radio"]'));
    var i = opts.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    var rtl = root.getAttribute('dir') === 'rtl';
    var fwd = (e.key === 'ArrowDown') || (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight'));
    var n = opts[(i + (fwd ? 1 : -1) + opts.length) % opts.length];
    n.focus(); n.click();
  });

  /* ---------- open / close ---------- */

  var lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    scrim.hidden = false; panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    // The drawer is modal, so the page behind it must not scroll away.
    document.body.style.overflow = 'hidden';
    reflect();
    document.addEventListener('keydown', onKey);
    panel.querySelector('.menu-close').focus();
  }

  function close(refocus) {
    scrim.hidden = true; panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    if (!refocus) return;
    // Restore focus only to a real, still-connected control. <body> has a
    // .focus method, so a naive truthiness test sends focus there and the
    // keyboard user is dumped back at the top of the document.
    var back = (lastFocus && lastFocus !== document.body && lastFocus.isConnected &&
                typeof lastFocus.focus === 'function') ? lastFocus : btn;
    back.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(true); return; }
    if (e.key !== 'Tab') return;
    var f = panel.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])');
    var vis = [].filter.call(f, function (el) { return el.offsetParent !== null && el.tabIndex !== -1; });
    if (!vis.length) return;
    var first = vis[0], last = vis[vis.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  btn.addEventListener('click', function () { panel.hidden ? open() : close(true); });
  panel.querySelector('.menu-close').addEventListener('click', function () { close(true); });
  scrim.addEventListener('click', function () { close(true); });

  /* A link to a section of the page the reader is already on navigates without
     a page load, so nothing closed the drawer: aria-expanded stayed true, the
     body stayed scroll-locked, and the panel went on covering the very section
     it had just jumped to. Focus follows the jump instead of returning to the
     toggle -- that heading is what the reader asked for. */
  panel.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.target === '_blank') return;

    var url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    var samePage = url.origin === location.origin &&
                   url.pathname === location.pathname &&
                   url.search === location.search;
    if (!samePage || !url.hash) { close(false); return; }

    close(false);
    var target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) return;
    // Headings are not focusable by default; -1 makes this one a focus target
    // without adding it to the tab order. preventScroll leaves the positioning
    // to the browser's own jump to the fragment.
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });

  reflect();
})();
