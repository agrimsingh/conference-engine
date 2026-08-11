// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkNotifyBar } from "./bulk-notify-bar";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	refresh.mockReset();
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ ok: true }),
		}),
	);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.unstubAllGlobals();
});

const recipients = [
	{
		id: "sub-1",
		title: "Talk A",
		speakers: ["Ada"],
	},
	{
		id: "sub-2",
		title: "Talk B",
		speakers: ["Grace", "Alan"],
	},
];

describe("BulkNotifyBar", () => {
	it("opens the review dialog and posts the notify payload", async () => {
		await act(async () => {
			root.render(
				<BulkNotifyBar
					eventSlug="aie-sandbox"
					recipients={recipients}
					defaultSubject="You're accepted"
					defaultText="Welcome aboard"
					mixedOutcomes={false}
				/>,
			);
		});

		const openButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Review and notify 2",
		);
		expect(openButton).toBeTruthy();
		await act(async () => openButton?.click());

		expect(container.querySelector('[role="dialog"]')).toBeTruthy();
		expect(container.textContent).toContain("Talk A · Ada");
		expect(container.textContent).toContain("Talk B · Grace, Alan");
		expect(container.textContent).toMatch(/have not been informed/i);

		const sendButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Send to 2",
		);
		expect(sendButton).toBeTruthy();
		await act(async () => sendButton?.click());

		expect(fetch).toHaveBeenCalledWith(
			"/api/admin/events/aie-sandbox/submissions/notify",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					submissionIds: ["sub-1", "sub-2"],
					email: {
						send: true,
						subject: "You're accepted",
						text: "Welcome aboard",
					},
				}),
			}),
		);
		expect(refresh).toHaveBeenCalled();
	});

	it("disables send when outcomes are mixed", async () => {
		await act(async () => {
			root.render(
				<BulkNotifyBar
					eventSlug="aie-sandbox"
					recipients={recipients}
					defaultSubject=""
					defaultText=""
					mixedOutcomes
				/>,
			);
		});

		const openButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Review and notify 2",
		);
		await act(async () => openButton?.click());

		expect(container.textContent).toMatch(/mixes accept, decline, and waitlist/i);
		const sendButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Send to 2",
		);
		expect(sendButton).toBeTruthy();
		expect(sendButton?.hasAttribute("disabled")).toBe(true);
		await act(async () => sendButton?.click());
		expect(fetch).not.toHaveBeenCalled();
	});
});
