const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchWithBoundedRetry(input: RequestInfo | URL, init: RequestInit, options: { attempts?: number; timeoutMs?: number } = {}): Promise<Response> {
	const attempts = options.attempts ?? 3;
	const timeoutMs = options.timeoutMs ?? 10_000;
	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(input, { ...init, signal: controller.signal });
			if (!TRANSIENT.has(response.status) || attempt === attempts - 1) return response;
			await response.body?.cancel();
		} catch (error) {
			lastError = error;
			if (attempt === attempts - 1) throw error;
		} finally { clearTimeout(timer); }
		await new Promise<void>((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
	}
	throw lastError instanceof Error ? lastError : new Error("External request failed");
}
