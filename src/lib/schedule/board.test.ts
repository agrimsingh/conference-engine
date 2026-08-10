import { describe, expect, it } from "vitest";
import type { ScheduleInterval } from "@/lib/domain";
import {
	filterUnplacedRail,
	findAvailableSlot,
	formatAutoPlaceSummary,
	isStageRoom,
	isUnplaced,
	planAutoPlace,
	publishableOnDay,
	roomsForLane,
	toPublishConfirmTarget,
	unplacedSessions,
} from "./board";

const base = {
	category: "talk",
	status: "accepted",
	speakerLabels: ["Ada"],
	speakerKeys: ["ada"],
	durationMinutes: 30,
};

describe("room lanes", () => {
	it("treats Main/Demo as stages and everything else as breakouts", () => {
		const rooms = [
			"Main Stage",
			"Demo Stage",
			"Seminar Room B1.01, Level B1",
			"Design Stage",
		];
		expect(isStageRoom("Main Stage")).toBe(true);
		expect(isStageRoom("demo stage")).toBe(true);
		expect(isStageRoom("Design Stage")).toBe(false);
		expect(roomsForLane(rooms, "stages")).toEqual(["Main Stage", "Demo Stage"]);
		expect(roomsForLane(rooms, "breakouts")).toEqual([
			"Seminar Room B1.01, Level B1",
			"Design Stage",
		]);
		expect(roomsForLane(rooms, "all")).toEqual(rooms);
	});
});

describe("unplaced pool", () => {
	it("treats only null slot as unplaced", () => {
		expect(isUnplaced({ slot: null })).toBe(true);
		expect(
			isUnplaced({
				slot: {
					roomId: "r1",
					roomName: "A",
					trackId: null,
					trackName: "Main",
					startsAtMs: 1,
					endsAtMs: 2,
				},
			}),
		).toBe(false);
	});

	it("excludes other-day placements from the unplaced rail", () => {
		const sessions = [
			{ id: "a", title: "Unplaced", ...base, slot: null },
			{
				id: "b",
				title: "Other day",
				...base,
				status: "scheduled",
				slot: {
					roomId: "r1",
					roomName: "Hall",
					trackId: null,
					trackName: "Main",
					startsAtMs: Date.parse("2026-06-11T10:00:00Z"),
					endsAtMs: Date.parse("2026-06-11T10:30:00Z"),
				},
			},
		];
		expect(unplacedSessions(sessions).map((row) => row.id)).toEqual(["a"]);
	});

	it("filters the rail by title, speaker, category, status", () => {
		const sessions = [
			{ id: "1", title: "Rust async", category: "talk", status: "accepted", speakerLabels: ["Graydon"], slot: null },
			{ id: "2", title: "CSS grid", category: "workshop", status: "accepted", speakerLabels: ["Jen"], slot: null },
			{
				id: "3",
				title: "Placed",
				category: "talk",
				status: "scheduled",
				speakerLabels: ["X"],
				slot: {
					roomId: null,
					roomName: "A",
					trackId: null,
					trackName: "T",
					startsAtMs: 1,
					endsAtMs: 2,
				},
			},
		];
		expect(filterUnplacedRail(sessions, "rust").map((row) => row.id)).toEqual(["1"]);
		expect(filterUnplacedRail(sessions, "jen").map((row) => row.id)).toEqual(["2"]);
		expect(filterUnplacedRail(sessions, "workshop").map((row) => row.id)).toEqual(["2"]);
		expect(filterUnplacedRail(sessions, "").map((row) => row.id)).toEqual(["1", "2"]);
	});
});

