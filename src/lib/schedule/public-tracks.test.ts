import { describe, expect, it } from "vitest";
import type { AgendaTrackRow } from "@/lib/db/types";
import { publicScheduleTrack, publicScheduleTrackColumns } from "./public-tracks";

const tracks: AgendaTrackRow[] = [
	{ id: "general", event_id: "event", name: "General agenda", slug: "general", position: 0, soft_deleted: 0, created_at: 0, updated_at: 0 },
	{ id: "retired", event_id: "event", name: "Workshops", slug: "workshops", position: 1, soft_deleted: 1, created_at: 0, updated_at: 0 },
];

describe("public schedule tracks", () => {
	it("uses the agenda-track identity and preserves retired track names", () => {
		expect(publicScheduleTrack("general", tracks)).toMatchObject({ id: "general", name: "General agenda", retired: false });
		expect(publicScheduleTrack("retired", tracks)).toMatchObject({ id: "retired", name: "Workshops (retired)", retired: true });
	});

	it("keeps active configured tracks and historical slot tracks as separate columns", () => {
		const columns = publicScheduleTrackColumns(tracks, [
			publicScheduleTrack("retired", tracks),
			publicScheduleTrack(null, tracks),
		]);
		expect(columns).toMatchObject([
			{ id: "general", name: "General agenda" },
			{ id: "retired", name: "Workshops (retired)" },
			{ id: null, name: "Unassigned" },
		]);
	});
});
