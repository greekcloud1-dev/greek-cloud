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

  /* Both language versions load this file, so every message the visitor can
     see has to come from here. Before this table the English page answered
     its visitors in Hebrew. */
  var HE = document.documentElement.lang === 'he';
  var S = HE ? {
    missing:   'כמה שדות עוד חסרים — סימנתי אותם.',
    required:  'השדה הזה נדרש.',
    consent:   'צריך לאשר כדי להמשיך.',
    email:     'כתובת המייל לא נראית תקינה.',
    under18:   'השירות מיועד לבגירים מגיל 18.',
    ageHigh:   'תאריך הלידה שהוזן אינו סביר.',
    ageIs:     'גיל: ',
    pastDate:  'התאריך הזה כבר עבר.',
    farDate:   'התאריך רחוק מדי. אפשר לסמן "עוד לא יודע/ת".',
    passBad:   'מספר דרכון ישראלי הוא 8 ספרות בדיוק.',
    invalid:   'הערך הזה לא תקין.',
    sending:   'שולחים בצורה מאובטחת…',
    downTitle: 'האתר בשיפוצים',
    downBody:  'השאלון מלא ותקין, אבל הטופס עדיין לא מקבל שליחות. ' +
               'הפרטים שלכם לא נשלחו לשום מקום ולא נשמרו אצלנו — ' +
               'הם נשארו בדפדפן שלכם בלבד. נסו שוב בקרוב.',
    sentTitle: 'התקבל!',
    sentBody:  'הפנייה שלכם נשלחה ונשמרה. ניצור איתכם קשר בוואטסאפ להמשך התהליך.',
    errTitle:  'השליחה נכשלה',
    errBody:   'הייתה תקלה בשליחה. הפרטים שלכם נשארו בדפדפן ולא אבדו — נסו לשלוח שוב בעוד רגע.'
  } : {
    missing:   'A few fields are still missing — I have marked them.',
    required:  'This field is required.',
    consent:   'You need to confirm this to continue.',
    email:     'That email address does not look right.',
    under18:   'The service is for adults aged 18 and over.',
    ageHigh:   'That date of birth does not look right.',
    ageIs:     'Age: ',
    pastDate:  'That date has already passed.',
    farDate:   'That date is too far ahead. You can tick "Not sure yet".',
    passBad:   'An Israeli passport number is exactly 8 digits.',
    invalid:   'That value is not valid.',
    sending:   'Sending securely…',
    downTitle: 'The site is under maintenance',
    downBody:  'Your answers are complete and valid, but the form is not accepting ' +
               'submissions yet. Nothing was sent anywhere and nothing was stored by us — ' +
               'it stayed in your browser. Please try again soon.',
    sentTitle: 'Received!',
    sentBody:  'Your request was sent and saved. We will reach out on WhatsApp to continue.',
    errTitle:  'Sending failed',
    errBody:   'Something went wrong while sending. Your details are still in your browser and were not lost -- please try again in a moment.'
  };

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
      return field.type === 'checkbox' ? S.consent : S.required;
    }
    if (field.validity.typeMismatch && field.type === 'email') return S.email;
    /* The date field inverts the two range errors relative to a number: its
       `max` is the latest date that is still 18 years ago, so a date ABOVE it
       is someone too young, and a date below `min` is an implausible age. */
    if (field.type === 'date' && field.name === 'birthdate') {
      if (field.validity.rangeOverflow) return S.under18;
      if (field.validity.rangeUnderflow) return S.ageHigh;
    }
    if (field.name === 'arrival' && field.validity.rangeUnderflow) return S.pastDate;
    if (field.name === 'arrival' && field.validity.rangeOverflow) return S.farDate;
    if (field.name === 'passport' && field.validity.patternMismatch) return S.passBad;
    if (field.validity.rangeUnderflow) return S.under18;
    if (field.validity.rangeOverflow) return S.ageHigh;
    return S.invalid;
  }

  /* ---------- date of birth ----------
     The bounds are computed here rather than written into the HTML because a
     hardcoded max goes stale the day after it ships: tomorrow's 18th birthday
     would still be refused. `min` is 120 years back, which is the same ceiling
     the server enforces.

     The readout underneath is the reason this is a date field rather than a
     number one: the visitor picks a date and immediately sees the age it
     produces, so a mistyped year is caught by the person who knows the answer.
     It is advisory only -- the real gate is checkValidity() plus the server. */
  var bday = form.querySelector('#birthdate');
  var bdayHint = form.querySelector('#birthdate-hint');
  var bdayHintBase = bdayHint ? bdayHint.textContent : '';

  function ageOn(dob, on) {
    var age = on.getFullYear() - dob.getFullYear();
    var m = on.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age--;
    return age;
  }

  if (bday) {
    var today = new Date();
    /* Built from the local date parts, not toISOString(): that converts to UTC
       first, and east of Greenwich the small hours of the morning still read as
       yesterday there -- which would push `max` back a day and refuse someone
       on the morning of their eighteenth birthday. The server derives the age
       from local parts too, so the two agree. */
    var iso = function (d) {
      var m = String(d.getMonth() + 1);
      var day = String(d.getDate());
      return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
    };
    bday.max = iso(new Date(today.getFullYear() - 18, today.getMonth(), today.getDate()));
    bday.min = iso(new Date(today.getFullYear() - 120, today.getMonth(), today.getDate()));

    bday.addEventListener('input', function () {
      if (!bdayHint) return;
      if (!bday.value) { bdayHint.textContent = bdayHintBase; bdayHint.removeAttribute('data-ok'); return; }
      var parts = bday.value.split('-');
      var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      var age = ageOn(d, new Date());
      if (!isFinite(age) || age < 0 || age > 120) { bdayHint.textContent = bdayHintBase; return; }
      bdayHint.textContent = S.ageIs + age;
      if (age >= 18) bdayHint.setAttribute('data-ok', '');
      else bdayHint.removeAttribute('data-ok');
    });
  }

  /* ---------- flight date ----------
     Required, unless the visitor ticks "not sure yet" -- which disables the
     field, so it is neither validated nor sent. `min` is today, from local date
     parts for the same reason as the birthday bounds above. */
  var arrival = form.querySelector('#arrival');
  var arrivalUnknown = form.querySelector('#arrival-unknown');
  if (arrival) {
    var now0 = new Date();
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    arrival.min = now0.getFullYear() + '-' + p2(now0.getMonth() + 1) + '-' + p2(now0.getDate());
    // The server refuses a date more than 730 days out; refuse it here first.
    var far = new Date(now0.getFullYear(), now0.getMonth(), now0.getDate() + 730);
    arrival.max = far.getFullYear() + '-' + p2(far.getMonth() + 1) + '-' + p2(far.getDate());
    // Also called by the draft restore below, which sets the box without an event.
    window.gcSyncArrival = function () {
      var off = !!(arrivalUnknown && arrivalUnknown.checked);
      arrival.disabled = off;
      arrival.required = !off;
      if (off) clearError(arrival);
    };
    if (arrivalUnknown) arrivalUnknown.addEventListener('change', window.gcSyncArrival);
    window.gcSyncArrival();
  }

  /* ---------- where the visitor came from ----------
     settings.js records the first page's UTM tags and external referrer for
     the tab; landing straight on this page falls back to its own. */
  (function fillSource() {
    var q = new URLSearchParams(location.search);
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    var here = { s: q.get('utm_source') || '', m: q.get('utm_medium') || '', c: q.get('utm_campaign') || '',
                 r: ref && ref !== location.hostname ? ref : '' };
    var src = null;
    try { src = JSON.parse(sessionStorage.getItem('gc-src') || 'null'); } catch (e) {}
    if (!src || (!src.s && !src.r)) src = here;
    var set = function (name, v) { var el = form.querySelector('[name="' + name + '"]'); if (el) el.value = String(v || '').slice(0, 100); };
    set('utm_source', src.s); set('utm_medium', src.m); set('utm_campaign', src.c); set('ref_host', src.r);
  })();

  function validate() {
    var fields = form.querySelectorAll('input, select, textarea');
    var firstBad = null;
    [].forEach.call(fields, function (field) {
      if (field.name === 'website') return;              // honeypot
      clearError(field);
      if (field.checkValidity()) return;
      // Radios and checkboxes hang their message off the group, not the input.
      // The group used to always be a <fieldset>; since the form was rebuilt as
      // <section class="step"> only the declaration still is one, so fall back
      // through the section and finally the field itself rather than throwing.
      if (field.type === 'checkbox' || field.type === 'radio') {
        var anchor = field.closest('fieldset') || field.closest('.consents')
                  || field.closest('.step') || field;
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
      // Same fallback chain validate() uses, or the flag it set never clears.
      var g = f.closest('fieldset') || f.closest('.consents') || f.closest('.step');
      if (g) g.removeAttribute('aria-invalid');
    });
  });

  /* Rendered as a block, not a line of status text: by this point the visitor
     has filled in everything, and a thin sentence under the button is not
     proportionate to "none of that went anywhere". One element is reused for
     all three outcomes (maintenance / sent / error) with a class swap, so
     only one ever shows at a time. */
  function notice(kind, title, body) {
    var box = form.querySelector('.form-down');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('role', 'status');
      box.innerHTML = '<span class="nt"></span><span class="body"></span>';
      statusEl.parentNode.insertBefore(box, statusEl);
    }
    box.className = 'note form-down form-down--' + kind;
    box.querySelector('.nt').textContent = title;
    box.querySelector('.body').textContent = body;
    say('');
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return box;
  }

  function showDown() { notice('warn', S.downTitle, S.downBody); }
  function showSendError() { notice('warn', S.errTitle, S.errBody); }

  function showSent(submissionId) {
    notice('ok', S.sentTitle, S.sentBody);
    // Nothing left to correct after a real send: freeze the form so a second
    // tap of "back" plus "submit" can't fire a duplicate request.
    [].forEach.call(form.querySelectorAll('input, select, textarea, button'), function (el) {
      el.disabled = true;
    });
    var payNote = form.querySelector('.pay-note');
    if (payNote) payNote.hidden = true;

    /* Hand the reference to the thank-you page through sessionStorage rather
       than the URL: it is a storage key, and a query string would put it in
       referrers, history and any log that records URLs.

       The inline notice above still renders first and the redirect is
       replace(), not assign(): "back" from the thank-you page must not return
       to a filled-in form that would happily submit itself a second time. If
       the redirect is blocked for any reason, the visitor is left on the
       notice, which already tells them the request was received. */
    try { if (submissionId) sessionStorage.setItem('gc-last-submission', submissionId); } catch (e) {}
    window.location.replace(HE ? '/thank-you.html' : '/en/thank-you.html');
  }

  /* ---------- image compression ----------
     A phone camera photo can run 5-10MB; a serverless function body has a
     hard ceiling well under that. Downscaling client-side, before upload, is
     what keeps a photographed prescription from hitting that ceiling, and it
     also makes the upload faster on a mobile connection. Only touches
     actual images -- the optional prescription file may be a PDF, which
     passes through untouched. Any failure here just falls back to the
     original file rather than blocking submission over a cosmetic step. */
  function compressImage(file, maxDim, quality) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) return Promise.resolve(file);
    return Promise.resolve()
      .then(function () { return createImageBitmap(file); })
      .then(function (bitmap) {
        var scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
        var w = Math.max(1, Math.round(bitmap.width * scale));
        var h = Math.max(1, Math.round(bitmap.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
        return new Promise(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
      })
      .then(function (blob) {
        if (!blob) return file;
        var name = (file.name || 'photo').replace(/\.[a-zA-Z0-9]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg' });
      })
      .catch(function () { return file; });
  }

  /* ---------- submit ---------- */

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    if (form.querySelector('[name="website"]').value) return;   // bot

    // Validate FIRST. The maintenance notice is deliberately the last thing a
    // visitor meets: telling someone the form is closed before they have
    // finished throws away answers they already gave, and only after a full,
    // valid set of details is the message honest about what happened to them.
    var bad = validate();
    if (bad) {
      say(S.missing, true);
      bad.focus();
      bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    if (!secureReady) { showDown(); return; }

    submitBtn.disabled = true;
    say(S.sending);

    var rxInput = form.querySelector('#f-rx');
    var rxFile = rxInput && rxInput.files[0];

    Promise.all([
      compressImage(rxFile, 1600, 0.82),
    ]).then(function (files) {
      // FormData(form) captures every named field -- text, select, radio,
      // hidden, checked checkboxes, and both file inputs -- in one call, so
      // this only needs to override the two files with their compressed
      // versions rather than re-listing every field by hand.
      var fd = new FormData(form);
      if (files[0]) fd.set('file_rx', files[0], files[0].name);

      return fetch('/api/submit', { method: 'POST', body: fd });
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (res.ok && body && body.ok) {
          // showSent() disables every control, submitBtn included, on
          // purpose -- there is nothing left to correct after a real send.
          // Re-enabling it in a shared "finally" below would undo exactly
          // that, so success returns early instead of falling through to it.
          // Clear the draft before leaving: showSent() redirects, and a draft
          // left behind would refill the form for the next visitor on a
          // shared machine.
          if (window.gcIntakeClearDraft) window.gcIntakeClearDraft();
          showSent(body.submissionId);
          return;
        }
        /* The server re-checks every rule. If it refused one specific field
           ("missing:passport", "invalid:arrival"), point at that field rather
           than blaming the network -- otherwise the visitor retries the same
           answer forever. Anything else is a genuine send failure. */
        var m = body && typeof body.error === 'string' && /^(missing|invalid|too_long):([a-z_]+)$/.exec(body.error);
        var bad = m && form.querySelector('[name="' + (m[2] === 'age' ? 'birthdate' : m[2]) + '"]');
        if (bad && bad.type !== 'hidden') {
          submitBtn.disabled = false;
          var msg = m[2] === 'age' ? S.under18 : (m[1] === 'missing' ? (bad.type === 'checkbox' ? S.consent : S.required) : S.invalid);
          if (bad.type === 'checkbox') {
            var anchor = bad.closest('fieldset') || bad.closest('.consents') || bad;
            anchor.setAttribute('aria-invalid', 'true');
          } else {
            showError(bad, msg);
          }
          say(S.missing, true);
          bad.focus();
          bad.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
        showSendError();
        submitBtn.disabled = false;
      });
    }).catch(function () {
      showSendError();
      submitBtn.disabled = false;
    });
  });
})();

