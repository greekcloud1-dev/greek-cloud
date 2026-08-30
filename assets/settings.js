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

  panel.innerHTML =
    '<div class="menu-top"><span class="t">' + t.title + '</span>' +
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

  reflect();
})();
