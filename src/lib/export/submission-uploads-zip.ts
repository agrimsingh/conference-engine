import { buildStoredZip, safeZipSegment } from "@/lib/content/zip";
import { getAssetById, getEventBySlug, listSubmissionsForEvent } from "@/lib/db/queries";
import { isFileUploadAnswer, titleFromAnswers } from "@/lib/domain";

const MAX_EXPORT_BYTES = 25 * 1024 * 1024;

export type SubmissionUploadRef = {
	submissionId: string;
	formId: string;
	fieldKey: string;
	assetId: string;
	answerFilename: string;
	title: string;
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

export function collectSubmissionUploadRefs(
	submissions: ReadonlyArray<{ id: string; form_id: string; answers_json: string }>,
): SubmissionUploadRef[] {
	const refs: SubmissionUploadRef[] = [];
	for (const submission of submissions) {
		const answers = parseAnswers(submission.answers_json);
		const title = titleFromAnswers(answers);
		for (const [fieldKey, value] of Object.entries(answers)) {
			if (!isFileUploadAnswer(value)) continue;
			refs.push({
				submissionId: submission.id,
				formId: submission.form_id,
				fieldKey,
				assetId: value.assetId,
				answerFilename: value.filename,
				title,
			});
		}
	}
	return refs;
}

export function submissionUploadEntryPath(
	ref: SubmissionUploadRef,
	filename: string,
): string {
	const titleSeg = safeZipSegment(ref.title || ref.submissionId, "submission");
	const idSeg = safeZipSegment(ref.submissionId.slice(0, 8), "id");
	const fieldSeg = safeZipSegment(ref.fieldKey, "field");
	const fileSeg = safeZipSegment(filename || ref.answerFilename || "upload.bin", "upload.bin");
	return `${titleSeg}-${idSeg}/${fieldSeg}/${fileSeg}`;
}

export async function exportSubmissionUploads(
	db: D1Database,
	files: R2Bucket,
	args: { eventId: string },
): Promise<
	| { ok: true; body: Uint8Array; count: number }
	| { ok: false; status: number; error: string }
> {
	const submissions = await listSubmissionsForEvent(db, args.eventId);
	const refs = collectSubmissionUploadRefs(submissions);
	const entries: Array<{ path: string; bytes: Uint8Array; modifiedAt: number }> = [];
	const seen = new Set<string>();
	let total = 0;

	for (const ref of refs) {
		if (seen.has(ref.assetId)) continue;
		seen.add(ref.assetId);

		const asset = await getAssetById(db, ref.assetId);
		if (
			!asset
			|| asset.event_id !== args.eventId
			|| asset.form_id !== ref.formId
			|| asset.field_key !== ref.fieldKey
		) {
			continue;
		}

		const object = await files.get(asset.r2_key);
		if (!object) continue;

		const bytes = new Uint8Array(await object.arrayBuffer());
		total += bytes.length;
		if (total > MAX_EXPORT_BYTES) {
			return {
				ok: false,
				status: 413,
				error: "Submission uploads exceed the 25 MB export limit",
			};
		}

		entries.push({
			path: submissionUploadEntryPath(ref, asset.filename ?? ref.answerFilename),
			bytes,
			modifiedAt: asset.created_at,
		});
	}

	return { ok: true, body: buildStoredZip(entries), count: entries.length };
}

export async function exportSubmissionUploadsForSlug(
	db: D1Database,
	files: R2Bucket,
	eventSlug: string,
): Promise<
	| { ok: true; eventSlug: string; body: Uint8Array; count: number }
	| { ok: false; status: number; error: string }
> {
	const event = await getEventBySlug(db, eventSlug);
	if (!event) return { ok: false, status: 404, error: "Event not found" };
	const exported = await exportSubmissionUploads(db, files, { eventId: event.id });
	if (!exported.ok) return exported;
	return {
		ok: true,
		eventSlug: event.slug,
		body: exported.body,
		count: exported.count,
	};
}
