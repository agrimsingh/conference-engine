import type { AssetRow, SpeakerTaskRow } from "@/lib/db/types";

type DownloadDeps = {
	getTask: (taskId: string) => Promise<SpeakerTaskRow | null>;
	getAsset: (assetId: string) => Promise<AssetRow | null>;
	getObject: (key: string) => Promise<R2ObjectBody | null>;
};

export type OrganizerAssetDownload =
	| { ok: true; response: Response }
	| { ok: false; status: 404 };

/**
 * The task-to-asset relationship and event ID are both checked before R2 is
 * touched, so an organizer for one event cannot dereference another event's
 * task, asset record, or R2 object.
 */
export async function getOrganizerAssetDownload(
	deps: DownloadDeps,
	args: { eventId: string; taskId: string },
): Promise<OrganizerAssetDownload> {
	const task = await deps.getTask(args.taskId);
	if (!task || task.event_id !== args.eventId || !task.asset_id) return { ok: false, status: 404 };
	const asset = await deps.getAsset(task.asset_id);
	if (!asset || asset.event_id !== args.eventId) return { ok: false, status: 404 };
	const object = await deps.getObject(asset.r2_key);
	if (!object) return { ok: false, status: 404 };

	return {
		ok: true,
		response: new Response(object.body, {
			headers: organizerAssetHeaders(asset, object),
		}),
	};
}

export function organizerAssetHeaders(asset: AssetRow, object: R2ObjectBody): Headers {
	const headers = new Headers();
	headers.set("Content-Type", safeContentType(object.httpMetadata?.contentType ?? asset.content_type));
	headers.set("Content-Disposition", `attachment; filename="${safeFilename(asset.filename)}"`);
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Cache-Control", "private, no-store");
	return headers;
}

function safeContentType(value: string | null | undefined): string {
	if (!value || !/^[a-z]+\/[a-z0-9.+-]+(?:;\s*charset=[a-z0-9-]+)?$/i.test(value)) return "application/octet-stream";
	return value;
}

function safeFilename(value: string | null): string {
	const normalized = (value ?? "speaker-upload").replace(/[\\/\r\n"]/g, "_").trim();
	return normalized || "speaker-upload";
}
