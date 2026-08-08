import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/cloudflare";
import { getPersonByEmail } from "@/lib/db/queries";
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

	return NextResponse.json({
		ok: true,
		token,
		personId: person.id,
		email: person.email,
		expiresInSeconds,
		portalUrl: `${url.pathname}?${url.searchParams.toString()}`,
	});
}
