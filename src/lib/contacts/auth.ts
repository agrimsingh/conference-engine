import { NextResponse } from "next/server";
import {
	getCurrentOrganizerAccount,
	isAdminBypass,
} from "@/lib/auth/admin";
import type { AccountRow } from "@/lib/db/types";

export type ContactsApiAccess =
	| { ok: true; account: AccountRow }
	| { ok: false; response: NextResponse };

/** Account-scoped CRM requires a real organizer session (not bypass-only). */
export async function authorizeContactsApi(db: D1Database): Promise<ContactsApiAccess> {
	const account = await getCurrentOrganizerAccount(db);
	if (account) return { ok: true, account };

	if (await isAdminBypass()) {
		return {
			ok: false,
			response: NextResponse.json(
				{ ok: false, error: "Sign in to manage contacts. Bypass alone is not an account." },
				{ status: 401 },
			),
		};
	}

	return {
		ok: false,
		response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
	};
}
