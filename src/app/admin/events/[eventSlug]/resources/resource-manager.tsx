"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import { AdminSectionShell } from "@/components/admin-section-shell";
import { buttonClasses, EmptyState, INPUT_CLASSES, noticeClasses, StatusPill } from "@/components/ui";
import { emptyNextActionHref } from "@/lib/admin/empty-next-action";
import type { PortalResourceRow } from "@/lib/db/types";

type ResourceDraft = {
	title: string;
	slug: string;
	resourceType: "rich_text" | "embed";
	content: string;
	embed: string;
	published: boolean;
};
const EMPTY_DRAFT: ResourceDraft = {
	title: "",
	slug: "",
	resourceType: "rich_text",
	content: "",
	embed: "",
	published: false,
};

type SectionId = "list" | "create";

const SECTIONS = [
	{
		id: "list" as const,
		label: "Portal wiki",
		description: "Published resources appear in the speaker portal. Drafts stay organizer-only.",
	},
	{
		id: "create" as const,
		label: "New resource",
		description:
			"Portal notes are always escaped as text. Embeds accept an HTTPS URL or one iframe and run inside an isolated sandbox without same-origin access.",
	},
];

function parseSection(value: string | null): SectionId {
	switch (value) {
		case "create":
		case "list":
			return value;
		default:
			return "list";
	}
}

function fromResource(resource: PortalResourceRow): ResourceDraft {
	return {
		title: resource.title,
		slug: resource.slug,
		resourceType: resource.resource_type,
		content: resource.content,
		embed: resource.embed_url ?? "",
		published: resource.published === 1,
	};
}

export function ResourceManager({
	eventSlug,
	initialResources,
	readOnly,
}: {
	eventSlug: string;
	initialResources: readonly PortalResourceRow[];
	readOnly: boolean;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const section = parseSection(searchParams.get("section"));
	const [resources, setResources] = useState(initialResources);
	const [draft, setDraft] = useState<ResourceDraft>(EMPTY_DRAFT);
	const [notice, setNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const setSection = useCallback(
		(next: SectionId) => {
			const params = new URLSearchParams(searchParams.toString());
			if (next === "list") params.delete("section");
			else params.set("section", next);
			const query = params.toString();
			router.replace(
				query
					? `/admin/events/${eventSlug}/resources?${query}`
					: `/admin/events/${eventSlug}/resources`,
				{ scroll: false },
			);
		},
		[eventSlug, router, searchParams],
	);

	async function send(
		path: string,
		method: "POST" | "PATCH" | "DELETE",
		body?: ResourceDraft,
	): Promise<PortalResourceRow | null> {
		const response = await fetch(`/api/admin/events/${eventSlug}/resources${path}`, {
			method,
			headers: body ? { "content-type": "application/json" } : undefined,
			body: body ? JSON.stringify(body) : undefined,
		});
		const value: unknown = await response.json();
		if (!response.ok || !isResourceResponse(value)) throw new Error(errorFromResponse(value));
		return value.resource ?? null;
	}

	async function create(): Promise<void> {
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			const resource = await send("", "POST", draft);
			if (!resource) throw new Error("Resource creation failed");
			setResources((current) => [...current, resource]);
			setDraft(EMPTY_DRAFT);
			setNotice("Resource created.");
			setSection("list");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Resource creation failed");
		} finally {
			setBusy(false);
		}
	}

	async function save(resourceId: string, next: ResourceDraft): Promise<void> {
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			const resource = await send(`/${resourceId}`, "PATCH", next);
			if (!resource) throw new Error("Resource update failed");
			setResources((current) => current.map((item) => (item.id === resource.id ? resource : item)));
			setNotice("Resource saved.");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Resource update failed");
		} finally {
			setBusy(false);
		}
	}

	async function remove(resourceId: string): Promise<void> {
		if (!window.confirm("Delete this portal resource? This cannot be undone.")) return;
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			await send(`/${resourceId}`, "DELETE");
			setResources((current) => current.filter((resource) => resource.id !== resourceId));
			setNotice("Resource deleted.");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Resource deletion failed");
		} finally {
			setBusy(false);
		}
	}

	const noticeNode = (
		<>
			{readOnly ? (
				<p className={noticeClasses("warning")}>
					Demo events are read-only. You can inspect resources here, but cannot change them.
				</p>
			) : null}
			{notice ? (
				<p role="status" className={noticeClasses("positive")}>
					{notice}
				</p>
			) : null}
			{error ? (
				<p role="alert" className={noticeClasses("negative")}>
					{error}
				</p>
			) : null}
		</>
	);

	return (
		<AdminSectionShell
			ariaLabel="Portal resource sections"
			mobileLabel="Section"
			sections={SECTIONS}
			section={section}
			onSectionChange={setSection}
			notice={noticeNode}
		>
			{section === "list" ? (
				resources.length ? (
					<div className="divide-y divide-neutral-800">
						{resources.map((resource) => (
							<ResourceEditor
								key={resource.id}
								resource={resource}
								disabled={busy || readOnly}
								onSave={save}
								onDelete={remove}
							/>
						))}
					</div>
				) : (
					<EmptyState
						title="No portal resources yet"
						description="Publish a guide, venue map, or other speaker reference when it is ready."
					>
						{readOnly ? null : (
							<p className="mt-4">
								<Link
									href={emptyNextActionHref(eventSlug, "resources.create")}
									className={buttonClasses("primary")}
								>
									Create resource
								</Link>
							</p>
						)}
					</EmptyState>
				)
			) : null}

			{section === "create" ? (
				<div>
					<ResourceForm draft={draft} onChange={setDraft} disabled={busy || readOnly} />
					<button
						type="button"
						disabled={busy || readOnly}
						onClick={() => void create()}
						className={`mt-4 ${buttonClasses("primary")}`}
					>
						{busy ? "Saving…" : "Create resource"}
					</button>
				</div>
			) : null}
		</AdminSectionShell>
	);
}

