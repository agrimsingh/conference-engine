import { isCfpOpenNow } from "@/lib/cfp/closes-at";
import { isSubmitterEditableStatus, issueDraftResumeToken } from "@/lib/cfp/drafts";

export type PortalSubmissionEditAccess =
	| { readonly kind: "ok"; readonly eventSlug: string; readonly formSlug: string; readonly token: string }
	| { readonly kind: "not_found" }
	| { readonly kind: "not_editable" }
	| { readonly kind: "demo" };

type EditableSubmissionRow = {
	readonly id: string;
	readonly opens_at: number | null;
	readonly closes_at: number | null;
};

export async function listPortalEditableSubmissionIds(
	db: D1Database,
	personId: string,
	now: number = Date.now(),
): Promise<ReadonlySet<string>> {
	const rows = await db.prepare(
		`SELECT s.id, f.opens_at, f.closes_at
		 FROM submissions s
		 JOIN cfp_forms f ON f.id = s.form_id AND f.event_id = s.event_id
		 JOIN events e ON e.id = s.event_id
		 WHERE s.submitter_person_id = ?
		   AND s.status = 'submitted'
		   AND f.status = 'open'
		   AND e.mode <> 'demo'`,
	).bind(personId).all<EditableSubmissionRow>();
	return new Set(rows.results.filter((row) => isCfpOpenNow(row, now)).map((row) => row.id));
}

type PortalEditRow = {
	readonly draft_id: string | null;
	readonly submission_status: string;
	readonly answers_json: string;
	readonly submitter_email: string;
	readonly submitter_name: string;
	readonly form_revision_id: string | null;
	readonly event_id: string;
	readonly form_id: string;
	readonly event_slug: string;
	readonly event_mode: "live" | "demo";
	readonly form_slug: string;
	readonly form_status: "draft" | "open" | "closed";
	readonly opens_at: number | null;
	readonly closes_at: number | null;
};

/** Recover edit access only after a portal session proves the proposal owner. */
export async function recoverPortalSubmissionEditAccess(
	db: D1Database,
	args: { readonly secret: string; readonly submissionId: string; readonly personId: string; readonly now?: number },
): Promise<PortalSubmissionEditAccess> {
	const now = args.now ?? Date.now();
	const row = await db.prepare(
		`SELECT d.id AS draft_id, s.status AS submission_status,
		        s.answers_json, COALESCE(s.submitter_email, p.email) AS submitter_email,
		        COALESCE(s.submitter_name, p.name, '') AS submitter_name,
		        s.form_revision_id, s.event_id, s.form_id,
		        e.slug AS event_slug, e.mode AS event_mode,
		        f.slug AS form_slug, f.status AS form_status,
		        f.opens_at, f.closes_at
		 FROM submissions s
		 JOIN people p ON p.id = s.submitter_person_id
		 LEFT JOIN submission_drafts d
		   ON d.submission_id = s.id AND d.status = 'submitted'
		  AND d.form_id = s.form_id AND d.event_id = s.event_id
		 JOIN cfp_forms f
		   ON f.id = s.form_id AND f.event_id = s.event_id
		 JOIN events e
		   ON e.id = s.event_id
		 WHERE s.id = ? AND s.submitter_person_id = ?`,
	).bind(args.submissionId, args.personId).first<PortalEditRow>();
	if (!row) return { kind: "not_found" };
	if (row.event_mode === "demo") return { kind: "demo" };
	if (
		!isSubmitterEditableStatus(row.submission_status) ||
		row.form_status !== "open" ||
		!isCfpOpenNow(row, now)
	) {
		return { kind: "not_editable" };
	}
	let draftId = row.draft_id;
	if (!draftId) {
		const candidateId = crypto.randomUUID();
		await db.prepare(
			`INSERT OR IGNORE INTO submission_drafts (
			   id, event_id, form_id, verified_email, submitter_name, answers_json,
			   status, submission_id, created_at, updated_at, finalized_at, form_revision_id
			 ) VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?)`,
		).bind(
			candidateId,
			row.event_id,
			row.form_id,
			row.submitter_email,
			row.submitter_name,
			row.answers_json,
			args.submissionId,
			now,
			now,
			now,
			row.form_revision_id,
		).run();
		const created = await db.prepare(
			"SELECT id FROM submission_drafts WHERE submission_id = ? AND status = 'submitted' AND event_id = ? AND form_id = ?",
		).bind(args.submissionId, row.event_id, row.form_id).first<{ id: string }>();
		if (!created) return { kind: "not_found" };
		draftId = created.id;
	}
	const token = await issueDraftResumeToken(db, {
		secret: args.secret,
		draftId,
		deliveryVerified: true,
		now,
	});
	return { kind: "ok", eventSlug: row.event_slug, formSlug: row.form_slug, token };
}
