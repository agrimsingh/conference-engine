// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PublicEmbedPayload } from "@/lib/embeds/embed";
import {
	AgendaWidget,
	ItineraryWidget,
	SessionsWidget,
	SpeakersWidget,
} from "./embed-widgets";

let container: HTMLDivElement;
let root: Root;

const payload: PublicEmbedPayload = {
	ok: true,
	event: { slug: "devflow", name: "DevFlow Conf", timezone: "UTC" },
	embed: {
		slug: "program",
		name: "Program",
		widgetType: "sessions",
		config: {
			brandColor: "#2563eb",
			trackIds: [],
			formats: [],
			rooms: [],
			visibleFields: [
				"title",
				"time",
				"room",
				"track",
				"speakers",
				"abstract",
				"format",
				"bio",
				"jobTitle",
				"company",
				"headshot",
			],
		},
	},
	sessions: [
		{
			id: "session-1",
			title: "Taming CI",
			abstract: "A sufficiently long description that should start collapsed and expand when requested. ".repeat(4),
			format: "Talk",
			room: "Hall A",
			trackId: "platform",
			track: "Platform & Infra",
			startsAt: Date.parse("2027-05-12T09:00:00Z"),
			endsAt: Date.parse("2027-05-12T10:00:00Z"),
			speakers: [{ id: "speaker-1", name: "Priya Raman", jobTitle: "Staff Engineer", company: "Acme", headshotUrl: null, url: "/e/devflow/speakers/speaker-1" }],
			url: "/e/devflow/sessions/session-1",
		},
		{
			id: "session-2",
			title: "Designing Reliable Agents",
			abstract: "Practical agent evaluation patterns.",
			format: "Workshop",
			room: "Room B",
			trackId: "ai",
			track: "Applied AI",
			startsAt: Date.parse("2027-05-13T11:00:00Z"),
			endsAt: Date.parse("2027-05-13T12:30:00Z"),
			speakers: [{ id: "speaker-2", name: "Sam Lee", jobTitle: "Founder", company: "Build Co", headshotUrl: "/headshot", url: "/e/devflow/speakers/speaker-2" }],
			url: "/e/devflow/sessions/session-2",
		},
	],
	speakers: [
		{
			id: "speaker-1",
			name: "Priya Raman",
			bio: "Priya builds dependable delivery platforms.",
			jobTitle: "Staff Engineer",
			company: "Acme",
			headshotUrl: null,
			url: "/e/devflow/speakers/speaker-1",
			sessions: [{ id: "session-1", title: "Taming CI", startsAt: Date.parse("2027-05-12T09:00:00Z"), endsAt: Date.parse("2027-05-12T10:00:00Z"), room: "Hall A", url: "/e/devflow/sessions/session-1" }],
		},
		{
			id: "speaker-2",
			name: "Sam Lee",
			bio: "Sam designs agent products.",
			jobTitle: "Founder",
			company: "Build Co",
			headshotUrl: "/headshot",
			url: "/e/devflow/speakers/speaker-2",
			sessions: [{ id: "session-2", title: "Designing Reliable Agents", startsAt: Date.parse("2027-05-13T11:00:00Z"), endsAt: Date.parse("2027-05-13T12:30:00Z"), room: "Room B", url: "/e/devflow/sessions/session-2" }],
		},
	],
	itineraryUrl: "/e/devflow/schedule?view=itinerary&embed=program",
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
	const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
	Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
	element.dispatchEvent(new Event(element instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
}

describe("public embed widgets", () => {
	it("searches sessions by title and speaker, updates the count, filters every facet, and expands descriptions", async () => {
		await act(async () => root.render(<SessionsWidget payload={payload} />));
		const search = container.querySelector('input[type="search"]') as HTMLInputElement;
		await act(async () => setValue(search, "Raman"));
		expect(container.textContent).toContain("1 result");
		expect(container.textContent).toContain("Taming CI");
		expect(container.textContent).not.toContain("Designing Reliable Agents");
		await act(async () => setValue(search, ""));
		for (const [label, value] of [["Track", "Applied AI"], ["Format", "Workshop"], ["Room", "Room B"]]) {
			const select = container.querySelector(`select[aria-label="${label}"]`) as unknown as HTMLSelectElement;
			await act(async () => setValue(select, value));
			expect(container.textContent).toContain("1 result");
			await act(async () => setValue(select, "all"));
		}
		const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Show more");
		expect(button).toBeDefined();
		await act(async () => button?.click());
		expect(container.textContent).toContain("Show less");
		expect(container.textContent).toContain("Staff Engineer");
		expect(container.textContent).toContain("Acme");
	});

	it("renders a searchable speaker list with a fallback, biography, affiliation, and rich detail links", async () => {
		await act(async () => root.render(<SpeakersWidget payload={payload} gallery={false} />));
		const fallback = container.querySelector('svg[aria-label="Illustrated speaker portrait"]');
		expect(fallback).not.toBeNull();
		expect(fallback?.getAttribute("data-avatar-variant")).toBeTruthy();
		expect(container.textContent).toContain("Priya builds dependable delivery platforms.");
		expect(container.textContent).toContain("Staff Engineer");
		expect(container.querySelector('a[href="/e/devflow/speakers/speaker-1"]')).not.toBeNull();
		expect(container.querySelector('a[href="/e/devflow/sessions/session-1"]')?.textContent).toContain("Taming CI");
		const search = container.querySelector('input[type="search"]') as HTMLInputElement;
		await act(async () => setValue(search, "Priya Raman"));
		expect(container.textContent).toContain("1 speaker");
		expect(container.textContent).not.toContain("Sam Lee");
	});

	it("renders a searchable speaker gallery with headshots, graceful fallback, and interactive details", async () => {
		await act(async () => root.render(<SpeakersWidget payload={payload} gallery />));
		expect(container.querySelector('img[src*="speaker-2"]')).not.toBeNull();
		expect(container.querySelector('svg[aria-label="Illustrated speaker portrait"]')).not.toBeNull();
		const priyaDetails = container.querySelector('button[aria-label="View details for Priya Raman"]') as HTMLButtonElement;
		expect(priyaDetails).not.toBeNull();
		await act(async () => priyaDetails.click());
		const dialog = container.querySelector('[role="dialog"]');
		expect(dialog?.getAttribute("aria-modal")).toBe("true");
		expect(dialog?.parentElement?.previousElementSibling?.hasAttribute("inert")).toBe(true);
		expect(dialog?.textContent).toContain("Priya builds dependable delivery platforms.");
		expect(dialog?.querySelector('a[href="/e/devflow/sessions/session-1"]')?.textContent).toContain("Taming CI");
		expect(dialog?.querySelector('a[href="/e/devflow/speakers/speaker-1"]')?.textContent).toContain("View full speaker profile");
		expect(container.querySelectorAll('button[aria-label^="View details for "]')).toHaveLength(2);
		const close = [...dialog!.querySelectorAll("button")].find((button) => button.textContent === "Close details");
		const lastLink = [...dialog!.querySelectorAll("a")].at(-1) as HTMLAnchorElement;
		lastLink.focus();
		await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })));
		expect(document.activeElement).toBe(close);
		close?.focus();
		await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
		expect(document.activeElement).toBe(lastLink);
		await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(priyaDetails);
		await act(async () => priyaDetails.click());
		const reopenedDialog = container.querySelector('[role="dialog"]')!;
		await act(async () => reopenedDialog.parentElement?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(priyaDetails);
		await act(async () => priyaDetails.click());
		const closeAgain = [...container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent === "Close details");
		await act(async () => closeAgain?.click());
		expect(container.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(priyaDetails);
		const search = container.querySelector('input[type="search"]') as HTMLInputElement;
		await act(async () => setValue(search, "Sam"));
		expect(container.textContent).toContain("Sam designs agent products.");
		expect(container.querySelector('a[href="/e/devflow/speakers/speaker-2"]')).not.toBeNull();
	});

	it("does not render speaker portraits when the headshot field is hidden", async () => {
		const withoutHeadshots = {
			...payload,
			embed: {
				...payload.embed,
				config: {
					...payload.embed.config,
					visibleFields: payload.embed.config.visibleFields.filter((field) => field !== "headshot"),
				},
			},
		};
		await act(async () => root.render(<SpeakersWidget payload={withoutHeadshots} gallery />));
		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector('svg[aria-label="Illustrated speaker portrait"]')).toBeNull();
		expect(container.textContent).toContain("Priya Raman");
	});

	it("navigates agenda days and opens a rich session detail", async () => {
		await act(async () => root.render(<AgendaWidget payload={payload} />));
		expect(container.textContent).toContain("Taming CI");
		expect(container.textContent).not.toContain("Designing Reliable Agents");
		const secondDay = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("May 13"));
		await act(async () => secondDay?.click());
		expect(container.textContent).toContain("Designing Reliable Agents");
		const session = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Designing Reliable Agents"));
		await act(async () => session?.click());
		expect(container.textContent).toContain("11:00 AM–12:30 PM");
		expect(container.textContent).toContain("Practical agent evaluation patterns.");
		expect(container.textContent).toContain("Workshop");
		expect(container.textContent).toContain("Applied AI");
		expect(container.textContent).toContain("Founder");
		expect(container.textContent).toContain("Build Co");
		expect(container.textContent).toContain("Close details");
	});

	it("honors agenda visible fields in cards and details while preserving configured speaker affiliations", async () => {
		const configuredAgenda = {
			...payload,
			embed: {
				...payload.embed,
				widgetType: "agenda" as const,
				config: {
					...payload.embed.config,
					visibleFields: ["title", "speakers", "jobTitle"] as PublicEmbedPayload["embed"]["config"]["visibleFields"],
				},
			},
		};
		await act(async () => root.render(<AgendaWidget payload={configuredAgenda} />));
		expect(container.textContent).toContain("Taming CI");
		expect(container.textContent).toContain("Priya Raman");
		expect(container.textContent).toContain("Staff Engineer");
		expect(container.textContent).not.toContain("Acme");
		expect(container.textContent).not.toContain("Hall A");
		expect(container.textContent).not.toContain("Platform & Infra");
		expect(container.textContent).not.toContain("Talk");
		expect(container.textContent).not.toContain("9:00 AM");
		const session = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("Taming CI"));
		await act(async () => session?.click());
		expect(container.textContent).toContain("Close details");
		expect(container.textContent).toContain("Priya Raman");
		expect(container.textContent).not.toContain("A sufficiently long description");
		expect(container.textContent).not.toContain("Room: Hall A");
	});

	it("renders chronological itinerary day navigation and rich cards linked to the filtered itinerary", async () => {
		await act(async () => root.render(<ItineraryWidget payload={payload} />));
		expect(container.querySelector('a[href="/e/devflow/schedule?view=itinerary&embed=program"]')).not.toBeNull();
		expect(container.textContent).toContain("A sufficiently long description");
		expect(container.textContent).toContain("Staff Engineer");
		expect(container.textContent).toContain("Platform & Infra");
		const secondDay = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes("May 13"));
		await act(async () => secondDay?.click());
		expect(container.textContent).toContain("Designing Reliable Agents");
		expect(container.textContent).not.toContain("Taming CI");
	});
});
