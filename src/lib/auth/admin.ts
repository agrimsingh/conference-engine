import { cookies } from "next/headers";

export const ADMIN_BYPASS_COOKIE = "ce_admin_bypass";

export async function isAdminBypass(): Promise<boolean> {
	const jar = await cookies();
	return jar.get(ADMIN_BYPASS_COOKIE)?.value === "1";
}

export async function requireAdminBypass(): Promise<void> {
	if (!(await isAdminBypass())) {
		throw new Error("Admin bypass cookie required (local demo auth)");
	}
}
