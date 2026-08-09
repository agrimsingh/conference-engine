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

const AVATAR_PALETTES = [
	{ backdrop: "#e0e7ff", accent: "#a5b4fc", skin: "#f5c7aa", hair: "#30201d", shirt: "#4f46e5" },
	{ backdrop: "#ccfbf1", accent: "#5eead4", skin: "#8d5a43", hair: "#231f20", shirt: "#0f766e" },
	{ backdrop: "#fce7f3", accent: "#f9a8d4", skin: "#d9946c", hair: "#4a2c20", shirt: "#be185d" },
	{ backdrop: "#fef3c7", accent: "#fcd34d", skin: "#f1bf97", hair: "#5a3828", shirt: "#b45309" },
	{ backdrop: "#dbeafe", accent: "#93c5fd", skin: "#6d4436", hair: "#171717", shirt: "#1d4ed8" },
	{ backdrop: "#dcfce7", accent: "#86efac", skin: "#b97052", hair: "#37251f", shirt: "#15803d" },
] as const;

function stableAvatarSeed(personId: string | null, name: string) {
	const source = personId || name.trim().toLocaleLowerCase() || "speaker";
	let hash = 2166136261;

	for (const character of source) {
		hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
	}

	return hash >>> 0;
}

function PublicSpeakerFallbackIllustration({
	personId,
	name,
	className,
}: {
	personId: string | null;
	name: string;
	className: string;
}) {
	const seed = stableAvatarSeed(personId, name);
	const palette = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
	const hairStyle = (seed >>> 3) % 3;
	const detailStyle = (seed >>> 6) % 3;
	const variant = seed.toString(36);
	const hair =
		hairStyle === 0 ? "M20 40c0-16 9-25 20-25s20 9 20 25v8H20z" : hairStyle === 1 ? "M18 38c1-15 9-24 22-24 12 0 21 9 22 24l-8 3-4-10-8 5-12-5-4 10z" : "M19 42c0-18 9-28 21-28s21 10 21 28l-7 3-5-12-9 4-11-4-3 12z";

	return (
		<svg
			aria-label="Illustrated speaker portrait"
			className={`${className} shrink-0`}
			data-avatar-variant={variant}
			focusable="false"
			role="img"
			viewBox="0 0 80 80"
		>
			<circle cx="40" cy="40" fill={palette.backdrop} r="40" />
			<circle cx="60" cy="20" fill={palette.accent} opacity="0.55" r="17" />
			<path d="M11 80c2-17 14-27 29-27s27 10 29 27z" fill={palette.shirt} />
			<ellipse cx="40" cy="40" fill={palette.skin} rx="17" ry="21" />
			<path d={hair} fill={palette.hair} />
			<circle cx="34" cy="42" fill={palette.hair} r="1.7" />
			<circle cx="46" cy="42" fill={palette.hair} r="1.7" />
			<path d="M35 51c3 2 7 2 10 0" fill="none" stroke={palette.hair} strokeLinecap="round" strokeWidth="1.6" />
			{detailStyle === 0 ? (
				<path d="M27 42h14m-2 0h14m-1 0h2" fill="none" stroke={palette.hair} strokeLinecap="round" strokeWidth="1.5" />
			) : detailStyle === 1 ? (
				<circle cx="30" cy="48" fill={palette.accent} opacity="0.55" r="2" />
			) : (
				<circle cx="50" cy="48" fill={palette.accent} opacity="0.55" r="2" />
			)}
		</svg>
	);
}

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
			<PublicSpeakerFallbackIllustration personId={personId} name={name} className={dim} />
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
