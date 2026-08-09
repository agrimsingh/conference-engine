"use client";

import { useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses } from "@/components/ui";
import {
	ACCELEVENTS_SESSION_TYPE_FORMATS,
	type AcceleventsIntegrationStatus,
	type AcceleventsSessionTypeFormat,
} from "@/lib/integrations/accelevents/repository";

type Props = {
	eventSlug: string;
	initialIntegration: AcceleventsIntegrationStatus;
};

type Message = { readonly tone: "positive" | "negative"; readonly text: string } | null;
type SyncAction = { readonly kind: "speaker" | "session"; readonly operation: "create" | "update" | "skip" | "reconcile" };
type SyncFailure = { readonly kind: "speaker" | "session"; readonly localId: string; readonly message: string };
type SyncResponse = {
	readonly dryRun: boolean;
	readonly actions: readonly SyncAction[];
	readonly failures: readonly SyncFailure[];
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSessionTypeFormat(value: string): value is AcceleventsSessionTypeFormat {
	return ACCELEVENTS_SESSION_TYPE_FORMATS.some((format) => format === value);
}

function syncResponse(value: unknown): SyncResponse | null {
	if (!isObject(value) || !Array.isArray(value.actions) || !Array.isArray(value.failures) || typeof value.dryRun !== "boolean") return null;
	const actions = value.actions.flatMap((action): readonly SyncAction[] => {
		if (!isObject(action)) return [];
		if ((action.kind !== "speaker" && action.kind !== "session") || (action.operation !== "create" && action.operation !== "update" && action.operation !== "skip" && action.operation !== "reconcile")) return [];
		return [{ kind: action.kind, operation: action.operation }];
	});
	const failures = value.failures.flatMap((failure): readonly SyncFailure[] => {
		if (!isObject(failure)) return [];
		if ((failure.kind !== "speaker" && failure.kind !== "session") || typeof failure.localId !== "string" || typeof failure.message !== "string") return [];
		return [{ kind: failure.kind, localId: failure.localId, message: failure.message }];
	});
	return { dryRun: value.dryRun, actions, failures };
}

function countActions(actions: readonly SyncAction[], operation: SyncAction["operation"]): number {
	return actions.filter((action) => action.operation === operation).length;
}

export function AcceleventsIntegrationPanel({ eventSlug, initialIntegration }: Props) {
	const [integration, setIntegration] = useState(initialIntegration);
	const [eventUrl, setEventUrl] = useState(initialIntegration.eventUrl ?? "");
	const [externalEventId, setExternalEventId] = useState(initialIntegration.externalEventId === null ? "" : String(initialIntegration.externalEventId));
	const [apiKey, setApiKey] = useState("");
	const [sessionTypeFormat, setSessionTypeFormat] = useState<AcceleventsSessionTypeFormat>(initialIntegration.sessionTypeFormat ?? "IN_PERSON");
	const [message, setMessage] = useState<Message>(null);
	const [sync, setSync] = useState<SyncResponse | null>(null);
	const [saving, setSaving] = useState(false);

	async function request(path: string, init: RequestInit): Promise<{ readonly response: Response; readonly body: Record<string, unknown> | null }> {
		const response = await fetch(`/api/admin/events/${eventSlug}/integrations/accelevents${path}`, init);
		const body: unknown = await response.json();
		return { response, body: isObject(body) ? body : null };
	}

	async function saveConfiguration(event: React.FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		setSaving(true);
		setMessage(null);
		try {
			const { response, body } = await request("", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ eventUrl, externalEventId: Number(externalEventId), apiKey, sessionTypeFormat }),
			});
			const next = body?.integration;
			if (!response.ok || !isObject(next)) {
				setMessage({ tone: "negative", text: typeof body?.error === "string" ? body.error : "Could not save Accelevents configuration." });
				return;
			}
			const nextEventUrl = typeof next.eventUrl === "string" ? next.eventUrl : null;
			const nextExternalEventId = typeof next.externalEventId === "number" && Number.isInteger(next.externalEventId) && next.externalEventId > 0 ? next.externalEventId : null;
			const nextSessionType = typeof next.sessionTypeFormat === "string" && isSessionTypeFormat(next.sessionTypeFormat) ? next.sessionTypeFormat : null;
			if (!nextEventUrl || !nextExternalEventId || !nextSessionType) {
				setMessage({ tone: "negative", text: "The saved integration response was invalid." });
				return;
			}
			setIntegration({
				configured: next.configured === true,
				eventUrl: nextEventUrl,
				externalEventId: nextExternalEventId,
				sessionTypeFormat: nextSessionType,
				lastSyncAt: typeof next.lastSyncAt === "number" ? next.lastSyncAt : null,
				lastSyncError: typeof next.lastSyncError === "string" ? next.lastSyncError : null,
			});
			setEventUrl(nextEventUrl);
			setExternalEventId(String(nextExternalEventId));
			setApiKey("");
			setSync(null);
			setMessage({ tone: "positive", text: "Accelevents is connected. The API key is stored server-side and is not shown again." });
		} catch (error) {
			setMessage({ tone: "negative", text: error instanceof Error ? error.message : "Network error. The configuration was not saved." });
		} finally {
			setSaving(false);
		}
	}

	async function runSync(dryRun: boolean): Promise<void> {
		setSaving(true);
		setMessage(null);
		try {
			const { response, body } = await request("/sync", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(dryRun ? { dryRun: true } : { dryRun: false, confirmed: true }),
			});
			const next = syncResponse(body);
			if (!next) {
				setMessage({ tone: "negative", text: typeof body?.error === "string" ? body.error : "Accelevents returned an invalid sync response." });
				return;
			}
			setSync(next);
			setMessage(next.failures.length > 0 || !response.ok
				? { tone: "negative", text: `${next.failures.length} Accelevents ${next.failures.length === 1 ? "record failed" : "records failed"}. Review the failure list below.` }
				: { tone: "positive", text: dryRun ? "Preview complete. Nothing was sent to Accelevents." : "Accelevents sync completed." });
		} catch (error) {
			setMessage({ tone: "negative", text: error instanceof Error ? error.message : "Network error. No sync result was received." });
		} finally {
			setSaving(false);
		}
	}

	async function disconnect(): Promise<void> {
		if (!window.confirm("Disconnect Accelevents and remove this event's saved sync mappings?")) return;
		setSaving(true);
		setMessage(null);
		try {
			const { response, body } = await request("", { method: "DELETE" });
			if (!response.ok || body?.ok !== true) {
				setMessage({ tone: "negative", text: typeof body?.error === "string" ? body.error : "Could not disconnect Accelevents." });
				return;
			}
			setIntegration({ configured: false, eventUrl: null, externalEventId: null, sessionTypeFormat: null, lastSyncAt: null, lastSyncError: null });
			setSync(null);
			setApiKey("");
			setMessage({ tone: "positive", text: "Accelevents was disconnected and its local sync mappings were removed." });
		} catch (error) {
			setMessage({ tone: "negative", text: error instanceof Error ? error.message : "Network error. Accelevents remains connected." });
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="mt-8 space-y-6">
			<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5">
				<h2 className="text-lg font-semibold text-neutral-100">Accelevents connection</h2>
				<p className="mt-1 max-w-2xl text-sm text-neutral-400">D1 stays authoritative. This sends speaker profiles and accepted, scheduled, or published sessions one way to Accelevents; it never imports or overwrites D1 data.</p>
				<form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={(event) => void saveConfiguration(event)}>
					<label className="block space-y-1.5 text-sm"><span className="font-medium text-neutral-200">Accelevents event URL or slug</span><input required value={eventUrl} onChange={(event) => { setEventUrl(event.target.value); setSync(null); }} placeholder="https://www.accelevents.com/events/my-event" className={`w-full ${INPUT_CLASSES}`} /></label>
					<label className="block space-y-1.5 text-sm"><span className="font-medium text-neutral-200">Accelevents event ID</span><input required type="number" min="1" step="1" value={externalEventId} onChange={(event) => { setExternalEventId(event.target.value); setSync(null); }} placeholder="12345" className={`w-full ${INPUT_CLASSES}`} /><span className="block text-xs text-neutral-500">Required for bounded exact-email reconciliation after a lost speaker-create response.</span></label>
					<label className="block space-y-1.5 text-sm"><span className="font-medium text-neutral-200">Event type</span><select value={sessionTypeFormat} onChange={(event) => { if (isSessionTypeFormat(event.target.value)) { setSessionTypeFormat(event.target.value); setSync(null); } }} className={`w-full ${INPUT_CLASSES}`}><option value="IN_PERSON">In person</option><option value="VIRTUAL">Virtual</option><option value="HYBRID">Hybrid</option></select></label>
					<label className="block space-y-1.5 text-sm sm:col-span-2"><span className="font-medium text-neutral-200">Accelevents API key</span><input required={!integration.configured} type="password" autoComplete="new-password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); setSync(null); }} placeholder={integration.configured ? "Enter a replacement key to rotate it" : "Paste an API key"} className={`w-full ${INPUT_CLASSES}`} /><span className="block text-xs text-neutral-500">The key is encrypted with this deployment&apos;s AUTH_SECRET and is never returned to the browser.</span></label>
					<div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button disabled={saving} className={buttonClasses(integration.configured ? "secondary" : "primary")}>{saving ? "Saving…" : integration.configured ? "Update connection" : "Connect Accelevents"}</button>{integration.configured ? <button type="button" disabled={saving} onClick={() => void disconnect()} className="text-sm font-medium text-red-300 hover:text-red-200 disabled:opacity-50">Disconnect</button> : null}</div>
				</form>
			</section>

			{integration.configured ? <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-neutral-100">Preview and push</h2><p className="mt-1 text-sm text-neutral-400">Preview first to see each create, update, reconciliation hold, and no-op. A push preserves external IDs and skips records whose D1 payload has not changed.</p></div><p className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-400">Connected: {integration.eventUrl}</p></div><div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={saving} onClick={() => void runSync(true)} className={buttonClasses("secondary")}>Preview D1 changes</button><button type="button" disabled={saving || !(sync?.dryRun && sync.failures.length === 0)} onClick={() => void runSync(false)} className={buttonClasses("primary")}>Push reviewed preview</button></div>{integration.lastSyncError ? <p className="mt-4 text-sm text-red-300">Last sync failure: {integration.lastSyncError}</p> : null}</section> : null}

			{sync ? <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-5"><h2 className="text-lg font-semibold text-neutral-100">{sync.dryRun ? "Preview" : "Latest push"}: {countActions(sync.actions, "create")} create{countActions(sync.actions, "create") === 1 ? "" : "s"}, {countActions(sync.actions, "update")} update{countActions(sync.actions, "update") === 1 ? "" : "s"}, {countActions(sync.actions, "skip")} unchanged</h2>{sync.failures.length > 0 ? <ul className="mt-4 space-y-2">{sync.failures.map((failure) => <li key={`${failure.kind}-${failure.localId}`} className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"><span className="font-medium">{failure.kind} {failure.localId}:</span> {failure.message}</li>)}</ul> : <p className="mt-2 text-sm text-neutral-400">{sync.dryRun ? "This preview made no external requests." : "Every completed item now has a persisted Accelevents ID and payload fingerprint."}</p>}</section> : null}
			{message ? <p aria-live="polite" className={noticeClasses(message.tone)}>{message.text}</p> : null}
		</div>
	);
}
