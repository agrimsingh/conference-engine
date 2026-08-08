import type { SubmissionExportRow } from "@/lib/export/submissions-csv";

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
	| { ok: true; created: number }
	| { ok: false; error: string; status: number };

export async function pushSubmissionsToAirtable(
	config: AirtableConfig,
	rows: SubmissionExportRow[],
): Promise<AirtablePushResult> {
	const url = `https://api.airtable.com/v0/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.tableName)}`;
	let created = 0;

	for (let i = 0; i < rows.length; i += BATCH_SIZE) {
		const batch = rows.slice(i, i + BATCH_SIZE);
		let attempt = 0;
		for (;;) {
			attempt += 1;
			const response = await fetch(url, {
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
			});

			let body: AirtableCreateResponse = {};
			try {
				body = (await response.json()) as AirtableCreateResponse;
			} catch {
				body = {};
			}

			if (response.status === 429 && attempt < 4) {
				await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
				continue;
			}

			if (!response.ok) {
				const message =
					body.error?.message ??
					`Airtable API error (${response.status})`;
				return { ok: false, error: message, status: 502 };
			}

			created += body.records?.length ?? batch.length;
			break;
		}
	}

	return { ok: true, created };
}
