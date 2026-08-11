export type ScheduleSession = {
	id: string;
	title: string;
	category: string;
	status: string;
	contentStatus: "draft" | "in_review" | "approved" | null;
	submitterName: string | null;
	durationMinutes: number;
	speakerKeys: string[];
	speakerLabels: string[];
	itemKind: "talk" | "service";
	agendaVisibility: "public" | "private";
	slot: {
		roomId: string | null;
		roomName: string;
		trackId: string | null;
		trackName: string;
		startsAtMs: number;
		endsAtMs: number;
	} | null;
};
