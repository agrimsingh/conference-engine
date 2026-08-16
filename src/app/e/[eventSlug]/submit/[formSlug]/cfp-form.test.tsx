// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormFieldDef } from "@/lib/domain";
import { CfpForm, SpeakerPortalRedirect } from "./cfp-form";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const title: FormFieldDef = {
	key: "title",
	label: "Title",
	fieldType: "text",
	required: true,
	position: 0,
	visibilityRule: { op: "always" },
	config: { kind: "text", maxLength: 10, placeholder: "Session title" },
};

const duration: FormFieldDef = {
	key: "duration_minutes",
	label: "Duration (minutes)",
	fieldType: "number",
	required: true,
	position: 0,
	visibilityRule: { op: "always" },
	config: { kind: "number", min: 15, max: 240, step: 5, defaultValue: 30 },
};

describe("CfpForm deadline banner", () => {
	it("shows the close deadline in the event timezone", async () => {
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
					submissionLimit={3}
					closesAt={Date.UTC(2026, 8, 15, 6, 59)}
					timezone="America/Los_Angeles"
					fields={[title]}
					sections={[]}
				/>,
			);
		});
		expect(container.textContent).toMatch(/Deadline:/);
		expect(container.textContent).toMatch(/Sep/);
		expect(container.textContent).toMatch(/Submission limit: 3/);
	});
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
					sections={[]}
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

describe("CfpForm maxLength char count", () => {
	it("applies HTML maxLength and shows a live character count", async () => {
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
					fields={[title]}
					sections={[]}
				/>,
			);
		});

		const input = container.querySelector('input[type="text"]') as HTMLInputElement | null;
		expect(input).not.toBeNull();
		expect(input?.getAttribute("maxlength")).toBe("10");
		expect(container.textContent).toContain("0/10");

		await act(async () => {
			if (!input) return;
			const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set;
			nativeInputValueSetter?.call(input, "hello");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(container.textContent).toContain("5/10");
	});
});

describe("CfpForm number defaults", () => {
	it("starts at the configured duration and lets the submitter adjust it", async () => {
		// Given
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
					fields={[duration]}
					sections={[]}
				/>,
			);
		});
		const input = container.querySelector('input[type="number"]') as HTMLInputElement | null;
		const initialValue = input?.value;

		// When
		await act(async () => {
			if (!input) return;
			const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
			setValue?.call(input, "45");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});

		// Then
		expect(initialValue).toBe("30");
		expect(input?.value).toBe("45");
	});
});

describe("CfpForm progress and review step", () => {
	it("shows required progress and moves to review before submitting", async () => {
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
					fields={[title]}
					sections={[]}
				/>,
			);
		});

		expect(container.textContent).toContain("Required progress");
		expect(container.textContent).toContain("0/3");

		const form = container.querySelector("form");
		await act(async () => {
			form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});

		expect(container.textContent).toContain("Review before submitting");
		expect(container.textContent).toContain("Check your proposal");
	});
});

describe("CfpForm readOnly demo", () => {
	it("shows the demo banner and replaces submit with create-event on review", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");

		await act(async () => {
			root.render(
				<CfpForm
					eventSlug="demo-cfp-to-stage"
					formSlug="cfp"
					eventName="Demo"
					formTitle="Demo CFP"
					formDescription={null}
					welcomeCopy={null}
					thankYouCopy={null}
					draftToken=""
					draftsEnabled={true}
					submissionLimit={0}
					fields={[title]}
					sections={[]}
					readOnly
				/>,
			);
		});

		expect(container.textContent).toContain("Read-only demo");
		expect(container.textContent).toContain("Create your event");
		expect(container.textContent).not.toContain("Save and email a resume link");

		const form = container.querySelector("form");
		await act(async () => {
			form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
		});

		expect(container.textContent).toContain("Demo review");
		expect(container.textContent).toContain("Create your event to submit");
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});

describe("SpeakerPortalRedirect", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("counts down then navigates to the speaker portal", async () => {
		const navigate = vi.fn();

		await act(async () => {
			root.render(
				<SpeakerPortalRedirect delaySeconds={3} href="/portal" navigate={navigate} />,
			);
		});

		expect(container.textContent).toContain("Redirecting to the speaker portal in");
		expect(container.textContent).toContain("3");
		const link = container.querySelector('a[href="/portal"]');
		expect(link?.textContent).toBe("Go to speaker portal");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		expect(container.textContent).toContain("2");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		expect(container.textContent).toContain("1");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		expect(navigate).toHaveBeenCalledWith("/portal");
	});

	it("pauses auto-redirect when Stay on this page is clicked", async () => {
		const navigate = vi.fn();

		await act(async () => {
			root.render(
				<SpeakerPortalRedirect delaySeconds={5} href="/portal" navigate={navigate} />,
			);
		});

		const stay = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Stay on this page",
		);
		expect(stay).toBeTruthy();

		await act(async () => {
			stay?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.textContent).toContain("Auto-redirect paused");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});
		expect(navigate).not.toHaveBeenCalled();
		expect(container.querySelector('a[href="/portal"]')?.textContent).toBe(
			"Go to speaker portal",
		);
	});
});
