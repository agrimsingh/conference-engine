export class MultipartBodyTooLargeError extends Error {
	constructor() {
		super("Multipart body too large");
	}
}

/**
 * Parse multipart data through a capped stream. Constructing a new Request
 * from the original request loses the multipart boundary in workerd, so carry
 * that header explicitly into the parsing request.
 */
export async function readBoundedMultipartFormData(request: Request, maxBytes: number): Promise<FormData> {
	const declaredLength = Number(request.headers.get("content-length"));
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new MultipartBodyTooLargeError();
	}
	const contentType = request.headers.get("content-type");
	if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
		throw new TypeError("Expected multipart form");
	}
	if (!request.body) throw new TypeError("Missing multipart body");

	const reader = request.body.getReader();
	let total = 0;
	let released = false;
	const release = () => {
		if (!released) {
			released = true;
			reader.releaseLock();
		}
	};
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const { done, value } = await reader.read();
			if (done) {
				release();
				controller.close();
				return;
			}
			total += value.byteLength;
			if (total > maxBytes) {
				try { await reader.cancel(); } finally { release(); }
				controller.error(new MultipartBodyTooLargeError());
				return;
			}
			controller.enqueue(value);
		},
		async cancel() {
			try { await reader.cancel(); } finally { release(); }
		},
	});
	const parsingRequestInit: RequestInit & { duplex: "half" } = {
		method: request.method,
		headers: { "content-type": contentType },
		body,
		duplex: "half",
	};
	const parsingRequest = new Request(request.url, parsingRequestInit);
	return parsingRequest.formData();
}
