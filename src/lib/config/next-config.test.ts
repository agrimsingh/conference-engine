import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	initOpenNextCloudflareForDev: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
	initOpenNextCloudflareForDev: mocks.initOpenNextCloudflareForDev,
}));

beforeEach(() => {
	vi.resetModules();
	mocks.initOpenNextCloudflareForDev.mockReset();
});

afterEach(() => vi.unstubAllEnvs());

describe("Next Cloudflare development bindings", () => {
	it("does not initialize the local proxy during production builds", async () => {
		vi.stubEnv("NODE_ENV", "production");

		await import("../../../next.config");

		expect(mocks.initOpenNextCloudflareForDev).not.toHaveBeenCalled();
	});

	it("initializes the local proxy in development", async () => {
		vi.stubEnv("NODE_ENV", "development");

		await import("../../../next.config");

		expect(mocks.initOpenNextCloudflareForDev).toHaveBeenCalledOnce();
	});
});
