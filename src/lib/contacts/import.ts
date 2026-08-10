import { hasFormulaPrefix, parseBoundedCsv } from "@/lib/sessions/csv";
import { isPlausibleEmail, normalizeEmail } from "@/lib/security/crypto";
import { appendActivity, normalizeContactTags, parseCustomFields } from "./contacts";

export type ContactImportResult =
	| {
			ok: true;
			imported: number;
			updated: number;
			rows: Array<{ row: number; email: string; action: "created" | "updated" }>;
	  }
	| { ok: false; error: string; rows?: Array<{ row: number; error: string }> };

export async function importAccountContactsCsv(
	db: D1Database,
	args: { accountId: string; csv: string; authorAccountId?: string | null; now?: number },
): Promise<ContactImportResult> {
	const parsed = parseBoundedCsv(args.csv);
	if (!parsed.ok) return { ok: false, error: parsed.error };

	const hasEmail = parsed.headers.includes("email");
	const hasName = parsed.headers.includes("name");
	if (!hasEmail || !hasName) {
		return { ok: false, error: "CSV requires name and email columns" };
	}

	const now = args.now ?? Date.now();
	const issues: Array<{ row: number; error: string }> = [];
	const actions: Array<{ row: number; email: string; action: "created" | "updated" }> = [];
	let imported = 0;
	let updated = 0;

	for (const [index, record] of parsed.rows.entries()) {
		const rowNumber = index + 2;
		const email = normalizeEmail(record.email ?? "");
		const name = (record.name ?? "").trim();
		const title = (record.title ?? record.job_title ?? record["job title"] ?? "").trim();
		const company = (record.company ?? "").trim();
		const bio = (record.bio ?? "").trim();
		const notes = (record.notes ?? "").trim();
		const tagsRaw = (record.tags ?? "").trim();
		const tags = tagsRaw
			? tagsRaw.split(/[|;,]/).map((tag) => tag.trim()).filter(Boolean)
			: [];

		if (
			hasFormulaPrefix(name) ||
			hasFormulaPrefix(email) ||
			hasFormulaPrefix(title) ||
			hasFormulaPrefix(company) ||
			hasFormulaPrefix(bio) ||
			hasFormulaPrefix(notes)
		) {
			issues.push({ row: rowNumber, error: "Formula-like values are not allowed" });
			continue;
		}
		if (!isPlausibleEmail(email) || !name) {
			issues.push({ row: rowNumber, error: "Name and valid email are required" });
			continue;
		}
		if (name.length > 160 || title.length > 160 || company.length > 160) {
			issues.push({ row: rowNumber, error: "Name, title, or company is too long" });
			continue;
		}
		if (bio.length > 10_000 || notes.length > 8_000) {
			issues.push({ row: rowNumber, error: "Bio or notes are too long" });
			continue;
		}
		const tagsResult = normalizeContactTags(tags);
		if (!tagsResult.ok) {
			issues.push({ row: rowNumber, error: tagsResult.error });
			continue;
		}

		const existing = await db
			.prepare(
				`SELECT id, custom_fields_json FROM account_contacts
				 WHERE account_id = ? AND email = ? COLLATE NOCASE`,
			)
			.bind(args.accountId, email)
			.first<{ id: string; custom_fields_json: string }>();

		if (existing) {
			const customFields = parseCustomFields(existing.custom_fields_json);
			await db
				.prepare(
					`UPDATE account_contacts
					 SET name = ?, title = ?, company = ?, bio = ?,
					     notes = CASE WHEN ? != '' THEN ? ELSE notes END,
					     custom_fields_json = ?, updated_at = ?
					 WHERE id = ? AND account_id = ?`,
				)
				.bind(
					name,
					title || null,
					company || null,
					bio || null,
					notes,
					notes,
					JSON.stringify(customFields),
					now,
					existing.id,
					args.accountId,
				)
				.run();
			if (tagsResult.value.length) {
				for (const tag of tagsResult.value) {
					await db
						.prepare(
							`INSERT OR IGNORE INTO account_contact_tags (account_id, contact_id, tag, created_at)
							 VALUES (?, ?, ?, ?)`,
						)
						.bind(args.accountId, existing.id, tag, now)
						.run();
				}
			}
			updated += 1;
			actions.push({ row: rowNumber, email, action: "updated" });
		} else {
			const id = crypto.randomUUID();
			await db
				.prepare(
					`INSERT INTO account_contacts (
						id, account_id, email, name, title, company, bio, notes, custom_fields_json, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
				)
				.bind(
					id,
					args.accountId,
					email,
					name,
					title || null,
					company || null,
					bio || null,
					notes || null,
					now,
					now,
				)
				.run();
			for (const tag of tagsResult.value) {
				await db
					.prepare(
						`INSERT INTO account_contact_tags (account_id, contact_id, tag, created_at)
						 VALUES (?, ?, ?, ?)`,
					)
					.bind(args.accountId, id, tag, now)
					.run();
			}
			await appendActivity(db, {
				contactId: id,
				kind: "system",
				body: "Imported from CSV",
				authorAccountId: args.authorAccountId ?? args.accountId,
				occurredAt: now,
			});
			imported += 1;
			actions.push({ row: rowNumber, email, action: "created" });
		}
	}

	if (issues.length) {
		return { ok: false, error: "Fix CSV validation errors before importing", rows: issues };
	}
	return { ok: true, imported, updated, rows: actions };
}
