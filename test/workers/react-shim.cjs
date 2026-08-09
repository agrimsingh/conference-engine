// Stands in for "react" inside vitest-pool-workers, where the real package
// fails to load from this spaces-in-path checkout. CJS so next's internal
// require("react") keeps working. Matches React.cache's behavior outside a
// render: no memoization.
module.exports = {
	cache(fn) {
		return fn;
	},
};
