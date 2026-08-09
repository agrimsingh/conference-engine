import { NextResponse } from "next/server";
import { isJsonObject, readBoundedJson } from "@/lib/cfp/request";
import { shouldExposeDevLoginUrl } from "@/lib/auth/admin";
import { failOneTimeLinkChallengeIfConfirmed } from "@/lib/auth/email-delivery";
import { createAuthChallenge } from "@/lib/auth/challenges";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { getPersonByEmail, listEventsByIds, listSubmissionsForPerson } from "@/lib/db/queries";
import { sendTemplatedEmail } from "@/lib/email/resend";
import { isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";

const MAX_PORTAL_LINK_REQUEST_BYTES = 16 * 1024;

function accepted(extra: Record<string, unknown> = {}): NextResponse {
	return NextResponse.json({ ok: true, ...extra }, { status: 202 });
}

export async function POST(request: Request) {
	const parsed = await readBoundedJson(request, MAX_PORTAL_LINK_REQUEST_BYTES);
	if (!parsed.ok || !isJsonObject(parsed.value)) return accepted();
	const body = parsed.value;
	const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
	if (!isPlausibleEmail(email)) return accepted();
	const db = await getDb();
	const person = await getPersonByEmail(db, email);
	if (!person) return accepted();
	const submissions = await listSubmissionsForPerson(db, person.id);
	const events = await listEventsByIds(db, submissions.map((submission) => submission.event_id));
	const writableEvents = new Map(events
		.filter((event) => event.mode !== "demo")
		.map((event) => [event.id, event]));
	// A person can own proposals in more than one event. Choose the first
	// proposal whose actual event is writable; do not treat the person alone as
	// sufficient eligibility or let a demo-only record create a challenge.
	const primary = submissions.find((submission) => writableEvents.has(submission.event_id));
	if (!primary) return accepted();
	const event = writableEvents.get(primary.event_id);
	if (!event) return accepted();

	const secret = await getAuthSecret();
	const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const [emailAllowed, ipAllowed] = await Promise.all([
		consumeFixedWindowRateLimit(db, { secret, bucket: "portal-link-email", subject: `email:${email || "invalid"}`, limit: 5, windowMs: 15 * 60_000 }),
		consumeFixedWindowRateLimit(db, { secret, bucket: "portal-link-ip", subject: `ip:${ip}`, limit: 20, windowMs: 15 * 60_000 }),
	]);
	if (!emailAllowed || !ipAllowed) return accepted();
	const challenge = await createAuthChallenge(db, {
		secret,
		kind: "portal_login",
		personId: person.id,
		eventId: event.id,
	});
	const url = new URL("/portal/authorize", request.url);
	url.searchParams.set("token", challenge.token);
	const delivery = await sendTemplatedEmail(db, {
		eventId: event.id,
		submissionId: null,
		templateKey: "portal_magic_link",
		toEmail: person.email,
		context: { eventName: event?.name ?? "conference-engine", submitterName: person.name?.trim() || "there", title: "Speaker portal", portalUrl: url.toString() },
		force: true,
	});
	if (!delivery.ok && await failOneTimeLinkChallengeIfConfirmed(db, {
		tokenHash: challenge.tokenHash,
		result: delivery,
		reason: delivery.error ?? "mail delivery failed",
	})) {
		return accepted();
	}
	if (await shouldExposeDevLoginUrl()) {
		return accepted({ personId: person.id, email: person.email, portalUrl: `${url.pathname}?${url.searchParams}` });
	}
	return accepted();
}
