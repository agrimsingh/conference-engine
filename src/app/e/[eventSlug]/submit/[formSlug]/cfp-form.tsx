"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buttonClasses, INPUT_CLASSES } from "@/components/ui";
import {
	evaluateVisibilityRule,
	type AnswerMap,
	type FormFieldDef,
	type FormSectionDef,
	type SpeakerAnswer,
} from "@/lib/domain";
import { renderFormCopy } from "@/lib/cfp/form-copy";
import { computeCfpProgress } from "@/lib/cfp/form-progress";
import { groupVisibleFieldsBySection } from "@/lib/cfp/form-sections";
import { missingRequiredVisibleMultiselect } from "@/lib/cfp/form-validation";
import { CfpReviewStep } from "./cfp-review-step";

const AUTOSAVE_DELAY_MS = 2_500;

type Props = {
	eventSlug: string;
	formSlug: string;
	eventName: string;
	formTitle: string;
	formDescription: string | null;
	welcomeCopy: string | null;
	thankYouCopy: string | null;
	draftToken: string;
	draftsEnabled: boolean;
	submissionLimit: number;
	fields: FormFieldDef[];
	sections: FormSectionDef[];
};

type FormStep = "edit" | "review";
type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export function CfpForm({
	eventSlug,
	formSlug,
	eventName,
	formTitle,
	formDescription,
	welcomeCopy,
	thankYouCopy,
	draftToken: initialDraftToken,
	draftsEnabled,
	submissionLimit,
	fields,
	sections,
}: Props) {
	const [answers, setAnswers] = useState<AnswerMap>(() => initialAnswers(fields));
	const [submitterName, setSubmitterName] = useState("");
	const [submitterEmail, setSubmitterEmail] = useState("");
	const [draftToken, setDraftToken] = useState(initialDraftToken);
	const [draftNotice, setDraftNotice] = useState<string | null>(null);
	const [resuming, setResuming] = useState(Boolean(initialDraftToken));
	const [errors, setErrors] = useState<string[]>([]);
	const [submissionId, setSubmissionId] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [draftPending, setDraftPending] = useState(false);
	const [invalidMultiselectKey, setInvalidMultiselectKey] = useState<string | null>(null);
	const [step, setStep] = useState<FormStep>("edit");
	const [activeSectionKey, setActiveSectionKey] = useState<string | null>(null);
	const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
	const fieldRefs = useRef<Record<string, HTMLFieldSetElement | null>>({});
	const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const autosaveSnapshot = useRef<string>("");
	const busy = submitting || draftPending || resuming;

	const visibleFields = useMemo(
		() => fields.filter((f) => evaluateVisibilityRule(f.visibilityRule, answers)),
		[fields, answers],
	);

	const sectionGroups = useMemo(
		() => groupVisibleFieldsBySection(sections, visibleFields),
		[sections, visibleFields],
	);

	const showSectionNav = sections.length > 0 && sectionGroups.some((group) => group.section !== null);

	useEffect(() => {
		if (!showSectionNav) {
			setActiveSectionKey(null);
			return;
		}
		setActiveSectionKey((current) => {
			if (current && sectionGroups.some((group) => group.section?.key === current)) return current;
			return sectionGroups.find((group) => group.section)?.section?.key ?? null;
		});
	}, [showSectionNav, sectionGroups]);

	const fieldsForStep = useMemo(() => {
		if (!showSectionNav || !activeSectionKey) return visibleFields;
		const group = sectionGroups.find((item) => item.section?.key === activeSectionKey);
		return group?.fields ?? visibleFields;
	}, [activeSectionKey, sectionGroups, showSectionNav, visibleFields]);

	const progress = useMemo(
		() => computeCfpProgress(fields, answers, { name: submitterName, email: submitterEmail }),
		[answers, fields, submitterEmail, submitterName],
	);

	useEffect(() => {
		if (!initialDraftToken) return;
		let active = true;
		void fetch(`/api/e/${eventSlug}/submit/${formSlug}/draft?token=${encodeURIComponent(initialDraftToken)}`, { cache: "no-store" })
			.then(async (response) => ({ response, body: await readJson<{ ok?: boolean; error?: string; draft?: { submitterName?: string; submitterEmail?: string; answers?: AnswerMap; submissionId?: string | null } }>(response) }))
			.then(({ response, body }) => {
				if (!active) return;
				if (!response.ok || !body?.ok || !body.draft) {
					setErrors([body?.error ?? "Your draft link is invalid or expired."]);
					return;
				}
				setSubmitterName(body.draft.submitterName ?? "");
				setSubmitterEmail(body.draft.submitterEmail ?? "");
				setAnswers(mergeAnswers(fields, body.draft.answers ?? {}));
				autosaveSnapshot.current = draftPayloadKey(body.draft.submitterName ?? "", mergeAnswers(fields, body.draft.answers ?? {}));
				if (body.draft.submissionId) setSubmissionId(body.draft.submissionId);
				else setDraftNotice("Draft restored. Keep saving while you work.");
			})
			.catch(() => active && setErrors(["We couldn't restore that draft. Try the link again."]))
			.finally(() => active && setResuming(false));
		return () => { active = false; };
	}, [eventSlug, fields, formSlug, initialDraftToken]);

	async function requestResumeLink() {
		setErrors([]);
		setDraftNotice(null);
		if (!isPlausibleEmail(submitterEmail)) {
			setErrors(["Enter a valid email address before requesting a resume link."]);
			return;
		}
		setDraftPending(true);
		try {
			const response = await fetch(`/api/e/${eventSlug}/submit/${formSlug}/draft`, {
				method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: submitterEmail, submitterName, answers }),
			});
			if (!response.ok) { setErrors(["We couldn't send a resume link. Check your email and try again."]); return; }
			setDraftNotice("If that email can save drafts, a resume link is on its way. Your current answers were saved with it.");
		} catch { setErrors(["We couldn't send a resume link. Check your connection and try again."]); }
		finally { setDraftPending(false); }
	}

	const persistDraft = useCallback(async (args: { silent?: boolean } = {}) => {
		if (!draftToken) return;
		if (!args.silent) setDraftPending(true);
		else setAutosaveStatus("saving");
		try {
			const response = await fetch(`/api/e/${eventSlug}/submit/${formSlug}/draft/save`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: draftToken, submitterName, answers }),
			});
			const body = await readJson<{ ok?: boolean; error?: string; token?: string }>(response);
			if (!response.ok || !body?.ok || !body.token) {
				const message = body?.error ?? "Couldn't save the draft. Your existing draft remains unchanged.";
				if (args.silent) {
					setAutosaveStatus("error");
					return;
				}
				setErrors([message]);
				return;
			}
			setDraftToken(body.token);
			window.history.replaceState(null, "", `?draft=${encodeURIComponent(body.token)}`);
			autosaveSnapshot.current = draftPayloadKey(submitterName, answers);
			if (args.silent) setAutosaveStatus("saved");
			else setDraftNotice("Draft saved. This link is private; you can also use the emailed link from another device.");
		} catch {
			if (args.silent) setAutosaveStatus("error");
			else setErrors(["Couldn't save the draft. Your existing draft remains unchanged."]);
		} finally {
			if (!args.silent) setDraftPending(false);
		}
	}, [answers, draftToken, eventSlug, formSlug, submitterName]);

	useEffect(() => {
		if (!draftsEnabled || !draftToken || resuming || step !== "edit" || busy) return;
		const payload = draftPayloadKey(submitterName, answers);
		if (payload === autosaveSnapshot.current) return;
		if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
		autosaveTimer.current = setTimeout(() => {
			void persistDraft({ silent: true });
		}, AUTOSAVE_DELAY_MS);
		return () => {
			if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
		};
	}, [answers, busy, draftToken, draftsEnabled, persistDraft, resuming, step, submitterName]);

	async function saveDraft() {
		if (!draftToken) {
			await requestResumeLink();
			return;
		}
		await persistDraft();
	}

	async function submit() {
		setErrors([]);
		setInvalidMultiselectKey(null);
		setSubmitting(true);
		try {
		if (draftToken) {
			const response = await fetch(`/api/e/${eventSlug}/submit/${formSlug}/draft/finalize`, {
				method: "POST", headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: draftToken, submitterName, answers }),
			});
			const body = await readJson<{ ok?: boolean; errors?: string[]; submissionId?: string }>(response);
			if (!response.ok || !body?.ok || !body.submissionId) { setErrors(body?.errors ?? ["Submission failed"]); return; }
			setSubmissionId(body.submissionId);
			return;
		}
		const response = await fetch(`/api/e/${eventSlug}/submit/${formSlug}`, {
			method: "POST", headers: { "content-type": "application/json" },
			body: JSON.stringify({ submitterName, submitterEmail, answers }),
		});
		const body = await readJson<{ ok?: boolean; errors?: string[]; submissionId?: string }>(response);
		if (!response.ok || !body?.ok || !body.submissionId) { setErrors(body?.errors ?? ["Submission failed"]); return; }
		setSubmissionId(body.submissionId);
		} catch { setErrors(["Submission failed. Check your connection and try again."]); }
		finally { setSubmitting(false); }
	}

	if (submissionId) {
		const renderedThankYou = thankYouCopy?.trim()
			? renderFormCopy(thankYouCopy, { eventName, submitterName: submitterName.trim() || "there", title: formTitle })
			: null;
		return (
			<div className="mx-auto w-full max-w-2xl space-y-5 rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-8">
				<p className="text-xs font-medium uppercase tracking-wide text-emerald-400">
					{eventName}
				</p>
				<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
					Proposal submitted
				</h1>
				<div className="space-y-3 text-pretty text-sm text-neutral-400">
					{renderedThankYou ? <p className="whitespace-pre-wrap text-neutral-300">{renderedThankYou}</p> : <p>
						We received your proposal for{" "}
						<span className="font-medium text-neutral-200">{formTitle}</span>.
						The program committee will review it over the next few weeks.
					</p>}
					<p>
						Check your email for the confirmation and sign in to the proposal portal
						with this email whenever you need to review your submitted proposal or its status.
					</p>
					<p className="text-neutral-500">
						Reference:{" "}
						<code className="rounded-md bg-neutral-950/60 px-1.5 py-0.5 text-xs text-neutral-300">
							{submissionId}
						</code>
					</p>
				</div>
			</div>
		);
	}

	if (step === "review") {
		return (
			<>
				<CfpReviewStep
					submitterName={submitterName}
					submitterEmail={submitterEmail}
					fields={visibleFields}
					answers={answers}
					onBack={() => setStep("edit")}
					onConfirm={() => void submit()}
					busy={submitting}
				/>
				{errors.length > 0 ? (
					<ul className="mx-auto mt-4 w-full max-w-2xl rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
						{errors.map((err) => (
							<li key={err}>{err}</li>
						))}
					</ul>
				) : null}
			</>
		);
	}

	return (
		<form
			className="mx-auto flex w-full max-w-2xl flex-col gap-6"
			onSubmit={(e) => {
				e.preventDefault();
				const missingField = missingRequiredVisibleMultiselect(visibleFields, answers);
				if (missingField) {
					setErrors([]);
					setInvalidMultiselectKey(missingField.key);
					fieldRefs.current[missingField.key]?.focus();
					return;
				}
				setInvalidMultiselectKey(null);
				setErrors([]);
				setStep("review");
			}}
		>
			<header className="space-y-2 border-b border-neutral-800 pb-5">
				<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
					{eventName} · Call for proposals
				</p>
				<h1 className="text-balance text-3xl font-semibold tracking-tight text-neutral-100">
					{formTitle}
				</h1>
				{formDescription ? (
					<p className="text-pretty text-sm text-neutral-400">{formDescription}</p>
				) : (
					<p className="text-pretty text-sm text-neutral-400">
						Pick a format — the form adapts. Submit when you&apos;re ready; we&apos;ll
						confirm what happens next.
					</p>
				)}
				{welcomeCopy ? <p className="text-pretty text-sm text-neutral-300">{welcomeCopy}</p> : null}
				<p className="text-xs text-neutral-500">Submit in English. There is no fee to submit a proposal.</p>
			</header>

			<div className="space-y-2">
				<div className="flex items-center justify-between gap-3 text-xs text-neutral-400">
					<span>Required progress</span>
					<span className="tabular-nums text-neutral-300">
						{progress.completed}/{progress.total}
					</span>
				</div>
				<div
					className="h-2 overflow-hidden rounded-full bg-neutral-800"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={progress.total}
					aria-valuenow={progress.completed}
					aria-label="Required fields completed"
				>
					<div
						className="h-full rounded-full bg-indigo-400 transition-[width] duration-300"
						style={{ width: progress.total > 0 ? `${(progress.completed / progress.total) * 100}%` : "0%" }}
					/>
				</div>
			</div>

			{showSectionNav ? (
				<nav aria-label="Proposal sections" className="flex flex-wrap gap-2">
					{sectionGroups.map((group) => {
						if (!group.section) return null;
						const selected = group.section.key === activeSectionKey;
						return (
							<button
								key={group.section.key}
								type="button"
								aria-current={selected ? "step" : undefined}
								className={`rounded-full px-3 py-1.5 text-sm transition-colors ${selected ? "bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-400/40" : "bg-neutral-900 text-neutral-400 ring-1 ring-neutral-800 hover:text-neutral-200"}`}
								onClick={() => setActiveSectionKey(group.section?.key ?? null)}
							>
								{group.section.title}
							</button>
						);
					})}
				</nav>
			) : null}

			{showSectionNav && activeSectionKey ? (
				<div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-sm text-neutral-300">
					{sectionGroups.find((group) => group.section?.key === activeSectionKey)?.section?.description
						?? sectionGroups.find((group) => group.section?.key === activeSectionKey)?.section?.title}
				</div>
			) : null}

			<section className="grid gap-4 sm:grid-cols-2">
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium text-neutral-200">Your name</span>
					<input
						required
						aria-required="true"
						className={INPUT_CLASSES}
						value={submitterName}
						onChange={(e) => setSubmitterName(e.target.value)}
					/>
				</label>
				<label className="flex flex-col gap-1 text-sm">
					<span className="font-medium text-neutral-200">Your email</span>
					<input
						required
						aria-required="true"
						type="email"
						className={INPUT_CLASSES}
						value={submitterEmail}
						onChange={(e) => setSubmitterEmail(e.target.value)}
					/>
				</label>
			</section>

			{fieldsForStep.map((field) => (
				<FieldInput
					key={field.key}
					field={field}
					value={answers[field.key]}
					fieldsetRef={(element) => { fieldRefs.current[field.key] = element; }}
					errorMessage={invalidMultiselectKey === field.key ? `${field.label} is required` : undefined}
					onChange={(value) => {
						setAnswers((prev) => ({
							...prev,
							[field.key]: value,
						}));
						if (invalidMultiselectKey === field.key) setInvalidMultiselectKey(null);
					}}
				/>
			))}

			{errors.length > 0 ? (
				<ul className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
					{errors.map((err) => (
						<li key={err}>{err}</li>
					))}
				</ul>
			) : null}
			{draftNotice ? <p className="rounded-md border border-indigo-400/30 bg-indigo-400/10 px-3 py-2 text-sm text-indigo-100" role="status">{draftNotice}</p> : null}
			{draftsEnabled && draftToken ? (
				<p className="text-xs text-neutral-500" role="status" aria-live="polite">
					{autosaveStatus === "saving" ? "Autosaving draft…" : null}
					{autosaveStatus === "saved" ? "Draft autosaved." : null}
					{autosaveStatus === "error" ? "Autosave paused. Use Save draft or keep editing." : null}
				</p>
			) : null}

			{draftsEnabled ? (
				<div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-4 text-sm">
					<button type="button" disabled={busy} className={buttonClasses("secondary")} onClick={() => void saveDraft()}>
						{resuming ? "Restoring…" : draftToken ? "Save draft" : "Save and email a resume link"}
					</button>
					<span className="text-neutral-500">Drafts are tied to this email and can be resumed securely.</span>
				</div>
			) : null}
			{submissionLimit > 0 ? <p className="text-xs text-neutral-500">This call accepts up to {submissionLimit} submitted proposals. Availability is confirmed when you submit.</p> : null}

			<button
				type="submit"
				disabled={busy}
				className={`self-start ${buttonClasses("primary")}`}
			>
				Review proposal
			</button>
		</form>
	);
}

