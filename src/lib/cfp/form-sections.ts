import type { FormFieldDef, FormSectionDef } from "@/lib/domain";

export type CfpSectionGroup = {
	section: FormSectionDef | null;
	fields: FormFieldDef[];
};

/** Groups visible fields by section metadata. Unmapped fields stay in a trailing group. */
export function groupVisibleFieldsBySection(
	sections: FormSectionDef[],
	fields: FormFieldDef[],
): CfpSectionGroup[] {
	if (sections.length === 0) return [{ section: null, fields }];

	const sectionKeys = new Set(sections.map((section) => section.key));
	const buckets = new Map<string, FormFieldDef[]>();
	for (const section of sections) buckets.set(section.key, []);

	const unsectioned: FormFieldDef[] = [];
	for (const field of fields) {
		const key = field.sectionKey;
		if (key && sectionKeys.has(key)) buckets.get(key)?.push(field);
		else unsectioned.push(field);
	}

	const groups: CfpSectionGroup[] = sections
		.map((section) => ({ section, fields: buckets.get(section.key) ?? [] }))
		.filter((group) => group.fields.length > 0);

	if (unsectioned.length > 0) groups.push({ section: null, fields: unsectioned });
	return groups.length > 0 ? groups : [{ section: null, fields }];
}
