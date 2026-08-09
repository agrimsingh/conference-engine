import { describe, expect, it } from "vitest";
import type { EventRow } from "@/lib/db/types";
import { assertEventWritable, DemoEventWriteError } from "./writability";

const event: EventRow = {
	id: "event-id",
	slug: "event",
	name: "Event",
	timezone: "UTC",
	start_day: null,
	end_day: null,
	mode: "live",
	track_conflict_policy: "hard",
	created_at: 0,
	updated_at: 0,
};

describe("assertEventWritable", () => {
	it("allows live events", () => {
		expect(() => assertEventWritable(event)).not.toThrow();
	});

	it("returns a typed 403-capable error for demo events", () => {
		try {
			assertEventWritable({ ...event, mode: "demo" });
		} catch (error) {
			expect(error).toBeInstanceOf(DemoEventWriteError);
			expect(error).toMatchObject({ code: "DEMO_EVENT_READ_ONLY", status: 403 });
			return;
		}
		throw new Error("Expected demo event write to be rejected");
	});
});
