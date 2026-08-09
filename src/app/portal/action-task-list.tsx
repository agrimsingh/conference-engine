"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, noticeClasses, StatusPill } from "@/components/ui";
import type { SpeakerActionAssignment } from "@/lib/speakers/operations";

export function ActionTaskList({ tasks, readOnlyEventIds = [] }: { tasks: SpeakerActionAssignment[]; readOnlyEventIds?: string[] }) {
	const router = useRouter(); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
	async function complete(id: string) { setBusy(id); setError(null); try { const response = await fetch(`/api/portal/action-tasks/${id}/complete`, { method: "POST" }); const value = await response.json() as { ok?: boolean; error?: string }; if (!response.ok || !value.ok) setError(value.error ?? "Could not complete task"); else router.refresh(); } catch { setError("Network error"); } finally { setBusy(null); } }
	return <div className="space-y-3">{error ? <p className={noticeClasses("negative")}>{error}</p> : null}<ul className="space-y-3">{tasks.map((task) => <li key={task.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-neutral-100">{task.title}</p>{task.dueAt ? <p className="mt-1 text-xs text-neutral-500">Due {new Date(task.dueAt).toLocaleDateString()}</p> : null}{task.instructions ? <p className="mt-2 text-neutral-400">{task.instructions}</p> : null}</div><div className="flex items-center gap-2"><StatusPill tone={task.status === "completed" ? "positive" : "warning"}>{task.status === "completed" ? "Complete" : "To do"}</StatusPill>{task.status === "pending" && !readOnlyEventIds.includes(task.eventId) ? <button disabled={busy === task.id} onClick={() => void complete(task.id)} className={buttonClasses("secondary", "sm")}>{busy === task.id ? "Saving…" : "Mark complete"}</button> : null}</div></div></li>)}</ul></div>;
}
