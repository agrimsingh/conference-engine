export { EventRoom } from "./EventRoom";

export default {
	fetch(): Response {
		return new Response("EventRoom development worker");
	},
} satisfies ExportedHandler<CloudflareEnv>;
