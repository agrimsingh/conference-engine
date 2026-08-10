import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	authorize: vi.fn(),
	getDb: vi.fn(),
	listPage: vi.fn(),
	facets: vi.fn(),
	queues: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
	authorizeEventAdminApi: mocks.authorize,
}));
vi.mock("@/lib/db/cloudflare", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/db/queries", () => ({
	listAdminSubmissionsPage: mocks.listPage,
	getSubmissionFacetCounts: mocks.facets,
	getSubmissionQueueCounts: mocks.queues,
}));

import { GET } from "./route";

describe("GET /api/admin/events/[eventSlug]/submissions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getDb.mockResolvedValue({ marker: "db" });
		mocks.listPage.mockResolvedValue({
			rows: [
				{
					id: "sub_1",
					status: "submitted",
					category: null,
					answers_json: JSON.stringify({ title: "Hello" }),
					submitter_name: "Ada",
					submitter_email: "ada@example.com",
					created_at: 1,
					updated_at: 2,
				},
			],
			total: 1,
		});
		mocks.facets.mockResolvedValue({
			total: 1,
			byCategory: [],
			byStatus: [],
			byLabel: [],
		});
		mocks.queues.mockResolvedValue({ pending: 1, all: 1 });
	});

	it("returns 401 when unauthorized", async () => {
		mocks.authorize.mockResolvedValue(null);
		const response = await GET(
			new Request("https://example.test/api/admin/events/aie-sandbox/submissions"),
			{ params: Promise.resolve({ eventSlug: "aie-sandbox" }) },
		);
		expect(response.status).toBe(401);
		expect(mocks.listPage).not.toHaveBeenCalled();
	});

	it("lists submissions when authorized", async () => {
		mocks.authorize.mockResolvedValue({
			event: { id: "evt_1", slug: "aie-sandbox", name: "Sandbox" },
		});
		const response = await GET(
			new Request(
				"https://example.test/api/admin/events/aie-sandbox/submissions?queue=all&page=1",
			),
			{ params: Promise.resolve({ eventSlug: "aie-sandbox" }) },
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			ok: boolean;
			submissions: unknown[];
		};
		expect(body.ok).toBe(true);
		expect(body.submissions).toEqual([
			{
				id: "sub_1",
				status: "submitted",
				category: null,
				title: "Hello",
				submitterName: "Ada",
				submitterEmail: "ada@example.com",
				createdAt: 1,
				updatedAt: 2,
			},
		]);
		expect(mocks.listPage).toHaveBeenCalledWith(
			{ marker: "db" },
			"evt_1",
			expect.objectContaining({ queue: "all", page: 1 }),
		);
	});
});
