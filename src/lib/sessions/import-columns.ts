/**
 * Canonical session-import fields plus aliases for Sessionboard (and similar)
 * CSV exports. Headers are matched after trim + lowercase; underscores and
 * spaces are interchangeable ("speaker_name" ≡ "speaker name").
 *
 * Sessionboard standard labels come from their Session + Contact field list
 * (Title, Description, Track, First Name, Last Name, Email, Biography, …).
 * Exports use whatever columns are visible in the table/report view.
 */
export const CANONICAL_IMPORT_FIELDS = [
	"title",
	"abstract",
	"track",
	"speaker_name",
	"speaker_email",
	"speaker_bio",
	"video_url",
	"google_doc_url",
	"supporting_url",
	"first_name",
	"last_name",
] as const;

export type CanonicalImportField = (typeof CANONICAL_IMPORT_FIELDS)[number];

/** Alias (normalized) → canonical field. First non-empty cell wins on collide. */
export const SESSION_IMPORT_ALIASES: Readonly<Record<string, CanonicalImportField>> = {
	title: "title",
	"session title": "title",
	"session name": "title",
	"talk title": "title",
	"presentation title": "title",

	abstract: "abstract",
	description: "abstract",
	"session description": "abstract",
	"session abstract": "abstract",
	summary: "abstract",

	track: "track",
	category: "track",
	"session track": "track",

	speaker_name: "speaker_name",
	speaker: "speaker_name",
	name: "speaker_name",
	"full name": "speaker_name",
	"speaker name": "speaker_name",
	speakers: "speaker_name",

	"first name": "first_name",
	firstname: "first_name",
	"last name": "last_name",
	lastname: "last_name",

	speaker_email: "speaker_email",
	email: "speaker_email",
	"speaker email": "speaker_email",
	"contact email": "speaker_email",

	speaker_bio: "speaker_bio",
	bio: "speaker_bio",
	biography: "speaker_bio",
	"speaker biography": "speaker_bio",
	"speaker bio": "speaker_bio",

	video_url: "video_url",
	video: "video_url",
	"video url": "video_url",
	"recording url": "video_url",
	recording: "video_url",

	google_doc_url: "google_doc_url",
	google_doc: "google_doc_url",
	doc_url: "google_doc_url",
	"google doc url": "google_doc_url",
	"google doc": "google_doc_url",

	supporting_url: "supporting_url",
	supporting: "supporting_url",
	resources_url: "supporting_url",
	"supporting url": "supporting_url",
	"resources url": "supporting_url",
	website: "supporting_url",
};

/** Collapse BOM/underscores/spaces so Sessionboard labels and our snake_case match. */
export function normalizeImportHeader(header: string): string {
	return header
		.replace(/^\uFEFF/, "")
		.trim()
		.toLowerCase()
		.replace(/[_]+/g, " ")
		.replace(/\s+/g, " ");
}

export function resolveImportField(header: string): CanonicalImportField | undefined {
	return SESSION_IMPORT_ALIASES[normalizeImportHeader(header)];
}

export function csvHasTitleColumn(headers: readonly string[]): boolean {
	return headers.some((header) => resolveImportField(header) === "title");
}

/** Remap a parsed CSV row onto canonical keys; unknown columns are dropped. */
export function canonicalizeCsvRecord(row: Record<string, string>): Record<CanonicalImportField, string> {
	const out = Object.fromEntries(CANONICAL_IMPORT_FIELDS.map((field) => [field, ""])) as Record<CanonicalImportField, string>;
	for (const [header, value] of Object.entries(row)) {
		const field = resolveImportField(header);
		if (!field) continue;
		if (!out[field] && value !== undefined) out[field] = value;
	}
	return out;
}
