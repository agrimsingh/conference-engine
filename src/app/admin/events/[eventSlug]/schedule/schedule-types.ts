export type ScheduleSession = {
	id: string;
	title: string;
	category: string;
	status: string;
	submitterName: string | null;
	durationMinutes: number;
	speakerKeys: string[];
	speakerLabels: string[];
	slot: {
		roomId: string | null;
		roomName: string;
		trackId: string | null;
		trackName: string;
		startsAtMs: number;
		endsAtMs: number;
	} | null;
};
