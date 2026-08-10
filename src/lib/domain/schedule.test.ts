import { describe, expect, it } from "vitest";
import {
	detectConflicts,
	formatScheduleConflicts,
	formatTrackConflict,
	isPublicScheduleStatus,
	PUBLIC_SCHEDULE_STATUSES,
	resolveRoom,
} from "./schedule";

describe("isPublicScheduleStatus", () => {
	it("accepts only published", () => {
		expect(PUBLIC_SCHEDULE_STATUSES).toEqual(["published"]);
		expect(isPublicScheduleStatus("published")).toBe(true);
	});

	it("rejects scheduled and other statuses", () => {
		expect(isPublicScheduleStatus("scheduled")).toBe(false);
		expect(isPublicScheduleStatus("accepted")).toBe(false);
		expect(isPublicScheduleStatus("draft")).toBe(false);
	});

	it("rejects empty and whitespace", () => {
		expect(isPublicScheduleStatus("")).toBe(false);
		expect(isPublicScheduleStatus(" published ")).toBe(false);
	});
});

describe("resolveRoom", () => {
	const rooms = [
		{ id: "r1", name: "Main Stage" },
		{ id: "r2", name: " Room B " },
	];

	it("rejects blank room names", () => {
		expect(resolveRoom(rooms, "")).toEqual({
			ok: false,
			error: "roomName required",
		});
		expect(resolveRoom(rooms, "   ")).toEqual({
			ok: false,
			error: "roomName required",
		});
	});

	it("allows free-form names when no rooms are configured", () => {
		expect(resolveRoom([], "Any Hall")).toEqual({ ok: true, room: null });
	});

	it("matches trimmed room names", () => {
		expect(resolveRoom(rooms, "Main Stage")).toEqual({
			ok: true,
			room: rooms[0],
		});
		expect(resolveRoom(rooms, "Room B")).toEqual({
			ok: true,
			room: rooms[1],
		});
	});

	it("fails closed on unknown room when catalog is non-empty", () => {
		const result = resolveRoom(rooms, "Basement");
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('Unknown room "Basement"');
			expect(result.error).toContain("Main Stage");
		}
	});
});

describe("detectConflicts", () => {
	it("uses configured room identity even when a denormalized display cache is stale", () => {
		const conflicts = detectConflicts(
			{ submissionId: "next", roomId: "main", roomName: "Grand Hall", startsAtMs: 100, endsAtMs: 200, speakerKeys: [] },
			[{ submissionId: "current", roomId: "main", roomName: "Main", startsAtMs: 100, endsAtMs: 200, speakerKeys: [] }],
		);
		expect(conflicts).toMatchObject([{ kind: "room", roomName: "Grand Hall", submissionIdA: "next", submissionIdB: "current" }]);
	});
});

describe("formatScheduleConflicts", () => {
	it("explains room overlaps with titles and times instead of raw ids", () => {
		const message = formatScheduleConflicts(
			[{ kind: "room", roomName: "Main Stage", submissionIdA: "aaa", submissionIdB: "bbb" }],
			{
				titleFor: (id) => (id === "aaa" ? "New talk" : "Existing talk"),
				timeRangeFor: (id) => (id === "bbb" ? "10:00–10:30" : null),
			},
		);
		expect(message).toContain("Main Stage");
		expect(message).toContain("Existing talk");
		expect(message).toContain("10:00–10:30");
		expect(message).toContain("New talk");
		expect(message).not.toContain("aaa");
	});
});

describe("formatTrackConflict", () => {
	it("names the track, both talks, and the blocking window", () => {
		expect(
			formatTrackConflict({
				trackName: "Agents",
				movingTitle: "Morning systems check-in",
				blockingTitle: "Running a conference with agents",
				blockingTimeRange: "10:00–10:30",
			}),
		).toBe(
			'Track conflict on "Agents": "Running a conference with agents" already runs 10:00–10:30. "Morning systems check-in" can\'t share that track at the same time — pick another track or time.',
		);
	});
});
