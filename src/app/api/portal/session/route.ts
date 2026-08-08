import { NextResponse } from "next/server";
import { shouldExposeDevLoginUrl } from "@/lib/auth/admin";
import { failOneTimeLinkChallengeIfConfirmed } from "@/lib/auth/email-delivery";
import { createAuthChallenge } from "@/lib/auth/challenges";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { getEventById, getPersonByEmail, listSubmissionsForPerson } from "@/lib/db/queries";
import { sendTemplatedEmail } from "@/lib/email/resend";
import { hasPortalEligibility } from "@/lib/speakers/portal-session";
import { isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";

function accepted(extra: Record<string, unknown> = {}): NextResponse {
	return NextResponse.json({ ok: true, ...extra }, { status: 202 });
}

export async function POST(request: Request) {
	let raw: unknown;
	try { raw = await request.json(); } catch { return accepted(); }
	const body = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
	const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
	const db = await getDb();
	const secret = await getAuthSecret();
	const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const [emailAllowed, ipAllowed] = await Promise.all([
		consumeFixedWindowRateLimit(db, { secret, bucket: "portal-link-email", subject: `email:${email || "invalid"}`, limit: 5, windowMs: 15 * 60_000 }),
		consumeFixedWindowRateLimit(db, { secret, bucket: "portal-link-ip", subject: `ip:${ip}`, limit: 20, windowMs: 15 * 60_000 }),
	]);
	if (!isPlausibleEmail(email) || !emailAllowed || !ipAllowed) return accepted();

	const person = await getPersonByEmail(db, email);
	if (!person) return accepted();
	const submissions = await listSubmissionsForPerson(db, person.id);
	if (!hasPortalEligibility(submissions)) return accepted();
	const primary = submissions[0];
	if (!primary) return accepted();
	const event = await getEventById(db, primary.event_id);
	const challenge = await createAuthChallenge(db, {
		secret,
		kind: "portal_login",
		personId: person.id,
		eventId: primary.event_id,
	});
	const url = new URL("/portal/authorize", request.url);
	url.searchParams.set("token", challenge.token);
	const delivery = await sendTemplatedEmail(db, {
		eventId: primary.event_id,
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
