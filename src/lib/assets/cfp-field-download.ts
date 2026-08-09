import { isFileUploadAnswer } from "@/lib/domain";
import type { AssetRow, SubmissionRow } from "@/lib/db/types";
import { organizerAssetHeaders } from "./organizer-download";

export type CfpFieldDownloadDeps = {
	getSubmission: (submissionId: string) => Promise<SubmissionRow | null>;
	getAsset: (assetId: string) => Promise<AssetRow | null>;
	getObject: (key: string) => Promise<R2ObjectBody | null>;
};

export type CfpFieldAssetDownload =
	| { ok: true; response: Response }
	| { ok: false; status: 404 };

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

/**
 * Submission answers, form_id, and field_key are checked before R2 is touched so
 * download links cannot dereference another event's assets.
 */
export async function getCfpFieldAssetDownload(
	deps: CfpFieldDownloadDeps,
	args: { eventId: string; submissionId: string; fieldKey: string },
): Promise<CfpFieldAssetDownload> {
	const submission = await deps.getSubmission(args.submissionId);
	if (!submission || submission.event_id !== args.eventId) return { ok: false, status: 404 };

	const answer = parseAnswers(submission.answers_json)[args.fieldKey];
	if (!isFileUploadAnswer(answer)) return { ok: false, status: 404 };

	const asset = await deps.getAsset(answer.assetId);
	if (
		!asset
		|| asset.event_id !== args.eventId
		|| asset.form_id !== submission.form_id
		|| asset.field_key !== args.fieldKey
	) {
		return { ok: false, status: 404 };
	}

	const object = await deps.getObject(asset.r2_key);
	if (!object) return { ok: false, status: 404 };

	return {
		ok: true,
		response: new Response(object.body, {
			headers: organizerAssetHeaders(asset, object),
		}),
	};
}
