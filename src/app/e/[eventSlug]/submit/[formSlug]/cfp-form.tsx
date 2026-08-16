"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CfpFieldInput } from "@/components/cfp-field-input";
import { buttonClasses, INPUT_CLASSES } from "@/components/ui";
import { evaluateVisibilityRule, type AnswerMap } from "@/lib/domain/visibility";
import { groupFieldsBySection, type FormSection } from "@/lib/domain/form-sections";
import { type FormFieldDef, type SpeakerAnswer } from "@/lib/domain/form-fields";
import { formatCfpDeadline } from "@/lib/cfp/closes-at";
import { renderFormCopy } from "@/lib/cfp/form-copy";
import { computeCfpProgress } from "@/lib/cfp/form-progress";
import { missingRequiredVisibleMultiselect } from "@/lib/cfp/form-validation";
import { CfpReviewStep } from "./cfp-review-step";

const AUTOSAVE_DELAY_MS = 2_500;
const SPEAKER_PORTAL_HREF = "/portal";
const PORTAL_REDIRECT_SECONDS = 10;
const DEMO_READ_ONLY_MESSAGE =
	"This is a read-only demo. Fields stay interactive so you can explore conditionals, but submissions, drafts, and uploads are not saved. Create your own event to submit for real.";

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
	closesAt?: number | null;
	timezone?: string;
	fields: FormFieldDef[];
	sections?: FormSection[];
	readOnly?: boolean;
};

type FormStep = "edit" | "review";
type AutosaveStatus = "idle" | "saving" | "saved" | "error";

type PortalRedirectState =
	| { status: "counting"; secondsLeft: number }
	| { status: "paused"; secondsLeft: number };

function assignLocation(href: string) {
	window.location.assign(href);
}

function pauseRedirect(prev: PortalRedirectState): PortalRedirectState {
	return { status: "paused", secondsLeft: prev.secondsLeft };
}

