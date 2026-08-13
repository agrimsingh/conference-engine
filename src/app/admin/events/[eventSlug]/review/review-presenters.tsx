import { speakerRoleLabel } from "@/lib/domain";

export type ReviewSpeaker = {
	readonly name: string;
	readonly email: string;
	readonly status: string;
	readonly position: number;
};

type ReviewPresenter = ReviewSpeaker & { readonly role: string };

export function formatReviewPresenters(speakers: readonly ReviewSpeaker[]): readonly ReviewPresenter[] {
	return speakers.map((speaker) => ({
		...speaker,
		role: speakerRoleLabel(speaker.position),
	}));
}

export function ReviewPresenters({ speakers }: { readonly speakers: readonly ReviewSpeaker[] }) {
	const presenters = formatReviewPresenters(speakers);
	if (presenters.length === 0) return <p className="mt-1 text-xs text-neutral-400">No presenters attached</p>;
	return (
		<ul className="mt-1 space-y-1 text-xs text-neutral-400">
			{presenters.map((speaker) => (
				<li key={`${speaker.position}:${speaker.email}`}>
					<span className="font-medium text-neutral-300">{speaker.role}:</span>{" "}
					{speaker.name} &lt;{speaker.email}&gt; ({speaker.status})
				</li>
			))}
		</ul>
	);
}
