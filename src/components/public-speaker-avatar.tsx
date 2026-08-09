import Image from "next/image";
import Link from "next/link";

type PublicSpeakerAvatarProps = {
	eventSlug: string;
	personId: string | null;
	name: string;
	hasHeadshot: boolean;
	profileHref?: string | null;
	size?: "sm" | "md" | "lg";
	showName?: boolean;
};

export function PublicSpeakerAvatar({
	eventSlug,
	personId,
	name,
	hasHeadshot,
	profileHref,
	size = "md",
	showName = true,
}: PublicSpeakerAvatarProps) {
	const dim = size === "lg" ? "h-20 w-20" : size === "sm" ? "h-8 w-8" : "h-12 w-12";
	const px = size === "lg" ? 80 : size === "sm" ? 32 : 48;
	const initial = name.trim().slice(0, 1).toUpperCase() || "?";
	const image =
		personId && hasHeadshot ? (
			<Image
				src={`/api/e/${eventSlug}/people/${personId}/headshot`}
				alt=""
				width={px}
				height={px}
				unoptimized
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

	const label = showName ? <span className="text-sm text-neutral-300">{name}</span> : null;

	if (profileHref) {
		return (
			<Link
				href={profileHref}
				className={showName ? "inline-flex items-center gap-2 hover:underline" : "inline-flex"}
			>
				{image}
				{label}
			</Link>
		);
	}

	return (
		<span className={showName ? "inline-flex items-center gap-2" : "inline-flex"}>
			{image}
			{label}
		</span>
	);
}
