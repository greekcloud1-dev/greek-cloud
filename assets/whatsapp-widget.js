/* ==========================================================================
   GreekCloud — floating WhatsApp button
   Self-mounting, like settings.js and a11y-widget.js, so every page gets it
   from one <script> include rather than repeated markup. Plain link, no
   panel or state — clicking it just opens the chat.
   ========================================================================== */

(function () {
  'use strict';

  var isEn = (document.documentElement.getAttribute('lang') || 'he').slice(0, 2) === 'en';
  var label = isEn ? 'Chat with us on WhatsApp' : 'שיחה בוואטסאפ';
  var message = isEn
    ? 'Hi, I have a question about GreekCloud'
    : 'היי, יש לי שאלה לגבי GreekCloud';

  var a = document.createElement('a');
  a.className = 'wa-fab';
  a.href = 'https://wa.me/972523660427?text=' + encodeURIComponent(message);
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', label);
  a.innerHTML =
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.4" ' +
    'stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/>' +
    '<path d="M8.5 8.6c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .5.4l.7 1.7c.1.2 0 .4-.1.5l-.5.6c-.1.2-.2.3-.1.5.4.8 ' +
    '1.6 2 2.4 2.4.2.1.3 0 .5-.1l.6-.6c.1-.1.3-.2.5-.1l1.7.8c.3.1.3.3.3.5v.5c0 .2 0 .4-.5.6-.9.4-1.9.2-3.1-.5-' +
    '1.6-.9-2.9-2.2-3.8-3.8-.7-1.2-.9-2.2-.5-3.1z" fill="#fff" stroke="none"/></svg>';

  document.body.appendChild(a);
})();
