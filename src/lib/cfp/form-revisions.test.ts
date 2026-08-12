import { describe, expect, it } from "vitest";
import { fieldsFromSnapshot, snapshotsEqual, type FormRevisionSnapshot } from "./form-revisions";

const snapshot = (label: string): FormRevisionSnapshot => ({
	fields: [
		{
			key: "title",
			label,
			fieldType: "text",
			required: true,
			position: 0,
			visibilityRule: { op: "always" },
			config: { kind: "text" },
			sectionKey: null,
		},
		{
			key: "speakers",
			label: "Speakers",
			fieldType: "speaker_block",
			required: true,
			position: 1,
			visibilityRule: { op: "always" },
			config: { kind: "speaker_block", minSpeakers: 1, maxSpeakers: 1 },
			sectionKey: null,
		},
	],
	sections: [],
	categoryRoutingJson: null,
	minSpeakers: 2,
	maxSpeakers: 5,
});

describe("form revisions", () => {
	it("treats working snapshots as equal only when field copy matches", () => {
		expect(snapshotsEqual(snapshot("Title"), snapshot("Title"))).toBe(true);
		expect(snapshotsEqual(snapshot("Title"), snapshot("Session title"))).toBe(false);
	});

	it("applies published speaker bounds onto speaker_block fields", () => {
		const [title, speakers] = fieldsFromSnapshot(snapshot("Title"));
		expect(title?.label).toBe("Title");
		expect(speakers?.config).toMatchObject({
			kind: "speaker_block",
			minSpeakers: 2,
			maxSpeakers: 5,
		});
	});
});
