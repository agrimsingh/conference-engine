/** Accept only an absolute origin; paths, credentials, and non-HTTP schemes are configuration errors. */
export function validatedAppOrigin(value: string | undefined | null): string | null {
	if (!value?.trim()) return null;
	try {
		const url = new URL(value.trim());
		if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
		return url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
	} catch {
		return null;
	}
}
