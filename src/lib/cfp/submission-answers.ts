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
		fieldLabels?: ReadonlyMap<string, string>;
	},
): SubmissionAnswerDisplay[] {
	const exclude = args.excludeKeys ?? new Set(["speakers", "title"]);
	const displays: SubmissionAnswerDisplay[] = [];

	const appendDisplayForKey = (key: string) => {
		const value = answers[key];
		if (value === undefined) return;
		if (exclude.has(key)) return;
		const label = args.fieldLabels?.get(key) ?? humanizeKey(key);

		if (isFileUploadAnswer(value)) {
			displays.push({
				kind: "file",
				key,
				label,
				filename: value.filename,
				downloadHref: args.downloadHref(key),
			});
			return;
		}

		const text = formatScalar(value);
		if (text) {
			displays.push({ kind: "text", key, label, value: text });
		}
	};

	// When fieldLabels is provided, ordered keys come first (Map insertion order), then leftover answer keys.
	const keys =
		args.fieldLabels !== undefined
			? [
					...args.fieldLabels.keys(),
					...Object.keys(answers).filter((key) => !args.fieldLabels!.has(key)),
				]
			: Object.keys(answers);

	for (const key of keys) {
		appendDisplayForKey(key);
	}

	return displays;
}
