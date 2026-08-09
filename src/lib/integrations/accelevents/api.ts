import { fetchWithBoundedRetry } from "@/lib/security/fetch";
import type {
	AcceleventsSessionPayload,
	AcceleventsSpeakerPayload,
} from "./sync";

const API_ORIGIN = "https://api.accelevents.com";

export class AcceleventsApiError extends Error {
	readonly name = "AcceleventsApiError";

	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

export type AcceleventsApi = {
	createSpeaker(payload: AcceleventsSpeakerPayload): Promise<string>;
	updateSpeaker(externalId: string, payload: AcceleventsSpeakerPayload): Promise<void>;
	createSession(payload: AcceleventsSessionPayload): Promise<string>;
	updateSession(externalId: string, payload: AcceleventsSessionPayload): Promise<void>;
	findSpeakerByEmail(externalEventId: number, email: string): Promise<string | null>;
};

function endpoint(eventUrl: string, suffix: string): string {
	return `${API_ORIGIN}/rest/host/event/${encodeURIComponent(eventUrl)}${suffix}`;
}

async function responseBody(response: Response): Promise<unknown> {
	const raw = await response.text();
	if (!raw.trim()) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed;
	} catch {
		return raw.slice(0, 500);
	}
}

function externalId(value: unknown): string | null {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (typeof value === "string" && value.trim()) return value.trim();
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	for (const key of ["id", "speakerId", "sessionId"]) {
		const candidate = Reflect.get(value, key);
		if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
		if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
	}
	return externalId(Reflect.get(value, "data"));
}

function errorText(body: unknown, status: number): string {
	if (typeof body === "string" && body.trim()) return `Accelevents request failed (${status}): ${body.slice(0, 500)}`;
	if (body && typeof body === "object" && !Array.isArray(body)) {
		const message = Reflect.get(body, "message");
		if (typeof message === "string" && message.trim()) return `Accelevents request failed (${status}): ${message.slice(0, 500)}`;
	}
	return `Accelevents request failed (${status})`;
}

function normalizedEmail(value: string): string {
	return value.trim().toLowerCase();
}

function speakerIdByEmail(value: unknown, email: string): string | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const data = Reflect.get(value, "data");
	if (!Array.isArray(data)) return null;
	const target = normalizedEmail(email);
	for (const speaker of data) {
		if (!speaker || typeof speaker !== "object" || Array.isArray(speaker)) continue;
		const candidateEmail = Reflect.get(speaker, "email");
		if (typeof candidateEmail !== "string" || normalizedEmail(candidateEmail) !== target) continue;
		const candidateId = Reflect.get(speaker, "speakerId");
		if (typeof candidateId === "number" && Number.isFinite(candidateId)) return String(candidateId);
		if (typeof candidateId === "string" && candidateId.trim()) return candidateId.trim();
	}
	return null;
}

export function createAcceleventsApi(config: {
	readonly eventUrl: string;
	readonly apiKey: string;
}): AcceleventsApi {
	const headers = {
		accept: "application/json",
		"content-type": "application/json",
		Key: config.apiKey,
		Authorization: config.apiKey,
	};

	async function request(
		path: string,
		method: "POST" | "PUT" | "GET",
		payload?: AcceleventsSpeakerPayload | AcceleventsSessionPayload,
	): Promise<unknown> {
		const response = await fetchWithBoundedRetry(endpoint(config.eventUrl, path), {
			method,
			headers,
			body: payload ? JSON.stringify(payload) : undefined,
		// Accelevents does not document an idempotency key for create endpoints. A
		// response can be lost after the provider accepts a POST, so retry only
		// read-only reconciliation requests. The sync layer records an in-flight
		// create before the single POST and will reconcile it on a later run.
		}, { attempts: method === "GET" ? 3 : 1, timeoutMs: 10_000 });
		const body = await responseBody(response);
		if (!response.ok) throw new AcceleventsApiError(response.status, errorText(body, response.status));
		return body;
	}

	return {
		async createSpeaker(payload) {
			const id = externalId(await request("/speaker", "POST", payload));
			if (!id) throw new AcceleventsApiError(502, "Accelevents did not return a speaker ID");
			return id;
		},
		async updateSpeaker(externalId, payload) {
			await request(`/speaker/${encodeURIComponent(externalId)}`, "PUT", payload);
		},
		async createSession(payload) {
			const id = externalId(await request("/session", "POST", payload));
			if (!id) throw new AcceleventsApiError(502, "Accelevents did not return a session ID");
			return id;
		},
		async updateSession(externalId, payload) {
			await request(`/session/${encodeURIComponent(externalId)}`, "PUT", payload);
		},
		async findSpeakerByEmail(externalEventId, email) {
			const query = new URLSearchParams({
				eventId: String(externalEventId),
				searchString: normalizedEmail(email),
				page: "0",
				size: "5",
			});
			return speakerIdByEmail(await request(`/speaker?${query.toString()}`, "GET"), email);
		},
	};
}
