import { NextResponse } from "next/server";

const API_SECURITY = [{ bearerAuth: [] }, { apiKeyAuth: [] }];

const eventRef = { $ref: "#/components/schemas/Event" };
const unauthorizedRef = { $ref: "#/components/responses/Unauthorized" };
const eventNotFoundRef = { $ref: "#/components/responses/EventNotFound" };
const eventSlugParam = { $ref: "#/components/parameters/eventSlug" };

const OPENAPI_DOCUMENT = {
	openapi: "3.1.0",
	info: {
		title: "Conference Engine API",
		version: "1.0.0",
		description:
			"Read-only operator API. File resources are metadata only; no object storage keys or file contents are exposed.",
	},
	paths: {
		"/api/v1/events/{eventSlug}/submissions": {
			get: {
				summary: "List event submissions",
				security: API_SECURITY,
				parameters: [eventSlugParam],
				responses: {
					"200": {
						description: "Submission list",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/SubmissionsResponse" },
								example: {
									ok: true,
									event: {
										id: "evt_demo",
										slug: "demo-cfp-to-stage",
										name: "Demo: CFP to stage",
									},
									submissions: [
										{
											id: "sub_01",
											status: "confirmed",
											title: "Shipping agents without the ceremony",
											submitterName: "Ada Lovelace",
											submitterEmail: "ada@example.com",
											submittedAt: 1717200000000,
											updatedAt: 1717286400000,
											labels: ["stage"],
											speakers: [
												{
													name: "Ada Lovelace",
													email: "ada@example.com",
													position: 0,
													status: "confirmed",
													addedAfterAcceptance: false,
												},
											],
										},
									],
								},
							},
						},
					},
					"401": unauthorizedRef,
					"404": eventNotFoundRef,
				},
			},
		},
		"/api/v1/events/{eventSlug}/schedule": {
			get: {
				summary: "List published schedule slots",
				security: API_SECURITY,
				parameters: [eventSlugParam],
				responses: {
					"200": {
						description: "Schedule",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/ScheduleResponse" },
								example: {
									ok: true,
									event: {
										id: "evt_demo",
										slug: "demo-cfp-to-stage",
										name: "Demo: CFP to stage",
										timezone: "America/Los_Angeles",
									},
									rooms: [{ id: "room_main", name: "Main Hall", position: 0 }],
									slots: [
										{
											id: "slot_01",
											submissionId: "sub_01",
											title: "Shipping agents without the ceremony",
											status: "confirmed",
											roomName: "Main Hall",
											trackId: "track_core",
											trackName: "Core",
											trackRetired: false,
											detailUrl: "/e/demo-cfp-to-stage/sessions/sub_01",
											media: {
												videoUrl: null,
												googleDocUrl: null,
												supportingUrl: "https://example.com/slides",
											},
											startsAt: 1720000800000,
											endsAt: 1720004400000,
											speakers: [
												{ name: "Ada Lovelace", email: "ada@example.com" },
											],
										},
									],
								},
							},
						},
					},
					"401": unauthorizedRef,
					"404": eventNotFoundRef,
				},
			},
		},
		"/api/v1/events/{eventSlug}/speakers": {
			get: {
				summary: "List the event speaker roster with task and resource metadata",
				security: API_SECURITY,
				parameters: [eventSlugParam],
				responses: {
					"200": {
						description: "Speaker roster",
						content: {
							"application/json": {
								schema: { $ref: "#/components/schemas/SpeakersResponse" },
								example: {
									ok: true,
									event: {
										id: "evt_demo",
										slug: "demo-cfp-to-stage",
										name: "Demo: CFP to stage",
										timezone: "America/Los_Angeles",
									},
									speakers: [
										{
											personId: "person_01",
											name: "Ada Lovelace",
											email: "ada@example.com",
											workflowStatus: "confirmed",
											profile: {
												bio: "Mathematician.",
												jobTitle: "Analyst",
												company: "Analytical Engine Co",
												socials: { twitter: "ada" },
												headshot: {
													assetId: "asset_hs_01",
													filename: "ada.jpg",
													uploadedAt: 1717200000000,
												},
											},
											submissionIds: ["sub_01"],
											submissionStatuses: ["confirmed"],
											tasks: [
												{
													id: "task_01",
													key: "headshot",
													label: "Upload headshot",
													status: "completed",
													dueAt: 1717286400000,
													submissionId: "sub_01",
													resource: {
														id: "asset_hs_01",
														filename: "ada.jpg",
														contentType: "image/jpeg",
														uploadedAt: 1717200000000,
													},
												},
											],
										},
									],
								},
							},
						},
					},
					"401": unauthorizedRef,
					"404": eventNotFoundRef,
				},
			},
		},
	},
	components: {
		securitySchemes: {
			bearerAuth: { type: "http", scheme: "bearer" },
			apiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
		},
		parameters: {
			eventSlug: {
				name: "eventSlug",
				in: "path",
				required: true,
				schema: { type: "string" },
			},
		},
		responses: {
			Unauthorized: { description: "Missing or invalid API key" },
			EventNotFound: {
				description: "The event slug does not exist",
				content: {
					"application/json": {
						schema: { $ref: "#/components/schemas/ErrorResponse" },
						example: { ok: false, error: "Event not found" },
					},
				},
			},
		},
		schemas: {
			Event: {
				type: "object",
				required: ["id", "slug", "name"],
				properties: {
					id: { type: "string" },
					slug: { type: "string" },
					name: { type: "string" },
					timezone: { type: "string" },
				},
			},
			ErrorResponse: {
				type: "object",
				required: ["ok", "error"],
				properties: {
					ok: { type: "boolean", const: false },
					error: { type: "string" },
				},
			},
			SubmissionSpeaker: {
				type: "object",
				required: ["name", "email", "position", "status", "addedAfterAcceptance"],
				properties: {
					name: { type: "string" },
					email: { type: "string" },
					position: { type: "integer" },
					status: { type: "string" },
					addedAfterAcceptance: { type: "boolean" },
				},
			},
			Submission: {
				type: "object",
				required: [
					"id",
					"status",
					"title",
					"submitterName",
					"submitterEmail",
					"submittedAt",
					"updatedAt",
					"labels",
					"speakers",
				],
				properties: {
					id: { type: "string" },
					status: { type: "string" },
					title: { type: "string" },
					submitterName: { type: "string" },
					submitterEmail: { type: "string" },
					submittedAt: { type: "integer" },
					updatedAt: { type: "integer" },
					labels: { type: "array", items: { type: "string" } },
					speakers: {
						type: "array",
						items: { $ref: "#/components/schemas/SubmissionSpeaker" },
					},
				},
			},
			SubmissionsResponse: {
				type: "object",
				required: ["ok", "event", "submissions"],
				properties: {
					ok: { type: "boolean", const: true },
					event: eventRef,
					submissions: {
						type: "array",
						items: { $ref: "#/components/schemas/Submission" },
					},
				},
			},
			ScheduleSpeaker: {
				type: "object",
				required: ["name", "email"],
				properties: {
					name: { type: "string" },
					email: { type: "string" },
				},
			},
			ScheduleMedia: {
				type: "object",
				required: ["videoUrl", "googleDocUrl", "supportingUrl"],
				properties: {
					videoUrl: { type: ["string", "null"] },
					googleDocUrl: { type: ["string", "null"] },
					supportingUrl: { type: ["string", "null"] },
				},
			},
			ScheduleSlot: {
				type: "object",
				required: [
					"id",
					"submissionId",
					"title",
					"status",
					"roomName",
					"trackId",
					"trackName",
					"trackRetired",
					"detailUrl",
					"media",
					"startsAt",
					"endsAt",
					"speakers",
				],
				properties: {
					id: { type: "string" },
					submissionId: { type: "string" },
					title: { type: "string" },
					status: { type: "string" },
					roomName: { type: "string" },
					trackId: { type: ["string", "null"] },
					trackName: { type: "string" },
					trackRetired: { type: "boolean" },
					detailUrl: { type: "string" },
					media: { $ref: "#/components/schemas/ScheduleMedia" },
					startsAt: { type: "integer" },
					endsAt: { type: "integer" },
					speakers: {
						type: "array",
						items: { $ref: "#/components/schemas/ScheduleSpeaker" },
					},
				},
			},
			ScheduleRoom: {
				type: "object",
				required: ["id", "name", "position"],
				properties: {
					id: { type: "string" },
					name: { type: "string" },
					position: { type: "integer" },
				},
			},
			ScheduleResponse: {
				type: "object",
				required: ["ok", "event", "rooms", "slots"],
				properties: {
					ok: { type: "boolean", const: true },
					event: eventRef,
					rooms: {
						type: "array",
						items: { $ref: "#/components/schemas/ScheduleRoom" },
					},
					slots: {
						type: "array",
						items: { $ref: "#/components/schemas/ScheduleSlot" },
					},
				},
			},
			SpeakerResource: {
				type: "object",
				required: ["id", "filename", "contentType", "uploadedAt"],
				properties: {
					id: { type: "string" },
					filename: { type: ["string", "null"] },
					contentType: { type: ["string", "null"] },
					uploadedAt: { type: ["integer", "null"] },
				},
			},
			SpeakerTask: {
				type: "object",
				required: ["id", "key", "label", "status", "dueAt", "submissionId", "resource"],
				properties: {
					id: { type: "string" },
					key: { type: "string" },
					label: { type: "string" },
					status: { type: "string" },
					dueAt: { type: ["integer", "null"] },
					submissionId: { type: "string" },
					resource: {
						oneOf: [
							{ $ref: "#/components/schemas/SpeakerResource" },
							{ type: "null" },
						],
					},
				},
			},
			SpeakerHeadshot: {
				type: "object",
				required: ["assetId", "filename", "uploadedAt"],
				properties: {
					assetId: { type: "string" },
					filename: { type: ["string", "null"] },
					uploadedAt: { type: "integer" },
				},
			},
			SpeakerProfile: {
				type: "object",
				required: ["bio", "jobTitle", "company", "socials", "headshot"],
				properties: {
					bio: { type: ["string", "null"] },
					jobTitle: { type: ["string", "null"] },
					company: { type: ["string", "null"] },
					socials: {
						type: "object",
						additionalProperties: { type: "string" },
					},
					headshot: {
						oneOf: [
							{ $ref: "#/components/schemas/SpeakerHeadshot" },
							{ type: "null" },
						],
					},
				},
			},
			Speaker: {
				type: "object",
				required: [
					"personId",
					"name",
					"email",
					"workflowStatus",
					"profile",
					"submissionIds",
					"submissionStatuses",
					"tasks",
				],
				properties: {
					personId: { type: "string" },
					name: { type: "string" },
					email: { type: "string" },
					workflowStatus: { type: "string" },
					profile: { $ref: "#/components/schemas/SpeakerProfile" },
					submissionIds: { type: "array", items: { type: "string" } },
					submissionStatuses: { type: "array", items: { type: "string" } },
					tasks: {
						type: "array",
						items: { $ref: "#/components/schemas/SpeakerTask" },
					},
				},
			},
			SpeakersResponse: {
				type: "object",
				required: ["ok", "event", "speakers"],
				properties: {
					ok: { type: "boolean", const: true },
					event: eventRef,
					speakers: {
						type: "array",
						items: { $ref: "#/components/schemas/Speaker" },
					},
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
