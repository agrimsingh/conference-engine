import { isValidIanaTimeZone } from "@/lib/events/settings";

const FALLBACK_TIMEZONES = [
	"UTC",
	"America/Los_Angeles",
	"America/Denver",
	"America/Chicago",
	"America/New_York",
	"America/Sao_Paulo",
	"Europe/London",
	"Europe/Paris",
	"Europe/Berlin",
	"Europe/Madrid",
	"Africa/Johannesburg",
	"Asia/Dubai",
	"Asia/Kolkata",
	"Asia/Singapore",
	"Asia/Shanghai",
	"Asia/Tokyo",
	"Australia/Sydney",
	"Pacific/Auckland",
] as const;

export function listIanaTimeZones(): string[] {
	try {
		if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
			const zones = Intl.supportedValuesOf("timeZone");
			if (zones.length > 0) {
				// Some runtimes omit bare "UTC"; keep it first for organizers.
				return zones.includes("UTC") ? zones : ["UTC", ...zones];
			}
		}
	} catch {
		// fall through
	}
	return [...FALLBACK_TIMEZONES];
}

export function detectBrowserTimeZone(fallback = "America/Los_Angeles"): string {
	try {
		const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (zone && isValidIanaTimeZone(zone)) return zone;
	} catch {
		// fall through
	}
	return fallback;
}

/** Ensure a stored/custom value still appears in the select options. */
export function timeZoneOptions(current?: string | null): string[] {
	const zones = listIanaTimeZones();
	const trimmed = current?.trim();
	if (trimmed && isValidIanaTimeZone(trimmed) && !zones.includes(trimmed)) {
		return [trimmed, ...zones];
	}
	return zones;
}
