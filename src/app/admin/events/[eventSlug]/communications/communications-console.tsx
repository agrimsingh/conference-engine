"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses, StatusPill } from "@/components/ui";
import {
	EDITABLE_MESSAGE_TEMPLATE_KEYS,
	defaultMessageTemplate,
	type EditableMessageTemplateKey,
	type EventMessageTemplateRow,
} from "@/lib/email/templates";
import type { DeliveryHistoryRow, ReminderRecipientRow } from "@/lib/email/communications";

const LABELS: Record<EditableMessageTemplateKey, string> = {
	submission_received: "Submission confirmation",
	acceptance: "Acceptance decision",
	rejection: "Rejection decision",
	waitlist: "Waitlist decision",
	portal_magic_link: "Portal invite",
	task_reminder: "Task reminder",
	speaker_announcement: "Speaker announcement",
	calendar_invite: "Schedule and calendar",
};

type Props = {
	eventSlug: string;
	templates: EventMessageTemplateRow[];
	deliveries: DeliveryHistoryRow[];
	reminders: ReminderRecipientRow[];
};

export function CommunicationsConsole({ eventSlug, templates, deliveries, reminders }: Props) {
	const router = useRouter();
	const saved = new Map(templates.map((template) => [template.template_key, template]));
	const [key, setKey] = useState<EditableMessageTemplateKey>("submission_received");
	const initial = saved.get(key);
	const [subject, setSubject] = useState(initial?.subject_template ?? defaultMessageTemplate(key).subject);
	const [text, setText] = useState(initial?.text_template ?? defaultMessageTemplate(key).text);
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	function select(next: EditableMessageTemplateKey) {
		setKey(next);
		const template = saved.get(next);
		const fallback = defaultMessageTemplate(next);
		setSubject(template?.subject_template ?? fallback.subject);
		setText(template?.text_template ?? fallback.text);
		setNotice(null);
	}

	async function saveTemplate() {
		setPending(true);
		setNotice(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/communications`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ templateKey: key, subject, text }),
			});
			const data = await response.json() as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) setNotice(data.error ?? "Template save failed");
			else {
				setNotice("Saved. Future sends use this copy.");
				router.refresh();
			}
		} catch { setNotice("Network error"); }
		finally { setPending(false); }
	}

	async function sendReminder(personIds?: string[]) {
		setPending(true);
		setNotice(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/reminders`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(personIds ? { personIds } : {}),
			});
			const data = await response.json() as { ok?: boolean; sent?: number; skipped?: number; error?: string };
			if (!response.ok || !data.ok) setNotice(data.error ?? "Reminder send failed");
			else {
				setNotice(`${data.sent ?? 0} sent, ${data.skipped ?? 0} safely skipped.`);
				router.refresh();
			}
		} catch { setNotice("Network error"); }
		finally { setPending(false); }
	}

	async function retryDelivery(deliveryKey: string) {
		setPending(true);
		setNotice(null);
		try {
			const response = await fetch(`/api/admin/events/${eventSlug}/communications/${encodeURIComponent(deliveryKey)}/retry`, { method: "POST" });
			const data = await response.json() as { ok?: boolean; error?: string; delivery?: { status?: string } };
			if (!response.ok || !data.ok) setNotice(data.error ?? "Delivery retry failed");
			else { setNotice(data.delivery?.status === "skipped" ? "Delivery is already in flight or sent." : "Delivery replay started."); router.refresh(); }
		} catch { setNotice("Network error"); }
		finally { setPending(false); }
	}

	return <div className="space-y-8">
		<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-3">
				<div><h2 className="font-medium text-neutral-100">Message templates</h2><p className="mt-1 text-sm text-neutral-400">Use variables such as {"{{event_name}}"}, {"{{submitter_name}}"}, {"{{title}}"}, and the context-specific links shown by each send.</p></div>
				<StatusPill tone="neutral">{templates.length} customized</StatusPill>
			</div>
			<div className="mt-4 grid gap-3 md:grid-cols-[13rem_1fr]">
				<label className="text-sm text-neutral-300">Template<select value={key} onChange={(event) => select(event.target.value as EditableMessageTemplateKey)} className={`mt-1 w-full ${INPUT_CLASSES}`}>{EDITABLE_MESSAGE_TEMPLATE_KEYS.map((templateKey) => <option key={templateKey} value={templateKey}>{LABELS[templateKey]}</option>)}</select></label>
				<div className="space-y-2"><label className="block text-sm text-neutral-300">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} className={`mt-1 w-full ${INPUT_CLASSES}`} /></label><label className="block text-sm text-neutral-300">Body<textarea value={text} onChange={(event) => setText(event.target.value)} rows={10} className={`mt-1 w-full ${INPUT_CLASSES} font-mono text-xs`} /></label><button type="button" disabled={pending || !subject.trim() || !text.trim()} onClick={() => void saveTemplate()} className={buttonClasses("primary", "sm")}>{pending ? "Saving…" : "Save template"}</button></div>
			</div>
		</section>

		<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
			<div className="flex flex-wrap items-baseline justify-between gap-3"><div><h2 className="font-medium text-neutral-100">Task reminder cockpit</h2><p className="mt-1 text-sm text-neutral-400">Each person gets one grouped email. Retrying reuses the same deterministic delivery key, so sent messages are not duplicated.</p></div><button type="button" disabled={pending || reminders.length === 0} onClick={() => void sendReminder()} className={buttonClasses("secondary", "sm")}>Send all reminders</button></div>
			{reminders.length === 0 ? <p className="mt-3 text-sm text-neutral-500">No required tasks are outstanding.</p> : <ul className="mt-3 divide-y divide-neutral-800">{reminders.map((recipient) => <li key={recipient.person_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span><span className="font-medium text-neutral-200">{recipient.name || recipient.email}</span><span className="text-neutral-500"> · {recipient.pending_count} pending · {recipient.email}</span></span><span className="flex items-center gap-2"><StatusPill tone={recipient.last_delivery_status === "sent" ? "positive" : recipient.last_delivery_status === "failed" ? "negative" : "neutral"}>{recipient.last_delivery_status ?? "not sent"}</StatusPill><button type="button" disabled={pending} onClick={() => void sendReminder([recipient.person_id])} className={buttonClasses("secondary", "sm")}>Retry person</button></span></li>)}</ul>}
		</section>

		<section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"><div><h2 className="font-medium text-neutral-100">Delivery history</h2><p className="mt-1 text-sm text-neutral-400">Latest {deliveries.length} delivery records for this event, including provider ID and any confirmed error.</p></div>{deliveries.length === 0 ? <p className="mt-3 text-sm text-neutral-500">No email deliveries yet.</p> : <ul className="mt-3 divide-y divide-neutral-800">{deliveries.map((delivery) => <li key={delivery.delivery_key} className="py-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-neutral-200">{delivery.template_key} · {delivery.to_email}</span><span className="flex items-center gap-2"><StatusPill tone={delivery.status === "sent" ? "positive" : delivery.status === "failed" ? "negative" : "neutral"}>{delivery.status}</StatusPill>{delivery.replayable === 1 && (delivery.status === "failed" || Boolean(delivery.error)) ? <button type="button" disabled={pending} onClick={() => void retryDelivery(delivery.delivery_key)} className={buttonClasses("secondary", "sm")}>Retry delivery</button> : null}</span></div><p className="mt-1 break-all text-xs text-neutral-500">Provider: {delivery.provider_id ?? "—"} · Attempts: {delivery.attempt_count} · {new Date(delivery.updated_at).toLocaleString()}</p>{delivery.error ? <p className="mt-1 text-xs text-red-300">{delivery.error}</p> : null}</li>)}</ul>}</section>
		{notice ? <p className={noticeClasses(notice.includes("failed") || notice === "Network error" ? "negative" : "positive")}>{notice}</p> : null}
	</div>;
}
