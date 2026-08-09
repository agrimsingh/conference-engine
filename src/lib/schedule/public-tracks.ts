import type { AgendaTrackRow } from "@/lib/db/types";

export type PublicScheduleTrack = {
	id: string | null;
	name: string;
	retired: boolean;
};

/**
 * Tracks are agenda configuration, while submission categories remain CFP
 * intake metadata. Keep retired rows visible by their stored name so old
 * agenda slots do not silently change grouping after a track is retired.
 */
export function publicScheduleTrack(
	trackId: string | null | undefined,
	tracks: AgendaTrackRow[],
): PublicScheduleTrack {
	if (!trackId) return { id: null, name: "Unassigned", retired: false };
	const track = tracks.find((candidate) => candidate.id === trackId);
	if (!track) return { id: trackId, name: "Retired track", retired: true };
	return {
		id: track.id,
		name: track.soft_deleted === 1 ? `${track.name} (retired)` : track.name,
		retired: track.soft_deleted === 1,
	};
}

export function publicScheduleTrackColumns(
	tracks: AgendaTrackRow[],
	slotTracks: PublicScheduleTrack[],
): PublicScheduleTrack[] {
	const columns = tracks
		.filter((track) => track.soft_deleted === 0)
		.map((track) => publicScheduleTrack(track.id, tracks));
	for (const track of slotTracks) {
		if (!columns.some((column) => column.id === track.id)) columns.push(track);
	}
	return columns;
}
