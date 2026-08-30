/* ==========================================================================
   GreekCloud — intake form
   ==========================================================================

   THE RULE THIS FILE IS BUILT AROUND:
   This form collects identity documents and health information. That data
   must never leave the browser except through a configured, encrypted
   pipeline. So submission is blocked until /api/health confirms one exists.
   There is no fallback path, and deliberately so: a "just email it instead"
   fallback would send medical data through an unencrypted third party.

   The backend is not built yet. /api/health will 404, secureReady stays
   false, and the form tells the visitor to make contact another way rather
   than silently dropping their details. That is the correct behaviour for
   this state, not a bug to work around.
   ========================================================================== */

(function () {
  'use strict';

  var form = document.querySelector('[data-intake]');
  if (!form) return;

  var statusEl = form.querySelector('.form-status');
  var submitBtn = form.querySelector('.submit');

  function say(msg, isError) {
    statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', !!isError);
  }

  /* ---------- the gate ---------- */

  var secureReady = false;
  fetch('/api/health')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (h) { secureReady = Boolean(h && h.configured); })
    .catch(function () { secureReady = false; });

  /* ---------- validation ----------
     Native validity, surfaced inline next to the field rather than only in
     the browser bubble, which vanishes and is easy to miss on mobile.
  ---------------------------------- */

  function clearError(field) {
    field.removeAttribute('aria-invalid');
    var note = field.parentNode.querySelector('.err');
    if (note) note.remove();
  }

  function showError(field, msg) {
    clearError(field);
    field.setAttribute('aria-invalid', 'true');
    var note = document.createElement('small');
    note.className = 'err';
    note.textContent = msg;
    field.parentNode.appendChild(note);
  }

  function messageFor(field) {
    if (field.validity.valueMissing) {
      if (field.type === 'checkbox') return 'צריך לאשר כדי להמשיך.';
      return 'השדה הזה נדרש.';
    }
    if (field.validity.typeMismatch && field.type === 'email') return 'כתובת המייל לא נראית תקינה.';
    if (field.validity.rangeUnderflow) return 'השירות מיועד לבגירים מגיל 18.';
    if (field.validity.rangeOverflow) return 'הגיל שהוזן אינו סביר.';
    return 'הערך הזה לא תקין.';
  }

  function validate() {
    var fields = form.querySelectorAll('input, select, textarea');
    var firstBad = null;
    [].forEach.call(fields, function (field) {
      if (field.name === 'website') return;              // honeypot
      clearError(field);
      if (field.checkValidity()) return;
      // Radios and checkboxes hang their message off the group, not the input.
      var anchor = field.type === 'checkbox' || field.type === 'radio'
        ? field.closest('fieldset') : field;
      if (field.type === 'checkbox' || field.type === 'radio') {
        anchor.setAttribute('aria-invalid', 'true');
      } else {
        showError(field, messageFor(field));
      }
      if (!firstBad) firstBad = field;
    });
    return firstBad;
  }

  [].forEach.call(form.querySelectorAll('input, select, textarea'), function (f) {
    f.addEventListener('input', function () { clearError(f); });
    f.addEventListener('change', function () {
      var fs = f.closest('fieldset');
      if (fs) fs.removeAttribute('aria-invalid');
    });
  });

  /* ---------- submit ---------- */

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (form.querySelector('[name="website"]').value) return;   // bot

    var bad = validate();
    if (bad) {
      say('כמה שדות עוד חסרים — סימנתי אותם.', true);
      bad.focus();
      bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    if (!secureReady) {
      say('שליחה מקוונת אינה זמינה כרגע. הפרטים שלכם לא נשלחו לשום מקום — ' +
          'כתבו לנו ונמשיך משם.', true);
      return;
    }

    submitBtn.disabled = true;
    say('שולחים בצורה מאובטחת…');

    // Wired once the pipeline exists: request signed upload URLs, PUT the
    // files directly to private storage, then POST the field values with
    // the returned paths. Files never travel through this JSON body.
    say('שליחה מקוונת אינה זמינה כרגע. הפרטים שלכם לא נשלחו לשום מקום.', true);
    submitBtn.disabled = false;
  });
})();
