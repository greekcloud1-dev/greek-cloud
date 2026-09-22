/* ==========================================================================
   GreekCloud — consent gate for Google Analytics 4
   ==========================================================================

   GA4 is loaded ONLY after the visitor clicks "accept". Until then (and after
   "decline") no Google script is requested and no analytics cookie is set.
   Advertising consent signals are always "denied".

   GA_ID is the single switch. While it is empty the site sets no analytics at
   all and this file behaves as the old informational notice.

   Conversion: thank-you.html (where the intake form lands) sends a
   generate_lead event, so every completed intake is counted in GA4.
   ========================================================================== */

(function () {
  'use strict';

  var GA_ID = 'G-VLXQX0P99R';             // e.g. 'G-XXXXXXXXXX'
  var KEY = 'gc-consent';       // 'granted' | 'denied'
  var OLD = 'gc-notice-seen';

  var root = document.documentElement;
  var isEn = (root.getAttribute('lang') || 'he').slice(0, 2) === 'en';
  var base = isEn ? '/en/' : '/';

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function loadGA() {
    if (!GA_ID || window.__gcGA) return;
    window.__gcGA = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      analytics_storage: 'granted'
    });
    gtag('js', new Date());
    gtag('config', GA_ID);
    if (/\/thank-you\.html$/.test(location.pathname)) {
      gtag('event', 'generate_lead', { lang: isEn ? 'en' : 'he' });
    }
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }

  var state = get(KEY);
  if (state === 'granted') { loadGA(); return; }
  if (state === 'denied') return;
  if (!GA_ID && get(OLD) === '1') return;

  var t = isEn ? {
    title: 'About your privacy',
    body: GA_ID
      ? 'With your consent we use Google Analytics to measure visits. No advertising cookies. Details in the '
      : 'This site sets no tracking or advertising cookies. It stores only the display preferences you choose, in your own browser. Details in the ',
    policy: 'privacy policy', ok: GA_ID ? 'Accept' : 'Understood', no: 'Decline'
  } : {
    title: 'על הפרטיות שלכם',
    body: GA_ID
      ? 'בהסכמתכם נשתמש ב־Google Analytics למדידת ביקורים באתר. ללא עוגיות פרסום. פירוט ב'
      : 'האתר אינו מציב עוגיות מעקב או פרסום. הוא שומר רק את העדפות התצוגה שאתם בוחרים, בדפדפן שלכם בלבד. פירוט ב',
    policy: 'מדיניות הפרטיות', ok: GA_ID ? 'מאשר/ת' : 'הבנתי', no: 'לא, תודה'
  };

  function show() {
    var bar = document.createElement('aside');
    bar.className = 'gc-notice';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', t.title);
    bar.innerHTML =
      '<p class="gc-notice-txt"><b>' + t.title + '</b> ' + t.body +
      '<a href="' + base + 'privacy.html">' + t.policy + '</a>.</p>' +
      (GA_ID ? '<button type="button" class="gc-notice-ok gc-notice-no">' + t.no + '</button>' : '') +
      '<button type="button" class="gc-notice-ok gc-notice-yes">' + t.ok + '</button>';
    document.body.appendChild(bar);

    bar.querySelector('.gc-notice-yes').addEventListener('click', function () {
      if (GA_ID) { set(KEY, 'granted'); loadGA(); } else { set(OLD, '1'); }
      bar.remove();
    });
    var no = bar.querySelector('.gc-notice-no');
    if (no) no.addEventListener('click', function () { set(KEY, 'denied'); bar.remove(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();
