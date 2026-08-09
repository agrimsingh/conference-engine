import { isSpeakerTaskKey, SPEAKER_TASK_TYPE_REGISTRY } from "@/lib/domain";
import { getSpeakerTaskById } from "@/lib/db/queries";
import type { AssetRow, SpeakerTaskRow } from "@/lib/db/types";
import { implicitlyConfirmByTaskCompletion } from "./co-speakers";
import { DemoEventWriteError, requireWritableEventById } from "@/lib/events/writability";

export type CompleteTextResult =
	| { ok: true; task: SpeakerTaskRow }
	| { ok: false; error: string; status: number };

export type CompleteFileResult =
	| { ok: true; task: SpeakerTaskRow; asset: AssetRow }
	| { ok: false; error: string; status: number };

export const MAX_SPEAKER_BIO_LENGTH = 10_000;

export async function completeTextTask(
	db: D1Database,
	args: { taskId: string; personId: string; text: string },
): Promise<CompleteTextResult> {
	const task = await getSpeakerTaskById(db, args.taskId);
	if (!task) return { ok: false, error: "Task not found", status: 404 };
	if (task.person_id !== args.personId) {
		return { ok: false, error: "Forbidden", status: 403 };
	}
	try {
		await requireWritableEventById(db, task.event_id);
	} catch (error) {
		if (error instanceof DemoEventWriteError) return { ok: false, error: "This task is read-only", status: 403 };
		throw error;
	}
	if (taskKind(task) !== "text") {
		return { ok: false, error: "Task is not a text task", status: 400 };
	}

	const text = args.text.trim();
	if (text.length > MAX_SPEAKER_BIO_LENGTH) {
		return {
			ok: false,
			error: task.template_key === "bio"
				? "Bio is too long (max 10000 characters)"
				: "Response is too long (max 10000 characters)",
			status: 400,
		};
	}
	if (task.template_key === "bio" && text.length < 20) {
		return { ok: false, error: "Bio must be at least 20 characters", status: 400 };
	}
	if (!text) return { ok: false, error: "Response is required", status: 400 };

	const now = Date.now();
	const statements: D1PreparedStatement[] = [
		db.prepare(
			`UPDATE speaker_tasks
       SET status = 'completed', text_value = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
		).bind(text, now, now, task.id),
	];
	if (task.template_key === "bio") statements.push(
		db.prepare(
			`UPDATE speaker_profiles
       SET bio = ?, updated_at = ?
       WHERE event_id = ? AND person_id = ?`,
		).bind(text, now, task.event_id, task.person_id),
		db.prepare(
			`UPDATE submission_speakers
       SET bio = ?
       WHERE submission_id = ? AND person_id = ?`,
		).bind(text, task.submission_id, task.person_id),
	);
	await db.batch(statements);

	// Completing a task proves the person is real → implicit confirmation.
	await implicitlyConfirmByTaskCompletion(db, {
		submissionId: task.submission_id,
		personId: task.person_id,
	});

	const updated = await getSpeakerTaskById(db, task.id);
	if (!updated) return { ok: false, error: "Task missing after update", status: 500 };
	return { ok: true, task: updated };
}

export async function completeFileTask(
	db: D1Database,
	files: R2Bucket,
	args: {
		taskId: string;
		personId: string;
		file: File;
	},
): Promise<CompleteFileResult> {
	const task = await getSpeakerTaskById(db, args.taskId);
	if (!task) return { ok: false, error: "Task not found", status: 404 };
	if (task.person_id !== args.personId) {
		return { ok: false, error: "Forbidden", status: 403 };
	}
	try {
		await requireWritableEventById(db, task.event_id);
	} catch (error) {
		if (error instanceof DemoEventWriteError) return { ok: false, error: "This task is read-only", status: 403 };
		throw error;
	}
	const key = task.template_key;
	if (taskKind(task) !== "file") {
		return { ok: false, error: "Task is not a file task", status: 400 };
	}

	const contentType = args.file.type || "application/octet-stream";
	const accept = acceptedFileTypes(task);
	if (accept.length > 0 && !accept.includes(contentType)) {
		return {
			ok: false,
			error: `Unsupported content type ${contentType}. Allowed: ${accept.join(", ")}`,
			status: 400,
		};
	}

	if (args.file.size <= 0) {
		return { ok: false, error: "Empty file", status: 400 };
	}
	if (args.file.size > 25 * 1024 * 1024) {
		return { ok: false, error: "File too large (max 25MB)", status: 400 };
	}

	const assetId = crypto.randomUUID();
	const supersededAssetId = task.asset_id;
	const superseded = supersededAssetId
		? await db.prepare("SELECT id, r2_key FROM assets WHERE id = ? AND event_id = ?").bind(supersededAssetId, task.event_id).first<{ id: string; r2_key: string }>()
		: null;
	const safeName = sanitizeFilename(args.file.name || `${key}.bin`);
	const r2Key = `events/${task.event_id}/people/${task.person_id}/${key}/${assetId}-${safeName}`;
	const body = await args.file.arrayBuffer();

	await files.put(r2Key, body, {
		httpMetadata: { contentType },
		customMetadata: {
			taskId: task.id,
			personId: task.person_id,
			templateKey: key,
		},
	});

	const now = Date.now();
	const statements: D1PreparedStatement[] = [
		db.prepare(
			`INSERT INTO assets (
        id, event_id, r2_key, content_type, filename, uploaded_by_person_id, created_at
			) SELECT ?, ?, ?, ?, ?, ?, ?
			  WHERE EXISTS (
			    SELECT 1 FROM speaker_tasks
			    WHERE id = ? AND asset_id IS ?
			  )`,
		)
			.bind(assetId, task.event_id, r2Key, contentType, safeName, task.person_id, now, task.id, supersededAssetId)
		,
		db.prepare(
			`UPDATE speaker_tasks
       SET status = 'completed', asset_id = ?, completed_at = ?, updated_at = ?
			WHERE id = ? AND asset_id IS ?`,
		)
			.bind(assetId, now, now, task.id, supersededAssetId)
		,
	];

	if (key === "headshot") {
		statements.push(db.prepare(
				`UPDATE speaker_profiles
         SET headshot_asset_id = ?, updated_at = ?
			 WHERE event_id = ? AND person_id = ?
			   AND EXISTS (SELECT 1 FROM speaker_tasks WHERE id = ? AND asset_id = ?)`,
			)
			.bind(assetId, now, task.event_id, task.person_id, task.id, assetId)
		);
	}
	try {
		const results = await db.batch(statements);
		if ((results[1]?.meta.changes ?? 0) === 0) {
			// Someone completed/replaced the task after our initial read. This
			// attempt never inserted its asset row, so remove only its R2 object.
			try { await files.delete(r2Key); } catch { /* best-effort compensation */ }
			return { ok: false, error: "Task was updated by another upload", status: 409 };
		}
	} catch (error) {
		// R2 has no cross-service transaction with D1. Remove only the object we
		// just wrote, then preserve the database error for the caller.
		try { await files.delete(r2Key); } catch { /* best-effort compensation */ }
		throw error;
	}

	// Completing a task proves the person is real → implicit confirmation.
	await implicitlyConfirmByTaskCompletion(db, {
		submissionId: task.submission_id,
		personId: task.person_id,
	});

	const updated = await getSpeakerTaskById(db, task.id);
	if (!updated) return { ok: false, error: "Task missing after update", status: 500 };

	// Only remove the prior R2 object after the new metadata/task pointer has
	// committed. Keep metadata if deletion fails so a later repair can find it.
	if (superseded && superseded.id !== assetId) {
		const stillReferenced = await db.prepare(
			`SELECT 1
       FROM speaker_tasks WHERE asset_id = ?
       UNION ALL
       SELECT 1 FROM speaker_profiles WHERE headshot_asset_id = ?
       LIMIT 1`,
		).bind(superseded.id, superseded.id).first<{ 1: number }>();
		if (!stillReferenced) {
			try {
				await files.delete(superseded.r2_key);
				await db.prepare("DELETE FROM assets WHERE id = ?").bind(superseded.id).run();
			} catch {
				// The new upload remains committed; retain old metadata for repair.
			}
		}
	}

	return {
		ok: true,
		task: updated,
		asset: {
			id: assetId,
			event_id: task.event_id,
			r2_key: r2Key,
			content_type: contentType,
			filename: safeName,
			uploaded_by_person_id: task.person_id,
			created_at: now,
		},
	};
}

function taskKind(task: SpeakerTaskRow): "text" | "file" {
	if (task.template_task_kind === "text" || task.template_task_kind === "file") return task.template_task_kind;
	return isSpeakerTaskKey(task.template_key) ? SPEAKER_TASK_TYPE_REGISTRY[task.template_key].kind : "file";
}

function acceptedFileTypes(task: SpeakerTaskRow): readonly string[] {
	return isSpeakerTaskKey(task.template_key) ? SPEAKER_TASK_TYPE_REGISTRY[task.template_key].accept : [];
}

function sanitizeFilename(name: string): string {
	const base = name.split(/[/\\]/).pop() ?? "upload.bin";
	return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "upload.bin";
}
