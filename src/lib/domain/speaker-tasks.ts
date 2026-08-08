export const SPEAKER_TASK_KEYS = ["bio", "headshot", "slides", "docs"] as const;

export type SpeakerTaskKey = (typeof SPEAKER_TASK_KEYS)[number];

export type SpeakerTaskKind = "text" | "file";

export type SpeakerTaskTypeMeta = {
	key: SpeakerTaskKey;
	label: string;
	kind: SpeakerTaskKind;
	accept: readonly string[];
	position: number;
};

export const SPEAKER_TASK_TYPE_REGISTRY: Record<SpeakerTaskKey, SpeakerTaskTypeMeta> =
	{
		bio: {
			key: "bio",
			label: "Speaker bio",
			kind: "text",
			accept: ["text/plain"],
			position: 0,
		},
		headshot: {
			key: "headshot",
			label: "Headshot",
			kind: "file",
			accept: ["image/jpeg", "image/png", "image/webp"],
			position: 1,
		},
		slides: {
			key: "slides",
			label: "Slides",
			kind: "file",
			accept: [
				"application/pdf",
				"application/vnd.ms-powerpoint",
				"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			],
			position: 2,
		},
		docs: {
			key: "docs",
			label: "Supporting docs",
			kind: "file",
			accept: [
				"application/pdf",
				"application/msword",
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				"application/zip",
				"application/x-zip-compressed",
			],
			position: 3,
		},
	};

export const SPEAKER_TASK_STATUSES = ["pending", "completed"] as const;
export type SpeakerTaskStatus = (typeof SPEAKER_TASK_STATUSES)[number];

export function isSpeakerTaskKey(value: string): value is SpeakerTaskKey {
	return (SPEAKER_TASK_KEYS as readonly string[]).includes(value);
}

export function isSpeakerTaskStatus(value: string): value is SpeakerTaskStatus {
	return (SPEAKER_TASK_STATUSES as readonly string[]).includes(value);
}

export function speakerTaskTypesInOrder(): SpeakerTaskTypeMeta[] {
	return SPEAKER_TASK_KEYS.map((key) => SPEAKER_TASK_TYPE_REGISTRY[key]).sort(
		(a, b) => a.position - b.position,
	);
}
