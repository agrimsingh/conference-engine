"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { AdminSectionShell } from "@/components/admin-section-shell";
import {
	EmptyState,
	StatusPill,
	buttonClasses,
	submissionStatusTone,
} from "@/components/ui";
import { isAcceptedProgrammeStatus } from "@/lib/speakers/portal-view";
import type { SpeakerSocialLinks } from "@/lib/speakers/social";
import { ActionTaskList } from "./action-task-list";
import { PortalResourceList } from "./portal-resource-list";
import { ProfileEditor } from "./profile-editor";
import { TaskChecklist, type TaskView } from "./task-checklist";
import { WithdrawButton } from "./withdraw-button";
import { SessionOps } from "./session-ops";
import type { PortalResourceRow } from "@/lib/db/types";
import type { SpeakerActionAssignment } from "@/lib/speakers/operations";
import { EditProposalButton } from "./edit-proposal-button";

export type PortalSection = "home" | "applications" | "profile" | "prep";

export type PortalCoSpeaker = {
	id: string;
	name: string;
	email: string;
	status: string;
	invitedAt: number | null;
	confirmedAt: number | null;
	position: number;
	role: string;
};

export type PortalApplication = {
	id: string;
	eventId: string;
	eventName: string;
	eventMode: string;
	title: string;
	status: string;
	statusLabel: string;
	canEditProposal: boolean;
	slotLabel: string | null;
	canWithdraw: boolean;
	removesFromSchedule: boolean;
	coSpeakers: PortalCoSpeaker[];
	profileTasks: TaskView[];
	prepTasks: TaskView[];
	timezone: string | undefined;
	needsSlotAck: boolean;
	canHandoff: boolean;
	handoffLabel: string | null;
	actingAsManagerFor: string | null;
};

export type PortalEventProfile = {
	eventId: string;
	eventName: string;
	eventMode: string;
	displayName: string;
	bio: string;
	jobTitle: string;
	company: string;
	salutation: string;
	pronouns: string;
	honorific: string;
	social: SpeakerSocialLinks;
	hasHeadshot: boolean;
	profileTasks: TaskView[];
	timezone: string | undefined;
};

export type PortalResourceGroup = {
	eventId: string;
	eventName: string;
	resources: PortalResourceRow[];
};

type Props = {
	email: string;
	applications: PortalApplication[];
	profiles: PortalEventProfile[];
	actionTasks: SpeakerActionAssignment[];
	resourceGroups: PortalResourceGroup[];
	demoEventIds: string[];
};

const SECTIONS = [
	{
		id: "home" as const,
		label: "Home",
		description: "What needs you next across every event.",
	},
	{
		id: "applications" as const,
		label: "Applications",
		description: "Proposals you’ve submitted and where each one stands.",
	},
	{
		id: "profile" as const,
		label: "Profile",
		description: "Bio, headshot, and links organizers use on the public program.",
	},
	{
		id: "prep" as const,
		label: "Prep",
		description: "Session materials after you’re accepted — slides, docs, action items.",
	},
] as const;

function parseSection(value: string | null): PortalSection {
	switch (value) {
		case "applications":
		case "profile":
		case "prep":
			return value;
		default:
			return "home";
	}
}

function incompleteCount(tasks: TaskView[]): number {
	return tasks.filter((task) => task.required && task.status !== "completed").length;
}

