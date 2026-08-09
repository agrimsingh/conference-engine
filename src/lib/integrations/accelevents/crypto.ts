import { fromBase64Url, toBase64Url } from "@/lib/security/crypto";

const encoder = new TextEncoder();

export type EncryptedAcceleventsApiKey = {
	readonly ciphertext: string;
	readonly iv: string;
};

export class AcceleventsSecretError extends Error {
	readonly name = "AcceleventsSecretError";
}

async function encryptionKey(secret: string): Promise<CryptoKey> {
	if (!secret) throw new AcceleventsSecretError("AUTH_SECRET is required for Accelevents credentials");
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
	return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptAcceleventsApiKey(
	apiKey: string,
	secret: string,
): Promise<EncryptedAcceleventsApiKey> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		await encryptionKey(secret),
		encoder.encode(apiKey),
	);
	return { ciphertext: toBase64Url(new Uint8Array(ciphertext)), iv: toBase64Url(iv) };
}

export async function decryptAcceleventsApiKey(
	encrypted: EncryptedAcceleventsApiKey,
	secret: string,
): Promise<string> {
	const iv = fromBase64Url(encrypted.iv);
	const ciphertext = fromBase64Url(encrypted.ciphertext);
	if (!iv || !ciphertext) throw new AcceleventsSecretError("Stored Accelevents credential is invalid");
	const decryptableCiphertext = new Uint8Array(ciphertext.byteLength);
	decryptableCiphertext.set(ciphertext);
	try {
		const plaintext = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: new Uint8Array(iv) },
			await encryptionKey(secret),
			decryptableCiphertext,
		);
		return new TextDecoder().decode(plaintext);
	} catch (error) {
		if (error instanceof AcceleventsSecretError) throw error;
		throw new AcceleventsSecretError("Unable to decrypt Accelevents API key");
	}
}
