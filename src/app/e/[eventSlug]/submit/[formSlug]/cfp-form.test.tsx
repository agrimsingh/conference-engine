// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FormFieldDef } from "@/lib/domain";
import { CfpForm } from "./cfp-form";

let container: HTMLDivElement;
let root: Root;

const topics: FormFieldDef = {
	key: "topics",
	label: "Topics",
	fieldType: "multiselect",
	required: true,
	position: 0,
	visibilityRule: { op: "always" },
	config: { kind: "multiselect", options: [{ value: "agents", label: "Agents" }] },
};

beforeEach(() => {
	container = document.createElement("div");
	(document.body as unknown as { appendChild: (child: HTMLDivElement) => void }).appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

describe("CfpForm required multiselect validation", () => {
	it("links and announces the focused group error before sending a submission", async () => {
		await act(async () => {
			root.render(
				<CfpForm
					eventSlug="test-event"
					formSlug="cfp"
					eventName="Test event"
					formTitle="Test CFP"
					formDescription={null}
					welcomeCopy={null}
					thankYouCopy={null}
					draftToken=""
					draftsEnabled={false}
					submissionLimit={0}
					fields={[topics]}
				/>,
			);
		});

		const form = container.querySelector("form");
		const fieldset = container.querySelector("fieldset");
		expect(form).not.toBeNull();
		expect(fieldset?.getAttribute("aria-invalid")).toBeNull();

		await act(async () => {
			form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});

		const error = document.getElementById("cfp-field-error-topics");
		expect(fieldset?.getAttribute("aria-invalid")).toBe("true");
		expect(fieldset?.getAttribute("aria-describedby")).toBe("cfp-field-error-topics");
		expect(document.activeElement).toBe(fieldset);
		expect(error?.textContent).toBe("Topics is required");
		expect(error?.getAttribute("role")).toBe("alert");
		expect(error?.getAttribute("aria-live")).toBe("assertive");
	});
});
