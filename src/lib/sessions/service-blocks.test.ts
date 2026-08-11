import { describe, expect, it } from "vitest";
import {
	assertCanPublishAgendaVisibility,
	normalizeServiceBlockInput,
} from "./service-blocks";

describe("normalizeServiceBlockInput", () => {
	it("accepts a public lunch block", () => {
		expect(
			normalizeServiceBlockInput({
				title: "Lunch",
				durationMinutes: 60,
				agendaVisibility: "public",
			}),
		).toEqual({
			ok: true,
			value: {
				title: "Lunch",
				abstract: "",
				durationMinutes: 60,
				agendaVisibility: "public",
			},
		});
	});

	it("rejects missing title and invalid duration/visibility", () => {
		const result = normalizeServiceBlockInput({
			title: "  ",
			durationMinutes: 17,
			agendaVisibility: "secret",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues.join(" ")).toMatch(/Title is required/i);
		expect(result.issues.join(" ")).toMatch(/Duration must be one of/i);
		expect(result.issues.join(" ")).toMatch(/Visibility must be public or private/i);
	});
});

describe("assertCanPublishAgendaVisibility", () => {
	it("allows public and defaults missing to public", () => {
		expect(assertCanPublishAgendaVisibility("public")).toEqual({ ok: true });
		expect(assertCanPublishAgendaVisibility(undefined)).toEqual({ ok: true });
	});

	it("refuses private service blocks", () => {
		const result = assertCanPublishAgendaVisibility("private");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/Private service blocks/i);
	});
});
