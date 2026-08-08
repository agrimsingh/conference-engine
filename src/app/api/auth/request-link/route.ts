import { NextResponse } from "next/server";
import { shouldExposeDevLoginUrl } from "@/lib/auth/admin";
import { createAuthChallenge, failAuthChallenge } from "@/lib/auth/challenges";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { upsertAccountByEmail } from "@/lib/db/queries";
import type { AccountRow } from "@/lib/db/types";
import { sendAuthEmail } from "@/lib/email/resend";
import { isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";
import { consumeFixedWindowRateLimit } from "@/lib/security/rate-limit";

type RequestLinkBody = { email?: unknown; name?: unknown; next?: unknown };

function accepted(extra: Record<string, unknown> = {}): NextResponse {
	return NextResponse.json({ ok: true, ...extra }, { status: 202 });
}

function readBody(value: unknown): RequestLinkBody {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as RequestLinkBody
		: {};
}

export async function POST(request: Request) {
	let raw: unknown = null;
	try { raw = await request.json(); } catch { return accepted(); }
	const body = readBody(raw);
	const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
	const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : undefined;
	const next = typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//")
		? body.next : "/admin";
	const db = await getDb();
	const secret = await getAuthSecret();
	const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
	const emailAllowed = await consumeFixedWindowRateLimit(db, {
		secret, bucket: "organizer-link-email", subject: `email:${email || "invalid"}`, limit: 5, windowMs: 15 * 60_000,
	});
	const ipAllowed = await consumeFixedWindowRateLimit(db, {
		secret, bucket: "organizer-link-ip", subject: `ip:${ip}`, limit: 20, windowMs: 15 * 60_000,
	});
	if (!isPlausibleEmail(email) || !emailAllowed || !ipAllowed) return accepted();

	const existing = await db.prepare("SELECT * FROM accounts WHERE email = ?").bind(email).first<AccountRow>();
	const account = await upsertAccountByEmail(db, { id: existing?.id ?? crypto.randomUUID(), email, name });
	const challenge = await createAuthChallenge(db, {
		secret,
		kind: "organizer_login",
		accountId: account.id,
	});
	const callbackUrl = new URL("/auth/callback", request.url);
	callbackUrl.searchParams.set("token", challenge.token);
	callbackUrl.searchParams.set("next", next);
	const loginUrl = callbackUrl.toString();
	const delivery = await sendAuthEmail({
		toEmail: email,
		templateKey: "organizer_magic_link",
		context: { eventName: "conference-engine", submitterName: account.name.trim() || name || "there", title: "Organizer admin", loginUrl },
		idempotencyKey: challenge.tokenHash,
	});
	if (!delivery.ok) {
		await failAuthChallenge(db, { tokenHash: challenge.tokenHash, reason: delivery.error ?? "mail delivery failed" });
		return accepted();
	}
	return accepted((await shouldExposeDevLoginUrl()) ? { loginUrl } : {});
}
