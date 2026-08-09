# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: conference program organizers (the archetype is the AI Engineer conference team). They run the full program lifecycle — CFP intake, review, acceptance, speaker onboarding, scheduling, publishing — under time pressure, often mid-event-cycle with hundreds of submissions. When design trade-offs conflict, the organizer wins: admin speed and information density outrank other concerns.

Secondary audiences (confirmed roles in the product):
- Speakers: submit talks via public CFP, complete onboarding tasks (bio, headshot, slides, supporting docs) through a magic-link portal.
- Reviewers: score submissions 1–5 with comments via tokenized links, identified by name.
- Attendees/public: read the published schedule (list/day/week/track/room views).

## Product Purpose

An open-source alternative to Sessionboard's "Program" module: CFP → review → accept → speaker onboarding → schedule → publish. Built originally for the AI Engineer hackathon (judged by the AIE team), but the confirmed intent is real adoption — win or lose, this should become software AIE or similar conference teams actually run. Success means an organizer team chooses it over Sessionboard/Sessionize for a real event.

## Positioning

Job-to-be-done over enterprise breadth. Sessionboard bundles Program + CRM + Marketing + CMS at $40k+/yr and is demo-gated and slow; this product does only the program side, fast. Speed is the wedge — the reference product's slowness is the customer's stated pain. Closest competitor in shape is Sessionize (~$499/event); the differentiators are the AIE-shaped conditional CFP preset, the realtime "who's blocking the program" outstanding-tasks board, and self-hosting on the organizer's own Cloudflare account.

## Operating Context

- The full lifecycle is: public CFP submission (conditional fields by session format) → category routing → evaluation plan with named reviewers → accept/reject with templated email → auto-spawned speaker tasks → magic-link speaker portal with file uploads → drag-and-drop scheduling with hard room/speaker conflict detection → calendar invites (.ics) → public schedule.
- Organizers work in an admin area (magic-link sign-in via `accounts` + `event_memberships`; optional cookie bypass in dev). A realtime dashboard shows outstanding speaker tasks via WebSocket with poll fallback.
- Daily cron sends task reminder emails; an admin endpoint triggers them on demand.
- A keyed public API (`/api/v1/...`) exposes submissions and schedule for downstream tooling; Sessionboard parity feature.
- Reference public-schedule structure: wf2025.ai.engineer/schedule (structure inspiration only, own style).

## Capabilities and Constraints

- Stack (fixed): Next.js App Router via OpenNext on Cloudflare Workers; D1 as system of record; R2 for uploads; KV for sessions; `EventRoom` Durable Object for realtime; Resend for email (from team@65labs.org). Deployed at conference-engine.65labs.org; public repo github.com/agrimsingh/conference-engine.
- Domain spine: `Event → CFPForm → Submission → Evaluation → Acceptance → SpeakerTask → AgendaSlot`. A submission becomes the session on acceptance. Category (routed from the format answer) doubles as the schedule track.
- Forms render generically from DB rows. Admin form-builder at `/admin/events/[slug]/forms` edits those rows (no seed-SQL edits required).
- English-only; no payments; no CRM/marketing/CMS scope. AI-assisted review explicitly optional/struck.
- Airtable: one-way CSV download plus optional Airtable REST push; never the system of record.
- Reviewer assignment: organizers assign named reviewers to specific submissions; scoring and the review board both fail-close when a reviewer has zero assignments (empty board / no scores). `emptyMeansAll` remains on the filter helper for explicit non-board callers only.
- Public schedule: attendees see `published` sessions only; `scheduled` remains organizer-private until publish.
- Multi-event: organizer accounts (`accounts`) hold email identity; `event_memberships` (role `admin`) scope admin access per event, while canonical ownership lives in the `event_ownership` table (at most one owner per event; ownership transfers atomically). Events created by a signed-in organizer always have an owner; only legacy events explicitly flagged `ownership_claimable` may temporarily have none. Magic-link login is the production auth path. Owners and admins invite teammates by email from `/admin/events/[slug]/team` (invitees join as `admin`); only the owner can transfer ownership, and admins can leave an event they don't own. Events flagged `ownership_claimable` with no owner row (pre-accounts-era events) can be claimed by any signed-in organizer; claiming clears the flag.
- Public embed: `/embed/[slug]/schedule` is the iframe-friendly schedule (no app chrome).
- Licensing: MIT open source. No paid SKU and no per-event pricing track.
- Undecided product facts: product name (see Brand Commitments).

## Brand Commitments

"conference-engine" remains an explicit placeholder name — open to renaming.

**Visual direction (user-chosen, 2026-08-08): the category standard, played straight.** When offered novel visual worlds, the user deliberately chose the conventional developer-tool aesthetic executed at full craft — no irony, no smuggled quirk. The quality bar is the landing/product craft of Linear, Vercel, Resend, Stripe, and PostHog. Convention is the commitment; future visual work should refine within this canon rather than re-litigating the direction. The public schedule took structural (not stylistic) inspiration from wf2025.ai.engineer/schedule.

## Evidence on Hand

- Live production deployment: https://conference-engine.65labs.org with seeded read-only demo event `demo-cfp-to-stage` at `/demo` (CFP, schedule, portal, review board, admin dashboard all runnable end-to-end).
- Real transactional email delivery via Resend (provider IDs logged for submission confirmations, acceptance, magic links, reminders).
- Public repository with per-slice commit history: https://github.com/agrimsingh/conference-engine.
- Customer's own requirements doc and video walkthrough (local `research/`, not in repo): six firm requirements, the "$40,000 for this software" quote, and the "very fancy form builder" framing.
- No real-event usage data, testimonials, or customers yet — do not fabricate any.

## Product Principles

1. **Organizer velocity is the product.** Every admin interaction should feel instant; the customer left Sessionboard over slowness. Density and keyboard-speed beat whitespace and ceremony in admin surfaces.
2. **The job, not the org chart.** Ship the program lifecycle completely; refuse adjacent scope (CRM, marketing, CMS, payments) even when it looks easy.
3. **The pipeline must never stall silently.** Outstanding work — unreviewed submissions, incomplete speaker tasks, unscheduled acceptances — is surfaced loudly and in real time.
4. **Speakers get consumer-grade, organizers get pro-grade.** Public and portal surfaces earn trust with clarity and polish; admin surfaces optimize for throughput.
5. **Data stays legible and exportable.** D1 is the single source of record; public API and one-way exports over integrations that fork the truth.