/* ==========================================================================
   GreekCloud — intake field behaviour
   ==========================================================================

   The form is one page, five named sections. This module owns the parts the
   markup cannot express on its own: input shaping, the live passport check,
   the symptom tags, the segmented control, the review card and the draft.
   Validation messages, the secure-pipeline gate and submit stay with the
   module above.

   The draft stores NO file inputs and NO free-text health description. That
   text is medical information, and the rule this form is built around is that
   such data does not sit outside the encrypted pipeline. A convenience feature
   is not worth parking a health history in a browser store nobody opted into.
   ========================================================================== */

(function () {
  'use strict';

  var form = document.querySelector('[data-intake]');
  if (!form) return;

  var savedEl = document.querySelector('[data-saved]');
  var seg     = form.querySelector('[data-seg]');
  var segOut  = form.querySelector('#rx-exists');

  /* ---------- input shaping ---------- */

  var nameEl = form.querySelector('#fullname');
  if (nameEl) {
    nameEl.addEventListener('input', function () {
      var v = nameEl.value.toUpperCase().replace(/[^A-Z \-]/g, '');
      if (v !== nameEl.value) nameEl.value = v;
    });
  }

  var pass = form.querySelector('#passport');
  var passHint = form.querySelector('#passport-hint');
  // This module has no access to the validation module's string table.
  var PASS_HE = document.documentElement.lang === 'he';
  var PS = PASS_HE
    ? { ok: '✓ 8 ספרות. תואם לפורמט.', short: 'חסרה ספרה. במספר דרכון ישראלי יש 8 ספרות.' }
    : { ok: '✓ 8 digits. Matches the format.', short: 'A digit is missing. An Israeli passport number has 8 digits.' };
  if (pass && passHint && pass.getAttribute('inputmode') === 'numeric') {
    var hintText = passHint.textContent;
    pass.setAttribute('pattern', '\\d{8}');
    pass.addEventListener('input', function () {
      var v = pass.value.replace(/\D/g, '').slice(0, 8);
      if (v !== pass.value) pass.value = v;
      pass.removeAttribute('aria-invalid');
      var ok = v.length === 8;
      passHint.textContent = ok ? PS.ok : hintText;
      passHint.style.color = ok ? 'var(--sage)' : '';
      passHint.style.fontWeight = ok ? '700' : '';
    });
    // Validate on blur, never while typing: flagging an incomplete number
    // mid-keystroke reads as the field fighting the person filling it.
    pass.addEventListener('blur', function () {
      if (pass.value && pass.value.length !== 8) {
        pass.setAttribute('aria-invalid', 'true');
        passHint.textContent = PS.short;
        passHint.style.color = 'var(--stop)';
        passHint.style.fontWeight = '700';
      }
    });
  }

  /* ---------- symptom tags ---------- */

  var tags = form.querySelector('[data-tags]');
  var cond = form.querySelector('#condition');
  if (tags && cond) {
    tags.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var on = b.getAttribute('aria-pressed') === 'true';
      b.setAttribute('aria-pressed', on ? 'false' : 'true');
      if (on) return;
      // Append, never overwrite: the textarea stays the person's own words.
      var phrase = b.textContent.trim();
      cond.value = cond.value.trim() ? cond.value.replace(/\s*$/, '') + ', ' + phrase : phrase;
      cond.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  /* ---------- segmented control ---------- */

  if (seg && segOut) {
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      [].forEach.call(seg.querySelectorAll('button'), function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      segOut.value = b.getAttribute('data-val');
      save();
    });
  }

  /* ---------- review card ----------
     Mirrors the two fields that get printed on the prescription, live, so the
     last thing seen before submitting is the thing that cannot be corrected
     afterwards. */

  function fillReview() {
    [].forEach.call(form.querySelectorAll('[data-review]'), function (el) {
      var f = form.querySelector('[name="' + el.getAttribute('data-review') + '"]');
      el.textContent = (f && f.value) ? f.value : '—';
    });
  }
  form.addEventListener('input', fillReview);
  fillReview();

  form.addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit]');
    if (!ed) return;
    var target = form.querySelector('#' + ed.getAttribute('data-edit'));
    if (!target) return;
    target.focus();
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  /* ---------- draft ---------- */

  var KEY = 'gc-intake-draft';

  /* Never persisted to the device. `condition` is the health narrative and
     `passport` is a government ID number: both are the kind of thing that
     should not still be sitting in localStorage on a shared laptop weeks
     later. Everything else is ordinary contact detail and is worth keeping so
     a half-finished form survives a reload. */
  var SKIP = { condition: 1, passport: 1, website: 1, file_rx: 1,
               // Set fresh from this visit on every load; a draft must not overwrite them.
               utm_source: 1, utm_medium: 1, utm_campaign: 1, ref_host: 1 };

  /* And what we do keep expires, so an abandoned draft does not live forever. */
  var DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var timer;

  function save() {
    var data = {};
    [].forEach.call(form.elements, function (f) {
      if (!f.name || SKIP[f.name] || f.type === 'file') return;
      if (f.type === 'radio' || f.type === 'checkbox') { if (f.checked) data[f.name] = f.value || true; }
      else data[f.name] = f.value;
    });
    try { localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), data: data })); } catch (e) { return; }
    if (savedEl) { savedEl.textContent = 'נשמר ✓'; savedEl.classList.add('is-ok'); }
  }

  function queueSave() {
    if (savedEl) { savedEl.textContent = 'שומר…'; savedEl.classList.remove('is-ok'); }
    clearTimeout(timer);
    timer = setTimeout(save, 800);
  }

  form.addEventListener('input', queueSave);
  form.addEventListener('blur', function () { clearTimeout(timer); save(); }, true);

  (function restore() {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { return; }
    if (!raw) return;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return; }

    // Older drafts were stored as a bare field map with no timestamp. Those
    // predate the passport exclusion, so drop them rather than restoring them.
    if (!parsed || typeof parsed !== 'object' || !parsed.savedAt || !parsed.data) {
      try { localStorage.removeItem(KEY); } catch (e) {}
      return;
    }
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      try { localStorage.removeItem(KEY); } catch (e) {}
      return;
    }
    var data = parsed.data;
    Object.keys(data).forEach(function (k) {
      var f = form.elements[k];
      if (!f || SKIP[k]) return;
      if (f.length && f[0] && f[0].type === 'radio') {
        [].forEach.call(f, function (r) { if (r.value === data[k]) r.checked = true; });
      } else if (f.type === 'checkbox') { f.checked = !!data[k]; }
      else if (f.type !== 'file') { f.value = data[k]; }
    });
    if (seg && segOut) {
      [].forEach.call(seg.querySelectorAll('button'), function (x) {
        x.setAttribute('aria-pressed', String(x.getAttribute('data-val') === segOut.value));
      });
    }
    fillReview();
    if (window.gcSyncArrival) window.gcSyncArrival();
    if (savedEl) { savedEl.textContent = 'נשמר ✓'; savedEl.classList.add('is-ok'); }
  })();

  /* The draft is cleared only on a genuinely successful send, never on the
     submit event itself. While the form is closed for maintenance every submit
     fails, and wiping a complete set of answers right after telling someone to
     "try again soon" would throw away exactly what they were asked to keep.
     The submit path calls this once a real pipeline confirms receipt. */
  window.gcIntakeClearDraft = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
  };
})();

