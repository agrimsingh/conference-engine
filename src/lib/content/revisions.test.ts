import { describe, expect, it } from "vitest";
import { sessionContentFromRow } from "./revisions";

describe("session content", () => {
	it("reads editable fields without discarding other answers", () => {
		expect(sessionContentFromRow({ answers_json: JSON.stringify({ title: "Talk", abstract: "Details", format: "stage" }), content_status: "approved" } as never))
			.toEqual({ title: "Talk", abstract: "Details", contentStatus: "approved" });
	});

	it("fails closed to draft for unknown legacy status", () => {
		expect(sessionContentFromRow({ answers_json: "{}", content_status: "unknown" } as never).contentStatus).toBe("draft");
	});
});
