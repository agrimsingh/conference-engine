import { NextResponse } from "next/server";
import { requirePublicApiKey } from "@/lib/auth/public-api";
import { getDb } from "@/lib/db/cloudflare";
import {
	getEventBySlug,
	listLabelsForEvent,
	listSpeakersForSubmission,
	listSubmissionsForEvent,
} from "@/lib/db/queries";
import { titleFromAnswers } from "@/lib/domain";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

function parseAnswers(raw: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// ignore
	}
	return {};
}

export async function GET(request: Request, context: RouteContext) {
	const auth = await requirePublicApiKey(request);
	if (!auth.ok) return auth.response;

	const { eventSlug } = await context.params;
	const db = await getDb();
	const event = await getEventBySlug(db, eventSlug);
	if (!event) {
		return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
	}

	const submissions = await listSubmissionsForEvent(db, event.id);
	const labelRows = await listLabelsForEvent(db, event.id);
	const labelsBySubmission = new Map<string, string[]>();
	for (const row of labelRows) {
		const list = labelsBySubmission.get(row.submission_id) ?? [];
		list.push(row.label);
		labelsBySubmission.set(row.submission_id, list);
	}

	const items = [];
	for (const submission of submissions) {
		const answers = parseAnswers(submission.answers_json);
		const speakers = await listSpeakersForSubmission(db, submission.id);
		items.push({
			id: submission.id,
			status: submission.status,
			title: titleFromAnswers(answers),
			submitterName: submission.submitter_name,
			submitterEmail: submission.submitter_email,
			submittedAt: submission.submitted_at,
			updatedAt: submission.updated_at,
			labels: labelsBySubmission.get(submission.id) ?? [],
			speakers: speakers.map((speaker) => ({
				name: speaker.name,
				email: speaker.email,
				position: speaker.position,
			})),
		});
	}

	return NextResponse.json({
		ok: true,
		event: { id: event.id, slug: event.slug, name: event.name },
		submissions: items,
	});
}
