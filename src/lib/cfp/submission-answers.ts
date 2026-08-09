import { isFileUploadAnswer } from "@/lib/domain";

export type SubmissionAnswerDisplay =
	| { kind: "text"; key: string; label: string; value: string }
	| { kind: "file"; key: string; label: string; filename: string; downloadHref: string };

function humanizeKey(key: string): string {
	return key.replaceAll("_", " ");
}

function formatScalar(value: unknown): string | null {
	if (typeof value === "string" || typeof value === "number") {
		const text = String(value).trim();
		return text.length > 0 ? text : null;
	}
	if (Array.isArray(value)) {
		const joined = value.map((item) => String(item)).filter(Boolean).join(", ");
		return joined.length > 0 ? joined : null;
	}
	return null;
}

export function buildSubmissionAnswerDisplays(
	answers: Record<string, unknown>,
	args: {
		submissionId: string;
		downloadHref: (fieldKey: string) => string;
		excludeKeys?: ReadonlySet<string>;
	},
): SubmissionAnswerDisplay[] {
	const exclude = args.excludeKeys ?? new Set(["speakers", "title"]);
	const displays: SubmissionAnswerDisplay[] = [];

	for (const [key, value] of Object.entries(answers)) {
		if (exclude.has(key)) continue;
		const label = humanizeKey(key);

		if (isFileUploadAnswer(value)) {
			displays.push({
				kind: "file",
				key,
				label,
				filename: value.filename,
				downloadHref: args.downloadHref(key),
			});
			continue;
		}

		const text = formatScalar(value);
		if (text) {
			displays.push({ kind: "text", key, label, value: text });
		}
	}

	return displays;
}
