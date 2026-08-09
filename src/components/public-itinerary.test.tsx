// @vitest-environment jsdom

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { itineraryStorageKey, serializeItinerarySelection } from "@/lib/schedule/itinerary";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
	default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => createElement("a", { href, ...props }, children),
}));

import { PublicItinerary } from "./public-itinerary";

const eventSlug = "event-a";
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	vi.useFakeTimers();
	window.localStorage.clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.useRealTimers();
});

function savedSelection(): string[] {
	const raw = window.localStorage.getItem(itineraryStorageKey(eventSlug));
	return raw ? JSON.parse(raw).sessionIds : [];
}

async function renderFilteredItinerary(mode: "itinerary" | "my-schedule" = "itinerary"): Promise<void> {
	await act(async () => {
		root.render(
			<PublicItinerary
				eventSlug={eventSlug}
				timezone="UTC"
				mode={mode}
				eventSessionIds={["session-a", "session-b"]}
				sessions={[{
					id: "slot-a",
					sessionId: "session-a",
					title: "Visible session",
					abstract: "",
					format: "Stage",
					roomName: "Main",
					trackName: "Agents",
					startsAtMs: Date.parse("2026-01-01T10:00:00Z"),
					endsAtMs: Date.parse("2026-01-01T10:30:00Z"),
					dayKey: "2026-01-01",
					detailHref: "/e/event-a/sessions/session-a",
					speakers: [],
				}]}
			/>,
		);
	});
	await act(async () => vi.runAllTimers());
}

describe("PublicItinerary filtered selections", () => {
	it("keeps hidden event selections while toggling a visible filtered session", async () => {
		window.localStorage.setItem(
			itineraryStorageKey(eventSlug),
			serializeItinerarySelection(eventSlug, ["session-a", "session-b"]),
		);

		await renderFilteredItinerary();

		expect(container.textContent).toContain("Visible session");
		expect(container.textContent).not.toContain("Hidden session");
		expect(savedSelection()).toEqual(["session-a", "session-b"]);

		const toggle = container.querySelector("button");
		await act(async () => toggle?.click());
		expect(savedSelection()).toEqual(["session-b"]);

		await act(async () => toggle?.click());
		expect(savedSelection()).toEqual(["session-b", "session-a"]);
	});

	it("shows only the filtered subset in My Schedule without pruning hidden selections", async () => {
		window.localStorage.setItem(
			itineraryStorageKey(eventSlug),
			serializeItinerarySelection(eventSlug, ["session-a", "session-b"]),
		);

		await renderFilteredItinerary("my-schedule");

		expect(container.textContent).toContain("Visible session");
		expect(container.querySelectorAll("li.rounded-lg")).toHaveLength(1);
		expect(savedSelection()).toEqual(["session-a", "session-b"]);
	});
});