/* ---- rail index ----------------------------------------------------------
   Marks which section the reader is in. IntersectionObserver only tells us
   *that* something crossed the line, so the active section is recomputed from
   geometry on each event: the last section whose top has passed the header.
   A narrow observer band alone left nothing marked while scrolling between
   two widely spaced sections.
   ------------------------------------------------------------------------ */
(function () {
  'use strict';
  var links = [].slice.call(document.querySelectorAll('.rail-index a'));
  if (!links.length || !('IntersectionObserver' in window)) return;

  var pairs = links.map(function (a) {
    var h = document.getElementById(a.getAttribute('href').slice(1));
    return h && h.closest('.step') ? { link: a, sec: h.closest('.step') } : null;
  }).filter(Boolean);
  if (!pairs.length) return;

  function mark() {
    var active = pairs[0];
    pairs.forEach(function (p) {
      if (p.sec.getBoundingClientRect().top <= 120) active = p;
    });
    links.forEach(function (a) { a.removeAttribute('aria-current'); });
    active.link.setAttribute('aria-current', 'true');
  }

  var io = new IntersectionObserver(mark, {
    rootMargin: '-110px 0px -40% 0px',
    threshold: [0, 0.25, 0.5, 1]
  });
  pairs.forEach(function (p) { io.observe(p.sec); });
  mark();
})();

