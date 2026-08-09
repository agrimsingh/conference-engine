// @vitest-environment jsdom

import type { AnchorHTMLAttributes, ImgHTMLAttributes, ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/image", () => ({
	default: (props: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
		const { unoptimized: _unoptimized, ...imageProps } = props;
		void _unoptimized;
		return createElement("img", imageProps);
	},
}));

vi.mock("next/link", () => ({
	default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode }) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

import { PublicSpeakerAvatar } from "./public-speaker-avatar";

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
});

async function renderAvatar(
	props: Partial<React.ComponentProps<typeof PublicSpeakerAvatar>> = {},
) {
	await act(async () => {
		root.render(
			<PublicSpeakerAvatar
				eventSlug="ai-summit"
				personId="person-alex"
				name="Alex Chen"
				hasHeadshot={false}
				{...props}
			/>,
		);
	});
}

describe("PublicSpeakerAvatar", () => {
	it("renders deterministic, varied illustrated fallbacks with an accessible non-duplicated label", async () => {
		await renderAvatar({ personId: "person-alex", name: "Alex Chen" });
		const firstFallback = container.querySelector("svg");
		const firstVariant = firstFallback?.getAttribute("data-avatar-variant");

		expect(firstFallback).not.toBeNull();
		expect(firstFallback?.getAttribute("role")).toBe("img");
		expect(firstFallback?.getAttribute("aria-label")).toBe("Illustrated speaker portrait");
		expect(firstFallback?.querySelector("circle, ellipse, path")).not.toBeNull();
		expect(container.textContent).toBe("Alex Chen");

		await renderAvatar({ personId: "person-taylor", name: "Taylor Singh" });
		const secondVariant = container.querySelector("svg")?.getAttribute("data-avatar-variant");
		expect(secondVariant).not.toBe(firstVariant);

		await renderAvatar({ personId: "person-alex", name: "Alex Chen" });
		expect(container.querySelector("svg")?.getAttribute("data-avatar-variant")).toBe(firstVariant);
	});

	it("prefers a real uploaded headshot and keeps profile links intact", async () => {
		await renderAvatar({ hasHeadshot: true, profileHref: "/e/ai-summit/speakers/person-alex", size: "lg" });

		const image = container.querySelector("img");
		const link = container.querySelector("a");
		expect(image?.getAttribute("src")).toBe("/api/e/ai-summit/people/person-alex/headshot");
		expect(image?.getAttribute("alt")).toBe("");
		expect(container.querySelector("svg")).toBeNull();
		expect(link?.getAttribute("href")).toBe("/e/ai-summit/speakers/person-alex");
		expect(link?.textContent).toBe("Alex Chen");
	});

	it("keeps the illustrated portrait at each public avatar size", async () => {
		for (const [size, dimensions] of [
			["sm", "h-8 w-8"],
			["md", "h-12 w-12"],
			["lg", "h-20 w-20"],
		] as const) {
			await renderAvatar({ size });
			expect(container.querySelector("svg")?.getAttribute("class")).toContain(dimensions);
		}
	});

	it("treats a display name as text instead of avatar markup", async () => {
		const untrustedName = '<img src=x onerror="alert(1)">';
		await renderAvatar({ personId: null, name: untrustedName });

		expect(container.querySelector("svg")).not.toBeNull();
		expect(container.querySelector("img")).toBeNull();
		expect(container.textContent).toBe(untrustedName);
	});
});
