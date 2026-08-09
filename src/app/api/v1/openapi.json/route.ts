import { NextResponse } from "next/server";

const API_SECURITY = [{ bearerAuth: [] }, { apiKeyAuth: [] }] as const;

const OPENAPI_DOCUMENT = {
	openapi: "3.1.0",
	info: {
		title: "Conference Engine API",
		version: "1.0.0",
		description: "Read-only operator API. File resources are metadata only; no object storage keys or file contents are exposed.",
	},
	paths: {
		"/api/v1/events/{eventSlug}/submissions": {
			get: {
				summary: "List event submissions",
				security: API_SECURITY,
				parameters: [{ $ref: "#/components/parameters/eventSlug" }],
				responses: { "200": { description: "Submission list" }, "401": { $ref: "#/components/responses/Unauthorized" }, "404": { $ref: "#/components/responses/EventNotFound" } },
			},
		},
		"/api/v1/events/{eventSlug}/schedule": {
			get: {
				summary: "List published schedule slots",
				security: API_SECURITY,
				parameters: [{ $ref: "#/components/parameters/eventSlug" }],
				responses: { "200": { description: "Schedule" }, "401": { $ref: "#/components/responses/Unauthorized" }, "404": { $ref: "#/components/responses/EventNotFound" } },
			},
		},
		"/api/v1/events/{eventSlug}/speakers": {
			get: {
				summary: "List the event speaker roster with task and resource metadata",
				security: API_SECURITY,
				parameters: [{ $ref: "#/components/parameters/eventSlug" }],
				responses: { "200": { description: "Speaker roster" }, "401": { $ref: "#/components/responses/Unauthorized" }, "404": { $ref: "#/components/responses/EventNotFound" } },
			},
		},
	},
	components: {
		securitySchemes: {
			bearerAuth: { type: "http", scheme: "bearer" },
			apiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
		},
		parameters: {
			eventSlug: { name: "eventSlug", in: "path", required: true, schema: { type: "string" } },
		},
		responses: {
			Unauthorized: { description: "Missing or invalid API key" },
			EventNotFound: { description: "The event slug does not exist" },
		},
	},
} as const;

export async function GET() {
	return NextResponse.json(OPENAPI_DOCUMENT, {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
