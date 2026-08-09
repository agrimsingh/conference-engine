import type { FieldConfig, FileUploadAnswer } from "@/lib/domain/form-fields";
import type { AssetRow } from "@/lib/db/types";

export const DEFAULT_CFP_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const CFP_UPLOAD_HARD_MAX_BYTES = 25 * 1024 * 1024;

export function effectiveUploadMaxBytes(config: Extract<FieldConfig, { kind: "file_upload" }>): number {
	const configured = config.maxBytes ?? DEFAULT_CFP_UPLOAD_MAX_BYTES;
	return Math.min(Math.max(1, configured), CFP_UPLOAD_HARD_MAX_BYTES);
}

export function uploadAcceptAttr(config: Extract<FieldConfig, { kind: "file_upload" }>): string | undefined {
	if (!config.accept?.length) return undefined;
	return config.accept.map((item) => item.trim()).filter(Boolean).join(",");
}

export function contentTypeAllowed(
	contentType: string,
	config: Extract<FieldConfig, { kind: "file_upload" }>,
): boolean {
	const accept = config.accept?.map((item) => item.trim()).filter(Boolean) ?? [];
	if (!accept.length) return true;
	const normalized = contentType.trim().toLowerCase();
	return accept.some((pattern) => {
		if (pattern.endsWith("/*")) {
			const prefix = pattern.slice(0, -1).toLowerCase();
			return normalized.startsWith(prefix);
		}
		return normalized === pattern.toLowerCase();
	});
}

export function buildCfpUploadR2Key(args: {
	eventId: string;
	formId: string;
	fieldKey: string;
	assetId: string;
	filename: string;
}): string {
	const safeName = sanitizeFilename(args.filename);
	return `events/${args.eventId}/cfp/${args.formId}/${args.fieldKey}/${args.assetId}-${safeName}`;
}

export function sanitizeFilename(name: string): string {
	const base = name.split(/[/\\]/).pop() ?? "upload.bin";
	return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "upload.bin";
}

export async function storeCfpFieldUpload(
	db: D1Database,
	files: R2Bucket,
	args: {
		eventId: string;
		formId: string;
		fieldKey: string;
		file: File;
		maxBytes: number;
		allowedContentTypes?: string[];
	},
): Promise<{ ok: true; answer: FileUploadAnswer } | { ok: false; error: string }> {
	if (args.file.size <= 0) return { ok: false, error: "Empty files are not allowed" };
	if (args.file.size > args.maxBytes) {
		return { ok: false, error: `File is too large (max ${Math.floor(args.maxBytes / (1024 * 1024))}MB)` };
	}
	const contentType = args.file.type || "application/octet-stream";
	if (args.allowedContentTypes?.length && !contentTypeAllowed(contentType, { kind: "file_upload", accept: args.allowedContentTypes })) {
		return { ok: false, error: "File type is not allowed for this field" };
	}

	const assetId = crypto.randomUUID();
	const r2Key = buildCfpUploadR2Key({
		eventId: args.eventId,
		formId: args.formId,
		fieldKey: args.fieldKey,
		assetId,
		filename: args.file.name,
	});
	const now = Date.now();
	try {
		await files.put(r2Key, args.file.stream(), {
			httpMetadata: { contentType },
		});
	} catch {
		return { ok: false, error: "Upload failed" };
	}

	try {
		await db.prepare(
			`INSERT INTO assets (
				id, event_id, r2_key, content_type, filename, uploaded_by_person_id, form_id, field_key, created_at
			) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
		).bind(
			assetId,
			args.eventId,
			r2Key,
			contentType,
			sanitizeFilename(args.file.name),
			args.formId,
			args.fieldKey,
			now,
		).run();
	} catch {
		try {
			await files.delete(r2Key);
		} catch {
			/* best-effort compensation */
		}
		return { ok: false, error: "Upload failed" };
	}

	return {
		ok: true,
		answer: {
			assetId,
			filename: sanitizeFilename(args.file.name),
			contentType,
		},
	};
}

/** Orphan uploads from closed tabs are not GC'd asynchronously yet; replace/clear deletes synchronously. */
export async function isCfpAssetReferencedBySubmission(
	db: D1Database,
	eventId: string,
	assetId: string,
): Promise<boolean> {
	const row = await db.prepare(
		`SELECT id FROM submissions WHERE event_id = ? AND answers_json LIKE ? LIMIT 1`,
	).bind(eventId, `%${assetId}%`).first<{ id: string }>();
	return Boolean(row);
}

export async function deleteCfpFieldUpload(
	db: D1Database,
	files: R2Bucket,
	args: {
		eventId: string;
		formId: string;
		fieldKey: string;
		assetId: string;
	},
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
	const asset = await db.prepare(
		`SELECT id, event_id, r2_key, form_id, field_key FROM assets WHERE id = ?`,
	).bind(args.assetId).first<AssetRow>();
	if (!asset) return { ok: true };
	if (
		asset.event_id !== args.eventId
		|| asset.form_id !== args.formId
		|| asset.field_key !== args.fieldKey
	) {
		return { ok: false, error: "Upload not found for this field", status: 404 };
	}
	if (await isCfpAssetReferencedBySubmission(db, args.eventId, args.assetId)) {
		return {
			ok: false,
			error: "This file is attached to a submitted proposal and cannot be removed",
			status: 409,
		};
	}
	try {
		await files.delete(asset.r2_key);
	} catch {
		/* best-effort */
	}
	await db.prepare(`DELETE FROM assets WHERE id = ?`).bind(args.assetId).run();
	return { ok: true };
}

export async function verifyCfpFieldUpload(
	db: D1Database,
	args: {
		eventId: string;
		formId: string;
		fieldKey: string;
		answer: unknown;
	},
): Promise<string | null> {
	if (!args.answer || typeof args.answer !== "object") return "Uploaded file reference is invalid";
	const record = args.answer as { assetId?: unknown; filename?: unknown };
	if (typeof record.assetId !== "string" || !record.assetId.trim()) return "Uploaded file reference is invalid";
	const asset = await db.prepare(
		`SELECT id, event_id, form_id, field_key, filename
		 FROM assets
		 WHERE id = ? AND event_id = ? AND form_id = ? AND field_key = ?`,
	).bind(record.assetId.trim(), args.eventId, args.formId, args.fieldKey).first<AssetRow>();
	if (!asset) return "Uploaded file was not found for this field";
	if (typeof record.filename === "string" && record.filename.trim() && asset.filename !== sanitizeFilename(record.filename)) {
		return "Uploaded file metadata does not match";
	}
	return null;
}
