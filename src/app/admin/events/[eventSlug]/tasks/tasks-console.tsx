"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { AdminSectionShell } from "@/components/admin-section-shell";
import { EmptyState } from "@/components/ui";
import type { RosterSpeaker } from "@/lib/speakers/roster";
import type { SpeakerActionAssignment } from "@/lib/speakers/operations";
import { FilesLibrary, type FileLibraryRow } from "../files/files-library";
import { ActionTasksDashboard } from "./action-tasks-dashboard";
import { DeliverablesDashboard, type DeliverableDashboardRow } from "./deliverables-dashboard";

type TaskSection = "actions" | "deliverables" | "library";

const SECTIONS = [
	{
		id: "actions" as const,
		label: "Action tasks",
		description: "Plain mark-complete onboarding actions, separate from file requests.",
	},
	{
		id: "deliverables" as const,
		label: "Deliverables",
		description: "File-request tasks, uploads, reminders, and organizer replies.",
	},
	{
		id: "library" as const,
		label: "File library",
		description: "All uploaded deliverables in one place. Download latest versions as a ZIP.",
	},
] as const;

function parseSection(value: string | null): TaskSection {
	switch (value) {
		case "deliverables":
		case "library":
			return value;
		default:
			return "actions";
	}
}

type Props = {
	eventSlug: string;
	speakers: RosterSpeaker[];
	actionRows: SpeakerActionAssignment[];
	deliverableRows: DeliverableDashboardRow[];
	fileRows: FileLibraryRow[];
};

export function TasksConsole({
	eventSlug,
	speakers,
	actionRows,
	deliverableRows,
	fileRows,
}: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const section = parseSection(searchParams.get("section"));

	const setSection = useCallback(
		(next: TaskSection) => {
			const params = new URLSearchParams(searchParams.toString());
			if (next === "actions") params.delete("section");
			else params.set("section", next);
			const query = params.toString();
			router.replace(
				query
					? `/admin/events/${eventSlug}/tasks?${query}`
					: `/admin/events/${eventSlug}/tasks`,
				{ scroll: false },
			);
		},
		[eventSlug, router, searchParams],
	);

	return (
		<AdminSectionShell
			ariaLabel="Task sections"
			mobileLabel="Tasks section"
			sections={SECTIONS}
			section={section}
			onSectionChange={setSection}
		>
			{section === "actions" ? (
				<ActionTasksDashboard eventSlug={eventSlug} speakers={speakers} rows={actionRows} />
			) : null}
			{section === "deliverables" ? (
				<DeliverablesDashboard eventSlug={eventSlug} rows={deliverableRows} />
			) : null}
			{section === "library" ? (
				fileRows.length ? (
					<FilesLibrary eventSlug={eventSlug} rows={fileRows} />
				) : (
					<EmptyState
						title="No uploaded files"
						description="Create a file request in Deliverables, then uploads appear here with session and speaker metadata."
					/>
				)
			) : null}
		</AdminSectionShell>
	);
}
