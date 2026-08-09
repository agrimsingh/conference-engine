import { describe, expect, it } from "vitest";
import {
	itineraryStorageKey,
	parseItinerarySelection,
	setSessionSelected,
} from "@/lib/schedule/itinerary";

describe("public itinerary selection", () => {
	it("keeps selections event-scoped, filters stale sessions, and removes duplicates", () => {
		const raw = JSON.stringify({
			version: 1,
			eventSlug: "event-a",
			sessionIds: ["session-1", "session-1", "session-2", "missing"],
		});

		expect(itineraryStorageKey("event-a")).not.toBe(itineraryStorageKey("event-b"));
		expect(parseItinerarySelection(raw, "event-a", ["session-1", "session-2"])).toEqual([
			"session-1",
			"session-2",
		]);
		expect(parseItinerarySelection(raw, "event-b", ["session-1", "session-2"])).toEqual([]);
		expect(parseItinerarySelection("not-json", "event-a", ["session-1"])).toEqual([]);
	});

	it("adds once and removes cleanly", () => {
		expect(setSessionSelected(["session-1"], "session-1", true)).toEqual(["session-1"]);
		expect(setSessionSelected(["session-1"], "session-2", true)).toEqual([
			"session-1",
			"session-2",
		]);
		expect(setSessionSelected(["session-1", "session-2"], "session-1", false)).toEqual([
			"session-2",
		]);
	});
});
