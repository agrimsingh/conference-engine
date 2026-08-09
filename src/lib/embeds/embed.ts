import {
	getEventBySlug,
	listAgendaSlotsWithSubmissions,
	listAgendaTracks,
	listPublicSpeakersForEvent,
	listSpeakersForSubmissions,
} from "@/lib/db/queries";
import { AIE_FORMAT_CATEGORY_ROUTE, displayCategory, isPublicScheduleStatus, titleFromAnswers } from "@/lib/domain";
import { publicScheduleTrack } from "@/lib/schedule/public-tracks";

export const EMBED_WIDGET_TYPES = ["sessions", "speakers", "agenda", "itinerary", "speaker_gallery"] as const;
export type EmbedWidgetType = (typeof EMBED_WIDGET_TYPES)[number];
export const EMBED_VISIBLE_FIELDS = ["title", "time", "room", "track", "speakers", "abstract", "format", "bio", "jobTitle", "company", "headshot"] as const;
export type EmbedVisibleField = (typeof EMBED_VISIBLE_FIELDS)[number];

export type EmbedConfig = {
	brandColor: string;
	trackIds: string[];
	formats: string[];
	rooms: string[];
	visibleFields: EmbedVisibleField[];
};

export type EmbedRow = {
	id: string;
	event_id: string;
	name: string;
	slug: string;
	widget_type: EmbedWidgetType;
	config_json: string;
	created_at: number;
	updated_at: number;
};

