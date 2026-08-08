import { NextResponse } from "next/server";
import {
	shouldExposeDevLoginUrl,
} from "@/lib/auth/admin";
import {
	createOrganizerLoginToken,
} from "@/lib/auth/organizer-session";
import { getDb } from "@/lib/db/cloudflare";
import { upsertAccountByEmail } from "@/lib/db/queries";
import { sendAuthEmail } from "@/lib/email/resend";

type Body = {
	email?: unknown;
	name?: unknown;
	next?: unknown;
};

export async function POST(request: Request) {
	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
	}

	const email =
		typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	if (!email.includes("@")) {
		return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 });
	}

	const name = typeof body.name === "string" ? body.name : undefined;
	const next =
		typeof body.next === "string" && body.next.startsWith("/")
			? body.next
			: "/admin";

	const db = await getDb();
	const account = await upsertAccountByEmail(db, { email, name });
	const { token } = await createOrganizerLoginToken({
		accountId: account.id,
		email: account.email,
	});

	const callbackUrl = new URL("/auth/callback", request.url);
	callbackUrl.searchParams.set("token", token);
	callbackUrl.searchParams.set("next", next);
	const loginUrl = callbackUrl.toString();

	await sendAuthEmail({
		toEmail: account.email,
		templateKey: "organizer_magic_link",
		context: {
			eventName: "conference-engine",
			submitterName: account.name.trim() || "there",
			title: "Organizer admin",
			loginUrl,
		},
	});

	const exposeDevUrl = await shouldExposeDevLoginUrl();
	if (exposeDevUrl) {
		return NextResponse.json({ ok: true, loginUrl });
	}

	return NextResponse.json({ ok: true });
}
