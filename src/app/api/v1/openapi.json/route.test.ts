import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/v1/openapi.json", () => {
	it("returns OpenAPI 3.x JSON with response schemas for the main GETs", async () => {
		const response = await GET();
		expect(response.status).toBe(200);

		const body: unknown = await response.json();
		expect(body).toEqual(expect.objectContaining({ openapi: expect.stringMatching(/^3\./) }));

		const doc = body as {
			openapi: string;
			paths: Record<string, { get?: { responses?: Record<string, unknown> } }>;
			components: { schemas: Record<string, unknown> };
		};

		expect(doc.components.schemas.SubmissionsResponse).toBeTruthy();
		expect(doc.components.schemas.ScheduleResponse).toBeTruthy();
		expect(doc.components.schemas.SpeakersResponse).toBeTruthy();

		for (const path of [
			"/api/v1/events/{eventSlug}/submissions",
			"/api/v1/events/{eventSlug}/schedule",
			"/api/v1/events/{eventSlug}/speakers",
		]) {
			const ok = doc.paths[path]?.get?.responses?.["200"] as {
				content?: { "application/json"?: { schema?: unknown; example?: unknown } };
			};
			expect(ok?.content?.["application/json"]?.schema).toBeTruthy();
			expect(ok?.content?.["application/json"]?.example).toBeTruthy();
		}
	});
});