export function SpeakerPortalRedirect({
	href = SPEAKER_PORTAL_HREF,
	delaySeconds = PORTAL_REDIRECT_SECONDS,
	navigate = assignLocation,
}: {
	href?: string;
	delaySeconds?: number;
	navigate?: (href: string) => void;
}) {
	const [redirect, setRedirect] = useState<PortalRedirectState>({
		status: "counting",
		secondsLeft: delaySeconds,
	});

	useEffect(() => {
		if (redirect.status !== "counting") return;
		if (redirect.secondsLeft <= 0) {
			navigate(href);
			return;
		}
		const timer = window.setTimeout(() => {
			setRedirect((prev) =>
				prev.status === "counting"
					? { status: "counting", secondsLeft: prev.secondsLeft - 1 }
					: prev,
			);
		}, 1_000);
		return () => window.clearTimeout(timer);
	}, [href, navigate, redirect]);

	return (
		<div className="space-y-3 border-t border-neutral-800 pt-5">
			<p className="text-sm text-neutral-400" aria-live="polite">
				{redirect.status === "counting" ? (
					<>
						Redirecting to the speaker portal in{" "}
						<span className="font-medium text-neutral-200 tabular-nums">
							{redirect.secondsLeft}
						</span>
						s…
					</>
				) : (
					<>Auto-redirect paused. You can still open the speaker portal anytime.</>
				)}
			</p>
			<div className="flex flex-wrap items-center gap-3">
				<a
					href={href}
					className={buttonClasses("primary")}
					onClick={() => setRedirect(pauseRedirect)}
				>
					Go to speaker portal
				</a>
				{redirect.status === "counting" ? (
					<button
						type="button"
						className={buttonClasses("secondary")}
						onClick={() => setRedirect(pauseRedirect)}
					>
						Stay on this page
					</button>
				) : null}
			</div>
		</div>
	);
}

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
	closesAt = null,
	timezone = "UTC",
	fields,
	sections = [],
	readOnly = false,
}: Props) {
	const [answers, setAnswers] = useState<AnswerMap>(() => initialAnswers(fields));
	const [submitterName, setSubmitterName] = useState("");
	const [submitterEmail, setSubmitterEmail] = useState("");
	const [draftToken, setDraftToken] = useState(readOnly ? "" : initialDraftToken);
	const [draftNotice, setDraftNotice] = useState<string | null>(null);
	const [resuming, setResuming] = useState(Boolean(!readOnly && initialDraftToken));
	const [errors, setErrors] = useState<string[]>([]);
	const [submissionId, setSubmissionId] = useState<string | null>(null);
	const [showConfirmation, setShowConfirmation] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [draftPending, setDraftPending] = useState(false);
	const [uploadBusyKey, setUploadBusyKey] = useState<string | null>(null);
	const [invalidMultiselectKey, setInvalidMultiselectKey] = useState<string | null>(null);
	const [step, setStep] = useState<FormStep>("edit");
	const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);
	const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
	const fieldRefs = useRef<Record<string, HTMLFieldSetElement | null>>({});
	const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const autosaveSnapshot = useRef<string>("");
	const draftsAllowed = draftsEnabled && !readOnly;
	const busy = submitting || draftPending || resuming || uploadBusyKey !== null;
	const uploadBaseUrl = readOnly ? undefined : `/api/e/${eventSlug}/submit/${formSlug}/upload`;

	const visibleFields = useMemo(
		() => fields.filter((f) => evaluateVisibilityRule(f.visibilityRule, answers)),
		[fields, answers],
	);

	const sectionGroups = useMemo(
		() => groupFieldsBySection(visibleFields, sections),
		[visibleFields, sections],
	);

	const showSectionNav = sections.length > 0 && sectionGroups.some((group) => group.section !== null);

	const activeSectionKey = useMemo(() => {
		if (!showSectionNav) return null;
		if (
			selectedSectionKey &&
			sectionGroups.some((group) => group.section?.key === selectedSectionKey)
		) {
			return selectedSectionKey;
		}
		return sectionGroups.find((group) => group.section)?.section?.key ?? null;
	}, [showSectionNav, selectedSectionKey, sectionGroups]);

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
		if (readOnly || !initialDraftToken) return;
		let active = true;
		void fetch(`/api/e/${eventSlug}/submit/${formSlug}/draft?token=${encodeURIComponent(initialDraftToken)}`, { cache: "no-store" })
			.then(async (response) => ({ response, body: await readJson<{ ok?: boolean; error?: string; draft?: { submitterName?: string; submitterEmail?: string; answers?: AnswerMap; submissionId?: string | null; status?: string } }>(response) }))
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
				if (body.draft.submissionId) {
					setSubmissionId(body.draft.submissionId);
					setShowConfirmation(false);
					setDraftNotice("Editing your submitted proposal. Changes save while the CFP is open.");
				} else {
					setDraftNotice("Draft restored. Keep saving while you work.");
				}
			})
			.catch(() => active && setErrors(["We couldn't restore that draft. Try the link again."]))
			.finally(() => active && setResuming(false));
		return () => { active = false; };
	}, [eventSlug, fields, formSlug, initialDraftToken, readOnly]);

	async function requestResumeLink() {
		if (readOnly) {
			setErrors([DEMO_READ_ONLY_MESSAGE]);
			return;
		}
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
		if (readOnly) {
			if (!args.silent) setErrors([DEMO_READ_ONLY_MESSAGE]);
			return;
		}
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
	}, [answers, draftToken, eventSlug, formSlug, readOnly, submitterName]);

	useEffect(() => {
		if (!draftsAllowed || !draftToken || resuming || step !== "edit" || busy) return;
		const payload = draftPayloadKey(submitterName, answers);
		if (payload === autosaveSnapshot.current) return;
		if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
		autosaveTimer.current = setTimeout(() => {
			void persistDraft({ silent: true });
		}, AUTOSAVE_DELAY_MS);
		return () => {
			if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
		};
	}, [answers, busy, draftToken, draftsAllowed, persistDraft, resuming, step, submitterName]);

	async function saveDraft() {
		if (readOnly) {
			setErrors([DEMO_READ_ONLY_MESSAGE]);
			return;
		}
		if (!draftToken) {
			await requestResumeLink();
			return;
		}
		await persistDraft();
	}

	async function submit() {
		if (readOnly) {
			setErrors([DEMO_READ_ONLY_MESSAGE]);
			return;
		}
		setErrors([]);
		setInvalidMultiselectKey(null);
		setSubmitting(true);
		try {
		if (draftToken) {
			const response = await fetch(`/api/e/${eventSlug}/submit/${formSlug}/draft/finalize`, {
				method: "POST", headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: draftToken, submitterName, answers }),
			});
			const body = await readJson<{ ok?: boolean; errors?: string[]; submissionId?: string; editToken?: string }>(response);
			if (!response.ok || !body?.ok || !body.submissionId) { setErrors(body?.errors ?? ["Submission failed"]); return; }
			setSubmissionId(body.submissionId);
			if (body.editToken) {
				setDraftToken(body.editToken);
				window.history.replaceState(null, "", `?draft=${encodeURIComponent(body.editToken)}`);
			}
			setShowConfirmation(true);
			return;
		}
		const response = await fetch(`/api/e/${eventSlug}/submit/${formSlug}`, {
			method: "POST", headers: { "content-type": "application/json" },
			body: JSON.stringify({ submitterName, submitterEmail, answers }),
		});
		const body = await readJson<{ ok?: boolean; errors?: string[]; submissionId?: string }>(response);
		if (!response.ok || !body?.ok || !body.submissionId) { setErrors(body?.errors ?? ["Submission failed"]); return; }
		setSubmissionId(body.submissionId);
		setShowConfirmation(true);
		} catch { setErrors(["Submission failed. Check your connection and try again."]); }
		finally { setSubmitting(false); }
	}

	function renderFieldInput(field: FormFieldDef) {
		return (
			<CfpFieldInput
				key={field.key}
				field={field}
				value={answers[field.key]}
				fieldsetRef={(element) => { fieldRefs.current[field.key] = element; }}
				errorMessage={invalidMultiselectKey === field.key ? `${field.label} is required` : undefined}
				uploadBaseUrl={uploadBaseUrl}
				uploadBusyKey={uploadBusyKey}
				onUploadStart={setUploadBusyKey}
				onUploadEnd={() => setUploadBusyKey(null)}
				onChange={(value) => {
					setAnswers((prev) => ({ ...prev, [field.key]: value }));
					if (invalidMultiselectKey === field.key) setInvalidMultiselectKey(null);
				}}
			/>
		);
	}

	if (submissionId && showConfirmation) {
		const renderedThankYou = thankYouCopy?.trim()
			? renderFormCopy(thankYouCopy, { eventName, submitterName: submitterName.trim() || "there", title: formTitle })
			: null;
		const canEdit = Boolean(draftToken && draftsEnabled);
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
					{canEdit ? (
						<p>
							You can still edit this proposal while the call for proposals is open.
						</p>
					) : null}
					<p className="text-neutral-500">
						Reference:{" "}
						<code className="rounded-md bg-neutral-950/60 px-1.5 py-0.5 text-xs text-neutral-300">
							{submissionId}
						</code>
					</p>
				</div>
				{canEdit ? (
					<button
						type="button"
						className={buttonClasses("secondary")}
						onClick={() => {
							setShowConfirmation(false);
							setStep("edit");
							setDraftNotice("Editing your submitted proposal. Changes save while the CFP is open.");
						}}
					>
						Edit proposal
					</button>
				) : null}
				<SpeakerPortalRedirect />
			</div>
		);
	}

	if (step === "review") {
		return (
			<>
				{readOnly ? <DemoReadOnlyBanner /> : null}
				<CfpReviewStep
					submitterName={submitterName}
					submitterEmail={submitterEmail}
					fields={visibleFields}
					answers={answers}
					onBack={() => setStep("edit")}
					onConfirm={() => void submit()}
					busy={submitting}
					updating={Boolean(submissionId)}
					readOnly={readOnly}
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
			{readOnly ? <DemoReadOnlyBanner /> : null}
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
				{closesAt ? (
					<p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
						Deadline: submissions accepted until{" "}
						<span className="font-medium">{formatCfpDeadline(closesAt, timezone)}</span>.
					</p>
				) : null}
				{submissionLimit > 0 && !readOnly ? (
					<p className="text-xs text-neutral-500">
						Submission limit: {submissionLimit} proposal
						{submissionLimit === 1 ? "" : "s"} per submitter.
					</p>
				) : null}
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
						className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
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
								className={`rounded-full px-3 py-1.5 text-sm transition-colors ${selected ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40" : "bg-neutral-900 text-neutral-400 ring-1 ring-neutral-800 hover:text-neutral-200"}`}
								onClick={() => setSelectedSectionKey(group.section?.key ?? null)}
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

			{showSectionNav ? (
				fieldsForStep.map((field) => renderFieldInput(field))
			) : (
				sectionGroups.map((group, index) => (
					<section key={group.section?.key ?? `ungrouped-${index}`} className="space-y-4">
						{group.section ? (
							<div className="border-b border-neutral-800 pb-2">
								<h2 className="text-sm font-medium text-neutral-200">{group.section.title}</h2>
								{group.section.description ? (
									<p className="mt-1 text-xs text-neutral-500">{group.section.description}</p>
								) : null}
							</div>
						) : null}
						{group.fields.map((field) => renderFieldInput(field))}
					</section>
				))
			)}

			{errors.length > 0 ? (
				<ul className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
					{errors.map((err) => (
						<li key={err}>{err}</li>
					))}
				</ul>
			) : null}
			{draftNotice ? <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100" role="status">{draftNotice}</p> : null}
			{draftsAllowed && draftToken ? (
				<p className="text-xs text-neutral-500" role="status" aria-live="polite">
					{autosaveStatus === "saving" ? "Autosaving draft…" : null}
					{autosaveStatus === "saved" ? "Draft autosaved." : null}
					{autosaveStatus === "error" ? "Autosave paused. Use Save draft or keep editing." : null}
				</p>
			) : null}

			{draftsAllowed ? (
				<div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-4 text-sm">
					<button type="button" disabled={busy} className={buttonClasses("secondary")} onClick={() => void saveDraft()}>
						{resuming ? "Restoring…" : draftToken ? "Save draft" : "Save and email a resume link"}
					</button>
					<span className="text-neutral-500">Drafts are tied to this email and can be resumed securely.</span>
				</div>
			) : null}
			<button
				type="submit"
				disabled={busy}
				className={`self-start ${buttonClasses("primary")}`}
			>
				{readOnly ? "Review sample answers" : "Review proposal"}
			</button>
		</form>
	);
}

function DemoReadOnlyBanner() {
	return (
		<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100" role="status">
			<p className="font-medium text-amber-200">Read-only demo</p>
			<p className="mt-1 text-pretty text-amber-100/90">{DEMO_READ_ONLY_MESSAGE}</p>
			<p className="mt-2 flex flex-wrap gap-4">
				<Link className="font-medium text-emerald-300 underline underline-offset-2 hover:text-emerald-200" href="/admin">
					Create your event
				</Link>
				<Link className="font-medium text-amber-100 underline underline-offset-2 hover:text-white" href="/demo">
					Demo launcher
				</Link>
			</p>
		</div>
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
		} else if (field.config.kind === "file_upload") {
			answers[field.key] = null;
		} else if (field.config.kind === "number") {
			answers[field.key] = field.config.defaultValue ?? "";
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
