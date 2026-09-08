# Synthetic customer intake verification — 2026-09-08

## Result: blocked before persistence

The local app at `http://localhost:3005` is an unconfigured demo. No customer
case was persisted, no reference number was issued, and no external message was
sent. Do not treat this check as successful end-to-end intake.

Synthetic data used (not a real customer):

- Name: לקוח דמה — בדיקת קליטה
- Phone: +12025550143 (fictional-number range)
- Email: crm-intake-test@example.com
- Service: other / בירור כללי
- Preferred contact: email
- Requested flight: 2026-09-15 14:30, Asia/Jerusalem
- Contact consent: checked for this synthetic test

| Boundary | Evidence | Result |
| --- | --- | --- |
| Customer form | Name, phone, email, service and consent advanced to review | Passed |
| Flight review | Automated datetime fill had a valid DOM value, but review displayed `טרם נקבע` | Needs manual-input reproduction; may be automation/event behavior |
| Submit control | Disabled; page explicitly states intake is not yet available | Correctly blocked |
| API | One direct synthetic POST to `/api/leads` returned HTTP 503: `שליחת פניות עדיין אינה זמינה. הפרטים לא נשמרו. אפשר לנסות שוב מאוחר יותר.` | Persistence unavailable |
| Database / staff view / notifications | Not reached | Not verified |

No browser console errors were observed on the checked form. Only
`.env.example` exists in the CRM directory; the running app reports demo mode.

## Next acceptance check

Connect an authorized test Supabase environment, apply migrations and activate
a test staff account. Reproduce the flight input using normal keyboard/date-picker
interaction, then submit one synthetic contact and verify the returned reference,
saved fields and UTC flight value, staff visibility after refresh, callback task,
audit trail and in-app notification. Verify outbound delivery separately with
explicit test destinations. Never enable real sends to fictional phone numbers.

Security work is a separate task. The inability to store this test contact remains
an activation blocker, not something to hide by enabling simulated success.
