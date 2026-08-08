import { default as handler } from "./.open-next/worker.js";

export { EventRoom } from "./src/durable-objects/EventRoom";

export default {
	fetch: handler.fetch.bind(handler),
} satisfies ExportedHandler<CloudflareEnv>;
