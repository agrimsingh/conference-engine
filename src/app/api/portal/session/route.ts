import { NextResponse } from "next/server";
import { isAdminBypass } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventById,
	getPersonByEmail,
	listAcceptedSubmissionsForPerson,
} from "@/lib/db/queries";
import { sendTemplatedEmail } from "@/lib/email/resend";
import { createPortalSession } from "@/lib/speakers/portal-session";

type Body = {
	email?: unknown;
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

	const db = await getDb();
	const person = await getPersonByEmail(db, email);
	if (!person) {
		return NextResponse.json(
			{
				ok: false,
				error: "No speaker record for that email. Accept a submission first.",
			},
			{ status: 404 },
		);
	}

	const { token, expiresInSeconds } = await createPortalSession({
		email: person.email,
		personId: person.id,
	});

	const url = new URL("/portal", request.url);
	url.searchParams.set("token", token);
	const portalUrl = url.toString();
	const portalPath = `${url.pathname}?${url.searchParams.toString()}`;

	const submissions = await listAcceptedSubmissionsForPerson(db, person.id);
	const primary = submissions[0];
	if (!primary) {
		return NextResponse.json(
			{
				ok: false,
				error: "No accepted submissions for that speaker.",
			},
			{ status: 404 },
		);
	}

	const event = await getEventById(db, primary.event_id);
	const eventName = event?.name ?? "conference-engine";

	const sendResult = await sendTemplatedEmail(db, {
		eventId: primary.event_id,
		submissionId: null,
		templateKey: "portal_magic_link",
		toEmail: person.email,
		context: {
			eventName,
			submitterName: person.name?.trim() || "there",
			title: "Speaker portal",
			portalUrl,
		},
		force: true,
	});

	const admin = await isAdminBypass();
	if (admin) {
		return NextResponse.json({
			ok: true,
			sent: sendResult.ok,
			token,
			personId: person.id,
			email: person.email,
			expiresInSeconds,
			portalUrl: portalPath,
			...(sendResult.ok ? {} : { emailError: sendResult.error }),
		});
	}

	if (!sendResult.ok) {
		return NextResponse.json(
			{ ok: false, error: sendResult.error || "Failed to send sign-in email" },
			{ status: 502 },
		);
	}

	return NextResponse.json({
		ok: true,
		sent: true,
	});
}
