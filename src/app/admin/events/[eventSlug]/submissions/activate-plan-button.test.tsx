// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivatePlanButton } from "./activate-plan-button";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
	default: ({
		href,
		children,
		...rest
	}: {
		href: string;
		children: ReactNode;
		className?: string;
	}) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

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

describe("ActivatePlanButton", () => {
	it("links to the admin review workspace when the plan is already active", async () => {
		await act(async () => {
			root.render(<ActivatePlanButton eventSlug="demo-cfp" planActive />);
		});

		const link = container.querySelector("a");
		expect(link?.getAttribute("href")).toBe("/admin/events/demo-cfp/review");
		expect(link?.textContent).toMatch(/Open review workspace/i);
		expect(container.querySelector("button")).toBeNull();
	});
});
