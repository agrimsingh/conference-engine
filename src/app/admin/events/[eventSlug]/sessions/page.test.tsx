import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type CapturedSession = {
	readonly id: string;
	readonly origin: string;
};

type CapturedSessionWorkbenchProps = {
	readonly sessions: readonly CapturedSession[];
};

const mocks = vi.hoisted(() => ({
	assertCanManageEvent: vi.fn(),
	listAccessibleEvents: vi.fn(),
	getDb: vi.fn(),
	listCloneableSessionsForEvents: vi.fn(),
	listSubmissionsForEvent: vi.fn(),
	sessionWorkbench: vi.fn<(props: CapturedSessionWorkbenchProps) => void>(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/events/event-one/sessions" }));
vi.mock("@/lib/auth/admin", () => ({
	assertCanManageEvent: mocks.assertCanManageEvent,
	listAccessibleEvents: mocks.listAccessibleEvents,
}));
vi.mock("@/lib/db/cloudflare", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/db/queries", () => ({
	listCloneableSessionsForEvents: mocks.listCloneableSessionsForEvents,
	listSubmissionsForEvent: mocks.listSubmissionsForEvent,
}));
vi.mock("./session-workbench", () => ({
	SessionWorkbench: (props: CapturedSessionWorkbenchProps) => {
		mocks.sessionWorkbench(props);
		return null;
	},
}));

import SessionsPage from "./page";

async function renderSessionsPage(): Promise<CapturedSessionWorkbenchProps> {
	const page = await SessionsPage({ params: Promise.resolve({ eventSlug: "event-one" }) });
	renderToStaticMarkup(page);
	const props = mocks.sessionWorkbench.mock.calls.at(-1)?.[0];
	if (!props) throw new TypeError("Expected SessionWorkbench to receive sessions page props");
	return props;
}

describe("SessionsPage roster", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getDb.mockResolvedValue({
			prepare: vi.fn(() => ({
				bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results: [] }) })),
			})),
		});
		mocks.assertCanManageEvent.mockResolvedValue({
			event: { id: "event-1", slug: "event-one", name: "Event One" },
		});
		mocks.listAccessibleEvents.mockResolvedValue({
			events: [{ id: "event-1" }],
		});
		mocks.listCloneableSessionsForEvents.mockResolvedValue([]);
		mocks.listSubmissionsForEvent.mockResolvedValue([
			{
				id: "cfp-session",
				origin: "cfp",
				answers_json: JSON.stringify({ title: "Accepted from CFP" }),
				submitter_name: "CFP Speaker",
				status: "accepted",
				lineage_parent_submission_id: null,
			},
			{
				id: "manual-session",
				origin: "manual",
				answers_json: JSON.stringify({ title: "Booked directly" }),
				submitter_name: "Manual Speaker",
				status: "accepted",
				lineage_parent_submission_id: null,
			},
		]);
	});

	it("includes CFP-origin and directly booked sessions in the organizer roster", async () => {
		// Given
		const expectedIds = ["cfp-session", "manual-session"];

		// When
		const props = await renderSessionsPage();

		// Then
		expect(props.sessions.map((session) => session.id)).toEqual(expectedIds);
		expect(props.sessions.map((session) => session.origin)).toEqual(["cfp", "manual"]);
	});
});
