"use client";

import { useState } from "react";
import { buttonClasses, INPUT_CLASSES, noticeClasses, StatusPill } from "@/components/ui";

export type ContentRevision = {
	id: string;
	number: number;
	editorName: string;
	createdAt: number;
	snapshot: { title?: string; abstract?: string; bio?: string; headshotAssetId?: string | null };
	restoredFrom: string | null;
};

export type ContentSession = {
	id: string;
	title: string;
	abstract: string;
	status: string;
	contentStatus: "draft" | "in_review" | "approved";
	hasApprovedSnapshot: boolean;
	revisions: ContentRevision[];
};

export type ContentSpeaker = {
	personId: string;
	name: string;
	email: string;
	bio: string;
	hasHeadshot: boolean;
	revisions: ContentRevision[];
};

type Props = {
	eventSlug: string;
	sessions: ContentSession[];
	speakers: ContentSpeaker[];
	view?: "sessions" | "speakers";
};

export function ContentConsole({ eventSlug, sessions, speakers, view }: Props) {
	const [notice, setNotice] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function request(url: string, body: unknown, method = "PATCH") {
		setBusy(true);
		setNotice(null);
		setError(null);
		try {
			const response = await fetch(url, {
				method,
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			});
			const value = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !value.ok) {
				setError(value.error ?? "Save failed");
				return false;
			}
			return true;
		} catch {
			setError("Network error");
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function saveSession(sessionId: string, form: HTMLFormElement) {
		const data = new FormData(form);
		if (
			await request(`/api/admin/events/${eventSlug}/content/sessions/${sessionId}`, {
				title: data.get("title"),
				abstract: data.get("abstract"),
			})
		) {
			setNotice(
				"Session content saved as a new draft revision. Approve it when ready for the public schedule.",
			);
			window.location.reload();
		}
	}

	async function status(sessionId: string, value: string) {
		if (
			await request(`/api/admin/events/${eventSlug}/content/sessions/${sessionId}`, {
				status: value,
			})
		) {
			setNotice(
				value === "approved"
					? "Current revision approved for public publication."
					: `Content marked ${value.replace("_", " ")}.`,
			);
			window.location.reload();
		}
	}

	async function restoreSession(sessionId: string, revisionId: string) {
		if (
			await request(
				`/api/admin/events/${eventSlug}/content/sessions/${sessionId}/restore`,
				{ revisionId },
				"POST",
			)
		) {
			setNotice("Prior session revision restored as a new draft revision.");
			window.location.reload();
		}
	}

	async function saveSpeaker(personId: string, form: HTMLFormElement) {
		const data = new FormData(form);
		if (
			await request(`/api/admin/events/${eventSlug}/content/speakers/${personId}`, {
				bio: data.get("bio"),
			})
		) {
			setNotice("Speaker bio saved with revision history.");
			window.location.reload();
		}
	}

	async function uploadHeadshot(personId: string, form: HTMLFormElement) {
		setBusy(true);
		setNotice(null);
		setError(null);
		try {
			const response = await fetch(
				`/api/admin/events/${eventSlug}/content/speakers/${personId}`,
				{ method: "POST", body: new FormData(form) },
			);
			const value = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !value.ok) setError(value.error ?? "Upload failed");
			else {
				setNotice("Speaker headshot saved with revision history.");
				window.location.reload();
			}
		} catch {
			setError("Network error");
		} finally {
			setBusy(false);
		}
	}

	async function restoreSpeaker(personId: string, revisionId: string) {
		if (
			await request(
				`/api/admin/events/${eventSlug}/content/speakers/${personId}/restore`,
				{ revisionId },
				"POST",
			)
		) {
			setNotice("Prior speaker revision restored.");
			window.location.reload();
		}
	}

	const showSessions = view === undefined || view === "sessions";
	const showSpeakers = view === undefined || view === "speakers";

	return (
		<div className="space-y-6">
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

			{showSessions ? (
				<section className={view ? undefined : "space-y-4"}>
					{view ? null : (
						<>
							<h2 className="text-lg font-medium text-neutral-100">Session content</h2>
							<p className="mt-1 text-sm text-neutral-400">
								Each save is a new draft. Approve to show that version on the public
								schedule and embeds; later drafts stay private until you approve them.
							</p>
						</>
					)}
					{sessions.length === 0 ? (
						<p className={`${view ? "py-2" : "border-t border-neutral-800 py-8"} text-sm text-neutral-500`}>
							No accepted sessions yet.
						</p>
					) : (
						<ul
							className={
								view
									? "divide-y divide-neutral-800"
									: "divide-y divide-neutral-800 border-t border-neutral-800"
							}
						>
							{sessions.map((session) => (
								<li key={session.id} className="space-y-4 py-4">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<p className="font-medium text-neutral-100">{session.title}</p>
										<div className="flex items-center gap-2">
											<StatusPill
												tone={
													session.contentStatus === "approved"
														? "positive"
														: session.contentStatus === "in_review"
															? "warning"
															: "neutral"
												}
											>
												{session.contentStatus === "draft" && session.hasApprovedSnapshot
													? "draft changes · prior approval live"
													: session.contentStatus.replace("_", " ")}
											</StatusPill>
											<span className="text-xs text-neutral-500">
												program: {session.status}
											</span>
										</div>
									</div>
									<form
										className="grid gap-3"
										onSubmit={(event) => {
											event.preventDefault();
											void saveSession(session.id, event.currentTarget);
										}}
									>
										<label className="text-sm text-neutral-300">
											Title
											<input
												required
												maxLength={240}
												name="title"
												defaultValue={session.title}
												className={`mt-1 w-full ${INPUT_CLASSES}`}
											/>
										</label>
										<label className="text-sm text-neutral-300">
											Abstract
											<textarea
												maxLength={8000}
												rows={5}
												name="abstract"
												defaultValue={session.abstract}
												className={`mt-1 w-full ${INPUT_CLASSES}`}
											/>
										</label>
										<div className="flex flex-wrap gap-2">
											<button disabled={busy} className={buttonClasses("secondary", "sm")}>
												Save new revision
											</button>
											<button
												disabled={busy}
												type="button"
												onClick={() => void status(session.id, "in_review")}
												className={buttonClasses("secondary", "sm")}
											>
												Mark in review
											</button>
											<button
												disabled={busy}
												type="button"
												onClick={() => void status(session.id, "approved")}
												className={buttonClasses("primary", "sm")}
											>
												Approve current revision
											</button>
										</div>
									</form>
									<details className="border-t border-neutral-800 pt-3">
										<summary className="cursor-pointer text-sm text-neutral-300">
											Revision history ({session.revisions.length})
										</summary>
										{session.revisions.length ? (
											<ul className="mt-3 divide-y divide-neutral-800">
												{session.revisions.map((revision) => (
													<li
														key={revision.id}
														className="flex flex-wrap items-start justify-between gap-3 py-2 text-xs"
													>
														<div>
															<p className="text-neutral-300">
																Revision {revision.number} · {revision.editorName} ·{" "}
																{new Date(revision.createdAt).toLocaleString()}
															</p>
															<p className="mt-1 text-neutral-500">
																{revision.snapshot.title ?? "Untitled"}
																{revision.restoredFrom ? " · restored" : ""}
															</p>
														</div>
														<button
															disabled={busy}
															onClick={() =>
																void restoreSession(session.id, revision.id)
															}
															className={buttonClasses("secondary", "sm")}
														>
															Restore
														</button>
													</li>
												))}
											</ul>
										) : (
											<p className="mt-2 text-xs text-neutral-500">No edits yet.</p>
										)}
									</details>
								</li>
							))}
						</ul>
					)}
				</section>
			) : null}

			{showSpeakers ? (
				<section className={view ? undefined : "space-y-4"}>
					{view ? null : (
						<h2 className="text-lg font-medium text-neutral-100">Speaker content</h2>
					)}
					{speakers.length === 0 ? (
						<p className={`${view ? "py-2" : "border-t border-neutral-800 py-8"} text-sm text-neutral-500`}>
							No speakers on accepted sessions yet.
						</p>
					) : (
						<ul
							className={
								view
									? "divide-y divide-neutral-800"
									: "divide-y divide-neutral-800 border-t border-neutral-800"
							}
						>
							{speakers.map((speaker) => (
								<li key={speaker.personId} className="space-y-4 py-4">
									<div className="flex items-center justify-between gap-2">
										<div>
											<p className="font-medium text-neutral-100">{speaker.name}</p>
											<p className="text-xs text-neutral-500">{speaker.email}</p>
										</div>
										<StatusPill tone={speaker.hasHeadshot ? "positive" : "warning"}>
											{speaker.hasHeadshot ? "photo set" : "photo missing"}
										</StatusPill>
									</div>
									<form
										onSubmit={(event) => {
											event.preventDefault();
											void saveSpeaker(speaker.personId, event.currentTarget);
										}}
									>
										<label className="text-sm text-neutral-300">
											Bio
											<textarea
												name="bio"
												maxLength={10000}
												rows={5}
												defaultValue={speaker.bio}
												className={`mt-1 w-full ${INPUT_CLASSES}`}
											/>
										</label>
										<button
											disabled={busy}
											className={`${buttonClasses("secondary", "sm")} mt-2`}
										>
											Save bio revision
										</button>
									</form>
									<form
										onSubmit={(event) => {
											event.preventDefault();
											void uploadHeadshot(speaker.personId, event.currentTarget);
										}}
									>
										<label className="text-sm text-neutral-300">
											Replace headshot (PNG, JPEG, or WebP; max 25 MB)
											<input
												required
												name="file"
												type="file"
												accept="image/png,image/jpeg,image/webp"
												className="mt-1 block w-full text-xs text-neutral-400"
											/>
										</label>
										<button
											disabled={busy}
											className={`${buttonClasses("secondary", "sm")} mt-2`}
										>
											Upload headshot
										</button>
									</form>
									{speaker.revisions.length ? (
										<details className="border-t border-neutral-800 pt-3">
											<summary className="cursor-pointer text-xs text-neutral-400">
												Speaker history ({speaker.revisions.length})
											</summary>
											<ul className="mt-2 divide-y divide-neutral-800">
												{speaker.revisions.map((revision) => (
													<li
														key={revision.id}
														className="flex justify-between gap-2 py-2 text-xs"
													>
														<span>
															Revision {revision.number} · {revision.editorName} ·{" "}
															{new Date(revision.createdAt).toLocaleString()}
														</span>
														<button
															disabled={busy}
															onClick={() =>
																void restoreSpeaker(speaker.personId, revision.id)
															}
															className="underline"
														>
															Restore
														</button>
													</li>
												))}
											</ul>
										</details>
									) : null}
								</li>
							))}
						</ul>
					)}
				</section>
			) : null}
		</div>
	);
}
