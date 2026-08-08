import {
	isSpeakerTaskKey,
	SPEAKER_TASK_TYPE_REGISTRY,
	type SpeakerTaskKey,
} from "@/lib/domain";
import { getSpeakerTaskById } from "@/lib/db/queries";
import type { AssetRow, SpeakerTaskRow } from "@/lib/db/types";
import { implicitlyConfirmByTaskCompletion } from "./co-speakers";

export type CompleteTextResult =
	| { ok: true; task: SpeakerTaskRow }
	| { ok: false; error: string; status: number };

export type CompleteFileResult =
	| { ok: true; task: SpeakerTaskRow; asset: AssetRow }
	| { ok: false; error: string; status: number };

export async function completeTextTask(
	db: D1Database,
	args: { taskId: string; personId: string; text: string },
): Promise<CompleteTextResult> {
	const task = await getSpeakerTaskById(db, args.taskId);
	if (!task) return { ok: false, error: "Task not found", status: 404 };
	if (task.person_id !== args.personId) {
		return { ok: false, error: "Forbidden", status: 403 };
	}
	if (!isSpeakerTaskKey(task.template_key)) {
		return { ok: false, error: "Unknown task key", status: 500 };
	}

	const meta = SPEAKER_TASK_TYPE_REGISTRY[task.template_key];
	if (meta.kind !== "text") {
		return { ok: false, error: "Task is not a text task", status: 400 };
	}

	const text = args.text.trim();
	if (text.length < 20) {
		return { ok: false, error: "Bio must be at least 20 characters", status: 400 };
	}

	const now = Date.now();
	await db.batch([
		db.prepare(
			`UPDATE speaker_tasks
       SET status = 'completed', text_value = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
		)
		.bind(text, now, now, task.id)
		,
		db.prepare(
			`UPDATE speaker_profiles
       SET bio = ?, updated_at = ?
       WHERE event_id = ? AND person_id = ?`,
		)
		.bind(text, now, task.event_id, task.person_id)
		,
		db.prepare(
			`UPDATE submission_speakers
       SET bio = ?
       WHERE submission_id = ? AND person_id = ?`,
		)
		.bind(text, task.submission_id, task.person_id)
	]);

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
	if (!isSpeakerTaskKey(task.template_key)) {
		return { ok: false, error: "Unknown task key", status: 500 };
	}

	const key = task.template_key as SpeakerTaskKey;
	const meta = SPEAKER_TASK_TYPE_REGISTRY[key];
	if (meta.kind !== "file") {
		return { ok: false, error: "Task is not a file task", status: 400 };
	}

	const contentType = args.file.type || "application/octet-stream";
	if (!meta.accept.includes(contentType)) {
		return {
			ok: false,
			error: `Unsupported content type ${contentType}. Allowed: ${meta.accept.join(", ")}`,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(assetId, task.event_id, r2Key, contentType, safeName, task.person_id, now)
		,
		db.prepare(
			`UPDATE speaker_tasks
       SET status = 'completed', asset_id = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`,
		)
		.bind(assetId, now, now, task.id)
		,
	];

	if (key === "headshot") {
		statements.push(db.prepare(
				`UPDATE speaker_profiles
         SET headshot_asset_id = ?, updated_at = ?
         WHERE event_id = ? AND person_id = ?`,
			)
			.bind(assetId, now, task.event_id, task.person_id)
		);
	}
	try {
		await db.batch(statements);
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

function sanitizeFilename(name: string): string {
	const base = name.split(/[/\\]/).pop() ?? "upload.bin";
	return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "upload.bin";
}