describe("findAvailableSlot", () => {
	const dayKey = "2026-06-10";
	const timeZone = "UTC";
	const timeRows = [9 * 60, 9 * 60 + 30, 10 * 60];
	const rooms = ["A", "B"];
	const roomIds = { A: "room-a", B: "room-b" };

	it("returns the earliest open room×time", () => {
		const slot = findAvailableSlot({
			session: { id: "s1", durationMinutes: 30, speakerKeys: ["ada"] },
			dayKey,
			timeZone,
			timeRows,
			rooms,
			roomIds,
			dayEndMinutes: 12 * 60,
			intervals: [],
		});
		expect(slot).toEqual({
			roomName: "A",
			startMinutes: 9 * 60,
			startsAtMs: Date.parse("2026-06-10T09:00:00.000Z"),
			endsAtMs: Date.parse("2026-06-10T09:30:00.000Z"),
		});
	});

	it("skips room conflicts and finds the next free cell", () => {
		const blocking: ScheduleInterval = {
			submissionId: "other",
			roomId: "room-a",
			roomName: "A",
			startsAtMs: Date.parse("2026-06-10T09:00:00.000Z"),
			endsAtMs: Date.parse("2026-06-10T09:30:00.000Z"),
			speakerKeys: ["bob"],
		};
		const slot = findAvailableSlot({
			session: { id: "s1", durationMinutes: 30, speakerKeys: ["ada"] },
			dayKey,
			timeZone,
			timeRows,
			rooms,
			roomIds,
			dayEndMinutes: 12 * 60,
			intervals: [blocking],
		});
		expect(slot?.roomName).toBe("B");
		expect(slot?.startMinutes).toBe(9 * 60);
	});

	it("skips speaker conflicts across rooms", () => {
		const blocking: ScheduleInterval = {
			submissionId: "other",
			roomId: "room-a",
			roomName: "A",
			startsAtMs: Date.parse("2026-06-10T09:00:00.000Z"),
			endsAtMs: Date.parse("2026-06-10T09:30:00.000Z"),
			speakerKeys: ["ada"],
		};
		const slot = findAvailableSlot({
			session: { id: "s1", durationMinutes: 30, speakerKeys: ["ada"] },
			dayKey,
			timeZone,
			timeRows,
			rooms,
			roomIds,
			dayEndMinutes: 12 * 60,
			intervals: [blocking],
		});
		expect(slot?.startMinutes).toBe(9 * 60 + 30);
		expect(slot?.roomName).toBe("A");
	});

	it("returns null when duration cannot fit before day end", () => {
		const slot = findAvailableSlot({
			session: { id: "s1", durationMinutes: 120, speakerKeys: [] },
			dayKey,
			timeZone,
			timeRows: [11 * 60],
			rooms,
			roomIds,
			dayEndMinutes: 12 * 60,
			intervals: [],
		});
		expect(slot).toBeNull();
	});

	it("ignores the candidate's own existing interval", () => {
		const self: ScheduleInterval = {
			submissionId: "s1",
			roomId: "room-a",
			roomName: "A",
			startsAtMs: Date.parse("2026-06-10T09:00:00.000Z"),
			endsAtMs: Date.parse("2026-06-10T09:30:00.000Z"),
			speakerKeys: ["ada"],
		};
		const slot = findAvailableSlot({
			session: { id: "s1", durationMinutes: 30, speakerKeys: ["ada"] },
			dayKey,
			timeZone,
			timeRows,
			rooms,
			roomIds,
			dayEndMinutes: 12 * 60,
			intervals: [self],
		});
		expect(slot?.roomName).toBe("A");
		expect(slot?.startMinutes).toBe(9 * 60);
	});
});

