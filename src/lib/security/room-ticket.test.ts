import { describe, expect, it } from "vitest";
import { constantTimeEqual, hmacSha256, normalizeEmail, toBase64Url } from "./crypto";
import { mintRoomTicket, verifyRoomTicket } from "./room-ticket";

describe("room tickets", () => {
	it("binds a ticket to its event and rejects tampering", async () => {
		const minted = await mintRoomTicket("test-secret", {
			eventId: "evt_1",
			eventSlug: "event-one",
			accountId: "acct_1",
			now: 1_000,
		});
		await expect(verifyRoomTicket("test-secret", minted.token, {
			eventId: "evt_1", eventSlug: "event-one", now: 1_001,
		})).resolves.toMatchObject({ accountId: "acct_1", nonce: minted.ticket.nonce });
		await expect(verifyRoomTicket("test-secret", minted.token, {
			eventId: "evt_2", eventSlug: "event-one", now: 1_001,
		})).resolves.toBeNull();
		await expect(verifyRoomTicket("test-secret", `${minted.token}x`, {
			eventId: "evt_1", eventSlug: "event-one", now: 1_001,
		})).resolves.toBeNull();
	});

	it("normalizes principal values and compares complete signatures", () => {
		expect(normalizeEmail("  A@Example.COM ")).toBe("a@example.com");
		expect(constantTimeEqual("abcdef", "abcdef")).toBe(true);
		expect(constantTimeEqual("abcdef", "abcdeg")).toBe(false);
		expect(constantTimeEqual("abcdef", "abc")).toBe(false);
	});

	it("rejects empty claims, expiry, and a signed ticket beyond the 60 second boundary", async () => {
		const now = 10_000;
		const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({
			v: 1, aud: "event-room", eventId: "evt_1", eventSlug: "event-one", accountId: "acct_1", exp: now + 60_001, nonce: "nonce",
		})));
		const future = `${payload}.${await hmacSha256("test-secret", payload)}`;
		await expect(verifyRoomTicket("test-secret", future, { eventId: "evt_1", eventSlug: "event-one", now })).resolves.toBeNull();
		const empty = toBase64Url(new TextEncoder().encode(JSON.stringify({
			v: 1, aud: "event-room", eventId: "", eventSlug: "event-one", accountId: "", exp: now + 1, nonce: "",
		})));
		await expect(verifyRoomTicket("test-secret", `${empty}.${await hmacSha256("test-secret", empty)}`, { eventId: "", eventSlug: "event-one", now })).resolves.toBeNull();
	});
});
