import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/version", () => {
	it("returns a public, cache-safe unknown marker when no release revision was baked in", async () => {
		// Given: the local test process has no deployment build revision.

		// When: a caller requests the public build provenance.
		const response = await GET();

		// Then: it returns no secrets and does not invent a release revision.
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({ build: { source: "unknown", revision: null } });
	});
});
