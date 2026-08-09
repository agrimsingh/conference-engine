import { describe, expect, it } from "vitest";
import { buildIcsInvite } from "./ics";

describe("calendar invite lifecycle", () => {
	it("emits an RFC-style request with stable UID and a revision sequence", () => {
		const ics = buildIcsInvite({ uid: "session@example.test", summary: "A, B", location: "Room; 1", startsAtMs: Date.UTC(2026, 7, 9, 1), endsAtMs: Date.UTC(2026, 7, 9, 2), organizerEmail: "team@example.test", attendeeEmail: "speaker@example.test", sequence: 4, dtstampMs: Date.UTC(2026, 7, 1) });
		expect(ics).toContain("METHOD:REQUEST\r\n");
		expect(ics).toContain("UID:session@example.test");
		expect(ics).toContain("SEQUENCE:4");
		expect(ics).toContain("STATUS:CONFIRMED");
		expect(ics).toContain("LOCATION:Room\\; 1");
		expect(ics).toContain("ATTENDEE;CN=speaker@example.test;CUTYPE=INDIVIDUAL");
	});

	it("uses CANCELLED status for the same UID cancellation", () => {
		const ics = buildIcsInvite({ uid: "session@example.test", summary: "Cancelled", location: "Room", startsAtMs: 0, endsAtMs: 1, organizerEmail: "team@example.test", attendeeEmail: "speaker@example.test", method: "CANCEL", sequence: 5, dtstampMs: 0 });
		expect(ics).toContain("METHOD:CANCEL");
		expect(ics).toContain("STATUS:CANCELLED");
		expect(ics).toContain("SEQUENCE:5");
	});
});
