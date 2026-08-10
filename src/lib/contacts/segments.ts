import { listAccountContacts, type ContactWriteResult } from "./contacts";
import {
	isContactPipelineStage,
	type AccountContact,
	type ContactFilters,
	type ContactSegment,
} from "./types";

type SegmentRow = {
	id: string;
	account_id: string;
	name: string;
	filter_json: string;
	created_at: number;
};

function parseFilters(raw: string): ContactFilters {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const obj = parsed as Record<string, unknown>;
		const filters: ContactFilters = {};
		if (typeof obj.q === "string") filters.q = obj.q;
		if (typeof obj.company === "string") filters.company = obj.company;
		if (typeof obj.title === "string") filters.title = obj.title;
		if (typeof obj.tag === "string") filters.tag = obj.tag;
		if (obj.stage === "all" || isContactPipelineStage(obj.stage)) filters.stage = obj.stage;
		return filters;
	} catch {
		return {};
	}
}

function mapSegment(row: SegmentRow): ContactSegment {
	return {
		id: row.id,
		accountId: row.account_id,
		name: row.name,
		filters: parseFilters(row.filter_json),
		createdAt: row.created_at,
	};
}

export async function listContactSegments(
	db: D1Database,
	accountId: string,
): Promise<ContactSegment[]> {
	const rows = await db
		.prepare(
			`SELECT id, account_id, name, filter_json, created_at
			 FROM account_contact_segments
			 WHERE account_id = ?
			 ORDER BY name COLLATE NOCASE`,
		)
		.bind(accountId)
		.all<SegmentRow>();
	return rows.results.map(mapSegment);
}

export async function createContactSegment(
	db: D1Database,
	args: {
		accountId: string;
		name: string;
		filters: ContactFilters;
		now?: number;
	},
): Promise<ContactWriteResult<ContactSegment>> {
	const name = args.name.trim();
	if (!name || name.length > 80) {
		return { ok: false, error: "Segment name must be between 1 and 80 characters", status: 400 };
	}
	const hasFilter = Boolean(
		args.filters.q?.trim() ||
			args.filters.company?.trim() ||
			args.filters.title?.trim() ||
			args.filters.tag?.trim() ||
			(args.filters.stage && args.filters.stage !== "all"),
	);
	if (!hasFilter) {
		return { ok: false, error: "Save at least one filter with the segment", status: 400 };
	}

	const now = args.now ?? Date.now();
	const id = crypto.randomUUID();
	try {
		await db
			.prepare(
				`INSERT INTO account_contact_segments (id, account_id, name, filter_json, created_at)
				 VALUES (?, ?, ?, ?, ?)`,
			)
			.bind(id, args.accountId, name, JSON.stringify(args.filters), now)
			.run();
	} catch {
		return { ok: false, error: "A segment with that name already exists", status: 409 };
	}

	const row = await db
		.prepare(
			`SELECT id, account_id, name, filter_json, created_at
			 FROM account_contact_segments WHERE id = ? AND account_id = ?`,
		)
		.bind(id, args.accountId)
		.first<SegmentRow>();
	if (!row) return { ok: false, error: "Segment create failed", status: 500 };
	return { ok: true, value: mapSegment(row) };
}

export async function getSegmentMembers(
	db: D1Database,
	accountId: string,
	segmentId: string,
): Promise<ContactWriteResult<{ segment: ContactSegment; contacts: AccountContact[] }>> {
	const row = await db
		.prepare(
			`SELECT id, account_id, name, filter_json, created_at
			 FROM account_contact_segments WHERE id = ? AND account_id = ?`,
		)
		.bind(segmentId, accountId)
		.first<SegmentRow>();
	if (!row) return { ok: false, error: "Segment not found", status: 404 };
	const segment = mapSegment(row);
	const contacts = await listAccountContacts(db, accountId, segment.filters);
	return { ok: true, value: { segment, contacts } };
}
