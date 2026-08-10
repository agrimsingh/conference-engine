export const CONTACT_PIPELINE_STAGES = [
	"research",
	"outreach",
	"negotiating",
	"confirmed",
	"declined",
] as const;

export type ContactPipelineStage = (typeof CONTACT_PIPELINE_STAGES)[number];

export const CONTACT_ACTIVITY_KINDS = ["note", "email", "stage", "merge", "system"] as const;
export type ContactActivityKind = (typeof CONTACT_ACTIVITY_KINDS)[number];

export type ContactCustomFields = Record<string, string>;

export type AccountContact = {
	id: string;
	accountId: string;
	email: string;
	name: string;
	title: string | null;
	company: string | null;
	bio: string | null;
	notes: string | null;
	customFields: ContactCustomFields;
	tags: string[];
	stage: ContactPipelineStage | null;
	createdAt: number;
	updatedAt: number;
};

export type ContactActivity = {
	id: string;
	kind: ContactActivityKind;
	body: string;
	authorAccountId: string | null;
	occurredAt: number;
};

export type ContactStageHistoryEntry = {
	id: string;
	fromStage: ContactPipelineStage | null;
	toStage: ContactPipelineStage;
	note: string | null;
	changedBy: string | null;
	changedAt: number;
};

export type ContactEventLink = {
	eventId: string;
	eventSlug: string;
	eventName: string;
	personId: string;
	linkedAt: number;
};

export type ContactDetail = AccountContact & {
	activities: ContactActivity[];
	stageHistory: ContactStageHistoryEntry[];
	eventLinks: ContactEventLink[];
};

export type ContactFilters = {
	q?: string;
	company?: string;
	title?: string;
	tag?: string;
	stage?: ContactPipelineStage | "all";
};

export type ContactSegment = {
	id: string;
	accountId: string;
	name: string;
	filters: ContactFilters;
	createdAt: number;
};

export type ContactKpis = {
	totalContacts: number;
	inPipeline: number;
	confirmed: number;
	topCompanies: Array<{ company: string; count: number }>;
};

export function isContactPipelineStage(value: unknown): value is ContactPipelineStage {
	return typeof value === "string" && (CONTACT_PIPELINE_STAGES as readonly string[]).includes(value);
}

export function isContactActivityKind(value: unknown): value is ContactActivityKind {
	return typeof value === "string" && (CONTACT_ACTIVITY_KINDS as readonly string[]).includes(value);
}

export const PIPELINE_STAGE_LABELS: Record<ContactPipelineStage, string> = {
	research: "Research",
	outreach: "Outreach",
	negotiating: "Negotiating",
	confirmed: "Confirmed",
	declined: "Declined",
};
