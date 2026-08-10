import { NextResponse } from "next/server";
import { authorizeEventAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/cloudflare";
import {
	getSubmissionFacetCounts,
	getSubmissionQueueCounts,
	listAdminSubmissionsPage,
} from "@/lib/db/queries";
import { isSubmissionQueueTab } from "@/lib/domain";

type RouteContext = {
	params: Promise<{ eventSlug: string }>;
};

function parsePageSize(raw: string | null): number {
	const value = Number(raw);
	if (!Number.isFinite(value)) return 25;
	return Math.min(100, Math.max(1, Math.floor(value)));
}

export async function GET(request: Request, context: RouteContext) {
	const { eventSlug } = await context.params;
	const db = await getDb();
	const access = await authorizeEventAdminApi(db, eventSlug);
	if (!access) {
		return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
	}

	const url = new URL(request.url);
	const category = url.searchParams.get("category")?.trim() || "all";
	const label = url.searchParams.get("label")?.trim() || "all";
	const status = url.searchParams.get("status")?.trim() || "all";
	const query = url.searchParams.get("q")?.trim().toLowerCase() || "";
	const sortParam = url.searchParams.get("sort");
	const sort =
		sortParam === "title" || sortParam === "status" ? sortParam : "newest";
	const queueParam = url.searchParams.get("queue");
	const queue =
		queueParam && isSubmissionQueueTab(queueParam) ? queueParam : "pending";
	const pageSize = parsePageSize(url.searchParams.get("pageSize"));
	const requestedPage = Math.max(1, Number(url.searchParams.get("page")) || 1);

	const [pageResult, facets, queueCounts] = await Promise.all([
		listAdminSubmissionsPage(db, access.event.id, {
			category,
			label,
			status,
			query,
			sort,
			page: requestedPage,
			pageSize,
			queue,
		}),
		getSubmissionFacetCounts(db, access.event.id),
		getSubmissionQueueCounts(db, access.event.id),
	]);

	const totalPages = Math.max(1, Math.ceil(pageResult.total / pageSize));
	const page = Math.min(requestedPage, totalPages);
	const rows =
		page === requestedPage
			? pageResult.rows
			: (
					await listAdminSubmissionsPage(db, access.event.id, {
						category,
						label,
						status,
						query,
						sort,
						page,
						pageSize,
						queue,
					})
				).rows;

	return NextResponse.json({
		ok: true,
		event: {
			id: access.event.id,
			slug: access.event.slug,
			name: access.event.name,
		},
		page,
		pageSize,
		total: pageResult.total,
		totalPages,
		queue,
		sort,
		filters: { category, label, status, q: query },
		facets,
		queueCounts,
		submissions: rows.map((row) => {
			const answers = safeJson(row.answers_json);
			const title = answers?.title;
			return {
				id: row.id,
				status: row.status,
				category: row.category,
				title: typeof title === "string" ? title : null,
				submitterName: row.submitter_name,
				submitterEmail: row.submitter_email,
				createdAt: row.created_at,
				updatedAt: row.updated_at,
			};
		}),
	});
}

function safeJson(value: string | null | undefined): Record<string, unknown> | null {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return null;
		}
		return parsed as Record<string, unknown>;
	} catch {
		return null;
	}
}
