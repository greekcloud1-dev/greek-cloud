/* ==========================================================================
   GreekCloud — dedicated accessibility widget
   ==========================================================================

   A floating button, separate from the navigation menu, opened with Alt+A —
   the convention Israeli sites are expected to follow for a Regulation 35
   preferences widget. It owns the "gc-a11y" localStorage key; the pre-paint
   snippet in <head> reads the same key before first paint so a chosen
   preference never flashes the default on the way in.

   Scope fence: toggles classes on <html> only. Never mutates content DOM,
   never injects alt text, never rewrites ARIA.
   ========================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;
  var KEY = 'gc-a11y';
  var isEn = (root.getAttribute('lang') || 'he').slice(0, 2) === 'en';

  var t = isEn ? {
    open: 'Accessibility', close: 'Close accessibility menu', title: 'Accessibility',
    textSize: 'Text size', normal: 'Normal',
    lineSpacing: 'Line spacing', lsNormal: 'Normal', ls16: 'Wide', ls20: 'Widest',
    contrast: 'Contrast', cOff: 'Normal', cHigh: 'High', cInvert: 'Inverted', cMono: 'Greyscale',
    links: 'Underline links', font: 'Simpler font', headings: 'Outline headings',
    cursor: 'Large cursor', motion: 'Reduce motion',
    reset: 'Reset accessibility preferences', resetDone: 'Accessibility preferences reset',
    on: 'on', off: 'off',
    note: 'Preferences are stored in your browser only and do not alter page content.',
    statement: 'Accessibility statement'
  } : {
    open: 'נגישות', close: 'סגירת תפריט הנגישות', title: 'נגישות',
    textSize: 'גודל טקסט', normal: 'רגיל',
    lineSpacing: 'ריווח שורות', lsNormal: 'רגיל', ls16: 'רחב', ls20: 'רחב מאוד',
    contrast: 'ניגודיות', cOff: 'רגילה', cHigh: 'גבוהה', cInvert: 'הפוכה', cMono: 'גווני אפור',
    links: 'קו תחתון לקישורים', font: 'גופן פשוט', headings: 'הדגשת כותרות',
    cursor: 'סמן גדול', motion: 'הפחתת תנועה',
    reset: 'איפוס העדפות נגישות', resetDone: 'העדפות הנגישות אופסו',
    on: 'מופעל', off: 'כבוי',
    note: 'ההעדפות נשמרות בדפדפן שלכם בלבד ואינן משנות את תוכן העמוד.',
    statement: 'הצהרת נגישות'
  };

  var base = isEn ? '/en/' : '/';

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function write(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }

  // Kept in lockstep with the pre-paint snippet in <head>. Same class names,
  // same conditions — if one changes, the other must too.
  function apply(p) {
    var c = root.classList;
    c.remove('a11y-text-110', 'a11y-text-125', 'a11y-text-150',
              'a11y-lines-16', 'a11y-lines-20',
              'a11y-contrast-high', 'a11y-contrast-invert', 'a11y-contrast-mono');
    if (p.text) c.add('a11y-text-' + p.text);
    if (p.lines) c.add('a11y-lines-' + p.lines);
    if (p.contrast) c.add('a11y-contrast-' + p.contrast);
    c.toggle('a11y-links', !!p.links);
    c.toggle('a11y-font', !!p.font);
    c.toggle('a11y-headings', !!p.headings);
    c.toggle('a11y-cursor-big', !!p.cursor);
    c.toggle('a11y-motion', !!p.motion);
  }

  /* ---------- markup ---------- */

  function seg(id, label, opts, attr) {
    return '<div class="a11y-group"><h3 id="' + id + '-h">' + label + '</h3>' +
      '<div class="seg" role="radiogroup" aria-labelledby="' + id + '-h" ' + attr + '>' +
      opts.map(function (o) {
        return '<button type="button" role="radio" data-v="' + o[0] + '"' +
          (o[2] ? ' aria-label="' + o[2] + '"' : '') + '>' + o[1] + '</button>';
      }).join('') + '</div></div>';
  }
  function toggle(key, label) {
    return '<label class="menu-toggle"><span>' + label + '</span>' +
      '<input type="checkbox" data-k="' + key + '"><span class="sw"></span></label>';
  }

  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'a11y-fab';
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-label', t.open);
  fab.setAttribute('aria-keyshortcuts', 'Alt+A');
  // Universal-access glyph: a circle with a simplified figure, not the
  // hamburger lines used by the nav menu — the two triggers must not look
  // like the same control.
  fab.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="10"/>' +
    '<circle cx="12" cy="7.3" r="1.6" fill="currentColor" stroke="none"/>' +
    '<path d="M6.5 10.2c2.2.9 3.8.9 5.5.9s3.3 0 5.5-.9M12 11.1v3.1l-2.4 5M12 14.2l2.4 5"/>' +
    '</svg>';

  var panel = document.createElement('div');
  panel.className = 'a11y-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t.title);

  panel.innerHTML =
    '<div class="a11y-panel-top"><span class="t">' + t.title + '</span>' +
      '<button type="button" class="a11y-close" aria-label="' + t.close + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +

    seg('a11y-text', t.textSize,
        [['', t.normal], ['110', 'A+', '110%'], ['125', 'A++', '125%'], ['150', 'A+++', '150%']], 'data-text-seg') +
    seg('a11y-lines', t.lineSpacing,
        [['', t.lsNormal], ['16', t.ls16], ['20', t.ls20]], 'data-lines-seg') +
    seg('a11y-contrast', t.contrast,
        [['', t.cOff], ['high', t.cHigh], ['invert', t.cInvert], ['mono', t.cMono]], 'data-contrast-seg') +

    '<div class="a11y-group">' +
      toggle('links', t.links) + toggle('font', t.font) +
      toggle('headings', t.headings) + toggle('cursor', t.cursor) +
      toggle('motion', t.motion) +
    '</div>' +

    '<button type="button" class="a11y-reset">' + t.reset + '</button>' +
    '<p class="menu-note">' + t.note +
      ' <a href="' + base + 'accessibility.html">' + t.statement + '</a></p>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var live = document.createElement('div');
  live.className = 'a11y-live';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  document.body.appendChild(live);
  function announce(m) { live.textContent = ''; setTimeout(function () { live.textContent = m; }, 60); }

  /* ---------- reflect ---------- */

  function markGroup(sel, value) {
    [].forEach.call(panel.querySelectorAll(sel + ' [role="radio"]'), function (b) {
      var on = b.dataset.v === value;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }
  function reflect() {
    var p = read();
    markGroup('[data-text-seg]', p.text || '');
    markGroup('[data-lines-seg]', p.lines || '');
    markGroup('[data-contrast-seg]', p.contrast || '');
    [].forEach.call(panel.querySelectorAll('[data-k]'), function (i) { i.checked = !!p[i.dataset.k]; });
  }

  /* ---------- wiring ---------- */

  function wireSeg(sel, key, label) {
    var g = panel.querySelector(sel);
    if (!g) return;
    g.addEventListener('click', function (e) {
      var b = e.target.closest('[role="radio"]'); if (!b) return;
      var p = read();
      if (b.dataset.v) { p[key] = b.dataset.v; } else { delete p[key]; }
      write(p); apply(p); reflect();
      announce(label + ': ' + (b.getAttribute('aria-label') || b.textContent));
    });
    g.addEventListener('keydown', function (e) {
      if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].indexOf(e.key) === -1) return;
      var opts = [].slice.call(g.querySelectorAll('[role="radio"]'));
      var i = opts.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var rtl = root.getAttribute('dir') === 'rtl';
      var fwd = (e.key === 'ArrowDown') || (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight'));
      var n = opts[(i + (fwd ? 1 : -1) + opts.length) % opts.length];
      n.focus(); n.click();
    });
  }

  wireSeg('[data-text-seg]', 'text', t.textSize);
  wireSeg('[data-lines-seg]', 'lines', t.lineSpacing);
  wireSeg('[data-contrast-seg]', 'contrast', t.contrast);

  [].forEach.call(panel.querySelectorAll('[data-k]'), function (input) {
    input.addEventListener('change', function () {
      var p = read();
      p[input.dataset.k] = input.checked;
      write(p); apply(p);
      announce(input.parentNode.querySelector('span').textContent + ': ' + (input.checked ? t.on : t.off));
    });
  });

  panel.querySelector('.a11y-reset').addEventListener('click', function () {
    write({}); apply({}); reflect();
    announce(t.resetDone);
  });

  /* ---------- open / close ---------- */

  var lastFocus = null;

  function open() {
    lastFocus = document.activeElement;
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    reflect();
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onOutside, true);
    panel.querySelector('.a11y-close').focus();
  }
  function close(refocus) {
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onOutside, true);
    if (!refocus) return;
    var back = (lastFocus && lastFocus !== document.body && lastFocus.isConnected &&
                typeof lastFocus.focus === 'function') ? lastFocus : fab;
    back.focus();
  }
  function onOutside(e) {
    if (!panel.contains(e.target) && !fab.contains(e.target)) close(false);
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

  fab.addEventListener('click', function () { panel.hidden ? open() : close(true); });
  panel.querySelector('.a11y-close').addEventListener('click', function () { close(true); });

  // Alt+A is this widget's shortcut (IS 5568 convention), not the nav menu's.
  // e.code, not e.key: on macOS Alt+A yields the dead key "å", so e.key
  // fails silently there. e.code is the physical key and layout-independent.
  document.addEventListener('keydown', function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.code !== 'KeyA') return;
    e.preventDefault();
    panel.hidden ? open() : close(true);
  });

  reflect();
})();
