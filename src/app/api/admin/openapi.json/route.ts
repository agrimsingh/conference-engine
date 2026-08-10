import { NextResponse } from "next/server";

const PAT_SECURITY = [{ bearerPat: [] }];
const eventSlugParam = {
	name: "eventSlug",
	in: "path",
	required: true,
	schema: { type: "string" },
	description: "Event slug (your event, or local fixture after db:reset:local)",
};

const unauthorized = {
	description: "Missing or invalid cookie session / Bearer PAT",
	content: {
		"application/json": {
			schema: {
				type: "object",
				required: ["ok", "error"],
				properties: {
					ok: { type: "boolean", const: false },
					error: { type: "string" },
				},
			},
		},
	},
};

const OPENAPI_DOCUMENT = {
	openapi: "3.1.0",
	info: {
		title: "Conference Engine Admin Agent API",
		version: "1.0.0",
		description:
			"Per-event admin JSON routes. Authenticate with an organizer cookie session or `Authorization: Bearer ce_pat_…` minted under Settings → API tokens. Tokens grant full admin on that event only. Demo events remain read-only for writes.",
	},
	servers: [{ url: "/" }],
	components: {
		securitySchemes: {
			bearerPat: {
				type: "http",
				scheme: "bearer",
				bearerFormat: "ce_pat_",
				description:
					"Per-event personal access token. Prefix `ce_pat_`. Returned once at mint time; only the hash is stored.",
			},
		},
		parameters: {
			eventSlug: eventSlugParam,
		},
		schemas: {
			ErrorResponse: {
				type: "object",
				required: ["ok", "error"],
				properties: {
					ok: { type: "boolean", const: false },
					error: { type: "string" },
				},
			},
			OkResponse: {
				type: "object",
				required: ["ok"],
				properties: { ok: { type: "boolean", const: true } },
			},
		},
	},
	paths: {
		"/api/admin/events/{eventSlug}/tokens": {
			get: {
				summary: "List API tokens",
				description: "Metadata only. Never returns plaintext or hash.",
				security: PAT_SECURITY,
				parameters: [eventSlugParam],
				responses: {
					"200": {
						description: "Active tokens",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["ok", "tokens"],
									properties: {
										ok: { type: "boolean", const: true },
										tokens: {
											type: "array",
											items: {
												type: "object",
												required: [
													"id",
													"name",
													"prefix",
													"scopes",
													"createdAt",
													"lastUsedAt",
													"createdByAccountId",
												],
												properties: {
													id: { type: "string" },
													name: { type: "string" },
													prefix: { type: "string" },
													scopes: {
														type: "array",
														items: { type: "string", const: "*" },
													},
													createdAt: { type: "integer" },
													lastUsedAt: { type: ["integer", "null"] },
													createdByAccountId: { type: ["string", "null"] },
												},
											},
										},
									},
								},
							},
						},
					},
					"401": unauthorized,
				},
			},
			post: {
				summary: "Mint API token",
				description: "Returns plaintext token once.",
				security: PAT_SECURITY,
				parameters: [eventSlugParam],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["name"],
								properties: { name: { type: "string" } },
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Created token",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["ok", "token"],
									properties: {
										ok: { type: "boolean", const: true },
										token: {
											type: "object",
											required: ["id", "name", "prefix", "token", "createdAt"],
											properties: {
												id: { type: "string" },
												name: { type: "string" },
												prefix: { type: "string" },
												token: {
													type: "string",
													description: "Plaintext ce_pat_… shown once",
												},
												createdAt: { type: "integer" },
											},
										},
									},
								},
							},
						},
					},
					"401": unauthorized,
					"403": {
						description: "Demo event is read-only",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
			delete: {
				summary: "Revoke API token",
				security: PAT_SECURITY,
				parameters: [eventSlugParam],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["tokenId"],
								properties: { tokenId: { type: "string" } },
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Revoked",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/OkResponse" },
							},
						},
					},
					"401": unauthorized,
					"404": {
						description: "Token not found",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
		},
		"/api/admin/events/{eventSlug}/tokens/{tokenId}": {
			delete: {
				summary: "Revoke API token by id",
				security: PAT_SECURITY,
				parameters: [
					eventSlugParam,
					{
						name: "tokenId",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "Revoked",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/OkResponse" },
							},
						},
					},
					"401": unauthorized,
					"404": {
						description: "Token not found",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
		},
		"/api/admin/events/{eventSlug}/submissions": {
			get: {
				summary: "List admin submissions",
				security: PAT_SECURITY,
				parameters: [
					eventSlugParam,
					{
						name: "queue",
						in: "query",
						schema: { type: "string" },
						description: "Submission queue tab (default pending)",
					},
					{ name: "category", in: "query", schema: { type: "string" } },
					{ name: "status", in: "query", schema: { type: "string" } },
					{ name: "q", in: "query", schema: { type: "string" } },
					{
						name: "sort",
						in: "query",
						schema: {
							type: "string",
							enum: ["newest", "title", "status"],
						},
					},
					{ name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
					{
						name: "pageSize",
						in: "query",
						schema: { type: "integer", minimum: 1, maximum: 100 },
					},
				],
				responses: {
					"200": {
						description: "Paged submission list with facets",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["ok", "event", "submissions", "total", "page"],
									properties: {
										ok: { type: "boolean", const: true },
										event: {
											type: "object",
											required: ["id", "slug", "name"],
											properties: {
												id: { type: "string" },
												slug: { type: "string" },
												name: { type: "string" },
											},
										},
										page: { type: "integer" },
										pageSize: { type: "integer" },
										total: { type: "integer" },
										totalPages: { type: "integer" },
										submissions: {
											type: "array",
											items: {
												type: "object",
												required: ["id", "status"],
												properties: {
													id: { type: "string" },
													status: { type: "string" },
													category: { type: ["string", "null"] },
													title: { type: ["string", "null"] },
													submitterName: { type: ["string", "null"] },
													submitterEmail: { type: ["string", "null"] },
													createdAt: { type: "integer" },
													updatedAt: { type: "integer" },
												},
											},
										},
									},
								},
							},
						},
					},
					"401": unauthorized,
				},
			},
		},
		"/api/admin/events/{eventSlug}/submissions/{submissionId}/decide": {
			post: {
				summary: "Decide a submission",
				description:
					"Existing write path. Body: `{ action: accept|waitlist|reject, email: { send, subject?, text? } }`.",
				security: PAT_SECURITY,
				parameters: [
					eventSlugParam,
					{
						name: "submissionId",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "Decision applied",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/OkResponse" },
							},
						},
					},
					"401": unauthorized,
					"403": {
						description: "Demo event is read-only",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
		},
		"/api/admin/events/{eventSlug}/submissions/{submissionId}/schedule": {
			post: {
				summary: "Place submission on schedule",
				description: "Existing schedule placement write path.",
				security: PAT_SECURITY,
				parameters: [
					eventSlugParam,
					{
						name: "submissionId",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "Scheduled",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/OkResponse" },
							},
						},
					},
					"401": unauthorized,
					"403": {
						description: "Demo event is read-only",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
		},
		"/api/admin/events/{eventSlug}/speakers": {
			get: {
				summary: "List speakers",
				security: PAT_SECURITY,
				parameters: [
					eventSlugParam,
					{ name: "status", in: "query", schema: { type: "string" } },
					{ name: "q", in: "query", schema: { type: "string" } },
				],
				responses: {
					"200": {
						description: "Speaker roster",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["ok", "speakers"],
									properties: {
										ok: { type: "boolean", const: true },
										speakers: { type: "array", items: { type: "object" } },
									},
								},
							},
						},
					},
					"401": unauthorized,
				},
			},
			post: {
				summary: "Create or import speakers",
				description:
					"JSON speaker upsert or CSV import (`text/csv` / `{ csv }`).",
				security: PAT_SECURITY,
				parameters: [eventSlugParam],
				responses: {
					"200": {
						description: "Created / imported",
						content: {
							"application/json": {
								schema: { type: "object" },
							},
						},
					},
					"401": unauthorized,
					"403": {
						description: "Demo event is read-only",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ErrorResponse" },
							},
						},
					},
				},
			},
		},
		"/api/admin/events/{eventSlug}/members": {
			get: {
				summary: "List event organizers",
				security: PAT_SECURITY,
				parameters: [eventSlugParam],
				responses: {
					"200": {
						description: "Members",
						content: {
							"application/json": {
								schema: {
									type: "object",
									required: ["ok", "members"],
									properties: {
										ok: { type: "boolean", const: true },
										members: { type: "array", items: { type: "object" } },
									},
								},
							},
						},
					},
					"401": unauthorized,
				},
			},
		},
	},
};

export async function GET() {
	return NextResponse.json(OPENAPI_DOCUMENT, {
		headers: {
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