export function PortalConsole({
	email,
	applications,
	profiles,
	actionTasks,
	resourceGroups,
	demoEventIds,
}: Props) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const section = parseSection(searchParams.get("section"));

	const setSection = useCallback(
		(next: PortalSection) => {
			const params = new URLSearchParams(searchParams.toString());
			if (next === "home") params.delete("section");
			else params.set("section", next);
			const query = params.toString();
			router.replace(query ? `/portal?${query}` : "/portal", { scroll: false });
		},
		[router, searchParams],
	);

	const pendingActionTasks = actionTasks.filter((task) => task.status !== "completed");
	const profileTodo = profiles.reduce(
		(sum, profile) => sum + incompleteCount(profile.profileTasks),
		0,
	);
	const prepTodo =
		applications.reduce((sum, app) => sum + incompleteCount(app.prepTasks), 0) +
		pendingActionTasks.length;
	const acceptedApps = applications.filter((app) =>
		isAcceptedProgrammeStatus(app.status),
	);

	return (
		<AdminSectionShell
			ariaLabel="Speaker portal sections"
			mobileLabel="Portal section"
			sections={SECTIONS.map((item) => ({
				...item,
				label:
					item.id === "prep" && prepTodo > 0
						? `Prep (${prepTodo})`
						: item.id === "profile" && profileTodo > 0
							? `Profile (${profileTodo})`
							: item.label,
			}))}
			section={section}
			onSectionChange={setSection}
		>
			{section === "home" ? (
				<div className="space-y-8">
					<section className="grid gap-3 sm:grid-cols-3">
						<div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
							<p className="text-xs uppercase tracking-wide text-neutral-500">
								Applications
							</p>
							<p className="mt-1 text-2xl font-semibold text-neutral-100">
								{applications.length}
							</p>
						</div>
						<div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
							<p className="text-xs uppercase tracking-wide text-neutral-500">
								Profile to-dos
							</p>
							<p className="mt-1 text-2xl font-semibold text-neutral-100">
								{profileTodo}
							</p>
						</div>
						<div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
							<p className="text-xs uppercase tracking-wide text-neutral-500">
								Prep to-dos
							</p>
							<p className="mt-1 text-2xl font-semibold text-neutral-100">
								{prepTodo}
							</p>
						</div>
					</section>

					<section className="space-y-3">
						<div className="flex items-baseline justify-between gap-3">
							<h3 className="text-sm font-medium text-neutral-200">Needs you</h3>
							<p className="text-xs text-neutral-500">{email}</p>
						</div>
						{profileTodo === 0 && prepTodo === 0 ? (
							<p className="text-sm text-neutral-500">
								You’re caught up. Check Applications for proposal status.
							</p>
						) : (
							<ul className="space-y-2">
								{profileTodo > 0 ? (
									<li className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
										<p className="font-medium text-neutral-100">
											Finish speaker profile details
										</p>
										<p className="mt-1 text-neutral-400">
											{profileTodo} bio/headshot item
											{profileTodo === 1 ? "" : "s"} still open.
										</p>
										<button
											type="button"
											className={`mt-3 ${buttonClasses("secondary", "sm")}`}
											onClick={() => setSection("profile")}
										>
											Go to Profile
										</button>
									</li>
								) : null}
								{prepTodo > 0 ? (
									<li className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
										<p className="font-medium text-neutral-100">
											Session prep waiting
										</p>
										<p className="mt-1 text-neutral-400">
											{prepTodo} prep item{prepTodo === 1 ? "" : "s"} after
											acceptance.
										</p>
										<button
											type="button"
											className={`mt-3 ${buttonClasses("secondary", "sm")}`}
											onClick={() => setSection("prep")}
										>
											Go to Prep
										</button>
									</li>
								) : null}
							</ul>
						)}
					</section>

					<section className="space-y-3">
						<div className="flex items-baseline justify-between gap-3">
							<h3 className="text-sm font-medium text-neutral-200">
								Your applications
							</h3>
							<button
								type="button"
								className="text-xs font-medium text-neutral-300 underline underline-offset-2 hover:text-neutral-100"
								onClick={() => setSection("applications")}
							>
								View all
							</button>
						</div>
						{applications.length === 0 ? (
							<EmptyState
								title="No applications yet"
								description="Submit a proposal with this email, then sign in again here."
							/>
						) : (
							<ul className="space-y-2">
								{applications.slice(0, 5).map((app) => (
									<li
										key={app.id}
										className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm"
									>
										<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
											{app.eventName}
										</p>
										<div className="mt-1 flex flex-wrap items-center gap-2">
											<p className="font-medium text-neutral-100">{app.title}</p>
											<StatusPill tone={submissionStatusTone(app.status)}>
												{app.statusLabel}
											</StatusPill>
										</div>
									</li>
								))}
							</ul>
						)}
					</section>

					{resourceGroups.map((group) => (
						<section key={group.eventId} className="space-y-3">
							<h3 className="text-sm font-medium text-neutral-200">
								{group.eventName} resources
							</h3>
							<PortalResourceList resources={group.resources} />
						</section>
					))}
				</div>
			) : null}

			{section === "applications" ? (
				applications.length === 0 ? (
					<EmptyState
						title="No applications yet"
						description="Use the email from your proposal, then request another sign-in link if needed."
					/>
				) : (
					<ul className="space-y-3">
						{applications.map((app) => (
							<li
								key={app.id}
								className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-4 text-sm"
							>
								<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
									{app.eventName}
								</p>
								<div className="mt-1 flex flex-wrap items-center gap-2">
									<p className="text-base font-medium text-neutral-100">
										{app.title}
									</p>
									<StatusPill tone={submissionStatusTone(app.status)}>
										{app.statusLabel}
									</StatusPill>
									{app.actingAsManagerFor ? (
										<StatusPill tone="neutral">
											managing for {app.actingAsManagerFor}
										</StatusPill>
									) : null}
								</div>
								{app.slotLabel ? (
									<p className="mt-1 text-xs text-neutral-500">{app.slotLabel}</p>
								) : isAcceptedProgrammeStatus(app.status) ? (
									<p className="mt-1 text-xs text-neutral-500">
										Accepted · schedule pending
									</p>
								) : null}

								{app.coSpeakers.length > 0 ? (
									<div className="mt-3 border-t border-neutral-800 pt-3">
										<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
											Speakers
										</p>
										<ul className="mt-2 space-y-1 text-xs text-neutral-400">
											{app.coSpeakers.map((speaker) => (
												<li key={speaker.id}>
													<span className="font-medium text-neutral-300">{speaker.role}:</span>{" "}
													{speaker.name || speaker.email} · {speaker.status}
													{speaker.invitedAt
														? ` · invited ${new Date(speaker.invitedAt).toISOString().slice(0, 10)}`
														: speaker.position === 0
															? ""
															: " · invite not sent"}
													{speaker.confirmedAt
														? ` · confirmed ${new Date(speaker.confirmedAt).toISOString().slice(0, 10)}`
														: ""}
												</li>
											))}
										</ul>
									</div>
								) : null}

								<div className="mt-4 flex flex-wrap gap-2">
									{app.canEditProposal ? (
										<EditProposalButton submissionId={app.id} />
									) : null}
									{incompleteCount(app.prepTasks) > 0 ||
									(isAcceptedProgrammeStatus(app.status) &&
										app.prepTasks.length > 0) ? (
										<button
											type="button"
											className={buttonClasses("secondary", "sm")}
											onClick={() => setSection("prep")}
										>
											Open prep
										</button>
									) : null}
									<button
										type="button"
										className={buttonClasses("secondary", "sm")}
										onClick={() => setSection("profile")}
									>
										Event profile
									</button>
								</div>

								{app.canWithdraw && app.eventMode !== "demo" ? (
									<div className="mt-3">
										<WithdrawButton
											submissionId={app.id}
											removesFromSchedule={app.removesFromSchedule}
										/>
									</div>
								) : null}
								<SessionOps
									submissionId={app.id}
									needsSlotAck={app.needsSlotAck}
									canHandoff={app.canHandoff && app.eventMode !== "demo"}
									handoffLabel={app.handoffLabel}
								/>
							</li>
						))}
					</ul>
				)
			) : null}

			{section === "profile" ? (
				profiles.length === 0 ? (
					<EmptyState
						title="No event profiles yet"
						description="Profiles appear for events you’ve proposed to or been added to as a speaker."
					/>
				) : (
					<ul className="space-y-6">
						{profiles.map((profile) => (
							<li
								key={profile.eventId}
								className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-4"
							>
								<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
									{profile.eventName}
								</p>
								<p className="mt-1 text-sm text-neutral-400">
									This identity feeds the public speaker page and schedule for
									this event.
								</p>
								{profile.eventMode !== "demo" ? (
									<div className="mt-4">
										<ProfileEditor
											variant="panel"
											eventId={profile.eventId}
											displayName={profile.displayName}
											bio={profile.bio}
											jobTitle={profile.jobTitle}
											company={profile.company}
											salutation={profile.salutation}
											pronouns={profile.pronouns}
											honorific={profile.honorific}
											social={profile.social}
											hasHeadshot={profile.hasHeadshot}
										/>
									</div>
								) : (
									<p className="mt-3 text-sm text-neutral-500">
										Demo event profiles are read-only.
									</p>
								)}
								{profile.profileTasks.length > 0 ? (
									<div className="mt-5 border-t border-neutral-800 pt-4">
										<div className="mb-3 flex items-baseline justify-between gap-3">
											<p className="text-sm font-medium text-neutral-200">
												Organizer checklist
											</p>
											<span className="text-xs text-neutral-500">
												{incompleteCount(profile.profileTasks) === 0
													? "Complete"
													: `${incompleteCount(profile.profileTasks)} open`}
											</span>
										</div>
										<p className="mb-3 text-xs text-neutral-500">
											Bio and headshot tasks mark you complete for organizers.
											Saving the profile above updates the public page.
										</p>
										<TaskChecklist
											compact
											timeZone={profile.timezone}
											tasks={profile.profileTasks}
											readOnly={profile.eventMode === "demo"}
										/>
									</div>
								) : null}
							</li>
						))}
					</ul>
				)
			) : null}

			{section === "prep" ? (
				acceptedApps.length === 0 && actionTasks.length === 0 ? (
					<EmptyState
						title="No session prep yet"
						description="Prep appears after a proposal is accepted — slides, docs, and other session materials."
					/>
				) : (
					<div className="space-y-8">
						{actionTasks.length > 0 ? (
							<section>
								<h3 className="mb-3 text-sm font-medium text-neutral-200">
									Action tasks
								</h3>
								<ActionTaskList
									tasks={actionTasks}
									readOnlyEventIds={demoEventIds}
								/>
							</section>
						) : null}

						{acceptedApps.length > 0 ? (
							<ul className="space-y-4">
								{acceptedApps.map((app) => (
									<li
										key={app.id}
										className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-4 text-sm"
									>
										<p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
											{app.eventName}
										</p>
										<div className="mt-1 flex flex-wrap items-center gap-2">
											<p className="font-medium text-neutral-100">{app.title}</p>
											<StatusPill tone={submissionStatusTone(app.status)}>
												{app.statusLabel}
											</StatusPill>
										</div>
										{app.slotLabel ? (
											<p className="mt-1 text-xs text-neutral-500">
												{app.slotLabel}
											</p>
										) : null}
										<div className="mt-4 border-t border-neutral-800 pt-3">
											<div className="mb-3 flex items-baseline justify-between gap-3">
												<p className="font-medium text-neutral-200">
													Session materials
												</p>
												<span className="text-xs text-neutral-500">
													{incompleteCount(app.prepTasks) === 0
														? "Complete"
														: `${incompleteCount(app.prepTasks)} required open`}
												</span>
											</div>
											{app.prepTasks.length === 0 ? (
												<p className="text-neutral-500">
													No session materials requested yet.
												</p>
											) : (
												<TaskChecklist
													compact
													timeZone={app.timezone}
													tasks={app.prepTasks}
													readOnly={app.eventMode === "demo"}
												/>
											)}
										</div>
									</li>
								))}
							</ul>
						) : null}
					</div>
				)
			) : null}
		</AdminSectionShell>
	);
}
