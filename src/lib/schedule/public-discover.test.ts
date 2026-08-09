import { describe, expect, it } from "vitest";
import {
	discoverFacetValues,
	filterPublicDiscoverSessions,
	sessionMatchesQuery,
	truncatePreview,
	type PublicDiscoverSession,
} from "./public-discover";

const sessions: PublicDiscoverSession[] = [
	{
		id: "1",
		title: "Rust async runtimes",
		abstract: "A deep dive into Tokio.",
		trackId: "t1",
		trackName: "Systems",
		format: "Stage",
		location: "Hall A",
		speakerNames: ["Graydon Hoare"],
		startsAtMs: 1,
		dayKey: "2026-01-01",
	},
	{
		id: "2",
		title: "CSS grid layouts",
		abstract: "Workshop abstract ".repeat(20),
		trackId: "t2",
		trackName: "Web",
		format: "Workshop",
		location: "Room B",
		speakerNames: ["Jen Simmons", "Rachel Andrew"],
		startsAtMs: 2,
		dayKey: "2026-01-01",
	},
	{
		id: "3",
		title: "Lightning: Deno tips",
		abstract: "Short",
		trackId: null,
		trackName: "Unassigned",
		format: "Lightning",
		location: "Hall A",
		speakerNames: ["Ryan Dahl"],
		startsAtMs: 3,
		dayKey: "2026-01-02",
	},
];

describe("public discover filters", () => {
	it("matches title and speaker name case-insensitively", () => {
		expect(sessionMatchesQuery(sessions[0]!, "async")).toBe(true);
		expect(sessionMatchesQuery(sessions[0]!, "GRAYDON")).toBe(true);
		expect(sessionMatchesQuery(sessions[0]!, "jen")).toBe(false);
		expect(sessionMatchesQuery(sessions[0]!, "  ")).toBe(true);
	});

	it("applies track / format / location facets together with search", () => {
		expect(
			filterPublicDiscoverSessions(sessions, {
				q: "a",
				track: "Web",
				format: "Workshop",
				location: "Room B",
			}).map((s) => s.id),
		).toEqual(["2"]);

		expect(
			filterPublicDiscoverSessions(sessions, { location: "Hall A", format: "Lightning" }).map(
				(s) => s.id,
			),
		).toEqual(["3"]);

		expect(filterPublicDiscoverSessions(sessions, { track: "all", format: "all" })).toHaveLength(
			3,
		);
	});

	it("lists facet values only when present", () => {
		expect(discoverFacetValues(sessions, "format")).toEqual(["Lightning", "Stage", "Workshop"]);
		expect(discoverFacetValues(sessions, "location")).toEqual(["Hall A", "Room B"]);
		expect(discoverFacetValues([], "trackName")).toEqual([]);
	});

	it("truncates long previews on a word boundary", () => {
		const long = "word ".repeat(50).trim();
		const { preview, truncated } = truncatePreview(long, 40);
		expect(truncated).toBe(true);
		expect(preview.endsWith("…")).toBe(true);
		expect(preview.length).toBeLessThanOrEqual(42);
		expect(truncatePreview("short", 40)).toEqual({ preview: "short", truncated: false });
	});
});
