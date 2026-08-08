import { MAX_CFP_REQUEST_BYTES } from "./submit";

export type BoundedJsonResult =
	| { ok: true; value: unknown }
	| { ok: false; status: 400 | 413; error: "Invalid JSON" | "Request payload is too large" };

/** Bound bytes before JSON parsing so unknown top-level keys cannot bypass CFP limits. */
export async function readBoundedJson(request: Request, maxBytes: number): Promise<BoundedJsonResult> {
	const contentLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		return { ok: false, status: 413, error: "Request payload is too large" };
	}
	try {
		if (!request.body) return { ok: true, value: JSON.parse("") };
		const reader = request.body.getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				total += value.byteLength;
				if (total > maxBytes) {
					await reader.cancel();
					return { ok: false, status: 413, error: "Request payload is too large" };
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
		const raw = new TextDecoder().decode(concatChunks(chunks, total));
		return { ok: true, value: JSON.parse(raw) };
	} catch {
		return { ok: false, status: 400, error: "Invalid JSON" };
	}
}

export function readBoundedCfpJson(request: Request): Promise<BoundedJsonResult> {
	return readBoundedJson(request, MAX_CFP_REQUEST_BYTES);
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}
