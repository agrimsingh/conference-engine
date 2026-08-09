export type FormSectionDef = {
	key: string;
	title: string;
	description?: string;
};

export function isFormSectionDef(value: unknown): value is FormSectionDef {
	if (typeof value !== "object" || value === null) return false;
	const section = value as Record<string, unknown>;
	return typeof section.key === "string"
		&& section.key.trim().length > 0
		&& typeof section.title === "string"
		&& section.title.trim().length > 0
		&& (section.description === undefined || typeof section.description === "string");
}

export function parseFormSections(raw: string | null | undefined): FormSectionDef[] {
	if (!raw?.trim()) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const sections: FormSectionDef[] = [];
	const seen = new Set<string>();
	for (const item of parsed) {
		if (!isFormSectionDef(item) || seen.has(item.key)) continue;
		seen.add(item.key);
		sections.push({
			key: item.key,
			title: item.title.trim(),
			description: item.description?.trim() || undefined,
		});
	}
	return sections;
}
