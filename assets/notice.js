/* ==========================================================================
   GreekCloud — first-visit privacy notice
   ==========================================================================

   WHY THIS IS A NOTICE AND NOT A CONSENT BANNER

   This site sets no analytics, no advertising pixels and no third-party
   scripts. The only thing it stores is the visitor's own display
   preferences (theme, text size, accessibility toggles) in localStorage,
   which is strictly functional.

   Under both the GDPR and the Israeli Privacy Protection Law, strictly
   functional storage that the user themselves asked for does not require
   prior consent — it requires transparency. So this is an informational
   notice with a single "understood" action.

   Presenting an Accept / Reject choice here would be worse, not better:
   it would imply there is tracking to reject, and a "reject" that changes
   nothing is a dark pattern. If analytics or pixels are ever added, this
   file must be replaced with a real consent gate that blocks those scripts
   until consent is given.
   ========================================================================== */

(function () {
  'use strict';

  var KEY = 'gc-notice-seen';
  try { if (localStorage.getItem(KEY) === '1') return; } catch (e) { return; }

  var root = document.documentElement;
  var isEn = (root.getAttribute('lang') || 'he').slice(0, 2) === 'en';
  var base = isEn ? '/en/' : '/';

  var t = isEn ? {
    title: 'About your privacy',
    body: 'This site sets no tracking or advertising cookies. It stores only the display ' +
          'preferences you choose, in your own browser. Details in the ',
    policy: 'privacy policy',
    ok: 'Understood'
  } : {
    title: 'על הפרטיות שלכם',
    body: 'האתר אינו מציב עוגיות מעקב או פרסום. הוא שומר רק את העדפות התצוגה שאתם בוחרים, ' +
          'בדפדפן שלכם בלבד. פירוט ב',
    policy: 'מדיניות הפרטיות',
    ok: 'הבנתי'
  };

  function show() {
    var bar = document.createElement('aside');
    bar.className = 'gc-notice';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', t.title);
    bar.innerHTML =
      '<p class="gc-notice-txt"><b>' + t.title + '</b> ' + t.body +
      '<a href="' + base + 'privacy.html">' + t.policy + '</a>.</p>' +
      '<button type="button" class="gc-notice-ok">' + t.ok + '</button>';

    document.body.appendChild(bar);

    bar.querySelector('.gc-notice-ok').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      bar.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', show);
  } else {
    show();
  }
})();
