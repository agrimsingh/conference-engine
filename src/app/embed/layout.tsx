export default function EmbedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="min-h-dvh bg-neutral-950 text-neutral-200">{children}</div>
	);
}
