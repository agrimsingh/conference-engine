import type { PortalResourceRow } from "@/lib/db/types";

export function PortalResourceList({ resources }: { resources: readonly PortalResourceRow[] }) {
	return <div className="space-y-3">{resources.map((resource) => <article key={resource.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"><h3 className="text-sm font-medium text-neutral-100">{resource.title}</h3>{resource.resource_type === "rich_text" ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-300">{resource.content}</p> : resource.embed_url ? <iframe className="mt-3 h-64 w-full rounded-md border border-neutral-800 bg-neutral-950 sm:h-96" title={resource.title} src={resource.embed_url} sandbox="allow-scripts allow-popups allow-presentation" allow="fullscreen" allowFullScreen referrerPolicy="no-referrer" loading="lazy" /> : null}</article>)}</div>;
}
