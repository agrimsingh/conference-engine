import { PublicSpeakerAvatar } from "@/components/public-speaker-avatar";
import { speakerRoleLine } from "@/lib/speakers/public-directory";
import { isPublicTbaSpeaker } from "@/lib/speakers/public-display";

export type PublicLineSpeaker = {
	personId: string | null;
	name: string;
	jobTitle?: string | null;
	company?: string | null;
	hasHeadshot: boolean;
};

export function PublicSpeakerLine({
	speakers,
	eventSlug,
	profileHrefFor,
	size = "sm",
	listClassName = "mt-1 flex flex-wrap gap-3",
}: {
	speakers: readonly PublicLineSpeaker[];
	eventSlug: string;
	profileHrefFor: (personId: string) => string | null;
	size?: "sm" | "md";
	listClassName?: string;
}) {
	if (speakers.length === 0) return null;
	return (
		<ul className={listClassName}>
			{speakers.map((speaker, index) => {
				if (isPublicTbaSpeaker(speaker)) {
					return (
						<li key={`tba-${index}`}>
							<p className="text-sm text-neutral-300">{speaker.name}</p>
						</li>
					);
				}
				const role = speakerRoleLine(speaker);
				return (
					<li key={`${speaker.personId ?? speaker.name}-${index}`}>
						<PublicSpeakerAvatar
							eventSlug={eventSlug}
							personId={speaker.personId}
							name={speaker.name}
							hasHeadshot={speaker.hasHeadshot}
							size={size}
							profileHref={speaker.personId ? profileHrefFor(speaker.personId) : null}
						/>
						{role ? <p className="mt-0.5 text-xs text-neutral-500">{role}</p> : null}
					</li>
				);
			})}
		</ul>
	);
}
