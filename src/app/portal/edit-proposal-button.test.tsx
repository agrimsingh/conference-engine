// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditProposalButton } from "./edit-proposal-button";

describe("EditProposalButton", () => {
	it("renders an on-demand recovery control without serializing an edit token", () => {
		const html = renderToStaticMarkup(
			<EditProposalButton submissionId="proposal-without-token" />,
		);

		expect(html).toContain("Edit proposal");
		expect(html).not.toContain("draft=");
		expect(html).not.toContain("token");
	});
});
