# P0 confirm email, production inbox proof

**Verdict.** PASS. A real `submission_received` confirmation landed in Gmail for `agrim.singh@gmail.com`, with matching Resend provider id and remote D1 `email_deliveries.status = sent`.

**Branch / tip.** `p0/confirm-email-verify` @ `6d3d09e` (no product code change required).

**throughput checkpoint.** n/a, read-only investigation with one prod write (CFP submit).

## Code path

1. `POST /api/e/[eventSlug]/submit/[formSlug]` (`src/app/api/e/[eventSlug]/submit/[formSlug]/route.ts`) inserts the submission, then calls `notifySubmissionLifecycle(..., templateKey: "submission_received")`.
2. Draft finalize uses the same notify (`.../draft/finalize/route.ts`).
3. `notifySubmissionLifecycle` (`src/lib/email/notify.ts`) loads submission + event, then calls `sendTemplatedEmail`.
4. `sendTemplatedEmail` (`src/lib/email/resend.ts`) skips demo events, reserves a row in `email_deliveries` under a payload HMAC `delivery_key`, calls Resend, then marks `provider_accepted` → `sent`.
5. Default subject/body live in `src/lib/email/templates.ts` / `src/lib/domain/message-templates.ts` (`Thanks for submitting to {{event_name}}`).
6. Dedupe is per delivery key (event + submission + template + to + subject/body). A new submission id always gets a new key, so reuse of the same inbox does not skip send.

## Prod trigger

- Host: `https://conference-engine.65labs.org`
- Event: `aie-sandbox` (writable; public form `GET /e/aie-sandbox/submit/cfp` → 200)
- Form: `cfp` (open)
- Method: one `POST /api/e/aie-sandbox/submit/cfp` with lightning payload to controlled inbox
- Title: `P0 confirm email verify 20260809T171630Z`
- Submitter: Agrim Singh / `agrim.singh@gmail.com`

### API response (HTTP 200)

```json
{
  "ok": true,
  "submissionId": "4cabd03c-648e-4d18-b4a5-41bb9456dadb",
  "email": {
    "ok": true,
    "status": "sent",
    "providerId": "230f41fc-9f16-41e5-b8fb-71dbfe3c8fff",
    "messageId": "JYT7ko-j_hihQpTQ482B0coAHfVGef3zBlD1iTbGpTI"
  },
  "coSpeakerInvites": []
}
```

## Gmail inbox evidence

Queried via MCP `plugin-gmail-gmail` (`search_threads` + `get_message`).

| Field | Value |
| --- | --- |
| Thread id | `19fe692af4542593` |
| Message id | `19fe786b8621eaf6` |
| From | `team@65labs.org` |
| To | `agrim.singh@gmail.com` |
| Subject | `Thanks for submitting to AI Engineer Sandbox` |
| Date (Gmail) | `2026-08-09T17:16:33Z` |
| Labels | `UNREAD`, `IMPORTANT`, `INBOX` |
| Body | `Hi Agrim Singh,` / proposal `"P0 confirm email verify 20260809T171630Z"` / `AI Engineer Sandbox` |

This is inbox receipt, not only a logged provider id.

## Remote D1 `email_deliveries`

```sql
SELECT delivery_key, submission_id, template_key, to_email, subject, status, provider_id, error
FROM email_deliveries
WHERE submission_id = '4cabd03c-648e-4d18-b4a5-41bb9456dadb';
```

| Column | Value |
| --- | --- |
| delivery_key | `JYT7ko-j_hihQpTQ482B0coAHfVGef3zBlD1iTbGpTI` |
| event_id | `evt_aie_sandbox` |
| template_key | `submission_received` |
| to_email | `agrim.singh@gmail.com` |
| subject | `Thanks for submitting to AI Engineer Sandbox` |
| status | `sent` |
| provider_id | `230f41fc-9f16-41e5-b8fb-71dbfe3c8fff` |
| error | null |

Provider id matches the submit API `email.providerId`. Delivery key matches API `email.messageId`.

## Fix / commit

None. Prod path works end to end. No tsc/lint/test run for a code fix.

## Replay

```bash
# submit (use a unique title)
curl -sS -X POST "https://conference-engine.65labs.org/api/e/aie-sandbox/submit/cfp" \
  -H "content-type: application/json" \
  -d @payload.json

# D1
npx wrangler d1 execute conference-engine --remote --command \
  "SELECT status, provider_id, subject FROM email_deliveries WHERE submission_id = '<id>';"

# Gmail: from:team@65labs.org subject:"Thanks for submitting" newer_than:1d
```
