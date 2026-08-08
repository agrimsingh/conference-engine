import { constantTimeEqual, fromBase64Url, hmacSha256, randomToken, toBase64Url } from "./crypto";

export type RoomTicket = {
	v: 1;
	aud: "event-room";
	eventId: string;
	eventSlug: string;
	accountId: string;
	exp: number;
	nonce: string;
};

export async function mintRoomTicket(secret: string, input: Omit<RoomTicket, "v" | "aud" | "exp" | "nonce"> & { now?: number }): Promise<{ token: string; ticket: RoomTicket }> {
	const ticket: RoomTicket = {
		v: 1,
		aud: "event-room",
		eventId: input.eventId,
		eventSlug: input.eventSlug,
		accountId: input.accountId,
		exp: (input.now ?? Date.now()) + 60_000,
		nonce: randomToken(18),
	};
	const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(ticket)));
	return { token: `${payload}.${await hmacSha256(secret, payload)}`, ticket };
}

export async function verifyRoomTicket(secret: string, token: string, expected: { eventId: string; eventSlug: string; now?: number }): Promise<RoomTicket | null> {
	const [payload, signature, extra] = token.split(".");
	if (!payload || !signature || extra) return null;
	const expectedSignature = await hmacSha256(secret, payload);
	if (!constantTimeEqual(signature, expectedSignature)) return null;
	const bytes = fromBase64Url(payload);
	if (!bytes) return null;
	let parsed: unknown;
	try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
	if (!isRoomTicket(parsed)) return null;
	const now = expected.now ?? Date.now();
	if (parsed.eventId !== expected.eventId || parsed.eventSlug !== expected.eventSlug
		|| !parsed.eventId || !parsed.eventSlug || !parsed.accountId || !parsed.nonce
		|| parsed.exp < now || parsed.exp > now + 60_000) return null;
	return parsed;
}

function isRoomTicket(value: unknown): value is RoomTicket {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return candidate.v === 1 && candidate.aud === "event-room"
		&& typeof candidate.eventId === "string" && typeof candidate.eventSlug === "string"
		&& typeof candidate.accountId === "string" && typeof candidate.exp === "number"
		&& typeof candidate.nonce === "string";
}
