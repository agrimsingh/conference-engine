// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcceleventsIntegrationPanel } from "./accelevents-integration-panel";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.unstubAllGlobals();
});

describe("Accelevents integration panel", () => {
	it("uses a dry-run request when an organizer previews the sync", async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({
			ok: true,
			dryRun: true,
			configured: true,
			actions: [
				{ kind: "speaker", localId: "person-ada", operation: "create", externalId: null },
			],
			failures: [],
		}), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		await act(async () => root.render(
			<AcceleventsIntegrationPanel
				eventSlug="event-a"
				initialIntegration={{
					configured: true,
					eventUrl: "demo-event",
					externalEventId: 99,
					sessionTypeFormat: "IN_PERSON",
					lastSyncAt: null,
					lastSyncError: null,
				}}
			/>,
		));
		const preview = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Preview D1 changes");
		const push = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Push reviewed preview");
		if (!preview) throw new Error("Preview button missing");
		if (!push) throw new Error("Push button missing");
		expect(push.disabled).toBe(true);
		await act(async () => preview.click());

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/admin/events/event-a/integrations/accelevents/sync",
			expect.objectContaining({ body: JSON.stringify({ dryRun: true }), method: "POST" }),
		);
		expect(container.textContent).toContain("Preview: 1 create");
		expect(push.disabled).toBe(false);
	});

	it("keeps a failed push result visible for the organizer to review", async () => {
		const responses = [
			{ status: 200, body: { ok: true, dryRun: true, configured: true, actions: [{ kind: "speaker", localId: "person-ada", operation: "create", externalId: null }], failures: [] } },
			{ status: 502, body: { ok: false, dryRun: false, configured: true, actions: [{ kind: "speaker", localId: "person-ada", operation: "create", externalId: null }], failures: [{ kind: "speaker", localId: "person-ada", message: "Accelevents denied speaker update" }] } },
		];
		const fetchMock = vi.fn(async () => {
			const next = responses.shift();
			if (!next) throw new Error("Unexpected request");
			return new Response(JSON.stringify(next.body), { status: next.status });
		});
		vi.stubGlobal("fetch", fetchMock);

		await act(async () => root.render(
			<AcceleventsIntegrationPanel
				eventSlug="event-a"
				initialIntegration={{ configured: true, eventUrl: "demo-event", externalEventId: 99, sessionTypeFormat: "IN_PERSON", lastSyncAt: null, lastSyncError: null }}
			/>,
		));
		const button = (label: string): HTMLButtonElement => {
			const found = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === label);
			if (!found) throw new Error(`${label} button missing`);
			return found;
		};
		await act(async () => button("Preview D1 changes").click());
		await act(async () => button("Push reviewed preview").click());

		expect(fetchMock).toHaveBeenLastCalledWith(
			"/api/admin/events/event-a/integrations/accelevents/sync",
			expect.objectContaining({ body: JSON.stringify({ dryRun: false, confirmed: true }), method: "POST" }),
		);
		expect(container.textContent).toContain("speaker person-ada: Accelevents denied speaker update");
	});
});