describe("planAutoPlace", () => {
	const dayKey = "2026-06-10";
	const timeZone = "UTC";
	const timeRows = [9 * 60, 9 * 60 + 30, 10 * 60];
	const rooms = ["A", "B"];
	const roomIds = { A: "room-a", B: "room-b" };

	it("places multiple unscheduled sessions without overlapping", () => {
		const plan = planAutoPlace({
			sessions: [
				{ id: "s1", durationMinutes: 30, speakerKeys: ["ada"] },
				{ id: "s2", durationMinutes: 30, speakerKeys: ["bob"] },
				{ id: "s3", durationMinutes: 30, speakerKeys: ["cara"] },
			],
			dayKey,
			timeZone,
			timeRows,
			rooms,
			roomIds,
			dayEndMinutes: 12 * 60,
			intervals: [],
		});
		expect(plan.placed).toBe(3);
		expect(plan.needAttention).toBe(0);
		expect(plan.placements.map((row) => row.sessionId)).toEqual(["s1", "s2", "s3"]);
		expect(plan.placements[0]?.slot).toMatchObject({
			roomName: "A",
			startMinutes: 9 * 60,
		});
		expect(plan.placements[1]?.slot).toMatchObject({
			roomName: "B",
			startMinutes: 9 * 60,
		});
		expect(plan.placements[2]?.slot).toMatchObject({
			roomName: "A",
			startMinutes: 9 * 60 + 30,
		});
		expect(formatAutoPlaceSummary(plan.placed, plan.needAttention)).toBe(
			"3 placed, 0 need attention",
		);
	});

	it("counts sessions that cannot fit as needing attention", () => {
		const packed: ScheduleInterval[] = [
			{
				submissionId: "x1",
				roomId: "room-a",
				roomName: "A",
				startsAtMs: Date.parse("2026-06-10T09:00:00.000Z"),
				endsAtMs: Date.parse("2026-06-10T10:30:00.000Z"),
				speakerKeys: [],
			},
			{
				submissionId: "x2",
				roomId: "room-b",
				roomName: "B",
				startsAtMs: Date.parse("2026-06-10T09:00:00.000Z"),
				endsAtMs: Date.parse("2026-06-10T10:30:00.000Z"),
				speakerKeys: [],
			},
		];
		const plan = planAutoPlace({
			sessions: [
				{ id: "fit", durationMinutes: 30, speakerKeys: ["z"] },
				{ id: "overflow", durationMinutes: 30, speakerKeys: ["y"] },
			],
			dayKey,
			timeZone,
			timeRows: [9 * 60],
			rooms,
			roomIds,
			dayEndMinutes: 10 * 60,
			intervals: packed,
		});
		expect(plan.placed).toBe(0);
		expect(plan.needAttention).toBe(2);
		expect(plan.skippedIds).toEqual(["fit", "overflow"]);
		expect(formatAutoPlaceSummary(plan.placed, plan.needAttention)).toBe(
			"0 placed, 2 need attention",
		);
	});

	it("places what fits and leaves the rest needing attention", () => {
		const plan = planAutoPlace({
			sessions: [
				{ id: "s1", durationMinutes: 30, speakerKeys: ["a"] },
				{ id: "s2", durationMinutes: 30, speakerKeys: ["b"] },
				{ id: "long", durationMinutes: 180, speakerKeys: ["c"] },
			],
			dayKey,
			timeZone,
			timeRows: [9 * 60, 9 * 60 + 30],
			rooms: ["A"],
			roomIds: { A: "room-a" },
			dayEndMinutes: 10 * 60,
			intervals: [],
		});
		expect(plan.placed).toBe(2);
		expect(plan.needAttention).toBe(1);
		expect(plan.skippedIds).toEqual(["long"]);
		expect(formatAutoPlaceSummary(plan.placed, plan.needAttention)).toBe(
			"2 placed, 1 need attention",
		);
	});
});

describe("publish confirm target", () => {
	it("collects scheduled day sessions only", () => {
		const day = [
			{ id: "1", title: "A", status: "scheduled", slot: { x: 1 } },
			{ id: "2", title: "B", status: "published", slot: { x: 1 } },
			{ id: "3", title: "C", status: "accepted", slot: null },
		];
		const rows = publishableOnDay(day);
		expect(rows.map((row) => row.id)).toEqual(["1"]);
		expect(toPublishConfirmTarget(rows)).toEqual({
			sessionIds: ["1"],
			titles: ["A"],
		});
	});
});
