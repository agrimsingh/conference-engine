import { describe, expect, it } from "vitest";
import {
	decryptAcceleventsApiKey,
	encryptAcceleventsApiKey,
} from "./crypto";

describe("Accelevents credential encryption", () => {
	it("round-trips the API key without retaining plaintext in the ciphertext", async () => {
		const encrypted = await encryptAcceleventsApiKey(
			"accelevents-api-key-value",
			"event-secret",
		);

		expect(encrypted.ciphertext).not.toContain("accelevents-api-key-value");
		expect(
			await decryptAcceleventsApiKey(encrypted, "event-secret"),
		).toBe("accelevents-api-key-value");
	});

	it("rejects a key encrypted with a different event secret", async () => {
		const encrypted = await encryptAcceleventsApiKey("key", "event-secret");
		await expect(
			decryptAcceleventsApiKey(encrypted, "other-secret"),
		).rejects.toThrow("Unable to decrypt Accelevents API key");
	});
});