function draftPayloadKey(submitterName: string, answers: AnswerMap): string {
	return JSON.stringify({ submitterName, answers });
}

function initialAnswers(fields: FormFieldDef[]): AnswerMap {
	const answers: AnswerMap = {};
	for (const field of fields) {
		if (field.config.kind === "speaker_block") {
			answers[field.key] = Array.from({ length: Math.max(1, field.config.minSpeakers ?? 1) }, () => ({ name: "", email: "", bio: "" })) satisfies SpeakerAnswer[];
		} else if (field.fieldType === "multiselect") {
			answers[field.key] = [];
		} else {
			answers[field.key] = "";
		}
	}
	return answers;
}

function mergeAnswers(fields: FormFieldDef[], saved: AnswerMap): AnswerMap {
	const merged = { ...initialAnswers(fields), ...saved };
	for (const field of fields) {
		if (field.config.kind !== "speaker_block") continue;
		const current = Array.isArray(merged[field.key]) ? merged[field.key] as SpeakerAnswer[] : [];
		const min = Math.max(1, field.config.minSpeakers ?? 1);
		merged[field.key] = [...current, ...Array.from({ length: Math.max(0, min - current.length) }, () => ({ name: "", email: "", bio: "" }))];
	}
	return merged;
}

async function readJson<T>(response: Response): Promise<T | null> {
	try { return await response.json() as T; } catch { return null; }
}

function isPlausibleEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function FieldInput({
	field,
	value,
	onChange,
	fieldsetRef,
	errorMessage,
}: {
	field: FormFieldDef;
	value: unknown;
	onChange: (value: unknown) => void;
	fieldsetRef?: (element: HTMLFieldSetElement | null) => void;
	errorMessage?: string;
}) {
	const label = (
		<span className="font-medium">
			{field.label}
			{field.required ? " *" : ""}
		</span>
	);

	switch (field.config.kind) {
		case "text":
		case "url":
		case "video":
		case "email": {
			const textValue = typeof value === "string" ? value : "";
			const maxLength = field.config.kind === "text" ? field.config.maxLength : undefined;
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					<input
						required={field.required}
						aria-required={field.required || undefined}
						type={
							field.config.kind === "email"
								? "email"
								: field.config.kind === "url" || field.config.kind === "video"
									? "url"
									: "text"
						}
						className={INPUT_CLASSES}
						placeholder={field.config.placeholder}
						maxLength={maxLength}
						value={textValue}
						onChange={(e) => onChange(e.target.value)}
					/>
					{maxLength != null ? (
						<span className="text-xs text-neutral-500 tabular-nums">
							{textValue.length}/{maxLength}
						</span>
					) : null}
				</label>
			);
		}
		case "textarea": {
			const textValue = typeof value === "string" ? value : "";
			const maxLength = field.config.maxLength;
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					<textarea
						required={field.required}
						aria-required={field.required || undefined}
						className={INPUT_CLASSES}
						rows={field.config.rows ?? 4}
						placeholder={field.config.placeholder}
						maxLength={maxLength}
						value={textValue}
						onChange={(e) => onChange(e.target.value)}
					/>
					{maxLength != null ? (
						<span className="text-xs text-neutral-500 tabular-nums">
							{textValue.length}/{maxLength}
						</span>
					) : null}
				</label>
			);
		}
		case "number":
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					<input
						required={field.required}
						aria-required={field.required || undefined}
						type="number"
						className={INPUT_CLASSES}
						min={field.config.min}
						max={field.config.max}
						step={field.config.step}
						value={typeof value === "number" ? value : value === "" ? "" : Number(value)}
						onChange={(e) => {
							const raw = e.target.value;
							onChange(raw === "" ? "" : Number(raw));
						}}
					/>
				</label>
			);
		case "select":
			return (
				<label className="flex flex-col gap-1 text-sm">
					{label}
					{field.helpText ? (
						<span className="text-xs text-neutral-500">{field.helpText}</span>
					) : null}
					<select
						required={field.required}
						aria-required={field.required || undefined}
						className={INPUT_CLASSES}
						value={typeof value === "string" ? value : ""}
						onChange={(e) => onChange(e.target.value)}
					>
						<option value="">Select…</option>
						{field.config.options.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</label>
			);
		case "multiselect":
			return (
				<fieldset
					ref={fieldsetRef}
					tabIndex={-1}
					className="flex flex-col gap-2 text-sm"
					aria-required={field.required || undefined}
					aria-invalid={errorMessage ? true : undefined}
					aria-describedby={errorMessage ? `cfp-field-error-${field.key}` : undefined}
				>
					<legend className="font-medium">{field.label}</legend>
					{errorMessage ? (
						<p id={`cfp-field-error-${field.key}`} role="alert" aria-live="assertive" className="text-sm text-red-300">
							{errorMessage}
						</p>
					) : null}
					{field.config.options.map((opt) => {
						const selected = Array.isArray(value) ? (value as string[]) : [];
						const checked = selected.includes(opt.value);
						return (
							<label key={opt.value} className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={checked}
									onChange={(e) => {
										if (e.target.checked) onChange([...selected, opt.value]);
										else onChange(selected.filter((v) => v !== opt.value));
									}}
								/>
								{opt.label}
							</label>
						);
					})}
				</fieldset>
			);
		case "speaker_block": {
			const speakers = Array.isArray(value) ? (value as SpeakerAnswer[]) : [];
			const min = Math.max(1, field.config.minSpeakers ?? 1);
			const max = field.config.maxSpeakers ?? 4;
			return (
				<fieldset className="flex flex-col gap-3 text-sm" aria-required="true">
					<legend className="font-medium">{field.label} *</legend>
					<p className="text-xs text-neutral-500">
						Add {min}–{max} speakers. The first speaker is the primary contact. Co-speakers are listed
						immediately and get an email to confirm their participation.
					</p>
					{speakers.map((speaker, index) => (
						<div
							key={index}
							className="grid gap-2 rounded-md border border-neutral-800 bg-neutral-900 p-3 sm:grid-cols-2"
						>
							<p className="col-span-full text-xs font-medium uppercase tracking-wide text-neutral-500">
								{index === 0 ? "Primary speaker" : `Co-speaker ${index}`}
							</p>
							<label className="flex flex-col gap-1">
								<span>Name</span>
								<input
									required
									aria-required="true"
									className={INPUT_CLASSES}
									value={speaker.name}
									onChange={(e) => {
										const next = [...speakers];
										next[index] = { ...speaker, name: e.target.value };
										onChange(next);
									}}
								/>
							</label>
							<label className="flex flex-col gap-1">
								<span>Email</span>
								<input
									type="email"
									required
									aria-required="true"
									className={INPUT_CLASSES}
									value={speaker.email}
									onChange={(e) => {
										const next = [...speakers];
										next[index] = { ...speaker, email: e.target.value };
										onChange(next);
									}}
								/>
							</label>
							<label className="col-span-full flex flex-col gap-1">
								<span>Bio</span>
								<textarea
									className={INPUT_CLASSES}
									rows={2}
									value={speaker.bio ?? ""}
									onChange={(e) => {
										const next = [...speakers];
										next[index] = { ...speaker, bio: e.target.value };
										onChange(next);
									}}
								/>
							</label>
							{index > 0 && speakers.length > min ? (
								<button type="button" className="justify-self-start text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-100" onClick={() => onChange(speakers.filter((_, speakerIndex) => speakerIndex !== index))}>Remove co-speaker</button>
							) : null}
						</div>
					))}
					{speakers.length < max ? (
						<button
							type="button"
							className="self-start text-sm text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
							onClick={() =>
								onChange([...speakers, { name: "", email: "", bio: "" }])
							}
						>
							Add co-speaker
						</button>
					) : null}
				</fieldset>
			);
		}
		default: {
			const _exhaustive: never = field.config;
			return _exhaustive;
		}
	}
}
