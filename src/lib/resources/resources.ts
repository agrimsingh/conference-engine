import type { PortalResourceRow } from "@/lib/db/types";

export const PORTAL_RESOURCE_TYPES = ["rich_text", "embed"] as const;
export type PortalResourceType = (typeof PORTAL_RESOURCE_TYPES)[number];

export type PortalResourceInput = {
	readonly title: string;
	readonly slug: string;
	readonly resourceType: PortalResourceType;
	readonly content: string;
	readonly embedUrl: string | null;
	readonly published: 0 | 1;
};

export type PortalResourceParseResult =
	| { readonly ok: true; readonly value: PortalResourceInput }
	| { readonly ok: false; readonly error: string };

function inputRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, max: number): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function isPortalResourceType(value: unknown): value is PortalResourceType {
	return typeof value === "string" && (PORTAL_RESOURCE_TYPES as readonly string[]).includes(value);
}

function isHttpsUrl(value: string): boolean {
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Accept a direct HTTPS URL or a single inert iframe snippet. The parser
 * deliberately ignores presentation attributes and rejects every other tag,
 * so no organizer-supplied HTML is ever rendered into the portal DOM.
 */
export function extractSafeEmbedUrl(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const source = value.trim();
	if (isHttpsUrl(source)) return new URL(source).toString();
	const iframe = /^<iframe\b([\s\S]*?)>\s*<\/iframe>$/i.exec(source);
	if (!iframe) return null;
	const attributes = iframe[1] ?? "";
	const attributePattern = /\s+([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(["'])(.*?)\2/g;
	let offset = 0;
	let src: string | null = null;
	for (const match of attributes.matchAll(attributePattern)) {
		if (match.index !== offset) return null;
		offset += match[0].length;
		const name = match[1]?.toLowerCase();
		const attributeValue = match[3] ?? "";
		if (name === "src") {
			if (src !== null) return null;
			src = attributeValue;
			continue;
		}
		if (!["title", "width", "height", "loading"].includes(name ?? "")) return null;
	}
	if (offset !== attributes.length || !src || !isHttpsUrl(src)) return null;
	return new URL(src).toString();
}

export function parsePortalResourceInput(input: unknown): PortalResourceParseResult {
	if (!inputRecord(input)) return { ok: false, error: "Expected a resource object" };
	const title = requiredText(input.title, 160);
	if (!title) return { ok: false, error: "Title must contain 1 to 160 characters" };
	const slug = requiredText(input.slug, 80);
	if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
		return { ok: false, error: "Slug must use lowercase letters, numbers, and hyphens" };
	}
	if (!isPortalResourceType(input.resourceType)) {
		return { ok: false, error: "Resource type must be rich_text or embed" };
	}
	if (input.published !== undefined && typeof input.published !== "boolean") {
		return { ok: false, error: "Published must be a boolean" };
	}
	const published: 0 | 1 = input.published === true ? 1 : 0;
	if (input.resourceType === "rich_text") {
		if (typeof input.content !== "string" || input.content.length > 20_000 || !input.content.trim()) {
			return { ok: false, error: "Rich text must contain 1 to 20000 characters" };
		}
		return {
			ok: true,
			value: { title, slug, resourceType: "rich_text", content: input.content.trim(), embedUrl: null, published },
		};
	}
	const embedUrl = extractSafeEmbedUrl(input.embed);
	if (!embedUrl) return { ok: false, error: "Embed must be an HTTPS URL or a single safe iframe" };
	return {
		ok: true,
		value: { title, slug, resourceType: "embed", content: "", embedUrl, published },
	};
}

export async function listOrganizerPortalResources(db: D1Database, eventId: string): Promise<PortalResourceRow[]> {
	const result = await db.prepare(
		"SELECT * FROM portal_resources WHERE event_id = ? ORDER BY position ASC, created_at ASC",
	).bind(eventId).all<PortalResourceRow>();
	return result.results;
}

/** Only a durable speaker-profile relationship grants a portal wiki page. */
export async function listPublishedPortalResourcesForSpeaker(db: D1Database, personId: string): Promise<PortalResourceRow[]> {
	const result = await db.prepare(
		`SELECT pr.* FROM portal_resources pr
		 WHERE pr.published = 1
		   AND (
			 EXISTS (
			   SELECT 1 FROM event_speaker_profiles esp
			   WHERE esp.event_id = pr.event_id
			     AND esp.person_id = ?
			     AND esp.workflow_status NOT IN ('declined', 'withdrawn')
			 )
			 OR EXISTS (
			   SELECT 1 FROM speaker_handoffs h
			   WHERE h.event_id = pr.event_id
			     AND h.manager_person_id = ?
			     AND h.status = 'accepted'
			 )
		   )
		 ORDER BY pr.event_id ASC, pr.position ASC, pr.created_at ASC`,
	).bind(personId, personId).all<PortalResourceRow>();
	return result.results.filter((resource) => resource.resource_type !== "embed" || (resource.embed_url !== null && isHttpsUrl(resource.embed_url)));
}

export async function createPortalResource(
	db: D1Database,
	eventId: string,
	input: PortalResourceInput,
): Promise<PortalResourceRow> {
	const now = Date.now();
	const resource = await db.prepare(
		`INSERT INTO portal_resources (
			id, event_id, title, slug, resource_type, content, embed_url,
			published, position, created_at, updated_at
		) SELECT ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(position), -1) + 1, ?, ?
		FROM portal_resources WHERE event_id = ?
		RETURNING *`,
	).bind(
		crypto.randomUUID(), eventId, input.title, input.slug, input.resourceType,
		input.content, input.embedUrl, input.published, now, now, eventId,
	).first<PortalResourceRow>();
	if (!resource) throw new Error("Portal resource creation failed");
	return resource;
}

export async function updatePortalResource(
	db: D1Database,
	eventId: string,
	resourceId: string,
	input: PortalResourceInput,
): Promise<PortalResourceRow | null> {
	return db.prepare(
		`UPDATE portal_resources
		 SET title = ?, slug = ?, resource_type = ?, content = ?, embed_url = ?,
			 published = ?, updated_at = ?
		 WHERE id = ? AND event_id = ?
		 RETURNING *`,
	).bind(
		input.title, input.slug, input.resourceType, input.content, input.embedUrl,
		input.published, Date.now(), resourceId, eventId,
	).first<PortalResourceRow>();
}

export async function deletePortalResource(db: D1Database, eventId: string, resourceId: string): Promise<boolean> {
	const result = await db.prepare("DELETE FROM portal_resources WHERE id = ? AND event_id = ?")
		.bind(resourceId, eventId)
		.run();
	return (result.meta.changes ?? 0) > 0;
}
