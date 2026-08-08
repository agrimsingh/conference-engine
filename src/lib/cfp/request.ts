import { MAX_CFP_REQUEST_BYTES } from "./submit";

export type BoundedJsonResult =
	| { ok: true; value: unknown }
	| { ok: false; status: 400 | 413; error: "Invalid JSON" | "Request payload is too large" };

/** Bound bytes before JSON parsing so unknown top-level keys cannot bypass CFP limits. */
export async function readBoundedCfpJson(request: Request): Promise<BoundedJsonResult> {
	const contentLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_CFP_REQUEST_BYTES) {
		return { ok: false, status: 413, error: "Request payload is too large" };
	}
	try {
		const raw = await request.text();
		if (new TextEncoder().encode(raw).byteLength > MAX_CFP_REQUEST_BYTES) {
			return { ok: false, status: 413, error: "Request payload is too large" };
		}
		return { ok: true, value: JSON.parse(raw) };
	} catch {
		return { ok: false, status: 400, error: "Invalid JSON" };
	}
}
