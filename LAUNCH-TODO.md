# Launch to-do — lifted out of the published HTML on 2026-09-14

These blocks were rendering publicly on indexable pages. They are tracked here
instead. This file is excluded from deployment via .vercelignore.

Updated 2026-09-17: entity details, retention period and jurisdiction supplied
by the owner and written into privacy/refund/terms (HE+EN). noindex removed
from those six pages.

Updated 2026-09-18: a separate session published the accessibility statement
(commit 3f24c2b) and a later session in this thread corrected the phone
number sitewide (commit acd0e7d). Both are live in production. What is left
below is genuinely still open.

## Resolved

- [x] Legal entity name + company/licensed-dealer number — Greek Cloud, 323587485
- [x] Registered address — יגאל אלון 2, תל אביב / 2 Yigal Alon St, Tel Aviv
- [x] Contact email — 1greek.cloud@gmail.com (used for privacy, refund and
      terms enquiries alike — a single shared inbox, not separate addresses)
- [x] Contact phone — +972-52-365-6528
- [x] Retention period — 3 months from the close of the request (privacy.html)
- [x] Jurisdiction district — Tel Aviv (terms.html)
- [x] External data processors — already disclosed in privacy.html: Vercel
      (EU/Frankfurt, full submission) and Resend (US, name/city/route/date/id
      only)
- [x] Cancellation fee — resolved by relying on the statutory cap (5% of the
      transaction price or ₪100, whichever is lower) rather than a separate
      house policy; already stated in refund.html
- [x] Postal address for a cancellation notice — not offered as a channel;
      email is the sole stated route, which the Consumer Protection Law permits

## Still open

- [ ] `about.html` `sameAs`: Instagram / Facebook / TikTok links — cosmetic,
      not a launch blocker (owner said "links to follow")
- [ ] Whether the database is registered with the Israeli Database Registrar,
      and the registration number if so — not stated either way on the site;
      confirm before this becomes a real question (e.g. a regulator enquiry)
- [ ] Name of the database manager / person responsible for information
      security
- [ ] Refund turnaround in business days and the name of the payment
      processor — refund.html currently relies on the statutory period
      rather than naming a specific day count or processor; fine as published,
      but worth tightening once a processor is chosen
- [x] `accessibility.html` — published and indexable as of 2026-09-18
      (commit 3f24c2b). States IS 5568 / WCAG 2.0 AA conformance, entity name
      + registration number, contact email and phone, and honestly discloses
      what is not yet done: no certified accessibility auditor review yet, no
      manual screen-reader testing yet. Correctly explains that a named
      coordinator is only mandatory for a public body or a 25+-employee
      employer, and that this business is neither, rather than inventing a
      role. Still open: actually commissioning the certified auditor review
      and the manual screen-reader pass mentioned as pending on the page.
