/* ==========================================================================
   GreekCloud — motion
   ==========================================================================

   SEO SAFETY (the rule this file is built around):
   Reveal-on-scroll content must never be invisible-by-default. If a crawler
   or a user gets the HTML without this script running, every element must
   render fully visible. So the hidden state is applied ONLY when
   <html class="has-anim"> is present — a class this script sets. No script,
   no hidden state. See base.css: the reveal rules are all scoped under
   html.has-anim and gated behind prefers-reduced-motion: no-preference.

   The class is set by an inline snippet in <head> (before first paint) so
   there is no flash of visible-then-hidden content. This file only drives
   the transition to the visible state.
   ========================================================================== */

(function () {
  'use strict';

  var root = document.documentElement;

  // Motion is optional; the theme toggle is not. Anything below that is not
  // animation lives in initAlways() and runs even when motion is refused.
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var motionOff = reduced || !('IntersectionObserver' in window);

  // Drop the class so every reveal target paints immediately.
  if (motionOff) root.classList.remove('has-anim');

  /* ---------- scroll reveal -------------------------------------------
     300-400ms, small 12px rise, ease-out. The offset stays small on
     purpose: it should read as a fade with a hint of movement, not a slide.
     Children of a [data-reveal-group] are staggered, capped at 8 — past
     that the last item feels like it is lagging behind the scroll.
  --------------------------------------------------------------------- */

  var STAGGER_MS = 55;
  var STAGGER_CAP = 8;

  function reveal(el) {
    el.classList.add('is-in');
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      io.unobserve(el);

      var group = el.hasAttribute('data-reveal-group');
      if (!group) { reveal(el); return; }

      var kids = [].slice.call(el.children);
      kids.forEach(function (kid, i) {
        var delay = Math.min(i, STAGGER_CAP) * STAGGER_MS;
        setTimeout(function () { reveal(kid); }, delay);
      });
      reveal(el);
    });
  }, {
    // Fire slightly before the element reaches the fold so the motion has
    // finished by the time it is properly in view.
    rootMargin: '0px 0px -12% 0px',
    threshold: 0.05
  });

  function observeAll() {
    var targets = document.querySelectorAll('[data-reveal], [data-reveal-group]');
    [].forEach.call(targets, function (el) {
      // Anything already in the viewport on load reveals immediately rather
      // than waiting for a scroll that may never come.
      var box = el.getBoundingClientRect();
      if (box.top < window.innerHeight * 0.92 && box.bottom > 0) {
        if (el.hasAttribute('data-reveal-group')) {
          [].forEach.call(el.children, function (kid, i) {
            setTimeout(function () { reveal(kid); }, Math.min(i, STAGGER_CAP) * STAGGER_MS);
          });
        }
        reveal(el);
        return;
      }
      io.observe(el);
    });
  }

  /* ---------- header state --------------------------------------------
     A hairline shadow once the page has moved. Toggled from a scroll
     listener guarded by requestAnimationFrame so it never reads layout
     more than once per frame.
  --------------------------------------------------------------------- */

  function headerState() {
    var head = document.querySelector('.site-head');
    if (!head) return;
    var ticking = false;
    function update() {
      head.classList.toggle('is-stuck', window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* ---------- FAQ height transition ------------------------------------
     <details> cannot be transitioned natively across browsers. Animate the
     panel's own height instead, and never let the animation gate the open
     state: `open` is set first and synchronously, so the content is present
     for find-in-page and assistive tech regardless of the transition.
  --------------------------------------------------------------------- */

  function faq() {
    var items = document.querySelectorAll('.faq details');
    [].forEach.call(items, function (d) {
      var panel = d.querySelector('.a');
      if (!panel) return;

      d.addEventListener('toggle', function () {
        if (panel.__anim) panel.__anim.cancel();
        var end = d.open ? panel.scrollHeight : 0;
        var start = d.open ? 0 : panel.scrollHeight;
        if (!panel.animate) return;
        panel.__anim = panel.animate(
          [
            { height: start + 'px', opacity: d.open ? 0 : 1 },
            { height: end + 'px', opacity: d.open ? 1 : 0 }
          ],
          { duration: d.open ? 260 : 200, easing: 'cubic-bezier(.22,.61,.36,1)' }
        );
        panel.__anim.onfinish = function () { panel.style.height = ''; };
      });
    });
  }


  function init() {
    // Theme and accessibility preferences are owned by settings.js.
    if (motionOff) return;
    observeAll();
    headerState();
    faq();
    // Hero runs on load rather than on intersection — it is above the fold
    // by definition and should not wait for the observer callback.
    root.classList.add('is-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
