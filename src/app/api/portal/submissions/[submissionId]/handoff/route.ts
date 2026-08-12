import { NextResponse } from "next/server";
import { getAuthSecret, getDb } from "@/lib/db/cloudflare";
import { readPortalSessionFromCookie } from "@/lib/speakers/portal-session";
import { requestSpeakerHandoff } from "@/lib/speakers/handoff";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function POST(request: Request, context: RouteContext) {
	const session = await readPortalSessionFromCookie();
	if (!session) {
		return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 401 });
	}
	const { submissionId } = await context.params;
	const body = (await request.json()) as { email?: unknown; name?: unknown };
	if (typeof body.email !== "string") {
		return NextResponse.json({ ok: false, error: "Enter a manager email" }, { status: 400 });
	}
	let authSecret: string;
	try {
		authSecret = await getAuthSecret();
	} catch {
		return NextResponse.json({ ok: false, error: "AUTH_SECRET missing" }, { status: 500 });
	}
	const result = await requestSpeakerHandoff(await getDb(), {
		submissionId,
		speakerPersonId: session.personId,
		managerEmail: body.email,
		managerName: typeof body.name === "string" ? body.name : undefined,
		origin: new URL(request.url).origin,
		runtime: { authSecret },
	});
	return result.ok
		? NextResponse.json(result)
		: NextResponse.json(result, { status: result.status });
}
