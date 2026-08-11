const SAFE_NEXT_BASE = "https://ce.invalid";

/** Relative in-app path only. Rejects scheme-relative, backslash, and off-origin WHATWG resolutions. */
export function safeNextPath(raw: string | null | undefined, fallback = "/admin"): string {
	if (!raw || raw.includes("\\") || raw.includes("\0")) return fallback;
	if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
	try {
		const resolved = new URL(raw, SAFE_NEXT_BASE);
		if (resolved.origin !== SAFE_NEXT_BASE) return fallback;
		return `${resolved.pathname}${resolved.search}${resolved.hash}`;
	} catch {
		return fallback;
	}
}
