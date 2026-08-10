// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionButtons } from "./decision-buttons";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh }),
}));

let container: HTMLDivElement;
let root: Root;

const previews = {
	accept: { subject: "Accepted", text: "Welcome" },
	waitlist: { subject: "Waitlisted", text: "Please wait" },
	reject: { subject: "Rejected", text: "Thank you" },
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	refresh.mockReset();
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.unstubAllGlobals();
});

async function openAcceptance(): Promise<void> {
	await act(async () => root.render(
		<DecisionButtons
			eventSlug="test-event"
			submissionId="submission-1"
			status="under_review"
			previews={previews}
		/>,
	));
	const accept = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Accept");
	if (!accept) throw new Error("Accept button missing");
	await act(async () => accept.click());
}

describe("DecisionButtons email choice", () => {
	it("sends the rendered decision email by default", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);
		await openAcceptance();

		const sendNow = container.querySelector<HTMLInputElement>('input[type="radio"]');
		expect(sendNow?.checked).toBe(true);
		const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Accept + send email");
		if (!confirm) throw new Error("Confirm button missing");
		await act(async () => confirm.click());

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/admin/events/test-event/submissions/submission-1/decide",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					action: "accept",
					email: { send: true, subject: "Accepted", text: "Welcome" },
				}),
			}),
		);
	});

	it("keeps status-only decisions explicit", async () => {
		const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);
		await openAcceptance();

		const statusOnly = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1];
		if (!statusOnly) throw new Error("Status-only choice missing");
		await act(async () => statusOnly.click());
		const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Accept without email");
		if (!confirm) throw new Error("Status-only confirm button missing");
		await act(async () => confirm.click());

		const request = fetchMock.mock.calls[0]?.[1];
		expect(request).toMatchObject({
			method: "POST",
			body: JSON.stringify({ action: "accept", email: { send: false } }),
		});
	});
});
