import { describe, expect, it } from "vitest";
import { assertMembershipRoleChange } from "./queries";

describe("canonical ownership", () => {
	it("does not permit a standalone owner demotion", () => {
		expect(() => assertMembershipRoleChange("owner", "admin")).toThrow("Transfer ownership");
		expect(() => assertMembershipRoleChange("admin", "admin")).not.toThrow();
	});
});
