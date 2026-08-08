import type { SubmissionExportRow } from "@/lib/export/submissions-csv";
import { fetchWithBoundedRetry } from "@/lib/security/fetch";

export type AirtableConfig = {
	apiKey: string;
	baseId: string;
	tableName: string;
};

type AirtableEnvFields = {
	AIRTABLE_API_KEY?: string;
	AIRTABLE_BASE_ID?: string;
	AIRTABLE_TABLE_NAME?: string;
};

export function resolveAirtableConfig(env: unknown): AirtableConfig | null {
	const fields = env as AirtableEnvFields;
	const apiKey = fields.AIRTABLE_API_KEY?.trim();
	const baseId = fields.AIRTABLE_BASE_ID?.trim();
	const tableName = fields.AIRTABLE_TABLE_NAME?.trim();
	if (!apiKey || !baseId || !tableName) return null;
	return { apiKey, baseId, tableName };
}

export const AIRTABLE_NOT_CONFIGURED_ERROR =
	"Airtable is not configured. Set AIRTABLE_API_KEY, AIRTABLE_BASE_ID, and AIRTABLE_TABLE_NAME, or download the CSV export instead.";

const BATCH_SIZE = 10;

type AirtableCreateResponse = {
	records?: Array<{ id: string }>;
	error?: { type?: string; message?: string };
};

export type AirtablePushResult =
	| { ok: true; upserted: number }
	| { ok: false; error: string; status: number };

export async function pushSubmissionsToAirtable(
	config: AirtableConfig,
	rows: SubmissionExportRow[],
): Promise<AirtablePushResult> {
	const url = `https://api.airtable.com/v0/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.tableName)}`;
	let upserted = 0;

	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		{
			let response: Response;
			try {
				response = await fetchWithBoundedRetry(url, {
				method: "PATCH",
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					typecast: true,
					performUpsert: { fieldsToMergeOn: ["id"] },
					records: batch.map((row) => ({
						fields: {
							id: row.id,
							title: row.title,
							status: row.status,
							category: row.category,
							speakers: row.speakers,
							submitted_at: row.submitted_at,
							labels: row.labels,
						},
					})),
				}),
				}, { attempts: 3, timeoutMs: 10_000 });
			} catch {
				return { ok: false, error: "Airtable request timed out", status: 502 };
			}

			let body: AirtableCreateResponse = {};
			try {
				body = (await response.json()) as AirtableCreateResponse;
			} catch {
				body = {};
			}

			if (!response.ok) {
				const message =
					body.error?.message ??
					`Airtable API error (${response.status})`;
				return { ok: false, error: message, status: 502 };
			}

			upserted += body.records?.length ?? batch.length;
		}
	}

	return { ok: true, upserted };
}
