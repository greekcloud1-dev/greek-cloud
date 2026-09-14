# Security notes

Review date: 2026-09-06. Covers the static site and the two serverless functions.

The single most important structural fact, and the reason the overall risk here is
contained: **there is no read surface.** `api/` holds exactly two files, and neither can
retrieve, list or enumerate a stored submission. No endpoint takes a submission id and
returns anything. An attacker can write junk; there is no code path through which they can
read anyone's passport number, health description or photo.

---

## Fixed in code

| Area | What was wrong | What changed |
|---|---|---|
| CSP | `img-src` omitted `blob:`, so the upload thumbnail preview was **silently broken in production**. Never seen locally because the dev server sends no CSP. | Added `blob:`. Verified by reproducing the real policy in an iframe: before `BLOCKED`, after `LOADED`, external images still blocked. |
| Upload type | `contentType` was taken verbatim from the client; `accept="image/*"` is a browser hint only. Anything could be stored as a "selfie". | Type is now decided by the file's own leading bytes (JPEG/PNG/WebP/HEIC, plus PDF for the prescription only). HTML disguised as `image/jpeg` is rejected. |
| Upload path | The client filename was concatenated into the Blob key. `@vercel/blob` blocks only the literal sequence `//` — `../` passes straight through. | The filename is discarded. Keys are now fixed: `selfie.<detected-ext>`. |
| Upload size | No server-side cap on either file. | 5 MB per file, `413` beyond. |
| Field length | No cap anywhere. `condition` could carry megabytes into the stored record. | Per-field caps; `400 too_long:<field>`. |
| Field content | Control characters passed through into a value used in the email subject. | Stripped before use. |
| Age | `min="18"` existed only in the browser. A minor's health record could be stored. | Validated server-side; 17, 0, −5, `abc` and 200 all rejected. |
| Submission id | `Math.random()` — predictable from earlier draws, on the value that separates one medical record from another. | `crypto.randomUUID()`. |
| Consent | No explicit consent to process **health data**. Bundling it into a general terms box is what makes such consent invalid. | Added `c_health` as a separate required checkbox, enforced server-side. |
| Honeypot | Returned a bare `{ok:true}` while real success returned `{ok:true, submissionId}` — a free oracle for finding the field name. | Now returns an identically shaped response. |
| Email failure | Swallowed into `console.error`. The failure mode it guards against (quota exhausted, key rotated, domain unverified) is exactly the one nobody notices. | Also writes `NOTIFY-FAILED.json` beside the record, where the operator is already looking. |
| Rate limiting | None. | Best-effort per-instance limiter, 5/hour/address, `429` with `Retry-After`. **See the caveat below — this is a speed bump, not a wall.** |
| localStorage | The intake draft persisted **passport number**, name, email and phone to the device indefinitely. `condition` was already excluded. | `passport` now excluded too; drafts carry a timestamp and expire after 7 days; pre-existing drafts are discarded rather than restored. |
| Browser storage | Passport and health textarea had no `autocomplete` restriction. | `autocomplete="off" spellcheck="false"` on both. |
| Headers | Missing HSTS, CORP, `X-DNS-Prefetch-Control`. `Permissions-Policy` still listed the removed `interest-cohort`. `/api/*` inherited a document CSP that means nothing to JSON. | All added/corrected; `/api/*` now has its own block (`default-src 'none'`, `no-store`, `no-referrer`). |
| Framing | `SAMEORIGIN` / `frame-ancestors 'self'`, but nothing on the site is framed. | Tightened to `DENY` / `'none'`. |
| Line endings | `core.autocrlf=true` with no `.gitattributes`: the served bytes of the inline script differ between a Windows checkout and a Linux build. | Added `.gitattributes` pinning `eol=lf`. Prerequisite for the CSP change below. |

---

## Still open — needs you, not code

**1. Vercel WAF rate limit + spend limit.** The in-code limiter is per-instance. Serverless
scales horizontally, so a distributed flood, or just enough concurrency to spin up new
instances, walks past it. The real control is a firewall rule in front of the function plus
a hard spend cap on the project. Without a spend limit, an unauthenticated write endpoint is
a cheap way to run up a bill.

**2. Retention.** Nothing is ever deleted. Health records, passport numbers and face photos
accumulate in Blob indefinitely. Decide a period, then implement deletion — this needs a
business decision first, which is why it is not done here.

**3. DPA with Vercel and Resend.** Both are processors handling special-category data. A
processor contract is required. Neither exists yet.

**4. Controller identity.** `privacy.html`, `terms.html` and `refund.html` still carry the
"not legally reviewed" banner and name no legal entity. A privacy policy with no identifiable
controller is not a functioning policy.

**5. `script-src 'unsafe-inline'`.** Replaceable with a `sha256-` hash of the one inline
bootstrap block, which is byte-identical across pages. Not done here because a wrong hash
breaks every page and the fix cannot be verified without a real deploy. The `.gitattributes`
above removes the blocker; do this as its own change and check a preview deploy before
promoting.

**6. Deployment protection.** The intake form is live and writing real data while the site is
pre-launch. Consider Vercel Deployment Protection on previews until launch.

**7. `BLOB_READ_WRITE_TOKEN` blast radius.** A public, unauthenticated function holds a
read-write storage token. Nothing in the code misuses it — `put` is the only import, and
neither `del` nor `list` is imported — but if a narrower write-only credential becomes
available, take it.

---

## Checked and genuinely fine

- **No secrets committed**, no `.env` tracked, lockfile present and tracked.
- **No client-side XSS.** Every `innerHTML` takes a static literal; uploaded filenames render
  via `textContent`; there is no `location.search`, `URLSearchParams`, `location.hash` or
  `postMessage` handling anywhere.
- **No third-party scripts.** Google Fonts stylesheet only. (SRI is not workable for that URL
  — Google serves different CSS per user agent. Do not add it.)
- **Error responses leak nothing** — fixed tokens from a closed set, no stack traces, no
  exception text, and `missing:${key}` interpolates only keys from a literal, never user input.
- **The notification email really is thin** — plan, city, arrival, name, id. No passport, no
  health description, no files.
- **`record.json` stores the blob *pathname*, not a signed URL** — a leaked record does not
  hand anyone a working link to the face photo.
- **Overwrites fail closed.** `addRandomSuffix: false` with `allowOverwrite` unset means a
  `put` to an existing path throws rather than replacing.
- **No CSRF concern** — the endpoint is unauthenticated and holds no session, so there is no
  ambient authority for a cross-site POST to borrow.
- **`Cross-Origin-Embedder-Policy` deliberately NOT added** — it would break the Google Fonts
  stylesheet for no benefit here.
- **`style-src 'unsafe-inline'` cannot be removed** — 185 style attributes plus CSSOM writes.
