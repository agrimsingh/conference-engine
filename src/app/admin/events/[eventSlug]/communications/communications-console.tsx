"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { AdminSectionShell } from "@/components/admin-section-shell";
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
	calendar_reschedule: "Schedule change",
};

type SectionId = "templates" | "reminders" | "history";

const SECTIONS = [
	{
		id: "templates" as const,
		label: "Message templates",
		description:
			"Use variables such as {{event_name}}, {{submitter_name}}, {{title}}, and the context-specific links shown by each send.",
	},
	{
		id: "reminders" as const,
		label: "Task reminders",
		description:
			"Each person gets one grouped email. Retrying reuses the same deterministic delivery key, so sent messages are not duplicated.",
	},
	{
		id: "history" as const,
		label: "Delivery history",
		description:
			"Delivery records for this event, including provider ID and any confirmed error.",
	},
];

function parseSection(value: string | null): SectionId {
	switch (value) {
		case "reminders":
		case "history":
		case "templates":
			return value;
		default:
			return "templates";
	}
}

type Props = {
	eventSlug: string;
	templates: EventMessageTemplateRow[];
	deliveries: DeliveryHistoryRow[];
	reminders: ReminderRecipientRow[];
};

export function CommunicationsConsole({ eventSlug, templates, deliveries, reminders }: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const section = parseSection(searchParams.get("section"));
	const saved = new Map(templates.map((template) => [template.template_key, template]));
	const [key, setKey] = useState<EditableMessageTemplateKey>("submission_received");
	const initial = saved.get(key);
	const [subject, setSubject] = useState(initial?.subject_template ?? defaultMessageTemplate(key).subject);
	const [text, setText] = useState(initial?.text_template ?? defaultMessageTemplate(key).text);
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	const setSection = useCallback(
		(next: SectionId) => {
			const params = new URLSearchParams(searchParams.toString());
			if (next === "templates") params.delete("section");
			else params.set("section", next);
			const query = params.toString();
			router.replace(
				query
					? `/admin/events/${eventSlug}/communications?${query}`
					: `/admin/events/${eventSlug}/communications`,
				{ scroll: false },
			);
		},
		[eventSlug, router, searchParams],
	);

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
			const data = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !data.ok) setNotice(data.error ?? "Template save failed");
			else {
				setNotice("Saved. Future sends use this copy.");
				router.refresh();
			}
		} catch {
			setNotice("Network error");
		} finally {
			setPending(false);
		}
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
			const data = (await response.json()) as {
				ok?: boolean;
				sent?: number;
				skipped?: number;
				error?: string;
			};
			if (!response.ok || !data.ok) setNotice(data.error ?? "Reminder send failed");
			else {
				setNotice(`${data.sent ?? 0} sent, ${data.skipped ?? 0} safely skipped.`);
				router.refresh();
			}
		} catch {
			setNotice("Network error");
		} finally {
			setPending(false);
		}
	}

	async function retryDelivery(deliveryKey: string) {
		setPending(true);
		setNotice(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/communications/${encodeURIComponent(deliveryKey)}/retry`,
				{ method: "POST" },
			);
			const data = (await response.json()) as {
				ok?: boolean;
				error?: string;
				delivery?: { status?: string };
			};
			if (!response.ok || !data.ok) setNotice(data.error ?? "Delivery retry failed");
			else {
				setNotice(
					data.delivery?.status === "skipped"
						? "Delivery is already in flight or sent."
						: "Delivery replay started.",
				);
				router.refresh();
			}
		} catch {
			setNotice("Network error");
		} finally {
			setPending(false);
		}
	}

	const noticeNode = notice ? (
		<p
			className={noticeClasses(
				notice.includes("failed") || notice === "Network error" ? "negative" : "positive",
			)}
		>
			{notice}
		</p>
	) : null;

	return (
		<AdminSectionShell
			ariaLabel="Communications sections"
			mobileLabel="Section"
			sections={SECTIONS}
			section={section}
			onSectionChange={setSection}
			notice={noticeNode}
		>
			{section === "templates" ? (
				<div>
					<div className="mb-4 flex flex-wrap items-baseline justify-end gap-3">
						<StatusPill tone="neutral">{templates.length} customized</StatusPill>
					</div>
					<div className="grid gap-3 md:grid-cols-[13rem_1fr]">
						<label className="text-sm text-neutral-300">
							Template
							<select
								value={key}
								onChange={(event) => select(event.target.value as EditableMessageTemplateKey)}
								className={`mt-1 w-full ${INPUT_CLASSES}`}
							>
								{EDITABLE_MESSAGE_TEMPLATE_KEYS.map((templateKey) => (
									<option key={templateKey} value={templateKey}>
										{LABELS[templateKey]}
									</option>
								))}
							</select>
						</label>
						<div className="space-y-2">
							<label className="block text-sm text-neutral-300">
								Subject
								<input
									value={subject}
									onChange={(event) => setSubject(event.target.value)}
									className={`mt-1 w-full ${INPUT_CLASSES}`}
								/>
							</label>
							<label className="block text-sm text-neutral-300">
								Body
								<textarea
									value={text}
									onChange={(event) => setText(event.target.value)}
									rows={10}
									className={`mt-1 w-full ${INPUT_CLASSES} font-mono text-xs`}
								/>
							</label>
							<button
								type="button"
								disabled={pending || !subject.trim() || !text.trim()}
								onClick={() => void saveTemplate()}
								className={buttonClasses("primary", "sm")}
							>
								{pending ? "Saving…" : "Save template"}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{section === "reminders" ? (
				<div>
					<div className="mb-4 flex flex-wrap items-baseline justify-end gap-3">
						<button
							type="button"
							disabled={pending || reminders.length === 0}
							onClick={() => void sendReminder()}
							className={buttonClasses("secondary", "sm")}
						>
							Send all reminders
						</button>
					</div>
					{reminders.length === 0 ? (
						<p className="text-sm text-neutral-500">No required tasks are outstanding.</p>
					) : (
						<ul className="divide-y divide-neutral-800">
							{reminders.map((recipient) => (
								<li
									key={recipient.person_id}
									className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
								>
									<span>
										<span className="font-medium text-neutral-200">
											{recipient.name || recipient.email}
										</span>
										<span className="text-neutral-500">
											{" "}
											· {recipient.pending_count} pending · {recipient.email}
										</span>
									</span>
									<span className="flex items-center gap-2">
										<StatusPill
											tone={
												recipient.last_delivery_status === "sent"
													? "positive"
													: recipient.last_delivery_status === "failed"
														? "negative"
														: "neutral"
											}
										>
											{recipient.last_delivery_status ?? "not sent"}
										</StatusPill>
										<button
											type="button"
											disabled={pending}
											onClick={() => void sendReminder([recipient.person_id])}
											className={buttonClasses("secondary", "sm")}
										>
											Retry person
										</button>
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			) : null}

			{section === "history" ? (
				<div>
					{deliveries.length === 0 ? (
						<p className="text-sm text-neutral-500">No email deliveries yet.</p>
					) : (
						<ul className="divide-y divide-neutral-800">
							{deliveries.map((delivery) => (
								<li key={delivery.delivery_key} className="py-3 text-sm">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="font-medium text-neutral-200">
											{delivery.template_key} · {delivery.to_email}
										</span>
										<span className="flex items-center gap-2">
											<StatusPill
												tone={
													delivery.status === "sent"
														? "positive"
														: delivery.status === "failed"
															? "negative"
															: "neutral"
												}
											>
												{delivery.status}
											</StatusPill>
											{delivery.replayable === 1 &&
											(delivery.status === "failed" || Boolean(delivery.error)) ? (
												<button
													type="button"
													disabled={pending}
													onClick={() => void retryDelivery(delivery.delivery_key)}
													className={buttonClasses("secondary", "sm")}
												>
													Retry delivery
												</button>
											) : null}
										</span>
									</div>
									<p className="mt-1 break-all text-xs text-neutral-500">
										Provider: {delivery.provider_id ?? "—"} · Attempts: {delivery.attempt_count}{" "}
										· {new Date(delivery.updated_at).toLocaleString()}
									</p>
									{delivery.error ? (
										<p className="mt-1 text-xs text-red-300">{delivery.error}</p>
									) : null}
								</li>
							))}
						</ul>
					)}
				</div>
			) : null}
		</AdminSectionShell>
	);
}
