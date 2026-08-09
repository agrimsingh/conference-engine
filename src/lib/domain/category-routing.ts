import type { AnswerMap } from "./visibility";

/** Display label stored on submissions.category (and used as schedule track). */
export type CategoryLabel = string;

export const UNCATEGORIZED_CATEGORY = "Uncategorized" as const;

/** Maps a form answer field onto a category label. */
export type CategoryRoute = {
	fieldKey: string;
	/** Answer value → category label */
	map: Readonly<Record<string, CategoryLabel>>;
	fallback?: CategoryLabel;
};

export const AIE_FORMAT_CATEGORY_ROUTE: CategoryRoute = {
	fieldKey: "format",
	map: {
		stage: "Stage",
		lightning: "Lightning",
		workshop: "Workshop",
		online: "Online",
	},
	fallback: UNCATEGORIZED_CATEGORY,
};

/** Canonical AIE track labels in display order (excluding Uncategorized). */
export const AIE_CATEGORY_LABELS = [
	"Stage",
	"Lightning",
	"Workshop",
	"Online",
] as const;

export type AieCategoryLabel = (typeof AIE_CATEGORY_LABELS)[number];

export function isAieCategoryLabel(value: string): value is AieCategoryLabel {
	return (AIE_CATEGORY_LABELS as readonly string[]).includes(value);
}

export function isCategoryRoute(value: unknown): value is CategoryRoute {
	if (typeof value !== "object" || value === null) return false;
	const route = value as { fieldKey?: unknown; map?: unknown; fallback?: unknown };
	if (typeof route.fieldKey !== "string" || !route.fieldKey.trim()) return false;
	if (typeof route.map !== "object" || route.map === null || Array.isArray(route.map)) return false;
	if (route.fallback !== undefined && (typeof route.fallback !== "string" || !route.fallback.trim())) return false;
	return Object.entries(route.map).every(([value, label]) => value.trim() !== "" && typeof label === "string" && label.trim() !== "");
}

/** Parses the per-form route without allowing malformed database JSON to break a public CFP. */
export function parseCategoryRoute(raw: string | null | undefined): CategoryRoute | null {
	if (!raw?.trim()) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return isCategoryRoute(parsed)
			? {
				fieldKey: parsed.fieldKey.trim(),
				map: Object.fromEntries(Object.entries(parsed.map).map(([value, label]) => [value.trim(), label.trim()])),
				fallback: parsed.fallback?.trim() || undefined,
			}
			: null;
	} catch {
		return null;
	}
}

export function resolveCategory(
	route: CategoryRoute,
	answers: AnswerMap,
): CategoryLabel {
	const raw = answers[route.fieldKey];
	if (typeof raw !== "string") return route.fallback ?? UNCATEGORIZED_CATEGORY;
	const mapped = route.map[raw];
	return mapped ?? route.fallback ?? UNCATEGORIZED_CATEGORY;
}

/**
 * Category to persist at submit time. Returns null when no route applies
 * or the answer doesn't map (UI treats NULL as Uncategorized).
 */
export function resolveSubmissionCategory(route: CategoryRoute | null, answers: AnswerMap): CategoryLabel | null {
	if (!route) return null;
	const raw = answers[route.fieldKey];
	if (typeof raw !== "string") return null;
	return route.map[raw] ?? route.fallback ?? null;
}

/** Normalize DB null/empty to Uncategorized for display & filtering. */
export function displayCategory(category: string | null | undefined): CategoryLabel {
	if (!category || category.trim() === "") return UNCATEGORIZED_CATEGORY;
	return category;
}