function ResourceEditor({
	resource,
	disabled,
	onSave,
	onDelete,
}: {
	resource: PortalResourceRow;
	disabled: boolean;
	onSave: (id: string, draft: ResourceDraft) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}) {
	const [expanded, setExpanded] = useState(false);
	const [draft, setDraft] = useState(() => fromResource(resource));

	return (
		<div className="py-4">
			<div className="flex items-center justify-between gap-3">
				<button
					type="button"
					onClick={() => setExpanded((current) => !current)}
					className="min-w-0 flex-1 text-left"
				>
					<span className="text-sm font-medium text-neutral-100">{resource.title}</span>
					<span className="mt-0.5 block text-xs text-neutral-500">{resource.slug}</span>
				</button>
				<span className="flex shrink-0 items-center gap-2">
					<StatusPill tone={draft.published ? "positive" : "neutral"}>
						{draft.published ? "Published" : "Draft"}
					</StatusPill>
					<button
						type="button"
						onClick={() => setExpanded((current) => !current)}
						className={buttonClasses("secondary", "sm")}
					>
						{expanded ? "Collapse" : "Edit"}
					</button>
				</span>
			</div>
			{expanded ? (
				<div className="mt-4">
					<ResourceForm draft={draft} onChange={setDraft} disabled={disabled} />
					<div className="mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							disabled={disabled}
							onClick={() => void onSave(resource.id, draft)}
							className={buttonClasses("secondary", "sm")}
						>
							Save
						</button>
						<button
							type="button"
							disabled={disabled}
							onClick={() => void onDelete(resource.id)}
							className={buttonClasses("secondary", "sm")}
						>
							Delete
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}

function ResourceForm({
	draft,
	onChange,
	disabled,
}: {
	draft: ResourceDraft;
	onChange: (draft: ResourceDraft) => void;
	disabled: boolean;
}) {
	function set<K extends keyof ResourceDraft>(key: K, value: ResourceDraft[K]): void {
		onChange({ ...draft, [key]: value });
	}
	return (
		<div className="grid gap-3">
			<div className="grid gap-3 sm:grid-cols-2">
				<label className="text-sm">
					Title
					<input
						className={`mt-1 w-full ${INPUT_CLASSES}`}
						value={draft.title}
						disabled={disabled}
						onChange={(event) => set("title", event.target.value)}
					/>
				</label>
				<label className="text-sm">
					Slug
					<input
						className={`mt-1 w-full ${INPUT_CLASSES}`}
						value={draft.slug}
						disabled={disabled}
						onChange={(event) => set("slug", event.target.value)}
					/>
				</label>
			</div>
			<label className="text-sm">
				Resource type
				<select
					className={`mt-1 w-full ${INPUT_CLASSES}`}
					value={draft.resourceType}
					disabled={disabled}
					onChange={(event) =>
						set("resourceType", event.target.value === "embed" ? "embed" : "rich_text")
					}
				>
					<option value="rich_text">Portal note</option>
					<option value="embed">Sandboxed embed</option>
				</select>
			</label>
			{draft.resourceType === "rich_text" ? (
				<label className="text-sm">
					Portal note
					<textarea
						className={`mt-1 min-h-32 w-full ${INPUT_CLASSES}`}
						value={draft.content}
						disabled={disabled}
						onChange={(event) => set("content", event.target.value)}
					/>
				</label>
			) : (
				<label className="text-sm">
					Embed URL or iframe
					<input
						className={`mt-1 w-full ${INPUT_CLASSES}`}
						value={draft.embed}
						disabled={disabled}
						placeholder="https://… or <iframe src=…></iframe>"
						onChange={(event) => set("embed", event.target.value)}
					/>
				</label>
			)}
			<label className="flex items-center gap-2 text-sm text-neutral-300">
				<input
					type="checkbox"
					checked={draft.published}
					disabled={disabled}
					onChange={(event) => set("published", event.target.checked)}
				/>
				Visible in the speaker portal
			</label>
		</div>
	);
}

function isResourceResponse(value: unknown): value is { ok: true; resource?: PortalResourceRow } {
	return typeof value === "object" && value !== null && "ok" in value && value.ok === true;
}
function errorFromResponse(value: unknown): string {
	return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string"
		? value.error
		: "Request failed";
}
