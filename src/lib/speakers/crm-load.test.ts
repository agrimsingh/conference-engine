import { describe, expect, it } from "vitest";
import { resolveSpeakerCrmLoad } from "./crm-load";

const crm = {
	owner: null,
	tags: [],
	lastContactAt: null,
	timeline: [],
};

describe("speaker CRM drawer loading", () => {
	it("closes the drawer on an HTTP or malformed CRM response", () => {
		// Given: an unsuccessful response and a successful HTTP response without CRM data.

		// When: the client resolves the drawer state.
		const httpFailure = resolveSpeakerCrmLoad(false, { ok: false, error: "Forbidden" });
		const malformedSuccess = resolveSpeakerCrmLoad(true, { ok: true });

		// Then: neither result leaves the loading drawer open.
		expect(httpFailure).toEqual({ kind: "failure", error: "Forbidden" });
		expect(malformedSuccess).toEqual({ kind: "failure", error: "Could not load speaker CRM" });
	});

	it("keeps the drawer open only for a complete CRM response", () => {
		// Given: a valid CRM response.

		// When: the client resolves the drawer state.
		const result = resolveSpeakerCrmLoad(true, { ok: true, crm });

		// Then: the complete detail is available to render.
		expect(result).toEqual({ kind: "loaded", crm });
	});
});
