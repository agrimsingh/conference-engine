import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/cfp/request";
import { authorizeWritableEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getSubmissionById,
	getSubmissionSpeakerById,
} from "@/lib/db/queries";
import {
	addCoSpeaker,
	confirmCoSpeaker,
	inviteCoSpeaker,
	removeCoSpeaker,
} from "@/lib/speakers/co-speakers";

type RouteContext = {
	params: Promise<{ eventSlug: string; submissionId: string }>;
};

type SpeakerAction =
	| { action: "add"; name: string; email: string }
	| { action: "confirm"; speakerId: string }
	| { action: "remove"; speakerId: string }
	| { action: "resend"; speakerId: string };

function parseAction(raw: unknown): SpeakerAction | null {
	if (typeof raw !== "object" || raw === null) return null;
	const record = raw as Record<string, unknown>;
	switch (record.action) {
		case "add": {
			if (typeof record.name !== "string" || typeof record.email !== "string") {
				return null;
			}
			return { action: "add", name: record.name, email: record.email };
		}
		case "confirm":
		case "remove":
		case "resend": {
			if (typeof record.speakerId !== "string") return null;
			return { action: record.action, speakerId: record.speakerId };
		}
		default:
			return null;
	}
}

export async function POST(request: Request, context: RouteContext) {
	const { eventSlug, submissionId } = await context.params;

	const db = await getDb();
	const authorization = await authorizeWritableEventAdminApi(db, eventSlug);
	if (!authorization.ok) return authorization.response;
	const event = authorization.access.event;

	const submission = await getSubmissionById(db, submissionId);
	if (!submission || submission.event_id !== event.id) {
		return NextResponse.json(
			{ ok: false, error: "Submission not found" },
			{ status: 404 },
		);
	}

	const json = await readBoundedJson(request, 16 * 1024);
	if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: json.status });
	const raw = json.value;

	const parsed = parseAction(raw);
	if (!parsed) {
		return NextResponse.json(
			{ ok: false, error: "Expected {action: add|confirm|remove|resend, …}" },
			{ status: 400 },
		);
	}

	const origin = new URL(request.url).origin;

	// Actions on an existing speaker must target one from this submission.
	if (parsed.action !== "add") {
		const speaker = await getSubmissionSpeakerById(db, parsed.speakerId);
		if (!speaker || speaker.submission_id !== submissionId) {
			return NextResponse.json(
				{ ok: false, error: "Speaker not found" },
				{ status: 404 },
			);
		}
	}

	switch (parsed.action) {
		case "add": {
			const added = await addCoSpeaker(db, {
				submissionId,
				name: parsed.name,
				email: parsed.email,
			});
			if (!added.ok) {
				return NextResponse.json(
					{ ok: false, error: added.error },
					{ status: added.status },
				);
			}
			const invite = await inviteCoSpeaker(db, {
				speakerId: added.speaker.id,
				origin,
				// A revived speaker may have a previously delivered link; resend
				// rotates it so the old bearer token stops working.
				mode: added.revived ? "resend" : "initial",
			});
			return NextResponse.json({
				ok: true,
				speakerId: added.speaker.id,
				addedAfterAcceptance: added.addedAfterAcceptance,
				// Admin-only route: surface the link so organizers can hand it over
				// out-of-band when email delivery is unavailable.
				confirmUrl: invite.ok ? invite.confirmUrl : null,
				emailStatus: invite.ok ? invite.email.status : "failed",
			});
		}
		case "confirm": {
			const result = await confirmCoSpeaker(db, parsed.speakerId);
			if (!result.ok) {
				return NextResponse.json(
					{ ok: false, error: result.error },
					{ status: result.status },
				);
			}
			return NextResponse.json({
				ok: true,
				status: result.speaker.status,
				spawnedTaskKeys: result.spawnedTaskKeys,
			});
		}
		case "remove": {
			const result = await removeCoSpeaker(db, parsed.speakerId);
			if (!result.ok) {
				return NextResponse.json(
					{ ok: false, error: result.error },
					{ status: result.status },
				);
			}
			return NextResponse.json({ ok: true, status: result.speaker.status });
		}
		case "resend": {
			const invite = await inviteCoSpeaker(db, {
				speakerId: parsed.speakerId,
				origin,
				mode: "resend",
			});
			if (!invite.ok) {
				return NextResponse.json(
					{ ok: false, error: invite.error },
					{ status: invite.status },
				);
			}
			return NextResponse.json({
				ok: true,
				confirmUrl: invite.confirmUrl,
				emailStatus: invite.email.status,
			});
		}
		default: {
			const _exhaustive: never = parsed;
			return _exhaustive;
		}
	}
}
