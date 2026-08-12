export const PUBLIC_TBA_SPEAKER_NAME = "Speaker to be announced";

export type PublicSpeakerSource = {
	status: string;
	personId: string | null;
	name: string;
};

export type PublicNamedSpeaker = {
	kind: "named";
	personId: string | null;
	name: string;
};

export type PublicTbaSpeaker = {
	kind: "tba";
	personId: null;
	name: typeof PUBLIC_TBA_SPEAKER_NAME;
};

export type PublicSessionSpeakerAppearance = PublicNamedSpeaker | PublicTbaSpeaker;

const OMITTED_STATUSES = new Set(["declined", "removed"]);

export function publicSpeakerSourceFromRow(row: {
	status: string;
	person_id?: string | null;
	name: string;
}): PublicSpeakerSource {
	return { status: row.status, personId: row.person_id ?? null, name: row.name };
}

export function publicSessionSpeakers(
	speakers: readonly PublicSpeakerSource[],
): PublicSessionSpeakerAppearance[] {
	const named: PublicNamedSpeaker[] = [];
	let unconfirmed = 0;
	for (const speaker of speakers) {
		if (OMITTED_STATUSES.has(speaker.status)) continue;
		if (speaker.status === "confirmed") {
			named.push({
				kind: "named",
				personId: speaker.personId,
				name: speaker.name.trim() || "Speaker",
			});
			continue;
		}
		unconfirmed += 1;
	}
	if (unconfirmed > 0 || named.length === 0) {
		return [...named, { kind: "tba", personId: null, name: PUBLIC_TBA_SPEAKER_NAME }];
	}
	return named;
}

export function mapPublicSessionSpeakers<T>(
	speakers: readonly PublicSpeakerSource[],
	mapNamed: (speaker: PublicNamedSpeaker) => T,
	tba: T,
): T[] {
	return publicSessionSpeakers(speakers).map((item) => (item.kind === "tba" ? tba : mapNamed(item)));
}

export function isPublicTbaSpeaker(speaker: {
	personId: string | null;
	name: string;
	kind?: "named" | "tba";
}): boolean {
	if (speaker.kind === "tba") return true;
	if (speaker.kind === "named") return false;
	return speaker.personId === null && speaker.name === PUBLIC_TBA_SPEAKER_NAME;
}