export type EmbedDefinition = Omit<EmbedRow, "config_json"> & { config: EmbedConfig };
export type EmbedInput = { name: string; slug: string; widgetType: EmbedWidgetType } & EmbedConfig;
export type EmbedParseResult = { ok: true; value: EmbedInput } | { ok: false; error: string };

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;
const SAFE_FILTER = /^[\p{L}\p{N}][\p{L}\p{N} _./:+&'()-]{0,79}$/u;
const WIDGET_DEFAULT_FIELDS: Record<EmbedWidgetType, EmbedVisibleField[]> = {
	sessions: ["title", "time", "room", "track", "speakers", "abstract", "format", "jobTitle", "company"],
	speakers: ["headshot", "jobTitle", "company", "bio"],
	agenda: ["title", "time", "room", "track", "abstract", "format", "speakers"],
	itinerary: ["title", "time", "room", "track", "speakers", "abstract", "format", "jobTitle", "company"],
	speaker_gallery: ["headshot", "jobTitle", "company", "bio"],
};

export function defaultVisibleFields(widgetType: EmbedWidgetType): EmbedVisibleField[] {
	return [...WIDGET_DEFAULT_FIELDS[widgetType]];
}

function stringArray(value: unknown, label: string): { ok: true; value: string[] } | { ok: false; error: string } {
	if (value === undefined) return { ok: true, value: [] };
	if (!Array.isArray(value) || value.length > 30) return { ok: false, error: `${label} must be an array of at most 30 values` };
	const normalized: string[] = [];
	for (const item of value) {
		if (typeof item !== "string" || !SAFE_FILTER.test(item.trim())) return { ok: false, error: `${label} contains an invalid value` };
		if (!normalized.includes(item.trim())) normalized.push(item.trim());
	}
	return { ok: true, value: normalized };
}

export function parseEmbedInput(input: unknown): EmbedParseResult {
	if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Expected JSON object" };
	const source = input as Record<string, unknown>;
	const name = typeof source.name === "string" ? source.name.trim() : "";
	const slug = typeof source.slug === "string" ? source.slug.trim().toLowerCase() : "";
	if (!name || name.length > 80) return { ok: false, error: "Name must be between 1 and 80 characters" };
	if (!SAFE_SLUG.test(slug) || slug.length > 64) return { ok: false, error: "Slug must contain lowercase letters, numbers, and hyphens" };
	if (typeof source.widgetType !== "string" || !(EMBED_WIDGET_TYPES as readonly string[]).includes(source.widgetType)) return { ok: false, error: "Unsupported widget type" };
	const widgetType = source.widgetType as EmbedWidgetType;
	const brandColor = source.brandColor === undefined ? "#2563eb" : source.brandColor;
	if (typeof brandColor !== "string" || !SAFE_COLOR.test(brandColor)) return { ok: false, error: "Brand color must be a six-digit hex color" };
	const trackIds = stringArray(source.trackIds, "Track filters"); if (!trackIds.ok) return trackIds;
	const formats = stringArray(source.formats, "Format filters"); if (!formats.ok) return formats;
	const rooms = stringArray(source.rooms, "Room filters"); if (!rooms.ok) return rooms;
	const rawFields = source.visibleFields === undefined ? defaultVisibleFields(widgetType) : source.visibleFields;
	if (!Array.isArray(rawFields) || rawFields.length === 0 || rawFields.length > EMBED_VISIBLE_FIELDS.length || rawFields.some((field) => typeof field !== "string" || !(EMBED_VISIBLE_FIELDS as readonly string[]).includes(field))) return { ok: false, error: "Visible fields contain an unsupported field" };
	return { ok: true, value: { name, slug, widgetType, brandColor: brandColor.toLowerCase(), trackIds: trackIds.value, formats: formats.value, rooms: rooms.value, visibleFields: [...new Set(rawFields)] as EmbedVisibleField[] } };
}

export function parseStoredEmbedConfig(widgetType: EmbedWidgetType, raw: unknown): EmbedConfig {
	const source = raw && typeof raw === "object" && !Array.isArray(raw)
		? raw as Record<string, unknown>
		: {};
	const brandColor = typeof source.brandColor === "string" && SAFE_COLOR.test(source.brandColor)
		? source.brandColor.toLowerCase()
		: "#2563eb";
	const safeArray = (value: unknown, label: string): string[] => {
		const parsed = stringArray(value, label);
		return parsed.ok ? parsed.value : [];
	};
	const visibleFields = Array.isArray(source.visibleFields)
		? [...new Set(source.visibleFields.filter((field): field is EmbedVisibleField =>
			typeof field === "string" && (EMBED_VISIBLE_FIELDS as readonly string[]).includes(field),
		))]
		: [];
	return {
		brandColor,
		trackIds: safeArray(source.trackIds, "Track filters"),
		formats: safeArray(source.formats, "Format filters"),
		rooms: safeArray(source.rooms, "Room filters"),
		visibleFields: visibleFields.length > 0 ? visibleFields : defaultVisibleFields(widgetType),
	};
}

function fromRow(row: EmbedRow): EmbedDefinition {
	let rawConfig: unknown = {};
	try {
		rawConfig = JSON.parse(row.config_json);
	} catch {
		// Invalid legacy JSON falls back to the safe defaults for this widget.
	}
	const config = parseStoredEmbedConfig(row.widget_type, rawConfig);
	return { id: row.id, event_id: row.event_id, name: row.name, slug: row.slug, widget_type: row.widget_type, created_at: row.created_at, updated_at: row.updated_at, config };
}

function configFromInput(input: EmbedInput): EmbedConfig {
	return { brandColor: input.brandColor, trackIds: input.trackIds, formats: input.formats, rooms: input.rooms, visibleFields: input.visibleFields };
}

export async function listEmbeds(db: D1Database, eventId: string): Promise<EmbedDefinition[]> {
	const result = await db.prepare("SELECT * FROM public_embeds WHERE event_id = ? ORDER BY updated_at DESC, name ASC").bind(eventId).all<EmbedRow>();
	return result.results.map(fromRow);
}

export async function getPublicEmbedBySlug(db: D1Database, eventId: string, slug: string): Promise<EmbedDefinition | null> {
	const row = await db.prepare("SELECT * FROM public_embeds WHERE event_id = ? AND slug = ?").bind(eventId, slug).first<EmbedRow>();
	return row ? fromRow(row) : null;
}

export async function createEmbed(db: D1Database, eventId: string, input: EmbedInput): Promise<EmbedDefinition> {
	const id = crypto.randomUUID(); const now = Date.now();
	await db.prepare("INSERT INTO public_embeds (id, event_id, name, slug, widget_type, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, eventId, input.name, input.slug, input.widgetType, JSON.stringify(configFromInput(input)), now, now).run();
	return { id, event_id: eventId, name: input.name, slug: input.slug, widget_type: input.widgetType, created_at: now, updated_at: now, config: configFromInput(input) };
}

export async function updateEmbed(db: D1Database, eventId: string, embedId: string, input: EmbedInput): Promise<EmbedDefinition | null> {
	const now = Date.now();
	const result = await db.prepare("UPDATE public_embeds SET name = ?, slug = ?, widget_type = ?, config_json = ?, updated_at = ? WHERE id = ? AND event_id = ?").bind(input.name, input.slug, input.widgetType, JSON.stringify(configFromInput(input)), now, embedId, eventId).run();
	if (!result.meta.changes) return null;
	return { id: embedId, event_id: eventId, name: input.name, slug: input.slug, widget_type: input.widgetType, created_at: now, updated_at: now, config: configFromInput(input) };
}

export async function deleteEmbed(db: D1Database, eventId: string, embedId: string): Promise<boolean> {
	const result = await db.prepare("DELETE FROM public_embeds WHERE id = ? AND event_id = ?").bind(embedId, eventId).run();
	return Boolean(result.meta.changes);
}

function parseAnswers(raw: string): Record<string, unknown> { try { const value: unknown = JSON.parse(raw); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; } }

export type PublicEmbedPayload = {
	ok: true;
	event: { slug: string; name: string; timezone: string };
	embed: { slug: string; name: string; widgetType: EmbedWidgetType; config: EmbedConfig };
	sessions: Array<{ id: string; title: string; abstract: string; format: string; room: string; trackId: string | null; track: string; startsAt: number; endsAt: number; speakers: Array<{ id: string | null; name: string; jobTitle: string | null; company: string | null; headshotUrl: string | null; url: string | null }>; url: string }>;
	speakers: Array<{ id: string; name: string; bio: string | null; jobTitle: string | null; company: string | null; headshotUrl: string | null; url: string; sessions: Array<{ id: string; title: string; startsAt: number; endsAt: number; room: string; url: string }> }>;
	itineraryUrl: string;
};

function surnameSortKey(name: string): string {
	const parts = name.trim().split(/\s+/);
	return `${parts.at(-1) ?? ""}\0${name}`;
}

export async function buildPublicEmbedPayload(db: D1Database, eventSlug: string, embedSlug: string): Promise<PublicEmbedPayload | null> {
	const event = await getEventBySlug(db, eventSlug); if (!event) return null;
	const embed = await getPublicEmbedBySlug(db, event.id, embedSlug); if (!embed) return null;
	const [slots, tracks, speakerRows] = await Promise.all([listAgendaSlotsWithSubmissions(db, event.id), listAgendaTracks(db, event.id, { includeRetired: true }), listPublicSpeakersForEvent(db, event.id)]);
	const published = slots.filter((slot) => isPublicScheduleStatus(slot.submission_status));
	const speakerMap = await listSpeakersForSubmissions(db, published.map((slot) => slot.submission_id));
	const speakerDirectory = new Map(speakerRows.map((speaker) => [speaker.person_id, speaker]));
	const sessions = published.map((slot) => {
		const answers = parseAnswers(slot.answers_json);
		const track = publicScheduleTrack(slot.track_id, tracks);
		const rawFormat = typeof answers.format === "string" ? answers.format.trim() : "";
		const format = rawFormat
			? AIE_FORMAT_CATEGORY_ROUTE.map[rawFormat] ?? rawFormat
			: displayCategory(slot.category);
		return {
			id: slot.submission_id,
			title: titleFromAnswers(answers),
			abstract: typeof answers.abstract === "string" ? answers.abstract.trim() : typeof answers.description === "string" ? answers.description.trim() : "",
			format,
			room: slot.room_name,
			trackId: track.id,
			track: track.name,
			startsAt: slot.starts_at,
			endsAt: slot.ends_at,
			speakers: (speakerMap.get(slot.submission_id) ?? [])
				.filter((speaker) => speaker.status === "confirmed")
				.map((speaker) => {
					const profile = speaker.person_id ? speakerDirectory.get(speaker.person_id) : undefined;
					return {
						id: speaker.person_id,
						name: profile?.display_name ?? (speaker.name.trim() || "Speaker"),
						jobTitle: profile?.job_title ?? null,
						company: profile?.company ?? null,
						headshotUrl: profile?.has_headshot === 1 && speaker.person_id ? `/api/e/${event.slug}/people/${speaker.person_id}/headshot` : null,
						url: speaker.person_id ? `/e/${event.slug}/speakers/${speaker.person_id}` : null,
					};
				}),
			url: `/e/${event.slug}/sessions/${slot.submission_id}`,
		};
	}).filter((session) => (embed.config.trackIds.length === 0 || (session.trackId && embed.config.trackIds.includes(session.trackId))) && (embed.config.formats.length === 0 || embed.config.formats.includes(session.format)) && (embed.config.rooms.length === 0 || embed.config.rooms.includes(session.room))).sort((a, b) => a.startsAt - b.startsAt);
	const speakers = speakerRows.map((speaker) => ({
		id: speaker.person_id,
		name: speaker.display_name,
		bio: speaker.bio,
		jobTitle: speaker.job_title,
		company: speaker.company,
		headshotUrl: speaker.has_headshot === 1 ? `/api/e/${event.slug}/people/${speaker.person_id}/headshot` : null,
		url: `/e/${event.slug}/speakers/${speaker.person_id}`,
		sessions: sessions
			.filter((session) => session.speakers.some((sessionSpeaker) => sessionSpeaker.id === speaker.person_id))
			.map((session) => ({ id: session.id, title: session.title, startsAt: session.startsAt, endsAt: session.endsAt, room: session.room, url: session.url })),
	})).filter((speaker) => speaker.sessions.length > 0).sort((a, b) => surnameSortKey(a.name).localeCompare(surnameSortKey(b.name), undefined, { sensitivity: "base" }));
	return { ok: true, event: { slug: event.slug, name: event.name, timezone: event.timezone }, embed: { slug: embed.slug, name: embed.name, widgetType: embed.widget_type, config: embed.config }, sessions, speakers, itineraryUrl: `/e/${event.slug}/schedule?view=itinerary&embed=${encodeURIComponent(embed.slug)}` };
}

export function buildEmbedUrls(origin: string, eventSlug: string, embedSlug: string) {
	const safeOrigin = new URL(origin).origin;
	const path = `/embed/${encodeURIComponent(eventSlug)}/widgets/${encodeURIComponent(embedSlug)}`;
	const shareUrl = `${safeOrigin}${path}`;
	const apiPath = `${safeOrigin}/api/e/${encodeURIComponent(eventSlug)}/embeds/${encodeURIComponent(embedSlug)}`;
	const loaderUrl = `${apiPath}/loader.js`;
	return {
		shareUrl,
		jsonUrl: apiPath,
		icalUrl: `${apiPath}/ical`,
		htmlUrl: `${apiPath}/html`,
		xmlUrl: `${apiPath}/xml`,
		loaderUrl,
		iframeSnippet: `<iframe src="${shareUrl}" title="Event widget" loading="lazy" width="100%" height="640" style="border:0" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`,
		scriptSnippet: `<conference-engine-embed src="${shareUrl}"></conference-engine-embed><script type="module" src="${loaderUrl}"></script>`,
	};
}

function escapeIcs(value: string): string { return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function icsDate(ms: number): string { return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }
export function buildEmbedIcal(payload: PublicEmbedPayload): string {
	const events = payload.sessions.map((session) => ["BEGIN:VEVENT", `UID:${escapeIcs(`${payload.event.slug}-${session.id}@conference-engine`)}`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(session.startsAt)}`, `DTEND:${icsDate(session.endsAt)}`, `SUMMARY:${escapeIcs(session.title)}`, `LOCATION:${escapeIcs(session.room)}`, `URL:${escapeIcs(session.url)}`, "END:VEVENT"].join("\r\n"));
	return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Conference Engine//Public Embed//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n");
}

function escapeMarkup(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
export function buildEmbedHtml(payload: PublicEmbedPayload): string {
	const items = payload.sessions.map((session) => `<li><time datetime="${new Date(session.startsAt).toISOString()}">${escapeMarkup(new Intl.DateTimeFormat("en", { timeZone: payload.event.timezone, dateStyle: "medium", timeStyle: "short" }).format(session.startsAt))}</time><a href="${escapeMarkup(session.url)}">${escapeMarkup(session.title)}</a><span>${escapeMarkup(session.room)}</span></li>`).join("");
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeMarkup(payload.embed.name)}</title><style>body{background:#0a0a0a;color:#e5e5e5;font:14px system-ui;margin:0;padding:20px}h1{font-size:20px}ul{list-style:none;padding:0}li{border-bottom:1px solid #262626;display:grid;gap:6px;padding:14px 0}a{color:${payload.embed.config.brandColor};font-weight:600;text-decoration:none}time,span{color:#a3a3a3;font-size:12px}</style></head><body><h1>${escapeMarkup(payload.event.name)}</h1><ul>${items}</ul></body></html>`;
}
export function buildEmbedXml(payload: PublicEmbedPayload): string {
	const sessions = payload.sessions.map((session) => `<session id="${escapeMarkup(session.id)}"><title>${escapeMarkup(session.title)}</title><startsAt>${session.startsAt}</startsAt><endsAt>${session.endsAt}</endsAt><room>${escapeMarkup(session.room)}</room><track>${escapeMarkup(session.track)}</track><format>${escapeMarkup(session.format)}</format><url>${escapeMarkup(session.url)}</url></session>`).join("");
	return `<?xml version="1.0" encoding="UTF-8"?><event slug="${escapeMarkup(payload.event.slug)}"><name>${escapeMarkup(payload.event.name)}</name><sessions>${sessions}</sessions></event>`;
}
