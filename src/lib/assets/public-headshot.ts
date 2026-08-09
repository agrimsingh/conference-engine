import type { AssetRow } from "@/lib/db/types";

type HeadshotDeps = {
	resolvePublicHeadshotAsset: (args: {
		eventId: string;
		personId: string;
	}) => Promise<AssetRow | null>;
	getObject: (key: string) => Promise<R2ObjectBody | null>;
};

export type PublicHeadshotDownload =
	| { ok: true; response: Response }
	| { ok: false; status: 404 };

/**
 * Headshots are public only when the person is a confirmed speaker on at least
 * one published session for the same event and a profile headshot asset exists.
 */
export async function getPublicHeadshot(
	deps: HeadshotDeps,
	args: { eventId: string; personId: string },
): Promise<PublicHeadshotDownload> {
	const asset = await deps.resolvePublicHeadshotAsset(args);
	if (!asset || asset.event_id !== args.eventId) return { ok: false, status: 404 };
	const object = await deps.getObject(asset.r2_key);
	if (!object) return { ok: false, status: 404 };

	return {
		ok: true,
		response: new Response(object.body, {
			headers: publicHeadshotHeaders(asset, object),
		}),
	};
}

export function publicHeadshotHeaders(asset: AssetRow, object: R2ObjectBody): Headers {
	const headers = new Headers();
	headers.set("Content-Type", safeContentType(object.httpMetadata?.contentType ?? asset.content_type));
	headers.set("Content-Disposition", `inline; filename="${safeFilename(asset.filename)}"`);
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
	return headers;
}

function safeContentType(value: string | null | undefined): string {
	if (!value || !/^image\/[a-z0-9.+-]+$/i.test(value)) return "application/octet-stream";
	return value;
}

function safeFilename(value: string | null): string {
	const normalized = (value ?? "headshot").replace(/[\\/\r\n"]/g, "_").trim();
	return normalized || "headshot";
}
