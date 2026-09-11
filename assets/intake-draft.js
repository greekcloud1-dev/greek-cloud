/* ==========================================================================
   GreekCloud — intake draft
   ==========================================================================

   Split out of intake.js so the storage policy can be exercised on its own
   against a stub DOM: this file touches nothing but the form fields it is
   allowed to keep, so a test can load it and assert exactly what reaches
   localStorage. Loaded after intake.js, whose input handler redraws the
   review summary when a restored value fires one.
   ========================================================================== */

(function () {
  'use strict';

  var form = document.querySelector('[data-intake]');
  if (!form) return;

  var savedEl = document.querySelector('[data-saved]');

  /* intake.js owns the review summary and redraws it on any input event, so
     a restored value announces itself the same way a typed one does. */
  function fillReview() {
    form.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /* ---------- draft ----------
     The draft saves retyping between sessions, and that is the whole of its
     mandate. An earlier rule skipped four fields and kept everything else,
     so a passport number, contact details, the prescription answer and every
     signed consent sat in localStorage with no expiry — on whatever device,
     shared or not, the form happened to be opened on. The privacy notice
     promised display preferences only.

     The rule is therefore inverted: nothing is stored unless it is named in
     KEEP. Identifiers, medical answers, consents and system fields can never
     be added to that list. Consents especially must be re-affirmed by a
     person on every visit; restoring them pre-ticked would record a claim
     nobody actually made this time.
     --------------------------------------------------------------------- */

  var KEY = 'gc-intake-draft';
  /* Bump to purge drafts written under an older, wider rule. */
  var DRAFT_VERSION = 2;
  var DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
  var KEEP = { city: 1, arrival: 1, plan: 1 };
  var isEn = (document.documentElement.getAttribute('lang') || 'he').slice(0, 2) === 'en';
  var txt = isEn
    ? { saving: 'Saving…', saved: 'Trip choices kept on this device ✓', clear: 'Delete draft',
        cleared: 'Draft deleted' }
    : { saving: 'שומר…', saved: 'פרטי הנסיעה נשמרו במכשיר הזה ✓', clear: 'מחיקת הטיוטה',
        cleared: 'הטיוטה נמחקה' };
  var timer;
  var clearBtn;

  function setSaved(text, ok) {
    if (savedEl) {
      savedEl.textContent = text;
      savedEl.classList.toggle('is-ok', !!ok);
    }
    if (clearBtn) clearBtn.hidden = !ok;
  }

  function dropDraft() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  /* The delete control is built here rather than in markup so both language
     pages get it from one place and it never appears without working JS. It
     sits outside the live region: inside, every autosave would re-announce
     the button label along with the status. */
  if (savedEl && savedEl.parentNode) {
    clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'draft-clear';
    clearBtn.textContent = txt.clear;
    clearBtn.hidden = true;
    clearBtn.addEventListener('click', function () {
      clearTimeout(timer);
      dropDraft();
      Object.keys(KEEP).forEach(function (k) {
        var f = form.elements[k];
        if (!f) return;
        if (f.length && f[0] && f[0].type === 'radio') {
          [].forEach.call(f, function (r) { r.checked = false; });
        } else { f.value = ''; }
      });
      fillReview();
      setSaved(txt.cleared, false);
      savedEl.focus();
    });
    savedEl.setAttribute('tabindex', '-1');
    savedEl.parentNode.insertBefore(clearBtn, savedEl.nextSibling);
  }

  function save() {
    var data = {};
    [].forEach.call(form.elements, function (f) {
      if (!f.name || !KEEP[f.name] || f.type === 'file') return;
      if (f.type === 'radio' || f.type === 'checkbox') { if (f.checked) data[f.name] = f.value || true; }
      else if (f.value) data[f.name] = f.value;
    });
    if (!Object.keys(data).length) { dropDraft(); setSaved('', false); return; }
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: DRAFT_VERSION, at: Date.now(), data: data }));
    } catch (e) { return; }
    setSaved(txt.saved, true);
  }

  function queueSave() {
    setSaved(txt.saving, false);
    if (clearBtn) clearBtn.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(save, 800);
  }

  form.addEventListener('input', queueSave);
  form.addEventListener('blur', function () { clearTimeout(timer); save(); }, true);

  (function restore() {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return; }
    if (!raw) return;
    var saved;
    try { saved = JSON.parse(raw); } catch (e) { dropDraft(); return; }
    /* An older draft carries the wider payload. Reading it is the one chance
       to erase it from this device, so drop it before anything is restored. */
    if (!saved || saved.v !== DRAFT_VERSION || !saved.data) { dropDraft(); return; }
    if (!(typeof saved.at === 'number') || Date.now() - saved.at > DRAFT_TTL_MS) { dropDraft(); return; }
    var data = saved.data;
    var restored = false;
    Object.keys(data).forEach(function (k) {
      if (!KEEP[k]) return;
      var f = form.elements[k];
      if (!f) return;
      if (f.length && f[0] && f[0].type === 'radio') {
        [].forEach.call(f, function (r) { if (r.value === data[k]) { r.checked = true; restored = true; } });
      } else if (f.type !== 'file' && f.type !== 'checkbox') { f.value = data[k]; restored = true; }
    });
    fillReview();
    if (restored) setSaved(txt.saved, true);
    else dropDraft();
  })();

  /* The draft is cleared only on a genuinely successful send, never on the
     submit event itself. While the form is closed for maintenance every submit
     fails, and wiping a complete set of answers right after telling someone to
     "try again soon" would throw away exactly what they were asked to keep.
     The submit path calls this once a real pipeline confirms receipt. */
  window.gcIntakeClearDraft = function () {
    dropDraft();
  };
})();
