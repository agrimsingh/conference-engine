# P0.3 evidence

- Migration: `migrations/0041_event_contact_email.sql`
- Unit: `unit-email.log` (UNIT_EXIT:0); verbose family run in `resend-reply-to-verbose.log`
- Typecheck: `tsc.log` (TSC_EXIT:0)
- Lint touched paths: `lint.log` (LINT_EXIT:0)
- Captured Resend JSON with `reply_to`: `resend-payload-reply-to.json` (from `resend-reply-to.test.ts` assertion against `fetchWithBoundedRetry` body)
- Settings UI screenshot: **blocked** — no local/dev listener on :3000/:8787 at capture time; Contact email field is in `settings-editor.tsx` (Event details)

