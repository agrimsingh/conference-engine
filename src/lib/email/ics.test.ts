import { describe, expect, it } from "vitest";
import { buildIcsInvite, buildIcsPublishCalendar, calendarSessionLabel } from "./ics";

describe("calendar invite lifecycle", () => {
	it("collapses duplicate session and event labels while retaining distinct names", () => {
		expect(calendarSessionLabel(" Production confidence ", "production CONFIDENCE")).toBe(
			"Production confidence",
		);
		expect(calendarSessionLabel("Taming CI", "Production confidence")).toBe(
			"Taming CI — Production confidence",
		);
	});

	it("emits an RFC-style request with stable UID and a revision sequence", () => {
		const ics = buildIcsInvite({ uid: "session@example.test", summary: "A, B", location: "Room; 1", startsAtMs: Date.UTC(2026, 7, 9, 1), endsAtMs: Date.UTC(2026, 7, 9, 2), organizerEmail: "team@example.test", organizerName: "AI, Summit; 2026", attendeeEmail: "speaker@example.test", sequence: 4, dtstampMs: Date.UTC(2026, 7, 1) });
		expect(ics).toContain("METHOD:REQUEST\r\n");
		expect(ics).toContain("UID:session@example.test");
		expect(ics).toContain("SEQUENCE:4");
		expect(ics).toContain("STATUS:CONFIRMED");
		expect(ics).toContain("LOCATION:Room\\; 1");
		expect(ics).toContain("ATTENDEE;CN=speaker@example.test;CUTYPE=INDIVIDUAL");
		expect(ics).toContain("ORGANIZER;CN=AI\\, Summit\\; 2026:mailto:team@example.test");
	});

	it("uses CANCELLED status for the same UID cancellation", () => {
		const ics = buildIcsInvite({ uid: "session@example.test", summary: "Cancelled", location: "Room", startsAtMs: 0, endsAtMs: 1, organizerEmail: "team@example.test", attendeeEmail: "speaker@example.test", method: "CANCEL", sequence: 5, dtstampMs: 0 });
		expect(ics).toContain("METHOD:CANCEL");
		expect(ics).toContain("STATUS:CANCELLED");
		expect(ics).toContain("SEQUENCE:5");
	});

	it("emits METHOD:PUBLISH without an ATTENDEE line", () => {
		const ics = buildIcsInvite({
			uid: "session@example.test",
			summary: "Public talk",
			location: "Main",
			startsAtMs: Date.UTC(2026, 7, 9, 1),
			endsAtMs: Date.UTC(2026, 7, 9, 2),
			organizerEmail: "team@example.test",
			attendeeEmail: "must-not-leak@example.test",
			method: "PUBLISH",
			sequence: 2,
			dtstampMs: Date.UTC(2026, 7, 1),
		});
		expect(ics).toContain("METHOD:PUBLISH\r\n");
		expect(ics).toContain("STATUS:CONFIRMED");
		expect(ics).toContain("SEQUENCE:2");
		expect(ics).not.toContain("ATTENDEE");
		expect(ics).not.toContain("must-not-leak@example.test");
	});

	it("preserves UID and SEQUENCE across a multi-event PUBLISH feed", () => {
		const ics = buildIcsPublishCalendar({
			calendarName: "Demo Conf",
			dtstampMs: Date.UTC(2026, 7, 1),
			events: [
				{
					uid: "earlier@example.test",
					summary: "Earlier",
					location: "A",
					startsAtMs: Date.UTC(2026, 7, 10, 9),
					endsAtMs: Date.UTC(2026, 7, 10, 10),
					organizerEmail: "team@example.test",
					sequence: 1,
				},
				{
					uid: "later@example.test",
					summary: "Later",
					location: "B",
					startsAtMs: Date.UTC(2026, 7, 10, 11),
					endsAtMs: Date.UTC(2026, 7, 10, 12),
					organizerEmail: "team@example.test",
					sequence: 7,
				},
			],
		});
		expect(ics).toContain("METHOD:PUBLISH\r\n");
		expect(ics).toContain("X-WR-CALNAME:Demo Conf");
		expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
		expect(ics).toContain("UID:earlier@example.test");
		expect(ics).toContain("SEQUENCE:1");
		expect(ics).toContain("UID:later@example.test");
		expect(ics).toContain("SEQUENCE:7");
		expect(ics).not.toContain("ATTENDEE");
	});
});
