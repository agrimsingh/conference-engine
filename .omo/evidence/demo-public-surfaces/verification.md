# Demo public surfaces — verification

## Intent

- `/demo` launches into real routes (not a static field-list brochure).
- `demo-cfp-to-stage` / `cfp` form status `open` for interactive browse; `events.mode=demo` blocks writes.
- `aie-sandbox` is local-only writable; prod public forms for that slug should be `closed`.

## Prod checks (post-deploy)

```bash
# Demo CFP UI (expect 200 + form chrome, not "CFP closed")
curl -sS -o /tmp/demo-cfp.html -w "%{http_code}\n" \
  https://conference-engine.65labs.org/e/demo-cfp-to-stage/submit/cfp
rg -n "Read-only demo|Call for proposals|Session format" /tmp/demo-cfp.html | head

# Submit blocked
curl -sS -X POST https://conference-engine.65labs.org/api/e/demo-cfp-to-stage/submit/cfp \
  -H 'content-type: application/json' \
  -d '{"submitterName":"x","submitterEmail":"x@example.com","answers":{}}' \
  -w "\n%{http_code}\n"

# aie-sandbox public CFP not accepting (closed page or non-200 form)
curl -sS -o /tmp/aie-cfp.html -w "%{http_code}\n" \
  https://conference-engine.65labs.org/e/aie-sandbox/submit/cfp
rg -n "CFP closed|no longer accepting|Call for proposals" /tmp/aie-cfp.html | head

# Launcher
curl -sS -o /tmp/demo.html -w "%{http_code}\n" \
  "https://conference-engine.65labs.org/demo?perspective=applicant"
rg -n "Demo launcher|Open demo CFP" /tmp/demo.html | head
```

## Remote SQL (ops)

```sql
UPDATE cfp_forms SET status='open', opens_at=NULL, closes_at=NULL
WHERE id='demo-cfp-form' AND slug='cfp' AND event_id='demo-cfp-to-stage-2026';

UPDATE cfp_forms SET status='closed'
WHERE event_id='evt_aie_sandbox' AND slug IN ('cfp','lightning','workshop') AND kind='public';
```

Never run `scripts/seed.sql` with `--remote`.
