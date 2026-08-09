import Link from "next/link";

type PublicSpeakerAvatarProps = {
	eventSlug: string;
	personId: string | null;
	name: string;
	hasHeadshot: boolean;
	profileHref?: string | null;
	size?: "sm" | "md";
};

export function PublicSpeakerAvatar({
	eventSlug,
	personId,
	name,
	hasHeadshot,
	profileHref,
	size = "md",
}: PublicSpeakerAvatarProps) {
	const dim = size === "sm" ? "h-8 w-8" : "h-12 w-12";
	const initial = name.trim().slice(0, 1).toUpperCase() || "?";
	const image =
		personId && hasHeadshot ? (
			<img
				src={`/api/e/${eventSlug}/people/${personId}/headshot`}
				alt=""
				className={`${dim} rounded-full object-cover`}
			/>
		) : (
			<span
				className={`inline-flex ${dim} items-center justify-center rounded-full bg-neutral-800 text-sm font-medium text-neutral-300`}
				aria-hidden
			>
				{initial}
			</span>
		);

	const label = <span className="text-sm text-neutral-300">{name}</span>;

	if (profileHref) {
		return (
			<Link href={profileHref} className="inline-flex items-center gap-2 hover:underline">
				{image}
				{label}
			</Link>
		);
	}

	return (
		<span className="inline-flex items-center gap-2">
			{image}
			{label}
		</span>
	);
}
