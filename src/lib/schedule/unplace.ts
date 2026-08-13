import { getCloudflareEnv } from "@/lib/db/cloudflare";
import { notifyCalendarCancellation } from "@/lib/email/notify";
import { fetchEventRoomMutation } from "@/lib/realtime/event-room-fetch";

export type UnplaceSlot = {
	room_name: string;
	starts_at: number;
	ends_at: number;
	ics_uid: string;
	calendar_sequence: number;
};

export type UnplaceResult =
	| {
			ok: true;
			status: string;
			slot: UnplaceSlot;
			email: Awaited<ReturnType<typeof notifyCalendarCancellation>>["email"];
			icsBytesLength: number;
	  }
	| { ok: false; error: string; status: number };

/**
 * Unplace through EventRoom DO (slot delete + SEQUENCE++) then CANCEL invite.
 * Calendar cancel runs only when the DO returns a complete slot payload.
 */
export async function unplaceScheduledSubmission(
	db: D1Database,
	args: { eventId: string; submissionId: string },
): Promise<UnplaceResult> {
	const env = await getCloudflareEnv();
	if (!env.EVENT_ROOM) {
		return { ok: false, error: "EVENT_ROOM binding unavailable", status: 503 };
	}

	const response = await fetchEventRoomMutation(env.EVENT_ROOM, args.eventId, new Request(
		"https://event-room/schedule",
		{
			method: "DELETE",
			headers: {
				"content-type": "application/json",
				"x-ce-event-id": args.eventId,
			},
			body: JSON.stringify({ submissionId: args.submissionId, action: "unplace" }),
		},
	));

	let value: unknown;
	try {
		value = await response.json();
	} catch {
		return { ok: false, error: "Invalid room response", status: 502 };
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return { ok: false, error: "Invalid room response", status: 502 };
	}
	const result = value as Record<string, unknown>;
	if (result.ok !== true) {
		return {
			ok: false,
			error: typeof result.error === "string" ? result.error : "Schedule mutation failed",
			status: response.status,
		};
	}

	const rawSlot = result.slot;
	if (
		!rawSlot ||
		typeof rawSlot !== "object" ||
		Array.isArray(rawSlot) ||
		typeof (rawSlot as Record<string, unknown>).room_name !== "string" ||
		typeof (rawSlot as Record<string, unknown>).starts_at !== "number" ||
		typeof (rawSlot as Record<string, unknown>).ends_at !== "number" ||
		typeof (rawSlot as Record<string, unknown>).ics_uid !== "string" ||
		typeof (rawSlot as Record<string, unknown>).calendar_sequence !== "number"
	) {
		return {
			ok: false,
			error: "Unplace succeeded without calendar slot payload",
			status: 502,
		};
	}

	const slot = rawSlot as UnplaceSlot;
	const cancellation = await notifyCalendarCancellation(db, {
		submissionId: args.submissionId,
		roomName: slot.room_name,
		startsAtMs: slot.starts_at,
		endsAtMs: slot.ends_at,
		icsUid: slot.ics_uid,
		sequence: slot.calendar_sequence,
		fromEmail: env.RESEND_FROM_EMAIL || "team@65labs.org",
		appOrigin: env.APP_ORIGIN,
	});

	return {
		ok: true,
		status: typeof result.status === "string" ? result.status : "accepted",
		slot,
		email: cancellation.email,
		icsBytesLength: cancellation.icsBytes.length,
	};
}
