export type SpeakerSocialLinks = {
	twitter?: string;
	linkedin?: string;
	github?: string;
	website?: string;
};

const SOCIAL_KEYS = ["twitter", "linkedin", "github", "website"] as const;
type SocialKey = (typeof SOCIAL_KEYS)[number];

export function parseSpeakerSocial(raw: string | null | undefined): SpeakerSocialLinks {
	if (!raw?.trim()) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		const record = parsed as Record<string, unknown>;
		const links: SpeakerSocialLinks = {};
		for (const key of SOCIAL_KEYS) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) links[key] = value.trim();
		}
		return links;
	} catch {
		return {};
	}
}

export function serializeSpeakerSocial(input: unknown): string | null {
	if (input == null) return null;
	if (typeof input === "string") {
		const parsed = parseSpeakerSocial(input);
		return Object.keys(parsed).length ? JSON.stringify(parsed) : null;
	}
	if (typeof input !== "object" || Array.isArray(input)) {
		throw new Error("social must be an object");
	}
	const record = input as Record<string, unknown>;
	const links: SpeakerSocialLinks = {};
	for (const key of SOCIAL_KEYS) {
		const value = record[key];
		if (value == null || value === "") continue;
		if (typeof value !== "string") throw new Error(`social.${key} must be a string`);
		const trimmed = value.trim();
		if (!trimmed) continue;
		if (trimmed.length > 500) throw new Error(`social.${key} is too long`);
		links[key] = trimmed;
	}
	return Object.keys(links).length ? JSON.stringify(links) : null;
}
