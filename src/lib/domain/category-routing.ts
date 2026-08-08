import type { AnswerMap } from "./visibility";

/** Display label stored on submissions.category (and used as schedule track). */
export type CategoryLabel = string;

export const UNCATEGORIZED_CATEGORY = "Uncategorized" as const;

/**
 * Maps a form answer field onto a category label.
 * AIE CFP routes by the `format` select.
 */
export type CategoryRoute = {
	fieldKey: string;
	/** Answer value → category label */
	map: Readonly<Record<string, CategoryLabel>>;
	fallback: CategoryLabel;
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

export function categoryRouteForForm(formSlug: string): CategoryRoute | null {
	switch (formSlug) {
		case "cfp":
			return AIE_FORMAT_CATEGORY_ROUTE;
		default:
			return null;
	}
}

export function resolveCategory(
	route: CategoryRoute,
	answers: AnswerMap,
): CategoryLabel {
	const raw = answers[route.fieldKey];
	if (typeof raw !== "string") return route.fallback;
	const mapped = route.map[raw];
	return mapped ?? route.fallback;
}

/**
 * Category to persist at submit time. Returns null when no route applies
 * or the answer doesn't map (UI treats NULL as Uncategorized).
 */
export function resolveSubmissionCategory(
	formSlug: string,
	answers: AnswerMap,
): CategoryLabel | null {
	const route = categoryRouteForForm(formSlug);
	if (!route) return null;
	const raw = answers[route.fieldKey];
	if (typeof raw !== "string") return null;
	return route.map[raw] ?? null;
}

/** Normalize DB null/empty to Uncategorized for display & filtering. */
export function displayCategory(category: string | null | undefined): CategoryLabel {
	if (!category || category.trim() === "") return UNCATEGORIZED_CATEGORY;
	return category;
}
