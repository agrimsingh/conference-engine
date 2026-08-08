export type VisibilityRule =
	| { op: "always" }
	| { op: "never" }
	| { op: "eq"; fieldKey: string; value: string }
	| { op: "neq"; fieldKey: string; value: string }
	| { op: "in"; fieldKey: string; values: string[] }
	| { op: "and"; rules: VisibilityRule[] }
	| { op: "or"; rules: VisibilityRule[] };

export type AnswerMap = Record<string, unknown>;

function asString(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return null;
}

export function evaluateVisibilityRule(
	rule: VisibilityRule,
	answers: AnswerMap,
): boolean {
	switch (rule.op) {
		case "always":
			return true;
		case "never":
			return false;
		case "eq": {
			const current = asString(answers[rule.fieldKey]);
			return current === rule.value;
		}
		case "neq": {
			const current = asString(answers[rule.fieldKey]);
			return current !== rule.value;
		}
		case "in": {
			const current = asString(answers[rule.fieldKey]);
			return current !== null && rule.values.includes(current);
		}
		case "and":
			return rule.rules.every((r) => evaluateVisibilityRule(r, answers));
		case "or":
			return rule.rules.some((r) => evaluateVisibilityRule(r, answers));
		default: {
			const _exhaustive: never = rule;
			return _exhaustive;
		}
	}
}

export function parseVisibilityRule(raw: string): VisibilityRule {
	const parsed: unknown = JSON.parse(raw);
	if (!isVisibilityRule(parsed)) {
		throw new Error("Invalid visibility_rule JSON");
	}
	return parsed;
}

export function isVisibilityRule(value: unknown): value is VisibilityRule {
	if (typeof value !== "object" || value === null || !("op" in value)) {
		return false;
	}
	const op = (value as { op: unknown }).op;
	switch (op) {
		case "always":
		case "never":
			return true;
		case "eq":
		case "neq": {
			const v = value as { fieldKey?: unknown; value?: unknown };
			return typeof v.fieldKey === "string" && typeof v.value === "string";
		}
		case "in": {
			const v = value as { fieldKey?: unknown; values?: unknown };
			return (
				typeof v.fieldKey === "string" &&
				Array.isArray(v.values) &&
				v.values.every((x) => typeof x === "string")
			);
		}
		case "and":
		case "or": {
			const v = value as { rules?: unknown };
			return Array.isArray(v.rules) && v.rules.every(isVisibilityRule);
		}
		default:
			return false;
	}
}