/* ---- file upload UI ------------------------------------------------------
   Progressive enhancement over <input type="file">. The input keeps its id,
   name, label and required flag; it is only moved off-screen and driven by a
   styled row. With JS off nothing here runs and the native control shows.

   The preview says a file was received. It deliberately does NOT claim the
   photo was checked or a face recognised — nothing here does that, and a form
   that collects identity documents is the last place to imply verification
   that has not happened.
   ------------------------------------------------------------------------ */
(function () {
  'use strict';
  var form = document.querySelector('[data-intake]');
  if (!form) return;

  var he = document.documentElement.lang === 'he';
  var T = he
    ? { pick: 'בחירת קובץ', opt: 'לא חובה, אפשר לדלג', got: 'נקלט ✓', swap: 'החלפה' }
    : { pick: 'Choose a file', opt: 'Optional, you can skip this', got: 'Received ✓', swap: 'Replace' };

  [].forEach.call(form.querySelectorAll('input[type=file]'), function (input) {
    var field = input.closest('.f');
    if (!field) return;
    var hint = field.querySelector('small');
    var optional = !input.required;

    var wrap = document.createElement('div');
    wrap.className = 'upload' + (optional ? ' is-optional' : '');
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    // Visually hidden, still focusable and still labelled by the <label for>.
    input.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';

    var drop = document.createElement('label');
    drop.className = 'upload-drop';
    drop.setAttribute('for', input.id);
    drop.innerHTML =
      '<span class="upload-plus" aria-hidden="true">+</span>' +
      '<span class="upload-txt"><b></b><small></small></span>';
    wrap.appendChild(drop);

    var nameEl = drop.querySelector('b');
    var subEl  = drop.querySelector('small');
    var swap   = null;

    function reset() {
      drop.querySelector('.upload-plus, .upload-thumb').outerHTML =
        '<span class="upload-plus" aria-hidden="true">+</span>';
      nameEl.textContent = T.pick;
      subEl.textContent = optional ? T.opt : (hint ? hint.textContent : '');
      subEl.className = '';
      if (swap) { swap.remove(); swap = null; }
    }
    reset();

    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (!f) { reset(); return; }

      nameEl.textContent = f.name;
      subEl.textContent = T.got + ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB';
      subEl.className = 'ok';

      var slot = drop.querySelector('.upload-plus, .upload-thumb');
      if (f.type.indexOf('image/') === 0) {
        var img = document.createElement('img');
        img.className = 'upload-thumb';
        img.alt = '';
        // Object URL, not a data URL: nothing about the file is copied into
        // the document, and it is released as soon as the image has decoded.
        img.src = URL.createObjectURL(f);
        img.onload = function () { URL.revokeObjectURL(img.src); };
        slot.replaceWith(img);
      } else if (slot.tagName === 'IMG') {
        slot.outerHTML = '<span class="upload-plus" aria-hidden="true">+</span>';
      }

      if (!swap) {
        swap = document.createElement('button');
        swap.type = 'button';
        swap.className = 'upload-swap';
        swap.textContent = T.swap;
        swap.addEventListener('click', function () { input.value = ''; reset(); });
        drop.appendChild(swap);
      }
    });
  });
})();
