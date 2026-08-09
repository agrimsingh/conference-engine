import { describe, expect, it } from "vitest";
import { buildStoredZip } from "./zip";

describe("stored ZIP", () => {
	it("contains one local entry and one central entry with its path", () => {
		const zip = buildStoredZip([{ path: "Session/slides.pdf", bytes: new TextEncoder().encode("latest"), modifiedAt: Date.UTC(2027, 4, 1) }]);
		const text = new TextDecoder().decode(zip);
		expect(text.match(/Session\/slides\.pdf/g)).toHaveLength(2);
		expect(Array.from(zip.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
	});
});
