import type { FormFieldDef } from "./form-fields";

export type FormSection = {
	key: string;
	title: string;
	description?: string;
};

/** @deprecated Use FormSection */
export type FormSectionDef = FormSection;

const SECTION_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

export function isFormSection(value: unknown): value is FormSection {
	if (typeof value !== "object" || value === null) return false;
	const section = value as { key?: unknown; title?: unknown; description?: unknown };
	if (typeof section.key !== "string" || !SECTION_KEY_RE.test(section.key.trim())) return false;
	if (typeof section.title !== "string" || !section.title.trim()) return false;
	if (section.description !== undefined && typeof section.description !== "string") return false;
	return true;
}

/** @deprecated Use isFormSection */
export const isFormSectionDef = isFormSection;

export function parseFormSections(raw: string | null | undefined): FormSection[] {
	if (!raw?.trim()) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const sections: FormSection[] = [];
	const seen = new Set<string>();
	for (const item of parsed) {
		if (!isFormSection(item)) continue;
		const key = item.key.trim();
		if (seen.has(key)) continue;
		seen.add(key);
		sections.push({
			key,
			title: item.title.trim(),
			description: item.description?.trim() || undefined,
		});
	}
	return sections;
}

export function serializeFormSections(sections: FormSection[]): string | null {
	if (!sections.length) return null;
	const normalized = sections.map((section) => ({
		key: section.key.trim(),
		title: section.title.trim(),
		...(section.description?.trim() ? { description: section.description.trim() } : {}),
	}));
	if (!normalized.every(isFormSection)) {
		throw new Error("sections are invalid");
	}
	const seen = new Set<string>();
	for (const section of normalized) {
		if (seen.has(section.key)) throw new Error("section keys must be unique");
		seen.add(section.key);
	}
	return JSON.stringify(normalized);
}

export function validateFormSectionsInput(raw: unknown): FormSection[] | string {
	if (raw === null || raw === undefined) return [];
	if (!Array.isArray(raw)) return "sections must be an array";
	const sections: FormSection[] = [];
	const seen = new Set<string>();
	for (const item of raw) {
		if (!isFormSection(item)) return "each section needs key and title";
		const key = item.key.trim();
		if (seen.has(key)) return "section keys must be unique";
		seen.add(key);
		sections.push({
			key,
			title: item.title.trim(),
			description: item.description?.trim() || undefined,
		});
	}
	return sections;
}

export type GroupedFormFields = {
	section: FormSection | null;
	fields: FormFieldDef[];
}[];

export function groupFieldsBySection(
	fields: FormFieldDef[],
	sections: FormSection[],
): GroupedFormFields {
	const byKey = new Map(sections.map((section) => [section.key, section]));
	const groups = new Map<string | null, FormFieldDef[]>();
	for (const field of fields) {
		const sectionKey = field.sectionKey?.trim() || null;
		if (sectionKey && !byKey.has(sectionKey)) {
			const unsectioned = groups.get(null) ?? [];
			unsectioned.push(field);
			groups.set(null, unsectioned);
			continue;
		}
		const bucket = groups.get(sectionKey) ?? [];
		bucket.push(field);
		groups.set(sectionKey, bucket);
	}

	const ordered: GroupedFormFields = [];
	for (const section of sections) {
		const bucket = groups.get(section.key);
		if (bucket?.length) ordered.push({ section, fields: bucket });
	}
	const unsectioned = groups.get(null);
	if (unsectioned?.length) ordered.push({ section: null, fields: unsectioned });
	return ordered;
}
